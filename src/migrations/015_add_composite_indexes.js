/**
 * Migración 015: Índices compuestos para queries de rango (desde, hasta)
 * Las queries WHERE desde <= ? AND hasta >= ? se benefician de un índice compuesto
 * más que de dos índices separados (ya existentes en 002).
 */

async function up(db, dbRun) {
    await dbRun(db, `
        CREATE INDEX IF NOT EXISTS idx_cuenta_remunerada_desde_hasta
        ON cuenta_remunerada(desde, hasta)
    `);

    await dbRun(db, `
        CREATE INDEX IF NOT EXISTS idx_gastos_mensuales_desde_hasta
        ON gastos_mensuales(desde, hasta)
    `);

    await dbRun(db, `
        CREATE INDEX IF NOT EXISTS idx_ingresos_mensuales_desde_hasta
        ON ingresos_mensuales(desde, hasta)
    `);

    await dbRun(db, `
        CREATE INDEX IF NOT EXISTS idx_impuestos_mensuales_desde_hasta
        ON impuestos_mensuales(desde, hasta)
    `);

    console.log('   ✅ Índices compuestos (desde, hasta) creados');
}

async function down(db, dbRun) {
    const indexes = [
        'idx_cuenta_remunerada_desde_hasta',
        'idx_gastos_mensuales_desde_hasta',
        'idx_ingresos_mensuales_desde_hasta',
        'idx_impuestos_mensuales_desde_hasta'
    ];
    for (const idx of indexes) {
        await dbRun(db, `DROP INDEX IF EXISTS ${idx}`);
    }
    console.log('   ✅ Índices compuestos eliminados (rollback)');
}

module.exports = { up, down };
