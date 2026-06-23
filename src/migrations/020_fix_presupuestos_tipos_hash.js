async function up(db, dbRun, dbGet, dbAll) {
    // Re-ensure tables from M019 exist (idempotent)
    await dbRun(db, `
        CREATE TABLE IF NOT EXISTS presupuestos_categoria (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            categoria_id INTEGER NOT NULL UNIQUE,
            limite_mensual REAL NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE CASCADE
        )
    `);

    await dbRun(db, `
        CREATE TABLE IF NOT EXISTS historial_tipos_interes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cuenta_remunerada_id INTEGER NOT NULL,
            desde TEXT NOT NULL,
            interes REAL NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (cuenta_remunerada_id) REFERENCES cuenta_remunerada(id) ON DELETE CASCADE
        )
    `);

    await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_historial_tipos_cr ON historial_tipos_interes(cuenta_remunerada_id, desde)`);

    // Add hash_dedup columns only if they don't already exist
    const gastosRealesCols = await dbAll(db, `PRAGMA table_info(gastos_reales)`);
    if (!(gastosRealesCols || []).find(c => c.name === 'hash_dedup')) {
        await dbRun(db, `ALTER TABLE gastos_reales ADD COLUMN hash_dedup TEXT`);
    }

    const ingresosRealesCols = await dbAll(db, `PRAGMA table_info(ingresos_reales)`);
    if (!(ingresosRealesCols || []).find(c => c.name === 'hash_dedup')) {
        await dbRun(db, `ALTER TABLE ingresos_reales ADD COLUMN hash_dedup TEXT`);
    }

    await dbRun(db, `CREATE UNIQUE INDEX IF NOT EXISTS idx_gastos_reales_hash ON gastos_reales(hash_dedup) WHERE hash_dedup IS NOT NULL`);
    await dbRun(db, `CREATE UNIQUE INDEX IF NOT EXISTS idx_ingresos_reales_hash ON ingresos_reales(hash_dedup) WHERE hash_dedup IS NOT NULL`);

    console.log('   ✅ M020: presupuestos_categoria, historial_tipos_interes, hash_dedup columns ensured');
}

async function down(db, dbRun) {
    await dbRun(db, `DROP TABLE IF EXISTS presupuestos_categoria`);
    await dbRun(db, `DROP TABLE IF EXISTS historial_tipos_interes`);
}

module.exports = { up, down };
