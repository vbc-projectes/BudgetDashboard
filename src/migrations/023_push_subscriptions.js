/**
 * Migración 023: Suscripciones push (notificaciones de pagos próximos)
 * Cada fila es un endpoint de navegador/PWA suscrito en este usuario —
 * puede haber varias si el usuario instaló la PWA en varios dispositivos.
 */

async function up(db, dbRun) {
    await dbRun(db, `
        CREATE TABLE IF NOT EXISTS push_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            endpoint TEXT NOT NULL UNIQUE,
            p256dh TEXT NOT NULL,
            auth TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

async function down(db, dbRun) {
    await dbRun(db, `DROP TABLE IF EXISTS push_subscriptions`);
}

module.exports = { up, down };
