/**
 * Migration 009: Add source + importe_por_accion columns to dividendos table.
 * source: 'manual' | 'auto' (auto = fetched from Yahoo Finance)
 */

async function columnExists(db, dbAll, table, column) {
    const rows = await dbAll(db, `PRAGMA table_info(${table})`);
    return rows.some(row => row.name === column);
}

async function addColumnIfMissing(db, dbRun, dbAll, table, column, definition) {
    const exists = await columnExists(db, dbAll, table, column);
    if (!exists) {
        await dbRun(db, `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
}

async function up(db, dbRun, dbGet, dbAll) {
    await addColumnIfMissing(db, dbRun, dbAll, 'dividendos', 'source', "TEXT DEFAULT 'manual'");
    await addColumnIfMissing(db, dbRun, dbAll, 'dividendos', 'importe_por_accion', 'REAL');
}

module.exports = { up };
