/**
 * src/routes/categorias.js
 */
'use strict';

const express = require('express');
const db = require('../config/database');
const { dbRun, dbAll } = require('../utils/dbHelpers');

const router = express.Router();

router.get('/categorias', async (req, res, next) => {
    try {
        const [gastos, ingresos, impuestos] = await Promise.all([
            dbAll(db, "SELECT * FROM categorias WHERE tipo='gasto' ORDER BY nombre"),
            dbAll(db, "SELECT * FROM categorias WHERE tipo='ingreso' ORDER BY nombre"),
            dbAll(db, "SELECT * FROM categorias WHERE tipo='impuestos' ORDER BY nombre")
        ]);
        res.json({ gastos: gastos || [], ingresos: ingresos || [], impuestos: impuestos || [] });
    } catch (err) { next(err); }
});

router.post('/add/categoria', async (req, res, next) => {
    try {
        const { nombre, tipo } = req.body;
        if (!nombre || !tipo) return res.status(400).json({ error: 'Nombre y tipo son requeridos' });
        if (!['gasto', 'ingreso', 'impuestos'].includes(tipo)) return res.status(400).json({ error: 'Tipo inválido' });
        try {
            await dbRun(db, 'INSERT INTO categorias (nombre, tipo) VALUES (?, ?)', [nombre.trim(), tipo]);
            res.json({ success: true, message: 'Categoría agregada' });
        } catch (err) {
            if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'La categoría ya existe para este tipo' });
            throw err;
        }
    } catch (err) { next(err); }
});

router.post('/update/categoria', async (req, res, next) => {
    try {
        const { id, nombre } = req.body;
        if (!id || !nombre) return res.status(400).json({ error: 'ID y nombre son requeridos' });
        await dbRun(db, 'UPDATE categorias SET nombre = ? WHERE id = ?', [nombre.trim(), id]);
        res.json({ success: true, message: 'Categoría actualizada' });
    } catch (err) { next(err); }
});

router.post('/delete/categoria', async (req, res, next) => {
    try {
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'ID es requerido' });
        await dbRun(db, 'DELETE FROM categorias WHERE id = ?', [id]);
        res.json({ success: true, message: 'Categoría eliminada' });
    } catch (err) { next(err); }
});

module.exports = router;
