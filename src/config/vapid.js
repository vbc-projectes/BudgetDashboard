'use strict';
/**
 * Claves VAPID para Web Push. Si no se dan por variables de entorno, se
 * generan una vez y se guardan junto a los usuarios — igual que
 * .current_user.json — para que sobrevivan a reinicios sin configuración
 * manual. Deben permanecer estables: si cambian, todas las suscripciones
 * existentes dejan de funcionar y cada dispositivo tiene que suscribirse
 * de nuevo.
 */
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');
const config = require('./config');

const USERS_ROOT = path.isAbsolute(config.USERS_ROOT)
    ? config.USERS_ROOT
    : path.join(process.cwd(), config.USERS_ROOT);
const VAPID_FILE = path.join(USERS_ROOT, '.vapid-keys.json');

function loadOrCreateVapidKeys() {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
        return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    }

    try {
        if (fs.existsSync(VAPID_FILE)) {
            const data = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf8'));
            if (data && data.publicKey && data.privateKey) return data;
        }
    } catch (_) {
        // Fichero corrupto o ilegible: se regenera más abajo.
    }

    const keys = webpush.generateVAPIDKeys();
    try {
        fs.mkdirSync(USERS_ROOT, { recursive: true });
        fs.writeFileSync(VAPID_FILE, JSON.stringify(keys, null, 2), 'utf8');
    } catch (_) {
        // Si no se puede persistir, seguimos con las claves en memoria para
        // este proceso; se regenerarán (e invalidarán suscripciones) en el
        // próximo reinicio.
    }
    return keys;
}

const vapidKeys = loadOrCreateVapidKeys();
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@localhost';

webpush.setVapidDetails(VAPID_SUBJECT, vapidKeys.publicKey, vapidKeys.privateKey);

module.exports = { webpush, vapidKeys, VAPID_SUBJECT };
