/**
 * Migración 007: Índice único en dividendos(ticker, fecha)
 * Elimina duplicados existentes antes de añadir la restricción.
 */

async function up(db, dbRun) {
    // Remove duplicate (ticker, fecha) rows keeping the earliest id
    await dbRun(db, `
        DELETE FROM dividendos
        WHERE id NOT IN (
            SELECT MIN(id) FROM dividendos GROUP BY ticker, fecha
        )
    `);

    // Add unique index — prevents duplicates on future inserts/syncs
    await dbRun(db, `
        CREATE UNIQUE INDEX IF NOT EXISTS idx_dividendos_ticker_fecha
        ON dividendos(ticker, fecha)
    `);

    console.log('   ✅ Índice único idx_dividendos_ticker_fecha creado');
}

module.exports = { up };
