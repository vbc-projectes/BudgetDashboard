/**
 * Migración 012: Añade columna linked_to_bolsa a cuenta_remunerada
 * Permite marcar una cuenta como vinculada al portfolio de bolsa,
 * de modo que las compras/ventas de acciones afectan su saldo calculado.
 */

async function up(db, dbRun, _dbGet, dbAll) {
    // SQLite no soporta IF NOT EXISTS en ALTER TABLE, así que comprobamos primero
    const info = await dbAll(db, 'PRAGMA table_info(cuenta_remunerada)');

    const hasCol = info.some(r => r.name === 'linked_to_bolsa');
    if (!hasCol) {
        await dbRun(db, `ALTER TABLE cuenta_remunerada ADD COLUMN linked_to_bolsa INTEGER DEFAULT 0`);
        console.log('   ✅ Columna linked_to_bolsa añadida a cuenta_remunerada');
    } else {
        console.log('   ℹ️ Columna linked_to_bolsa ya existe en cuenta_remunerada');
    }
}

module.exports = { up };
