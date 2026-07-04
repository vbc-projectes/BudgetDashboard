async function up(db, dbRun) {
    await dbRun(db, `ALTER TABLE gastos_mensuales ADD COLUMN frecuencia_meses INTEGER DEFAULT 1 NOT NULL`);
}

module.exports = { up };
