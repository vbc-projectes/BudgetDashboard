const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

const USERS_ROOT = path.isAbsolute(config.USERS_ROOT)
    ? config.USERS_ROOT
    : path.join(process.cwd(), config.USERS_ROOT);
const CURRENT_USER_FILE = path.join(USERS_ROOT, '.current_user.json');
const PROFILE_FILE_NAME = 'profile.json';

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function ensureUsersRoot() {
    ensureDir(USERS_ROOT);
}

function normalizeUserName(name) {
    if (typeof name !== 'string') {
        throw new Error('Nombre de usuario requerido');
    }
    const trimmed = name.trim();
    if (!trimmed) {
        throw new Error('Nombre de usuario requerido');
    }
    // Whitelist: letters (incl. accented), digits, spaces, hyphens, underscores — max 50 chars
    if (!/^[\w\u00C0-\u024F_ -]{1,50}$/.test(trimmed)) {
        throw new Error('Nombre de usuario invalido: solo letras, números, espacios, guiones y guiones bajos');
    }
    return trimmed;
}

function listUsers() {
    ensureUsersRoot();
    return fs.readdirSync(USERS_ROOT, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .filter(name => !name.startsWith('.'))
        .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
}

function getUserPaths(userName) {
    const safeName = normalizeUserName(userName);
    const userRoot = path.join(USERS_ROOT, safeName);
    return {
        userRoot,
        finanzasDir: path.join(userRoot, 'finanzas'),
        dbPath: path.join(userRoot, 'finanzas', 'finanzas.db'),
        uploadsDir: path.join(userRoot, 'uploads', 'importaciones'),
        profilePath: path.join(userRoot, PROFILE_FILE_NAME)
    };
}

function ensureUserFolders(userName) {
    const paths = getUserPaths(userName);
    ensureDir(paths.userRoot);
    ensureDir(paths.finanzasDir);
    ensureDir(paths.uploadsDir);
    return paths;
}

function readLastUser() {
    try {
        if (!fs.existsSync(CURRENT_USER_FILE)) return null;
        const data = JSON.parse(fs.readFileSync(CURRENT_USER_FILE, 'utf8'));
        return data && typeof data.name === 'string' ? data.name : null;
    } catch (err) {
        return null;
    }
}

function saveLastUser(name) {
    ensureUsersRoot();
    fs.writeFileSync(CURRENT_USER_FILE, JSON.stringify({ name }, null, 2), 'utf8');
}

function readUserProfile(name) {
    const paths = getUserPaths(name);
    try {
        if (!fs.existsSync(paths.profilePath)) return {};
        const data = JSON.parse(fs.readFileSync(paths.profilePath, 'utf8'));
        return data && typeof data === 'object' ? data : {};
    } catch (err) {
        return {};
    }
}

function saveUserProfile(name, profile) {
    const paths = getUserPaths(name);
    ensureDir(paths.userRoot);
    fs.writeFileSync(paths.profilePath, JSON.stringify(profile || {}, null, 2), 'utf8');
    return profile || {};
}

function setUserIcon(name, icon) {
    const profile = readUserProfile(name);
    profile.icon = icon;
    return saveUserProfile(name, profile);
}

function _hashPin(pin) {
    return crypto.createHash('sha256').update(String(pin)).digest('hex');
}

function hasUserPin(name) {
    return !!readUserProfile(name).pinHash;
}

function setUserPin(name, pin) {
    if (!/^\d{4}$/.test(String(pin))) throw new Error('El PIN debe ser de 4 dígitos numéricos');
    const profile = readUserProfile(name);
    profile.pinHash = _hashPin(pin);
    return saveUserProfile(name, profile);
}

function removeUserPin(name) {
    const profile = readUserProfile(name);
    delete profile.pinHash;
    return saveUserProfile(name, profile);
}

function verifyUserPin(name, pin) {
    const profile = readUserProfile(name);
    if (!profile.pinHash) return true;
    return profile.pinHash === _hashPin(pin);
}

module.exports = {
    USERS_ROOT,
    normalizeUserName,
    listUsers,
    getUserPaths,
    ensureUserFolders,
    readLastUser,
    saveLastUser,
    readUserProfile,
    saveUserProfile,
    setUserIcon,
    hasUserPin,
    setUserPin,
    removeUserPin,
    verifyUserPin
};
