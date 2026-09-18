// backend/src/lib/gastosRecurrentes.js
// Lógica compartida de avance de series recurrentes de gastos, usada por el
// scheduler diario (gastosScheduler.js) y por el endpoint manual de
// "generar siguiente ocurrencia" (routes/gastos.js).

// Suma N meses a una fecha (YYYY-MM-DD), ajustando al último día si el mes
// destino es más corto (ej. 31 ene +1 → 28/29 feb).
function sumarMeses(fechaStr, n) {
  if (!fechaStr) return null;
  const d = new Date(fechaStr);
  const dia = d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const ultimoDia = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(dia, ultimoDia));
  return target.toISOString().slice(0, 10);
}

// Período (mes/año) que le correspondería a la siguiente ocurrencia de una
// serie, dada su última fila.
function siguientePeriodo(actual) {
  const intervalo = Math.max(1, actual.intervalo_meses || 1);
  const idx = (actual.periodo_anio * 12 + (actual.periodo_mes - 1)) + intervalo;
  return { anio: Math.floor(idx / 12), mes: (idx % 12) + 1, intervalo };
}

// Inserta la fila de la siguiente ocurrencia de la serie a partir de `actual`
// (última fila conocida). No valida si "corresponde" generarla todavía —
// eso lo decide quien llama (scheduler: tope de mes actual; endpoint manual:
// ver gastos.js).
async function generarOcurrencia(q, actual) {
  const { anio: nuevoAnio, mes: nuevoMes, intervalo } = siguientePeriodo(actual);
  const nuevaFecha = sumarMeses(actual.fecha, intervalo);
  const nuevoVenc  = actual.fecha_vencimiento ? sumarMeses(actual.fecha_vencimiento, intervalo) : null;
  const esFijo = actual.recurrente_tipo === "FIJO";

  const rows = await q(`
    INSERT INTO gastos
      (categoria, subcategoria, concepto, proveedor, monto, moneda,
       monto_secundario, moneda_secundaria, fecha, fecha_vencimiento,
       periodo_mes, periodo_anio, estado, persona_id, equipo_id, proyecto_id,
       recurrente, recurrente_tipo, intervalo_meses, serie_id, por_completar,
       archivo, notas, registrado_por_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
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
    true, actual.recurrente_tipo, intervalo, actual.serie_id,
    !esFijo,
    "", actual.notas,
    actual.registrado_por_id,
  ]);
  return rows[0];
}

module.exports = { sumarMeses, siguientePeriodo, generarOcurrencia };
