// backend/src/lib/reminderScheduler.js
// Scheduler de recordatorios. Corre cada minuto, busca recordatorios cuyo
// proximo_envio ya pasó, dispara el envío por WhatsApp (delegando a T_INTRANET),
// registra el resultado y calcula el siguiente proximo_envio según la frecuencia.
//
// IMPORTANTE: PM2 corre intranet-ctglobal con instances: 1. No hay riesgo de
// que dos schedulers disparen el mismo recordatorio. Si en el futuro escalas
// a cluster, hay que añadir un lock (advisory lock de Postgres o tabla aparte).

const cron     = require("node-cron");
const prisma   = require("./prisma");
const { enviarWhatsApp, enviarEmail } = require("./whatsappClient");

const TZ = process.env.TZ || "America/Bogota";

// ── Cálculo del próximo envío según frecuencia ───────────────

/**
 * Devuelve el próximo Date (UTC) en que debe ejecutarse el recordatorio,
 * tomando como referencia "ahora" y respetando hora + día de semana/mes.
 *
 * @param {object} r — Reminder de Prisma
 * @param {Date} desde — desde qué momento calcular (normalmente NOW + 1min para evitar repetir el mismo minuto)
 */
function calcularProximoEnvio(r, desde) {
  const [hh, mm] = (r.hora || "09:00").split(":").map(Number);

  // Trabajamos en la zona del servidor (debe ser America/Bogota por TZ env).
  // Tomamos "desde" como base y avanzamos hasta cumplir las condiciones de la frecuencia.
  const base = new Date(desde);
  base.setSeconds(0, 0);

  // Helper: setea hora HH:MM al date dado (mutando)
  const setHora = (d) => { d.setHours(hh, mm, 0, 0); return d; };

  switch (r.frecuencia) {
    case "UNICA": {
      // Solo una vez en fecha_inicio @ hora. Si ya pasó, no se reenvía.
      const d = new Date(r.fecha_inicio);
      return setHora(d);
    }

    case "DIARIA": {
      // Próxima ocurrencia hoy o mañana a la hora.
      const d = new Date(base);
      setHora(d);
      if (d <= base) d.setDate(d.getDate() + 1);
      return d;
    }

    case "SEMANAL": {
      // dia_semana: 0=Dom..6=Sáb (mismo que Date.getDay())
      const target = r.dia_semana ?? 1;
      const d = new Date(base);
      setHora(d);
      while (d.getDay() !== target || d <= base) {
        d.setDate(d.getDate() + 1);
      }
      return d;
    }

    case "MENSUAL": {
      // dia_mes: 1..31. Si el mes no tiene ese día, ajustar al último día del mes.
      const target = r.dia_mes ?? 1;
      const d = new Date(base);
      setHora(d);
      // Empezar en el mes actual; si ya pasó la fecha objetivo, mover al siguiente mes.
      const ajustarDia = (date) => {
        const year  = date.getFullYear();
        const month = date.getMonth();
        const ultimoDia = new Date(year, month + 1, 0).getDate(); // día 0 del mes siguiente = último día del actual
        const dia = Math.min(target, ultimoDia);
        date.setDate(dia);
        setHora(date);
        return date;
      };
      ajustarDia(d);
      if (d <= base) {
        d.setMonth(d.getMonth() + 1);
        d.setDate(1); // reset para que ajustarDia no se confunda en meses cortos
        ajustarDia(d);
      }
      return d;
    }

    case "CADA_N_DIAS": {
      // Si nunca se ha enviado: primer envío = fecha_inicio @ hora.
      // Si ya: ultimo_envio + N días @ hora.
      const n = Math.max(1, r.intervalo_dias || 1);
      if (!r.ultimo_envio) {
        const d = new Date(r.fecha_inicio);
        return setHora(d);
      }
      const d = new Date(r.ultimo_envio);
      d.setDate(d.getDate() + n);
      setHora(d);
      // Si el cálculo da en el pasado (servidor estuvo caído), saltar al siguiente válido.
      while (d <= base) {
        d.setDate(d.getDate() + n);
      }
      return d;
    }

    default:
      throw new Error(`Frecuencia desconocida: ${r.frecuencia}`);
  }
}

/**
 * Calcula proximo_envio INICIAL al crear un recordatorio.
 * Se exporta para usar desde el route POST.
 */
function calcularProximoInicial(r) {
  const [hh, mm] = (r.hora || "09:00").split(":").map(Number);
  const inicio = new Date(r.fecha_inicio);
  inicio.setHours(hh, mm, 0, 0);

  // Si fecha_inicio @ hora ya pasó, el scheduler reasignará en el primer tick.
  // Aquí solo devolvemos esa fecha para tenerla como punto de partida.
  if (r.frecuencia === "UNICA") return inicio;

  const ahora = new Date();
  if (inicio > ahora) return inicio;

  // Si la fecha_inicio ya pasó, calculamos cuál sería el "siguiente" desde ahora.
  return calcularProximoEnvio(r, ahora);
}

// ── Resolución de destinatario ───────────────────────────────

async function resolverTelefono(r) {
  if (r.destinatario && r.destinatario.telefono_whatsapp) {
    return r.destinatario.telefono_whatsapp.trim();
  }
  if (r.telefono_manual) {
    return r.telefono_manual.trim();
  }
  return "";
}

// ── Procesamiento de un recordatorio individual ──────────────

async function procesar(r) {
  const telefono = await resolverTelefono(r);
  let exito = false;
  let error = "";

  if (!telefono) {
    error = "Sin teléfono (ni destinatario.telefono_whatsapp ni telefono_manual)";
  } else {
    const res = await enviarWhatsApp({
      to:             telefono,
      mensaje:        r.mensaje,
      tipo:           `INTRANET_REM_${r.tipo}`,
      destinatarioId: r.destinatario_id,
    });
    exito = res.exito;
    error = res.error || "";
  }

  // Log
  await prisma.reminderLog.create({
    data: {
      reminder_id:           r.id,
      canal:                 "WHATSAPP",
      destinatario_snapshot: telefono,
      exito,
      error: error.slice(0, 1000),
    },
  });

  // Actualizar reminder
  const ahora = new Date();
  const datosUpdate = {
    ultimo_envio:  ahora,
    veces_enviado: { increment: 1 },
  };

  if (r.frecuencia === "UNICA") {
    // Se ejecuta una sola vez y se desactiva.
    datosUpdate.activo = false;
    datosUpdate.proximo_envio = ahora; // no se usará, queda como marca
  } else {
    // Calcular siguiente envío (mínimo 1 minuto en el futuro para no repetir).
    const desde = new Date(ahora.getTime() + 60_000);
    const reFresh = { ...r, ultimo_envio: ahora };
    const siguiente = calcularProximoEnvio(reFresh, desde);

    // Si pasa la caducidad, desactivar.
    if (r.fecha_caducidad && siguiente > new Date(r.fecha_caducidad).setHours(23, 59, 59, 999)) {
      datosUpdate.activo = false;
    }
    datosUpdate.proximo_envio = siguiente;
  }

  await prisma.reminder.update({
    where: { id: r.id },
    data:  datosUpdate,
  });

  console.log(
    `[scheduler] reminder #${r.id} "${r.titulo}" → ${exito ? "✓" : "✗"} ${error ? `(${error})` : ""}`
  );
}

// ── Tick del cron ────────────────────────────────────────────

let _running = false; // evitar solapamiento si un tick tarda > 1 min

async function tick() {
  if (_running) return;
  _running = true;
  try {
    const ahora = new Date();
    const pendientes = await prisma.reminder.findMany({
      where: {
        activo:        true,
        pausado:       false,
        proximo_envio: { lte: ahora },
        OR: [
          { fecha_caducidad: null },
          { fecha_caducidad: { gte: ahora } },
        ],
      },
      include: {
        destinatario: { select: { id: true, telefono_whatsapp: true } },
      },
      take: 50, // por si se acumula, no procesar miles en un tick
    });

    if (pendientes.length === 0) return;
    console.log(`[scheduler] ${pendientes.length} recordatorio(s) por enviar`);

    for (const r of pendientes) {
      try { await procesar(r); }
      catch (e) {
        console.error(`[scheduler] error procesando reminder #${r.id}:`, e.message);
      }
    }
  } catch (e) {
    console.error("[scheduler] error en tick:", e.message);
  } finally {
    _running = false;
  }
}

// ════════════════════════════════════════════════════════════
//  RECORDATORIOS DE EVENTOS DEL CALENDARIO
// ════════════════════════════════════════════════════════════

const MIN = { SEMANA: 10080, D3: 4320, D2: 2880, D1: 1440, H1: 60, MIN30: 30 };

function etiquetaOffset(min) {
  if (min === MIN.SEMANA) return "en 1 semana";
  if (min % 1440 === 0)   return `en ${min / 1440} día${min / 1440 === 1 ? "" : "s"}`;
  if (min % 60 === 0)     return `en ${min / 60} hora${min / 60 === 1 ? "" : "s"}`;
  return `en ${min} minuto${min === 1 ? "" : "s"}`;
}

function fmtFechaEvento(d) {
  return new Date(d).toLocaleString("es-CO", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: TZ,
  });
}

async function enviarEventoRecordatorio(er, offset) {
  const ev = er.event;
  const cuando = etiquetaOffset(offset);
  const fechaTxt = fmtFechaEvento(ev.fecha_inicio);

  const destinatarios = er.destinatarios.length
    ? await prisma.user.findMany({
        where: { id: { in: er.destinatarios }, activo: true },
        select: { id: true, nombre: true, email: true, telefono_whatsapp: true },
      })
    : [];

  const textoWA =
    `🗓️ *Recordatorio: ${ev.titulo}*\n` +
    `El evento es ${cuando} — ${fechaTxt}.` +
    (ev.descripcion ? `\n\n${ev.descripcion}` : "");

  const html =
    `<p>Hola {NOMBRE},</p>` +
    `<p>Te recordamos el evento <b>${ev.titulo}</b>.</p>` +
    `<p><b>Cuándo:</b> ${cuando} — ${fechaTxt}</p>` +
    (ev.descripcion ? `<p><b>Detalle:</b> ${ev.descripcion}</p>` : "") +
    `<p style="color:#64748b;font-size:12px">Calendario CTGlobal · intranet.ctglobal.com.co/calendario</p>`;
  const subject = `Recordatorio: ${ev.titulo} (${cuando})`;

  let ok = 0, fail = 0;
  for (const u of destinatarios) {
    if (er.canal_whatsapp && u.telefono_whatsapp) {
      const r = await enviarWhatsApp({
        to: u.telefono_whatsapp.trim(), mensaje: textoWA,
        tipo: "INTRANET_EVENTO", destinatarioId: u.id,
      });
      r.exito ? ok++ : fail++;
    }
    if (er.canal_email && u.email) {
      const r = await enviarEmail({
        to: u.email, subject, html: html.replace("{NOMBRE}", u.nombre || ""),
        tipo: "INTRANET_EVENTO",
      });
      r.exito ? ok++ : fail++;
    }
  }
  console.log(`[scheduler-eventos] evento #${ev.id} "${ev.titulo}" ${cuando} → ${ok} ok, ${fail} fallo(s), ${destinatarios.length} destinatario(s)`);
}

let _runningEv = false;

async function tickEventos() {
  if (_runningEv) return;
  _runningEv = true;
  try {
    const now = new Date();
    const ers = await prisma.eventReminder.findMany({
      where: {
        OR: [{ canal_email: true }, { canal_whatsapp: true }],
        event: { fecha_inicio: { gte: now } },
      },
      include: { event: true },
    });

    for (const er of ers) {
      const pendientes = er.offsets_min.filter(o =>
        !er.enviados_min.includes(o) &&
        new Date(er.event.fecha_inicio.getTime() - o * 60000) <= now
      );
      if (!pendientes.length) continue;

      for (const off of pendientes) {
        try { await enviarEventoRecordatorio(er, off); }
        catch (e) { console.error(`[scheduler-eventos] error evento #${er.event_id} offset ${off}:`, e.message); }
      }
      await prisma.eventReminder.update({
        where: { id: er.id },
        data:  { enviados_min: { set: [...new Set([...er.enviados_min, ...pendientes])] } },
      });
    }
  } catch (e) {
    console.error("[scheduler-eventos] error en tick:", e.message);
  } finally {
    _runningEv = false;
  }
}

// ── Arranque ────────────────────────────────────────────────

let _task = null;
let _taskEv = null;

function startScheduler() {
  if (_task) return;
  // Cada minuto. Zona horaria explícita para que "09:00" signifique 09:00 Bogotá.
  _task   = cron.schedule("* * * * *", tick, { timezone: TZ });
  _taskEv = cron.schedule("* * * * *", tickEventos, { timezone: TZ });
  console.log(`[scheduler] iniciado (recordatorios + eventos, cada minuto, TZ=${TZ})`);
}

function stopScheduler() {
  if (_task)   { _task.stop();   _task = null; }
  if (_taskEv) { _taskEv.stop(); _taskEv = null; }
}

module.exports = {
  startScheduler,
  stopScheduler,
  calcularProximoEnvio,
  calcularProximoInicial,
  etiquetaOffset,
  // exportado para tests
  _procesar: procesar,
  _tick: tick,
  _tickEventos: tickEventos,
};
