// backend/src/lib/gastosScheduler.js
// Genera automáticamente la ocurrencia del mes en curso para cada gasto
// recurrente (serie_id). FIJO clona el monto igual (admin: fecha y valor
// constantes). VARIABLE crea la fila con monto en 0 y por_completar=true
// (facturas: la fecha se repite pero el valor lo completa un usuario al
// llegar el recibo real).

const cron = require("node-cron");
const { Pool } = require("pg");
const { generarOcurrencia } = require("./gastosRecurrentes");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
const TZ = process.env.TZ || "America/Bogota";

async function q(text, params = []) {
  const { rows } = await pool.query(text, params);
  return rows;
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
        // Avanza ocurrencia por ocurrencia según intervalo_meses (ej. agua
        // cada 2 meses) hasta llegar al mes en curso, sin adelantarse a la
        // próxima fecha de cobro. Tope de seguridad 24 iteraciones.
        let actual = g;
        let guard = 0;
        const intervalo = Math.max(1, actual.intervalo_meses || 1);
        while (guard++ < 24) {
          const idx = (actual.periodo_anio * 12 + (actual.periodo_mes - 1)) + intervalo;
          const nuevoAnio = Math.floor(idx / 12);
          const nuevoMes  = (idx % 12) + 1;
          if ((nuevoAnio * 12 + nuevoMes) > (anioActual * 12 + mesActual)) break;

          actual = await generarOcurrencia(q, actual);
          console.log(`[gastos-scheduler] serie #${actual.serie_id} → nueva ocurrencia #${actual.id} (${nuevoMes}/${nuevoAnio}, ${actual.recurrente_tipo}, cada ${intervalo}m)`);
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
