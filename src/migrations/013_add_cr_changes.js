/**
 * Migración 013: Añade soporte para aportaciones variables y ajustes manuales de saldo
 * en la cuenta remunerada.
 *
 * cuenta_remunerada_aportaciones: permite cambiar la aportación mensual a partir de una fecha.
 * cuenta_remunerada_ajustes:      permite fijar el saldo correcto en una fecha concreta.
 */

async function up(db, dbRun) {
    await dbRun(db, `
        CREATE TABLE IF NOT EXISTS cuenta_remunerada_aportaciones (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            cuenta_id  INTEGER NOT NULL REFERENCES cuenta_remunerada(id) ON DELETE CASCADE,
            desde      TEXT    NOT NULL,
            cantidad   REAL    NOT NULL
        )
    `);
    console.log('   ✅ Tabla cuenta_remunerada_aportaciones creada/verificada');

    await dbRun(db, `
        CREATE TABLE IF NOT EXISTS cuenta_remunerada_ajustes (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            cuenta_id   INTEGER NOT NULL REFERENCES cuenta_remunerada(id) ON DELETE CASCADE,
            fecha       TEXT    NOT NULL,
            saldo       REAL    NOT NULL,
            descripcion TEXT
        )
    `);
    console.log('   ✅ Tabla cuenta_remunerada_ajustes creada/verificada');
}

module.exports = { up };
