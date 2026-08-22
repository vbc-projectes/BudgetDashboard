/**
 * src/routes/settings.js
 * Ajustes clave-valor persistidos por usuario (tabla app_settings).
 */
'use strict';

const express = require('express');
const db = require('../config/database');
const { dbGet, dbRun } = require('../utils/dbHelpers');

const router = express.Router();

router.get('/settings/:key', async (req, res, next) => {
    try {
        const row = await dbGet(db, `SELECT value FROM app_settings WHERE key = ?`, [req.params.key]);
        res.json({ key: req.params.key, value: row ? row.value : null });
    } catch (err) { next(err); }
});

router.post('/settings/:key', async (req, res, next) => {
    try {
        const { value } = req.body || {};
        if (value === undefined) return res.status(400).json({ error: 'value es requerido' });
        await dbRun(db,
            `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
            [req.params.key, String(value)]
        );
        res.json({ success: true });
    } catch (err) { next(err); }
});

module.exports = router;
