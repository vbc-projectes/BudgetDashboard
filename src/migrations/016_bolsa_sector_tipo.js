async function up(db, dbRun, dbGet, dbAll) {
    const cols = await dbAll(db, `PRAGMA table_info(operaciones_bolsa)`);
    const names = (cols || []).map(c => c.name);
    if (!names.includes('sector'))      await dbRun(db, `ALTER TABLE operaciones_bolsa ADD COLUMN sector TEXT`);
    if (!names.includes('tipo_activo')) await dbRun(db, `ALTER TABLE operaciones_bolsa ADD COLUMN tipo_activo TEXT`);
    await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_operaciones_bolsa_sector ON operaciones_bolsa(sector)`);
    console.log('   ✅ Columnas sector y tipo_activo añadidas a operaciones_bolsa');
}

async function down(db, dbRun) {
    // SQLite no soporta DROP COLUMN en versiones antiguas; se omite rollback destructivo
}

module.exports = { up, down };
