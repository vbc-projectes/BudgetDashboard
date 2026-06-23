'use strict';

const express = require('express');
const db = require('../config/database');
const { dbRun, dbGet, dbAll } = require('../utils/dbHelpers');

const router = express.Router();

router.get('/presupuestos', async (req, res, next) => {
    try {
        const rows = await dbAll(db, `
            SELECT pc.id, pc.categoria_id, pc.limite_mensual, pc.created_at, c.nombre AS categoria
            FROM presupuestos_categoria pc
            JOIN categorias c ON pc.categoria_id = c.id
            ORDER BY c.nombre
        `);
        res.json(rows);
    } catch (err) { next(err); }
});

router.post('/presupuestos', async (req, res, next) => {
    try {
        const { categoria_id, limite_mensual } = req.body;
        if (!categoria_id || !limite_mensual) return res.status(400).json({ error: 'categoria_id y limite_mensual son requeridos' });
        await dbRun(db,
            `INSERT INTO presupuestos_categoria (categoria_id, limite_mensual) VALUES (?, ?)
             ON CONFLICT(categoria_id) DO UPDATE SET limite_mensual = excluded.limite_mensual`,
            [parseInt(categoria_id), parseFloat(limite_mensual)]
        );
        res.json({ success: true });
    } catch (err) { next(err); }
});

router.put('/presupuestos/:id', async (req, res, next) => {
    try {
        const { limite_mensual } = req.body;
        if (!limite_mensual) return res.status(400).json({ error: 'limite_mensual es requerido' });
        await dbRun(db, `UPDATE presupuestos_categoria SET limite_mensual=? WHERE id=?`, [parseFloat(limite_mensual), req.params.id]);
        res.json({ success: true });
    } catch (err) { next(err); }
});

router.delete('/presupuestos/:id', async (req, res, next) => {
    try {
        await dbRun(db, `DELETE FROM presupuestos_categoria WHERE id=?`, [req.params.id]);
        res.json({ success: true });
    } catch (err) { next(err); }
});

module.exports = router;
