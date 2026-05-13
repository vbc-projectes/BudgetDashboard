/**
 * src/routes/importacion.js
 * File upload & listing for bank import (web/Docker version)
 * Uses multer for multipart uploads; also handles base64 saves from frontend.
 */
'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../config/database');
const { dbRun } = require('../utils/dbHelpers');
const PuntualService = require('../services/PuntualService');
const { readLastUser, ensureUserFolders, normalizeUserName } = require('../config/userManager');

const router = express.Router();

// ── Services (shared instances for import) ──────────────────────────
const gastosPuntualesService = new PuntualService('gastos_puntuales');
const ingresosPuntualesService = new PuntualService('ingresos_puntuales');
const gastosRealesService = new PuntualService('gastos_reales');
const ingresosRealesService = new PuntualService('ingresos_reales');

// ── Helpers ───────────────────────────────────────────────────────────
function getUploadsDir() {
    const user = readLastUser();
    if (!user) throw new Error('Usuario no seleccionado');
    const paths = ensureUserFolders(user);
    return paths.uploadsDir;
}

// multer storage — files land in the user's uploads dir
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        try {
            const dir = getUploadsDir();
            fs.mkdirSync(dir, { recursive: true });
            cb(null, dir);
        } catch (err) {
            cb(err);
        }
    },
    filename: (req, file, cb) => {
        const sanitized = file.originalname.replace(/\s+/g, '_');
        cb(null, `${Date.now()}_${sanitized}`);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (req, file, cb) => {
        const allowed = ['.csv', '.xls', '.xlsx', '.txt'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) cb(null, true);
        else cb(new Error('Formato de archivo no permitido'));
    }
});

// ── Batch import helper (matches ipcHandlers logic) ──────────────────
async function importBatch(service, datos) {
    if (!Array.isArray(datos) || datos.length === 0) {
        throw new Error('No hay datos para importar');
    }
    const resultados = [];
    let exitosos = 0;
    let fallidos = 0;

    await dbRun(db, 'BEGIN TRANSACTION');
    try {
        for (const item of datos) {
            try {
                await service.add(item);
                resultados.push({ ...item, ok: true });
                exitosos++;
            } catch (err) {
                resultados.push({ ...item, ok: false, error: err.message });
                fallidos++;
                throw err;
            }
        }
        await dbRun(db, 'COMMIT');
    } catch (err) {
        try { await dbRun(db, 'ROLLBACK'); } catch (_) {}
        return { success: false, total: datos.length, exitosos, fallidos: fallidos || datos.length - exitosos, error: err.message, detalles: resultados };
    }
    return { success: true, total: datos.length, exitosos, fallidos, detalles: resultados };
}

// ── Routes ────────────────────────────────────────────────────────────

// List saved files
router.get('/api/importacion/listar', (req, res, next) => {
    try {
        const uploadsDir = getUploadsDir();
        fs.mkdirSync(uploadsDir, { recursive: true });
        const archivos = fs.readdirSync(uploadsDir);
        const lista = archivos.map(archivo => {
            const rutaCompleta = path.join(uploadsDir, archivo);
            const stats = fs.statSync(rutaCompleta);
            const parts = archivo.split('_');
            const ts = parseInt(parts[0]);
            const hasTs = !isNaN(ts) && ts.toString().length === 13;
            return {
                id: archivo,
                nombre: hasTs ? archivo.substring(ts.toString().length + 1) : archivo,
                archivo,
                fechaGuardado: hasTs ? new Date(ts).toISOString() : stats.mtime.toISOString(),
                tamaño: stats.size,
                tipo: path.extname(archivo).toLowerCase()
            };
        }).sort((a, b) => new Date(b.fechaGuardado) - new Date(a.fechaGuardado));
        res.json({ success: true, archivos: lista });
    } catch (err) { next(err); }
});

// Get file content (base64)
router.get('/api/importacion/contenido/:id', (req, res, next) => {
    try {
        const idStr = path.basename(req.params.id); // prevent path traversal
        const rutaArchivo = path.join(getUploadsDir(), idStr);
        if (!fs.existsSync(rutaArchivo)) return res.status(404).json({ error: 'Archivo no encontrado' });
        const contenido = fs.readFileSync(rutaArchivo, 'base64');
        const parts = idStr.split('_');
        const ts = parseInt(parts[0]);
        const nombreSinTimestamp = (!isNaN(ts) && ts.toString().length === 13)
            ? idStr.substring(ts.toString().length + 1) : idStr;
        res.json({ success: true, nombre: nombreSinTimestamp, contenido });
    } catch (err) { next(err); }
});

// Delete saved file
router.delete('/api/importacion/eliminar/:id', (req, res, next) => {
    try {
        const idStr = path.basename(req.params.id);
        const rutaArchivo = path.join(getUploadsDir(), idStr);
        if (!fs.existsSync(rutaArchivo)) return res.status(404).json({ error: 'Archivo no encontrado' });
        fs.unlinkSync(rutaArchivo);
        res.json({ success: true });
    } catch (err) { next(err); }
});

// Save file from base64 (sent by frontend JS)
router.post('/api/importacion/guardar', (req, res, next) => {
    try {
        const { filename, contenido } = req.body;
        if (!filename || !contenido) return res.status(400).json({ error: 'Filename y contenido son requeridos' });
        const uploadsDir = getUploadsDir();
        fs.mkdirSync(uploadsDir, { recursive: true });
        const sanitized = filename.replace(/\s+/g, '_');
        const uniqueFilename = `${Date.now()}_${sanitized}`;
        const filePath = path.join(uploadsDir, uniqueFilename);
        fs.writeFileSync(filePath, Buffer.from(contenido, 'base64'));
        res.json({ success: true, message: 'Archivo guardado correctamente', filename: uniqueFilename });
    } catch (err) { next(err); }
});

// Upload file via multipart (alternative to base64)
router.post('/api/importacion/upload', upload.single('archivo'), (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });
        res.json({ success: true, filename: req.file.filename, message: 'Archivo subido correctamente' });
    } catch (err) { next(err); }
});

// ── Batch data import endpoints ───────────────────────────────────────
router.post('/import/gasto_puntual', async (req, res, next) => {
    try { res.json(await importBatch(gastosPuntualesService, req.body?.datos)); } catch (err) { next(err); }
});

router.post('/import/ingreso_puntual', async (req, res, next) => {
    try { res.json(await importBatch(ingresosPuntualesService, req.body?.datos)); } catch (err) { next(err); }
});

router.post('/import/gasto_real', async (req, res, next) => {
    try { res.json(await importBatch(gastosRealesService, req.body?.datos)); } catch (err) { next(err); }
});

router.post('/import/ingreso_real', async (req, res, next) => {
    try { res.json(await importBatch(ingresosRealesService, req.body?.datos)); } catch (err) { next(err); }
});

module.exports = router;
