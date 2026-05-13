/**
 * server.js — Express entry point for Docker/web deployment
 * Replaces Electron's main.js when running in web mode.
 * SQLite data is persisted in USERS_ROOT (mounted as Docker volume).
 */

'use strict';

const express = require('express');
const path = require('path');
const config = require('./src/config/config');
const {
    securityMiddleware,
    timeoutMiddleware,
    errorHandler,
    notFoundHandler
} = require('./src/middleware/index');
const routes = require('./src/routes/index');

const app = express();

// ── Body parsers ────────────────────────────────────────────────────
app.use(express.json({ limit: config.BODY_LIMIT }));
app.use(express.urlencoded({ extended: false, limit: config.BODY_LIMIT }));

// ── Security / CORS / timeout ────────────────────────────────────────
app.use(securityMiddleware);
app.use(timeoutMiddleware);

// ── Static frontend ──────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── API routes ───────────────────────────────────────────────────────
app.use('/', routes);

// ── SPA fallback: serve index.html for any non-API GET ───────────────
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/add/') ||
        req.path.startsWith('/update/') || req.path.startsWith('/delete/') ||
        req.path.startsWith('/import/') || req.path.startsWith('/sell/')) {
        return next();
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Error handling ───────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

const { runMigrations } = require('./src/database/migrationRunner');
const {
    readLastUser,
    ensureUserFolders
} = require('./src/config/userManager');
const db = require('./src/config/database');

// ── Start ────────────────────────────────────────────────────────────
const PORT = config.PORT;
app.listen(PORT, async () => {
    console.log(`🚀 DashboardEconomic web server running on http://localhost:${PORT}`);
    console.log(`   NODE_ENV: ${config.NODE_ENV}`);
    console.log(`   USERS_ROOT: ${config.USERS_ROOT}`);

    // If there is a last-used user, switch to their DB and run migrations.
    // Otherwise run migrations on the default DB so the schema is always current.
    try {
        const lastUser = readLastUser();
        if (lastUser) {
            const paths = ensureUserFolders(lastUser);
            await db.__setDbPath(paths.dbPath);
            console.log(`   Resuming as user: ${lastUser}`);
        }
        await runMigrations();
    } catch (err) {
        console.error('❌ Error en migraciones al arrancar:', err.message);
    }
});

module.exports = app;
