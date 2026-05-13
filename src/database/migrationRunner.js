const db = require('../config/database');
const { dbRun, dbGet, dbAll } = require('../utils/dbHelpers');
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
    console.log('🔄 Verificando migraciones...');
    
    await initMigrationsTable();
    
    const executedMigrations = await getExecutedMigrations();
    const availableMigrations = getAvailableMigrations();
    
    const pendingMigrations = availableMigrations.filter(
        m => !executedMigrations.includes(m.version)
    );

    if (pendingMigrations.length === 0) {
        console.log('✅ Todas las migraciones están actualizadas');
        return;
    }

    console.log(`📦 Ejecutando ${pendingMigrations.length} migración(es) pendiente(s)...`);

    for (const migration of pendingMigrations) {
        try {
            console.log(`   Ejecutando: ${migration.version}_${migration.name}...`);
            
            const migrationModule = require(migration.path);
            
            if (typeof migrationModule.up !== 'function') {
                throw new Error(`Migración ${migration.filename} no tiene función 'up'`);
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
            
            console.log(`   ✅ Completada: ${migration.version}_${migration.name}`);
        } catch (err) {
            console.error(`   ❌ Error en migración ${migration.filename}:`, err.message);
            throw err;
        }
    }

    console.log('✅ Todas las migraciones se ejecutaron correctamente');
}

module.exports = { runMigrations, getAvailableMigrations, getExecutedMigrations };
