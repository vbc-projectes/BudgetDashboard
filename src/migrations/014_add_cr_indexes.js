/**
 * Migración 014: Añade índices sobre cuenta_id en las tablas de aportaciones
 * y ajustes de cuenta remunerada (creadas en 013) para acelerar las queries
 * de filtrado por cuenta.
 */

async function up(db, dbRun) {
    await dbRun(db, `
        CREATE INDEX IF NOT EXISTS idx_cr_aportaciones_cuenta_id
        ON cuenta_remunerada_aportaciones(cuenta_id)
    `);
    console.log('   ✅ Índice idx_cr_aportaciones_cuenta_id creado/verificado');

    await dbRun(db, `
        CREATE INDEX IF NOT EXISTS idx_cr_ajustes_cuenta_id
        ON cuenta_remunerada_ajustes(cuenta_id)
    `);
    console.log('   ✅ Índice idx_cr_ajustes_cuenta_id creado/verificado');
}

module.exports = { up };
