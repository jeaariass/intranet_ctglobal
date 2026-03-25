/**
 * run-migrations.js
 * Ejecuta todos los archivos migration.sql en orden numérico.
 *
 * Uso:
 *   node prisma/run-migrations.js
 *
 * Lo que hace:
 *   1. Crea la tabla _migrations si no existe (registro de lo ya ejecutado)
 *   2. Lee todas las carpetas de migrations en orden
 *   3. Ejecuta solo las que no han corrido antes
 *   4. Registra cada migration exitosa
 *
 * Así puedes correr el script múltiples veces sin problema:
 *   - Primera vez: ejecuta las 4 migrations
 *   - Segunda vez: no ejecuta nada (ya están registradas)
 *   - Cuando agregues migration 005: solo ejecuta esa
 */

require("dotenv").config();
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  console.log("✅ Conectado a PostgreSQL\n");

  // Tabla de control: saber qué migrations ya corrieron
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          SERIAL PRIMARY KEY,
      nombre      TEXT NOT NULL UNIQUE,
      ejecutado_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Leer migrations ya ejecutadas
  const { rows: done } = await client.query(
    "SELECT nombre FROM _migrations ORDER BY nombre"
  );
  const doneSet = new Set(done.map((r) => r.nombre));

  // Leer carpetas de migrations en orden
  const migrationsDir = path.join(__dirname, "migrations");
  const folders = fs
    .readdirSync(migrationsDir)
    .filter((f) => fs.statSync(path.join(migrationsDir, f)).isDirectory())
    .sort(); // orden alfabético = orden numérico (001, 002, 003...)

  let ran = 0;
  let skipped = 0;

  for (const folder of folders) {
    if (doneSet.has(folder)) {
      console.log(`⏭️  Saltando (ya ejecutada): ${folder}`);
      skipped++;
      continue;
    }

    const sqlPath = path.join(migrationsDir, folder, "migration.sql");
    if (!fs.existsSync(sqlPath)) {
      console.log(`⚠️  Sin migration.sql en: ${folder}`);
      continue;
    }

    const sql = fs.readFileSync(sqlPath, "utf8");

    console.log(`🔄 Ejecutando: ${folder}...`);

    try {
      // Ejecutar en una transacción para que falle limpio si hay error
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO _migrations (nombre) VALUES ($1)",
        [folder]
      );
      await client.query("COMMIT");
      console.log(`✅ Completada: ${folder}\n`);
      ran++;
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`❌ Error en ${folder}:`);
      console.error(`   ${err.message}`);
      console.error("\n💡 La migration se revirtió. Corrige el error y vuelve a correr.\n");
      await client.end();
      process.exit(1);
    }
  }

  console.log("─────────────────────────────────────");
  console.log(`📊 Resumen:`);
  console.log(`   Ejecutadas: ${ran}`);
  console.log(`   Saltadas:   ${skipped}`);
  console.log(`   Total:      ${folders.length}`);

  if (ran > 0) {
    console.log("\n✅ Base de datos actualizada correctamente.");
    console.log("   Siguiente paso: node prisma/seed.js\n");
  } else {
    console.log("\n✅ Base de datos ya estaba al día.\n");
  }

  await client.end();
}

run().catch((e) => {
  console.error("❌ Error fatal:", e.message);
  process.exit(1);
});
