// backend/src/lib/gastosScheduler.js
// Genera automáticamente la ocurrencia del mes en curso para cada gasto
// recurrente (serie_id). FIJO clona el monto igual (admin: fecha y valor
// constantes). VARIABLE crea la fila con monto en 0 y por_completar=true
// (facturas: la fecha se repite pero el valor lo completa un usuario al
// llegar el recibo real).

const cron = require("node-cron");
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
const TZ = process.env.TZ || "America/Bogota";

async function q(text, params = []) {
  const { rows } = await pool.query(text, params);
  return rows;
}

// Suma un mes a una fecha (YYYY-MM-DD), ajustando al último día si el mes
// destino es más corto (ej. 31 ene → 28/29 feb).
function sumarMes(fechaStr) {
  if (!fechaStr) return null;
  const d = new Date(fechaStr);
  const dia = d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const ultimoDia = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(dia, ultimoDia));
  return target.toISOString().slice(0, 10);
}

let _running = false;

async function tickGastosRecurrentes() {
  if (_running) return;
  _running = true;
  try {
    const now = new Date();
    const mesActual = now.getMonth() + 1;
    const anioActual = now.getFullYear();

    // Última ocurrencia de cada serie recurrente activa.
    const ultimas = await q(`
      SELECT DISTINCT ON (serie_id) *
      FROM gastos
      WHERE recurrente = TRUE AND serie_id IS NOT NULL
      ORDER BY serie_id, (periodo_anio * 12 + periodo_mes) DESC, id DESC
    `);

    for (const g of ultimas) {
      try {
        // Avanza ocurrencia por ocurrencia hasta llegar al mes en curso
        // (cubre el caso de servidor caído varios meses), tope de seguridad 24.
        let actual = g;
        let guard = 0;
        while (
          guard++ < 24 &&
          (actual.periodo_anio * 12 + actual.periodo_mes) < (anioActual * 12 + mesActual)
        ) {
          const nuevaFecha = sumarMes(actual.fecha);
          const nuevoVenc  = actual.fecha_vencimiento ? sumarMes(actual.fecha_vencimiento) : null;
          const idx = (actual.periodo_anio * 12 + (actual.periodo_mes - 1)) + 1;
          const nuevoAnio = Math.floor(idx / 12);
          const nuevoMes  = (idx % 12) + 1;

          const esFijo = actual.recurrente_tipo === "FIJO";

          const rows = await q(`
            INSERT INTO gastos
              (categoria, subcategoria, concepto, proveedor, monto, moneda,
               monto_secundario, moneda_secundaria, fecha, fecha_vencimiento,
               periodo_mes, periodo_anio, estado, persona_id, equipo_id, proyecto_id,
               recurrente, recurrente_tipo, serie_id, por_completar, archivo, notas,
               registrado_por_id)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
            RETURNING *
          `, [
            actual.categoria, actual.subcategoria, actual.concepto, actual.proveedor,
            esFijo ? actual.monto : 0,
            actual.moneda,
            esFijo ? actual.monto_secundario : null,
            esFijo ? actual.moneda_secundaria : null,
            nuevaFecha, nuevoVenc,
            nuevoMes, nuevoAnio,
            "PENDIENTE",
            actual.persona_id, actual.equipo_id, actual.proyecto_id,
            true, actual.recurrente_tipo, actual.serie_id,
            !esFijo,
            "", actual.notas,
            actual.registrado_por_id,
          ]);
          actual = rows[0];
          console.log(`[gastos-scheduler] serie #${actual.serie_id} → nueva ocurrencia #${actual.id} (${nuevoMes}/${nuevoAnio}, ${actual.recurrente_tipo})`);
        }
      } catch (e) {
        console.error(`[gastos-scheduler] error generando serie #${g.serie_id}:`, e.message);
      }
    }
  } catch (e) {
    console.error("[gastos-scheduler] error en tick:", e.message);
  } finally {
    _running = false;
  }
}

let _task = null;

function startGastosScheduler() {
  if (_task) return;
  // Una vez al día a las 06:00 Bogotá (idempotente: no duplica si ya corrió).
  _task = cron.schedule("0 6 * * *", tickGastosRecurrentes, { timezone: TZ });
  console.log(`[gastos-scheduler] iniciado (gastos recurrentes, diario 06:00, TZ=${TZ})`);
}

function stopGastosScheduler() {
  if (_task) { _task.stop(); _task = null; }
}

module.exports = {
  startGastosScheduler,
  stopGastosScheduler,
  _tickGastosRecurrentes: tickGastosRecurrentes,
};
