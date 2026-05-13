/**
 * Migración 010: Importar assets existentes como operaciones de compra
 *
 * Los registros de la tabla `assets` (tabla legacy de posiciones) se insertan
 * en `operaciones_bolsa` como operaciones de tipo 'compra', de modo que la
 * lógica de posiciones del módulo Inversiones los tenga en cuenta.
 *
 * Se usan tres criterios para evitar duplicados al re-ejecutar:
 *   - Solo se insertan tickers de `assets` que no tengan ya alguna operación
 *     de compra en `operaciones_bolsa`.
 *   - La operación lleva notas='Importado desde assets' para identificarla.
 *   - La migración es idempotente: si la tabla `assets` no existe o está vacía
 *     termina sin error.
 */

async function up(db, dbRun, dbGet, dbAll) {
    // Comprobar que la tabla assets existe
    const tableExists = await dbGet(db, `
        SELECT name FROM sqlite_master WHERE type='table' AND name='assets'
    `);
    if (!tableExists) {
        console.log('   ℹ️  Tabla assets no encontrada – migración omitida');
        return;
    }

    const assets = await dbAll(db, `SELECT * FROM assets`);
    if (!assets || assets.length === 0) {
        console.log('   ℹ️  Sin registros en assets – migración omitida');
        return;
    }

    let insertados = 0;
    let omitidos = 0;

    for (const asset of assets) {
        const ticker = String(asset.ticker || '').trim().toUpperCase();
        if (!ticker) { omitidos++; continue; }

        // Saltar si ya existe alguna compra para este ticker
        const existing = await dbGet(db, `
            SELECT id FROM operaciones_bolsa
            WHERE ticker = ? AND tipo = 'compra'
            LIMIT 1
        `, [ticker]);

        if (existing) { omitidos++; continue; }

        // Usar created_at como fecha de compra (fallback: hoy)
        let fecha = null;
        if (asset.created_at) {
            fecha = String(asset.created_at).slice(0, 10);
        }
        if (!fecha || fecha === 'undefined') {
            fecha = new Date().toISOString().slice(0, 10);
        }

        const empresa  = String(asset.company || '').trim() || null;
        const cantidad = parseFloat(asset.shares) || 0;
        const precio   = parseFloat(asset.purchase_price) || 0;

        if (cantidad <= 0 || precio <= 0) { omitidos++; continue; }

        await dbRun(db, `
            INSERT INTO operaciones_bolsa
                (ticker, empresa, tipo, fecha, cantidad, precio_unitario, comision, notas)
            VALUES (?, ?, 'compra', ?, ?, ?, 0, 'Importado desde assets')
        `, [ticker, empresa, fecha, cantidad, precio]);

        insertados++;
    }

    console.log(`   ✅ Assets importados como operaciones: ${insertados} insertados, ${omitidos} omitidos`);
}

module.exports = { up };
