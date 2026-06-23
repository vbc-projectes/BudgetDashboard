'use strict';

const express = require('express');
const path = require('path');
const db = require('../config/database');

const router = express.Router();

router.get('/backup/download', async (req, res, next) => {
    try {
        const dbPath = db.__getDbPath();
        if (!dbPath || dbPath === ':memory:') {
            return res.status(400).json({ error: 'Backup no disponible para base de datos en memoria' });
        }
        const today = new Date().toISOString().slice(0, 10);
        const filename = `finanzas_backup_${today}.db`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.sendFile(path.resolve(dbPath));
    } catch (err) { next(err); }
});

module.exports = router;
