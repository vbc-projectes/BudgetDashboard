/**
 * src/routes/cuentaRemunerada.js
 */
'use strict';

const express = require('express');
const db = require('../config/database');
const { dbRun, dbGet, dbAll } = require('../utils/dbHelpers');
const { calcularInteresGenerado, generarDescripcionRandom } = require('../utils/calculations');
const CuentaRemuneradaService = require('../services/CuentaRemuneradaService');

const router = express.Router();

router.get('/cuenta_remunerada', async (req, res, next) => {
    try {
        const rows = await dbAll(db, 'SELECT * FROM cuenta_remunerada ORDER BY created_at DESC');
        res.json(rows || []);
    } catch (err) { next(err); }
});

router.post('/add/cuenta_remunerada', async (req, res, next) => {
    try {
        const { descripcion, monto, aportacion_mensual, interes, retencion, categoria_id, desde, hasta, linked_to_bolsa } = req.body;
        if (monto === undefined || categoria_id === undefined || !desde) {
            return res.status(400).json({ error: 'Monto, categoría y desde son requeridos' });
        }
        const descripcionFinal = (descripcion || '').trim() || generarDescripcionRandom();
        const interesGenerado = calcularInteresGenerado(monto, aportacion_mensual || 0, interes || 0, desde, hasta);
        const linkedVal = linked_to_bolsa ? 1 : 0;
        // Si se marca linked_to_bolsa, desactivar en las demás cuentas
        if (linkedVal === 1) {
            await dbRun(db, `UPDATE cuenta_remunerada SET linked_to_bolsa = 0`);
        }
        await dbRun(db,
            `INSERT INTO cuenta_remunerada (descripcion, monto, aportacion_mensual, interes, retencion, interes_generado, categoria_id, desde, hasta, linked_to_bolsa) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [descripcionFinal, monto, aportacion_mensual || null, interes || null, retencion || 0, interesGenerado, categoria_id, desde, hasta || null, linkedVal]
        );
        res.json({ success: true });
    } catch (err) { next(err); }
});

router.post('/update/cuenta_remunerada', async (req, res, next) => {
    try {
        const { id, desde, hasta, monto, aportacion_mensual, interes, retencion, categoria_id, categoria, descripcion, linked_to_bolsa } = req.body;
        if (!id) return res.status(400).json({ error: 'ID es requerido' });

        let catId = categoria_id;
        if (!catId && categoria) {
            const cat = await dbGet(db, "SELECT id FROM categorias WHERE nombre = ? AND tipo = 'ingreso'", [categoria]);
            if (!cat) return res.status(400).json({ error: 'Categoría no encontrada' });
            catId = cat.id;
        }
        if (!catId) return res.status(400).json({ error: 'Categoría es requerida' });

        let descripcionFinal = (descripcion || '').trim();
        if (!descripcionFinal) {
            const existing = await dbGet(db, 'SELECT descripcion FROM cuenta_remunerada WHERE id = ?', [id]);
            descripcionFinal = existing?.descripcion || generarDescripcionRandom();
        }
        const interesGenerado = calcularInteresGenerado(monto, aportacion_mensual, interes, desde, hasta);

        // Si se activa linked_to_bolsa, desactivar el flag en las demás cuentas primero
        const linkedVal = linked_to_bolsa !== undefined ? (linked_to_bolsa ? 1 : 0) : undefined;
        if (linkedVal === 1) {
            await dbRun(db, `UPDATE cuenta_remunerada SET linked_to_bolsa = 0 WHERE id != ?`, [id]);
        }

        const linkedSet = linkedVal !== undefined ? ', linked_to_bolsa=?' : '';
        const linkedParam = linkedVal !== undefined ? [linkedVal] : [];

        await dbRun(db,
            `UPDATE cuenta_remunerada SET descripcion=?, desde=?, hasta=?, monto=?, aportacion_mensual=?, interes=?, retencion=?, interes_generado=?, categoria_id=?${linkedSet} WHERE id=?`,
            [descripcionFinal, desde, hasta, monto, aportacion_mensual || null, interes || null, parseFloat(retencion) || 0, interesGenerado, catId, ...linkedParam, id]
        );
        res.json({ success: true });
    } catch (err) { next(err); }
});

router.post('/delete/cuenta_remunerada', async (req, res, next) => {
    try {
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'ID es requerido' });
        await dbRun(db, 'DELETE FROM cuenta_remunerada WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) { next(err); }
});

// Snapshot del saldo de la cuenta remunerada a día de hoy
router.get('/cuenta-remunerada/saldo-hoy', async (req, res, next) => {
    // retencionDivPct: porcentaje de retención sobre dividendos (0-100)
    try {
        const service = new CuentaRemuneradaService();
        const retencionDivPct = Math.max(0, Math.min(100, parseFloat(req.query.retencionDivPct) || 0));
        res.json(await service.getSaldoHoy(retencionDivPct));
    } catch (err) { next(err); }
});

// ── Aportaciones variables ──────────────────────────────────────────────────
router.get('/cuenta-remunerada/:id/aportaciones', async (req, res, next) => {
    try {
        const rows = await dbAll(db, `SELECT * FROM cuenta_remunerada_aportaciones WHERE cuenta_id = ? ORDER BY desde ASC`, [req.params.id]);
        res.json(rows || []);
    } catch (err) { next(err); }
});

router.post('/cuenta-remunerada/:id/aportaciones', async (req, res, next) => {
    try {
        const { desde, cantidad } = req.body;
        if (!desde || cantidad === undefined) return res.status(400).json({ error: 'desde y cantidad son requeridos' });
        await dbRun(db, `INSERT INTO cuenta_remunerada_aportaciones (cuenta_id, desde, cantidad) VALUES (?, ?, ?)`, [req.params.id, desde, cantidad]);
        res.json({ success: true });
    } catch (err) { next(err); }
});

router.delete('/cuenta-remunerada/aportaciones/:aportacionId', async (req, res, next) => {
    try {
        await dbRun(db, `DELETE FROM cuenta_remunerada_aportaciones WHERE id = ?`, [req.params.aportacionId]);
        res.json({ success: true });
    } catch (err) { next(err); }
});

// ── Ajustes manuales de saldo ───────────────────────────────────────────────
router.get('/cuenta-remunerada/:id/ajustes', async (req, res, next) => {
    try {
        const rows = await dbAll(db, `SELECT * FROM cuenta_remunerada_ajustes WHERE cuenta_id = ? ORDER BY fecha ASC`, [req.params.id]);
        res.json(rows || []);
    } catch (err) { next(err); }
});

router.post('/cuenta-remunerada/:id/ajustes', async (req, res, next) => {
    try {
        const { fecha, saldo, descripcion } = req.body;
        if (!fecha || saldo === undefined) return res.status(400).json({ error: 'fecha y saldo son requeridos' });
        await dbRun(db, `INSERT INTO cuenta_remunerada_ajustes (cuenta_id, fecha, saldo, descripcion) VALUES (?, ?, ?, ?)`, [req.params.id, fecha, saldo, descripcion || null]);
        res.json({ success: true });
    } catch (err) { next(err); }
});

router.delete('/cuenta-remunerada/ajustes/:ajusteId', async (req, res, next) => {
    try {
        await dbRun(db, `DELETE FROM cuenta_remunerada_ajustes WHERE id = ?`, [req.params.ajusteId]);
        res.json({ success: true });
    } catch (err) { next(err); }
});

// ── Historial tipos de interés ──────────────────────────────────────────────
router.get('/cuenta-remunerada/:id/tipos-interes', async (req, res, next) => {
    try {
        const rows = await dbAll(db, `SELECT * FROM historial_tipos_interes WHERE cuenta_remunerada_id = ? ORDER BY desde ASC`, [req.params.id]);
        res.json(rows || []);
    } catch (err) { next(err); }
});

router.post('/cuenta-remunerada/:id/tipos-interes', async (req, res, next) => {
    try {
        const { desde, interes } = req.body;
        if (!desde || interes === undefined) return res.status(400).json({ error: 'desde e interes son requeridos' });
        await dbRun(db, `INSERT INTO historial_tipos_interes (cuenta_remunerada_id, desde, interes) VALUES (?, ?, ?)`, [req.params.id, desde, interes]);
        res.json({ success: true });
    } catch (err) { next(err); }
});

router.delete('/cuenta-remunerada/tipos-interes/:tipoId', async (req, res, next) => {
    try {
        await dbRun(db, `DELETE FROM historial_tipos_interes WHERE id = ?`, [req.params.tipoId]);
        res.json({ success: true });
    } catch (err) { next(err); }
});

// ── Informe fiscal de intereses ─────────────────────────────────────────────
router.get('/cuenta-remunerada/:id/informe-fiscal', async (req, res, next) => {
    try {
        const service = new CuentaRemuneradaService();
        const informe = await service.getInformeFiscal(req.params.id);
        res.json(informe);
    } catch (err) { next(err); }
});

// Vincular/desvincular cuenta remunerada de la cartera de bolsa (transacción atómica)
router.post('/cuenta_remunerada/set-link', async (req, res, next) => {
    try {
        const { id, linked } = req.body;
        if (!id) return res.status(400).json({ error: 'ID requerido' });
        await dbRun(db, 'BEGIN');
        await dbRun(db, 'UPDATE cuenta_remunerada SET linked_to_bolsa = 0');
        if (linked) {
            await dbRun(db, 'UPDATE cuenta_remunerada SET linked_to_bolsa = 1 WHERE id = ?', [id]);
        }
        await dbRun(db, 'COMMIT');
        res.json({ success: true });
    } catch (err) {
        await dbRun(db, 'ROLLBACK').catch(() => {});
        next(err);
    }
});

module.exports = router;
