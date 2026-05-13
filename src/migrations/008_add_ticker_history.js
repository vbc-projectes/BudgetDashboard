/**
 * Migración 008: Histórico de precios de tickers
 * Almacena precios de cierre diarios para tickers usados por el usuario.
 * Evita llamadas repetidas a Yahoo Finance para el mismo período.
 */

async function up(db, dbRun) {
    await dbRun(db, `
        CREATE TABLE IF NOT EXISTS ticker_history (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker     TEXT NOT NULL,
            fecha      TEXT NOT NULL,
            precio_cierre REAL NOT NULL,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(ticker, fecha)
        )
    `);

    await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_ticker_history_ticker_fecha ON ticker_history(ticker, fecha)`);

    console.log('   ✅ Tabla ticker_history creada');
}

async function down(db, dbRun) {
    await dbRun(db, `DROP TABLE IF EXISTS ticker_history`);
}

module.exports = { up, down };
