const db = require('../config/database');
const { dbRun, dbGet, dbAll } = require('../utils/dbHelpers');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

const MIGRATIONS_TABLE = 'migrations';
const MIGRATIONS_DIR = path.join(__dirname, '../migrations');

/**
 * Inicializa la tabla de migraciones
 */
async function initMigrationsTable() {
    await dbRun(db, `
        CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            version TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            executed_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

/**
 * Obtiene todas las migraciones ejecutadas
 */
async function getExecutedMigrations() {
    const rows = await dbAll(db, `SELECT version FROM ${MIGRATIONS_TABLE} ORDER BY version`);
    return rows.map(row => row.version);
}

/**
 * Registra una migración como ejecutada
 */
async function recordMigration(version, name) {
    await dbRun(db, `INSERT INTO ${MIGRATIONS_TABLE} (version, name) VALUES (?, ?)`, [version, name]);
}

/**
 * Obtiene todos los archivos de migración disponibles
 */
function getAvailableMigrations() {
    if (!fs.existsSync(MIGRATIONS_DIR)) {
        fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
        return [];
    }

    const files = fs.readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.js'))
        .sort();

    return files.map(file => {
        const match = file.match(/^(\d+)_(.+)\.js$/);
        if (!match) return null;
        return {
            version: match[1],
            name: match[2],
            filename: file,
            path: path.join(MIGRATIONS_DIR, file)
        };
    }).filter(Boolean);
}

/**
 * Ejecuta las migraciones pendientes
 */
async function runMigrations() {
    logger.info('Checking migrations...');
    
    await initMigrationsTable();
    
    const executedMigrations = await getExecutedMigrations();
    const availableMigrations = getAvailableMigrations();
    
    const pendingMigrations = availableMigrations.filter(
        m => !executedMigrations.includes(m.version)
    );

    if (pendingMigrations.length === 0) {
        logger.info('Database schema is up to date');
        return;
    }

    logger.info(`Applying ${pendingMigrations.length} pending migration(s)...`);

    for (const migration of pendingMigrations) {
        try {
            logger.info(`  Applying: ${migration.version}_${migration.name}`);
            
            const migrationModule = require(migration.path);
            
            if (typeof migrationModule.up !== 'function') {
                throw new Error(`Migration ${migration.filename} missing 'up' function`);
            }

            await dbRun(db, 'BEGIN');
            try {
                await migrationModule.up(db, dbRun, dbGet, dbAll);
                await recordMigration(migration.version, migration.name);
                await dbRun(db, 'COMMIT');
            } catch (innerErr) {
                await dbRun(db, 'ROLLBACK').catch(() => {});
                throw innerErr;
            }
            
            logger.info(`  Done:     ${migration.version}_${migration.name}`);
        } catch (err) {
            logger.error(`  Failed:   ${migration.filename}:`, err.message);
            throw err;
        }
    }

    logger.info('All migrations applied successfully');
}

module.exports = { runMigrations, getAvailableMigrations, getExecutedMigrations };
