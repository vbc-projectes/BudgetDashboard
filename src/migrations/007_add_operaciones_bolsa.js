/**
 * Migración 007: Tablas de operaciones de bolsa
 * Crea tablas para registrar compras/ventas de acciones y dividendos
 */

async function up(db, dbRun) {
    // Tabla de operaciones de bolsa (compras y ventas)
    await dbRun(db, `
        CREATE TABLE IF NOT EXISTS operaciones_bolsa (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker TEXT NOT NULL,
            empresa TEXT,
            tipo TEXT CHECK(tipo IN ('compra','venta')) NOT NULL,
            fecha TEXT NOT NULL,
            cantidad REAL NOT NULL,
            precio_unitario REAL NOT NULL,
            comision REAL DEFAULT 0,
            notas TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Tabla de dividendos
    await dbRun(db, `
        CREATE TABLE IF NOT EXISTS dividendos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker TEXT NOT NULL,
            empresa TEXT,
            fecha TEXT NOT NULL,
            importe_bruto REAL NOT NULL,
            retencion REAL DEFAULT 0,
            notas TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Índices de rendimiento
    await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_operaciones_bolsa_ticker ON operaciones_bolsa(ticker)`);
    await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_operaciones_bolsa_fecha ON operaciones_bolsa(fecha)`);
    await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_dividendos_ticker ON dividendos(ticker)`);
    await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_dividendos_fecha ON dividendos(fecha)`);

    console.log('   ✅ Tablas de bolsa creadas (operaciones_bolsa, dividendos)');
}

async function down(db, dbRun) {
    await dbRun(db, `DROP TABLE IF EXISTS dividendos`);
    await dbRun(db, `DROP TABLE IF EXISTS operaciones_bolsa`);
}

module.exports = { up, down };
