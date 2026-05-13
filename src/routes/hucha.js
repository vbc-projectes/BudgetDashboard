/**
 * src/routes/hucha.js
 */
'use strict';

const express = require('express');
const HuchaService = require('../services/HuchaService');
const SubHuchaService = require('../services/SubHuchaService');

const router = express.Router();
const huchaService = new HuchaService();
const subHuchaService = new SubHuchaService();

// ── Hucha ──────────────────────────────────────────────────────────
router.get('/hucha', async (req, res, next) => {
    try { res.json(await huchaService.getAll()); } catch (err) { next(err); }
});

router.post('/add/hucha', async (req, res, next) => {
    try { await huchaService.add(req.body); res.json({ success: true }); } catch (err) { next(err); }
});

router.post('/update/hucha', async (req, res, next) => {
    try { await huchaService.update(req.body); res.json({ success: true }); } catch (err) { next(err); }
});

router.post('/delete/hucha', async (req, res, next) => {
    try { await huchaService.delete(req.body.id); res.json({ success: true }); } catch (err) { next(err); }
});

// ── Sub-Huchas ─────────────────────────────────────────────────────
router.get('/sub_huchas', async (req, res, next) => {
    try { res.json(await subHuchaService.getAll()); } catch (err) { next(err); }
});

router.post('/add/sub_hucha', async (req, res, next) => {
    try { await subHuchaService.add(req.body); res.json({ success: true }); } catch (err) { next(err); }
});

router.post('/update/sub_hucha', async (req, res, next) => {
    try { await subHuchaService.update(req.body); res.json({ success: true }); } catch (err) { next(err); }
});

router.post('/delete/sub_hucha', async (req, res, next) => {
    try { await subHuchaService.delete(req.body.id); res.json({ success: true }); } catch (err) { next(err); }
});

router.get('/sub_huchas/:id/puntuales', async (req, res, next) => {
    try { res.json(await subHuchaService.getPuntuales(Number(req.params.id))); } catch (err) { next(err); }
});

router.post('/add/sub_hucha_puntual', async (req, res, next) => {
    try { await subHuchaService.addPuntual(req.body); res.json({ success: true }); } catch (err) { next(err); }
});

router.post('/delete/sub_hucha_puntual', async (req, res, next) => {
    try { await subHuchaService.deletePuntual(req.body.id); res.json({ success: true }); } catch (err) { next(err); }
});

router.get('/sub_huchas/total', async (req, res, next) => {
    try {
        const total = await subHuchaService.calcularTotalSubHuchas(req.query.mes);
        res.json({ total });
    } catch (err) { next(err); }
});

module.exports = router;
