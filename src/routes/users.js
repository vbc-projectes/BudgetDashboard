/**
 * src/routes/users.js
 * User management & DB switching for web mode
 */
'use strict';

const express = require('express');
const db = require('../config/database');
const { runMigrations } = require('../database/migrationRunner');
const {
    normalizeUserName,
    listUsers,
    ensureUserFolders,
    readLastUser,
    saveLastUser,
    readUserProfile,
    setUserIcon
} = require('../config/userManager');

const router = express.Router();

// In-process current user (per server instance)
let currentUser = readLastUser();

function getActiveUser() { return currentUser || readLastUser(); }
function setActiveUser(name) { currentUser = name; saveLastUser(name); }

router.get('/users', (req, res) => {
    res.json({ users: listUsers(), currentUser: getActiveUser() || null });
});

router.get('/users/current', (req, res) => {
    res.json({ name: getActiveUser() || null });
});

router.post('/users/create', async (req, res, next) => {
    try {
        const name = normalizeUserName(req.body?.name);
        ensureUserFolders(name);
        res.json({ success: true, name });
    } catch (err) { next(err); }
});

router.post('/users/select', async (req, res, next) => {
    try {
        const name = normalizeUserName(req.body?.name);
        const paths = ensureUserFolders(name);
        await db.__setDbPath(paths.dbPath);
        await runMigrations();
        setActiveUser(name);
        res.json({ success: true, name, paths });
    } catch (err) { next(err); }
});

router.get('/users/profile', async (req, res, next) => {
    try {
        const name = normalizeUserName(req.query?.name);
        res.json({ profile: readUserProfile(name) });
    } catch (err) { next(err); }
});

router.post('/users/icon', async (req, res, next) => {
    try {
        const name = normalizeUserName(req.body?.name);
        const icon = typeof req.body?.icon === 'string' ? req.body.icon.trim() : '';
        if (!icon) return res.status(400).json({ error: 'Icono de usuario requerido' });
        ensureUserFolders(name);
        const profile = setUserIcon(name, icon);
        res.json({ success: true, profile });
    } catch (err) { next(err); }
});

module.exports = router;
