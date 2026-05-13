/**
 * src/routes/cuentaRemunerada.js
 */
'use strict';

const express = require('express');
const db = require('../config/database');
const { dbRun, dbGet, dbAll } = require('../utils/dbHelpers');
const { calcularInteresGenerado, generarDescripcionRandom } = require('../utils/calculations');

const router = express.Router();

router.get('/cuenta_remunerada', async (req, res, next) => {
    try {
        const rows = await dbAll(db, 'SELECT * FROM cuenta_remunerada ORDER BY created_at DESC');
        res.json(rows || []);
    } catch (err) { next(err); }
});

router.post('/add/cuenta_remunerada', async (req, res, next) => {
    try {
        const { descripcion, monto, aportacion_mensual, interes, retencion, categoria_id, desde, hasta } = req.body;
        if (monto === undefined || categoria_id === undefined || !desde || !hasta) {
            return res.status(400).json({ error: 'Monto, categoría, desde y hasta son requeridos' });
        }
        const descripcionFinal = (descripcion || '').trim() || generarDescripcionRandom();
        const interesGenerado = calcularInteresGenerado(monto, aportacion_mensual || 0, interes || 0, desde, hasta);
        await dbRun(db,
            `INSERT INTO cuenta_remunerada (descripcion, monto, aportacion_mensual, interes, retencion, interes_generado, categoria_id, desde, hasta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [descripcionFinal, monto, aportacion_mensual || null, interes || null, retencion || 0, interesGenerado, categoria_id, desde, hasta]
        );
        res.json({ success: true });
    } catch (err) { next(err); }
});

router.post('/update/cuenta_remunerada', async (req, res, next) => {
    try {
        const { id, desde, hasta, monto, aportacion_mensual, interes, retencion, categoria_id, categoria, descripcion } = req.body;
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

        await dbRun(db,
            `UPDATE cuenta_remunerada SET descripcion=?, desde=?, hasta=?, monto=?, aportacion_mensual=?, interes=?, retencion=?, interes_generado=?, categoria_id=? WHERE id=?`,
            [descripcionFinal, desde, hasta, monto, aportacion_mensual || null, interes || null, parseFloat(retencion) || 0, interesGenerado, catId, id]
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

module.exports = router;
