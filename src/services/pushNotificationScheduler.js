/**
 * src/services/pushNotificationScheduler.js
 * Cada día a las 08:00 (hora del servidor): notifica los gastos puntuales de
 * hoy. Los lunes, además, notifica los de toda la semana (lunes-domingo).
 *
 * Recorre TODOS los usuarios abriendo una conexión SQLite propia y aislada
 * por usuario (no la conexión compartida de src/config/database.js, que en
 * modo web solo apunta al usuario activo de la sesión del navegador — si
 * este job la tocara, podría servir datos de otro usuario a media petición).
 */
'use strict';

const sqlite3 = require('sqlite3').verbose();
const { dbAll, dbRun } = require('../utils/dbHelpers');
const { listUsers, getUserPaths } = require('../config/userManager');
const { webpush } = require('../config/vapid');
const logger = require('../utils/logger');

const NOTIFY_HOUR = 8;
const NOTIFY_MINUTE = 0;
const MAX_PREVIEW_ITEMS = 3;

// Formatea en fecha de calendario LOCAL (no UTC) — gastos.fecha son fechas de
// calendario sin zona horaria, y toISOString() convierte a UTC, lo que
// desplazaría el día en cualquier servidor que no esté en UTC+0.
function toYMD(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

function openDb(dbPath, mode) {
    return new Promise((resolve, reject) => {
        function onOpen(err) {
            if (err) reject(err);
            else resolve(database);
        }
        const database = mode
            ? new sqlite3.Database(dbPath, mode, onOpen)
            : new sqlite3.Database(dbPath, onOpen);
    });
}

function closeDb(database) {
    return new Promise((resolve) => database.close(() => resolve()));
}

async function getSubscriptions(dbPath) {
    const database = await openDb(dbPath);
    try {
        // Red de seguridad: si este usuario no se ha seleccionado desde que
        // se añadió la migración de esta tabla, créala igualmente aquí.
        await dbRun(database, `
            CREATE TABLE IF NOT EXISTS push_subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                endpoint TEXT NOT NULL UNIQUE,
                p256dh TEXT NOT NULL,
                auth TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);
        return await dbAll(database, 'SELECT * FROM push_subscriptions');
    } finally {
        await closeDb(database);
    }
}

async function removeSubscription(dbPath, endpoint) {
    const database = await openDb(dbPath);
    try {
        await dbRun(database, 'DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint]);
    } finally {
        await closeDb(database);
    }
}

async function getGastosPuntualesEnRango(dbPath, desde, hasta) {
    const database = await openDb(dbPath, sqlite3.OPEN_READONLY);
    try {
        return await dbAll(database, `
            SELECT g.fecha, g.descripcion, g.monto
            FROM gastos_puntuales g
            WHERE g.fecha BETWEEN ? AND ?
            ORDER BY g.fecha ASC
        `, [desde, hasta]);
    } catch (err) {
        logger.debug(`Sin gastos_puntuales consultables en ${dbPath}: ${err.message}`);
        return [];
    } finally {
        await closeDb(database);
    }
}

function formatEuro(value) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value || 0);
}

function buildPayload(title, items) {
    const total = items.reduce((sum, g) => sum + (Number(g.monto) || 0), 0);
    const preview = items.slice(0, MAX_PREVIEW_ITEMS).map((g) => g.descripcion).join(', ');
    const extra = items.length > MAX_PREVIEW_ITEMS ? ` y ${items.length - MAX_PREVIEW_ITEMS} más` : '';
    const body = `${items.length} pago${items.length === 1 ? '' : 's'} · ${formatEuro(total)} — ${preview}${extra}`;
    return JSON.stringify({ title, body, url: '/' });
}

async function notifyUser(dbPath, subscriptions, payload) {
    for (const sub of subscriptions) {
        const pushSubscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
        try {
            await webpush.sendNotification(pushSubscription, payload);
        } catch (err) {
            if (err.statusCode === 404 || err.statusCode === 410) {
                // El navegador/SO invalidó esta suscripción (desinstalada,
                // permiso revocado...): dejar de intentarlo.
                await removeSubscription(dbPath, sub.endpoint).catch(() => {});
            } else {
                logger.error(`Push falló (${dbPath}): ${err.message}`);
            }
        }
    }
}

async function runDailyPushNotifications() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = toYMD(today);
    const isMonday = today.getDay() === 1;

    for (const userName of listUsers()) {
        try {
            const { dbPath } = getUserPaths(userName);
            const subscriptions = await getSubscriptions(dbPath);
            if (subscriptions.length === 0) continue;

            const hoy = await getGastosPuntualesEnRango(dbPath, todayStr, todayStr);
            if (hoy.length > 0) {
                await notifyUser(dbPath, subscriptions, buildPayload('Pagos de hoy', hoy));
            }

            if (isMonday) {
                const domingo = toYMD(addDays(today, 6));
                const semana = await getGastosPuntualesEnRango(dbPath, todayStr, domingo);
                if (semana.length > 0) {
                    await notifyUser(dbPath, subscriptions, buildPayload('Pagos de esta semana', semana));
                }
            }
        } catch (err) {
            logger.error(`Notificaciones push fallaron para el usuario "${userName}": ${err.message}`);
        }
    }
}

function msUntilNext(hour, minute) {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next - now;
}

let scheduled = false;

function startPushNotificationScheduler() {
    if (scheduled) return;
    scheduled = true;

    function scheduleNext() {
        const delay = msUntilNext(NOTIFY_HOUR, NOTIFY_MINUTE);
        setTimeout(async () => {
            try {
                await runDailyPushNotifications();
            } catch (err) {
                logger.error('Error ejecutando notificaciones push diarias:', err.message);
            }
            scheduleNext();
        }, delay).unref();
    }

    scheduleNext();
    logger.info(`Notificaciones push programadas a las ${String(NOTIFY_HOUR).padStart(2, '0')}:${String(NOTIFY_MINUTE).padStart(2, '0')} (hora del servidor)`);
}

module.exports = { startPushNotificationScheduler, runDailyPushNotifications };
