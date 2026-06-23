async function up(db, dbRun, dbGet, dbAll) {
    const cols = await dbAll(db, `PRAGMA table_info(sub_huchas)`);
    const names = (cols || []).map(c => c.name);
    if (!names.includes('objetivo'))       await dbRun(db, `ALTER TABLE sub_huchas ADD COLUMN objetivo REAL`);
    if (!names.includes('fecha_objetivo')) await dbRun(db, `ALTER TABLE sub_huchas ADD COLUMN fecha_objetivo TEXT`);
    if (!names.includes('color'))          await dbRun(db, `ALTER TABLE sub_huchas ADD COLUMN color TEXT`);
    if (!names.includes('icono'))          await dbRun(db, `ALTER TABLE sub_huchas ADD COLUMN icono TEXT`);
    console.log('   ✅ Columnas objetivo, fecha_objetivo, color, icono añadidas a sub_huchas');
}

async function down(db, dbRun) {
    // SQLite no soporta DROP COLUMN en versiones antiguas; se omite rollback destructivo
}

module.exports = { up, down };
