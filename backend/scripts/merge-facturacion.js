/**
 * merge-facturacion.js
 * Traspasa el histórico de la tabla `invoices` (módulo Facturación, ya
 * decomisionado) hacia `gastos` con categoria='EQUIPO', y copia los PDFs de
 * uploads/invoices/ a uploads/gastos/.
 *
 * Se corre en el servidor (necesita el filesystem real de uploads/), como
 * parte de deploy.sh justo después de que la migración 020 (que agrega el
 * valor 'EQUIPO' al enum gasto_categoria) haya quedado confirmada.
 *
 * Idempotente: cada gasto migrado queda marcado en notas con
 * "[ref:factura-<id>]"; si ya existe, esa factura se salta. No borra ni
 * modifica la tabla `invoices` ni sus archivos — queda intacta como respaldo.
 *
 * Uso: node scripts/merge-facturacion.js
 */

require("dotenv").config();
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const client = new Client({ connectionString: process.env.DATABASE_URL });

const uploadsInvoices = path.join(__dirname, "../uploads/invoices");
const uploadsGastos   = path.join(__dirname, "../uploads/gastos");

const TIPO_A_SUBCATEGORIA = {
  COMPRA: "Compra",
  SERVICIO_MENSUAL: "Servicio mensual",
  SERVICIO_ANUAL: "Servicio anual",
  MANTENIMIENTO: "Mantenimiento",
  OTRO: "Otro",
};

const ESTADO_A_GASTO = {
  PENDIENTE: "PENDIENTE",
  PAGADO: "PAGADO",
  VENCIDO: "PENDIENTE",   // Gastos no tiene estado VENCIDO propio; se resalta por fecha_vencimiento vencida en la UI.
  CANCELADO: "ANULADO",
};

async function run() {
  await client.connect();

  const { rows: tabla } = await client.query(`SELECT to_regclass('invoices') AS existe`);
  if (!tabla[0].existe) {
    console.log("✅ Tabla 'invoices' no existe (ya migrada/removida). Nada que hacer.");
    await client.end();
    return;
  }

  if (!fs.existsSync(uploadsGastos)) fs.mkdirSync(uploadsGastos, { recursive: true });

  const { rows: facturas } = await client.query(`SELECT * FROM invoices ORDER BY id ASC`);
  console.log(`📄 ${facturas.length} factura(s) en 'invoices'.`);

  let migradas = 0, saltadas = 0, avisos = 0;

  for (const f of facturas) {
    const marcador = `[ref:factura-${f.id}]`;
    const { rows: yaExiste } = await client.query(
      `SELECT id FROM gastos WHERE notas LIKE $1 LIMIT 1`,
      [`%${marcador}%`]
    );
    if (yaExiste.length) { saltadas++; continue; }

    let archivoNuevo = "";
    if (f.archivo_pdf) {
      const origen = path.join(uploadsInvoices, f.archivo_pdf);
      if (fs.existsSync(origen)) {
        archivoNuevo = `fact${f.id}_${f.archivo_pdf}`;
        fs.copyFileSync(origen, path.join(uploadsGastos, archivoNuevo));
      } else {
        console.warn(`⚠️  Factura #${f.id}: no se encontró el archivo ${f.archivo_pdf}, se migra sin adjunto.`);
        avisos++;
      }
    }

    const notas = [f.notas || "", marcador].filter(Boolean).join(" ").trim();

    await client.query(`
      INSERT INTO gastos
        (categoria, subcategoria, concepto, proveedor, monto, moneda,
         monto_secundario, moneda_secundaria, fecha, fecha_vencimiento,
         periodo_mes, periodo_anio, estado, equipo_id, recurrente,
         archivo, notas, registrado_por_id)
      VALUES ('EQUIPO',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,FALSE,$14,$15,$16)
    `, [
      TIPO_A_SUBCATEGORIA[f.tipo] || "Otro",
      f.concepto,
      f.proveedor || "",
      f.monto,
      f.moneda || "COP",
      f.monto_secundario,
      f.moneda_secundaria,
      f.fecha_emision,
      f.fecha_vencimiento,
      f.periodo_mes,
      f.periodo_anio,
      ESTADO_A_GASTO[f.estado] || "PENDIENTE",
      f.equipo_id,
      archivoNuevo,
      notas,
      f.registrado_por_id,
    ]);
    migradas++;
  }

  console.log(`✅ Migradas: ${migradas} · Ya migradas (saltadas): ${saltadas} · Avisos: ${avisos}`);
  await client.end();
}

run().catch((e) => {
  console.error("❌ Error migrando Facturación → Gastos:", e.message);
  process.exit(1);
});
