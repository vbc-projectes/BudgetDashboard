/**
 * Migración 022: Tabla genérica de ajustes clave-valor por usuario
 * Persiste preferencias que antes solo vivían en localStorage (p.ej. retención
 * de dividendos), para que sean consistentes entre Electron y web y no se
 * pierdan al cambiar de origen/perfil.
 */

async function up(db, dbRun) {
    await dbRun(db, `
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

async function down(db, dbRun) {
    await dbRun(db, `DROP TABLE IF EXISTS app_settings`);
}

module.exports = { up, down };
