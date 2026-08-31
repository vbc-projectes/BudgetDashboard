/**
 * src/routes/push.js
 * Suscripción/desuscripción de notificaciones push para el usuario activo.
 * El envío real (el cron diario) vive en src/services/pushNotificationScheduler.js.
 */
'use strict';

const express = require('express');
const db = require('../config/database');
const { dbRun, dbGet } = require('../utils/dbHelpers');
const { vapidKeys } = require('../config/vapid');

const router = express.Router();

router.get('/push/vapid-public-key', (req, res) => {
    res.json({ publicKey: vapidKeys.publicKey });
});

router.post('/push/subscribe', async (req, res, next) => {
    try {
        const sub = req.body?.subscription;
        if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
            return res.status(400).json({ error: 'Suscripción inválida' });
        }
        await dbRun(db, `
            INSERT INTO push_subscriptions (endpoint, p256dh, auth) VALUES (?, ?, ?)
            ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth
        `, [sub.endpoint, sub.keys.p256dh, sub.keys.auth]);
        res.json({ success: true });
    } catch (err) { next(err); }
});

router.post('/push/unsubscribe', async (req, res, next) => {
    try {
        const endpoint = req.body?.endpoint;
        if (!endpoint) return res.status(400).json({ error: 'endpoint requerido' });
        await dbRun(db, 'DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint]);
        res.json({ success: true });
    } catch (err) { next(err); }
});

router.get('/push/status', async (req, res, next) => {
    try {
        const endpoint = req.query?.endpoint;
        if (!endpoint) return res.json({ subscribed: false });
        const row = await dbGet(db, 'SELECT 1 FROM push_subscriptions WHERE endpoint = ?', [endpoint]);
        res.json({ subscribed: !!row });
    } catch (err) { next(err); }
});

module.exports = router;
