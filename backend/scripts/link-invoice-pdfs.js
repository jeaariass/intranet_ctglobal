// backend/scripts/link-invoice-pdfs.js
// Vincula archivos PDF existentes en /uploads/invoices/ con sus facturas en la BD.
//
// USO:
//   1. Pon tus PDFs en backend/uploads/invoices/
//   2. Edita el array LINKS_PDF más abajo con el nombre del archivo y el concepto de la factura
//   3. Ejecuta:  node scripts/link-invoice-pdfs.js

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const { Pool } = require("pg");
const fs   = require("fs");
const path = require("path");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

// ─────────────────────────────────────────────────────────────
// EDITA ESTE ARRAY:
// archivo     → nombre exacto del PDF en backend/uploads/invoices/
// concepto    → parte del concepto en la BD (no tiene que ser exacto, usa ILIKE)
// mes / anio  → para identificar la factura correcta
// ─────────────────────────────────────────────────────────────
const LINKS_PDF = [

  { archivo: "Invoice-7XHZTROX-0002.pdf", mes: 4,  anio: 2025 },
  { archivo: "Invoice-7XHZTROX-0003.pdf", mes: 5,  anio: 2025 },
  { archivo: "Invoice-7XHZTROX-0004.pdf", mes: 6,  anio: 2025 },
  { archivo: "Invoice-7XHZTROX-0005.pdf", mes: 7,  anio: 2025 },
  { archivo: "Invoice-7XHZTROX-0006.pdf", mes: 8,  anio: 2025 },
  { archivo: "Invoice-7XHZTROX-0007.pdf", mes: 9,  anio: 2025 },
  { archivo: "Invoice-7XHZTROX-0008.pdf", mes: 10, anio: 2025 },
  { archivo: "Invoice-7XHZTROX-0009.pdf", mes: 11, anio: 2025 },
  { archivo: "Invoice-7XHZTROX-0010.pdf", mes: 12, anio: 2025 },
  { archivo: "Invoice-7XHZTROX-0011.pdf", mes: 1,  anio: 2026 },
  { archivo: "Invoice-7XHZTROX-0012.pdf", mes: 2,  anio: 2026 },
  { archivo: "Invoice-7XHZTROX-0013.pdf", mes: 3,  anio: 2026 },

  // Agrega tus otros PDFs aquí con el mes y año que corresponde.
  // Ejemplo para facturas anteriores (si las tienes):
  // { archivo: "claude-dic-2025.pdf",  mes: 12, anio: 2025 },
  // { archivo: "claude-nov-2025.pdf",  mes: 11, anio: 2025 },
  // { archivo: "claude-oct-2025.pdf",  mes: 10, anio: 2025 },
  // { archivo: "claude-sep-2025.pdf",  mes: 9,  anio: 2025 },
  // { archivo: "claude-ago-2025.pdf",  mes: 8,  anio: 2025 },
  // { archivo: "claude-jul-2025.pdf",  mes: 7,  anio: 2025 },
  // { archivo: "claude-jun-2025.pdf",  mes: 6,  anio: 2025 },
  // { archivo: "claude-may-2025.pdf",  mes: 5,  anio: 2025 },
  // { archivo: "claude-abr-2025.pdf",  mes: 4,  anio: 2025 },
];

const uploadsDir = path.join(__dirname, "../uploads/invoices");

async function main() {
  console.log("🔗 Vinculando PDFs con facturas en la BD...\n");

  let ok = 0, errores = 0;

  for (const link of LINKS_PDF) {
    const filePath = path.join(uploadsDir, link.archivo);

    // 1. Verificar que el archivo existe
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  Archivo no encontrado: ${link.archivo} — saltando`);
      errores++;
      continue;
    }

    // 2. Buscar la factura en la BD por mes y año (y proveedor Anthropic)
    const { rows } = await pool.query(
      `SELECT id, concepto FROM invoices
       WHERE periodo_mes = $1 AND periodo_anio = $2
         AND proveedor ILIKE 'anthropic'
       LIMIT 1`,
      [link.mes, link.anio]
    );

    if (!rows[0]) {
      console.log(`⚠️  No se encontró factura para ${link.mes}/${link.anio} — saltando`);
      errores++;
      continue;
    }

    // 3. Actualizar el campo archivo_pdf
    await pool.query(
      `UPDATE invoices SET archivo_pdf = $1 WHERE id = $2`,
      [link.archivo, rows[0].id]
    );

    console.log(`✅ ${link.archivo} → "${rows[0].concepto}" (id: ${rows[0].id})`);
    ok++;
  }

  console.log(`\n📊 Resultado: ${ok} vinculados, ${errores} sin vincular`);
  await pool.end();
}

main().catch(e => {
  console.error("❌ Error:", e.message);
  process.exit(1);
});