async function up(db, dbRun, dbGet, dbAll) {
    const tablas = [
        'gastos_puntuales',
        'gastos_mensuales',
        'ingresos_puntuales',
        'ingresos_mensuales',
        'impuestos_puntuales',
        'impuestos_mensuales'
    ];
    for (const tabla of tablas) {
        const cols = await dbAll(db, `PRAGMA table_info(${tabla})`);
        if (!(cols || []).find(c => c.name === 'notas')) {
            await dbRun(db, `ALTER TABLE ${tabla} ADD COLUMN notas TEXT`);
        }
    }
    console.log('   ✅ Columna notas añadida a tablas de gastos, ingresos e impuestos');
}

async function down(db, dbRun) {
    // SQLite no soporta DROP COLUMN en versiones antiguas; se omite rollback destructivo
}

module.exports = { up, down };
