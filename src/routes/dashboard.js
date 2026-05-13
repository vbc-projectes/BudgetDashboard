/**
 * src/routes/dashboard.js
 */
'use strict';

const express = require('express');
const {
    getDashboardData,
    getDashboardRealData,
    getDashboardRangoFechas,
    getImpuestosMes,
    getImpuestosMesReal,
    getAhorrosMes,
    getAhorrosMesReal,
    getCategoriasPeriodo,
    getCategoriasPeriodoReal,
    getGastosCategoriaMes,
    getGastosCategoriaMesReal,
    getResumenPeriodos
} = require('../services/dashboardService');

const router = express.Router();

router.get('/dashboard', async (req, res, next) => {
    try { res.json(await getDashboardData()); } catch (err) { next(err); }
});

router.get('/dashboard-real', async (req, res, next) => {
    try { res.json(await getDashboardRealData()); } catch (err) { next(err); }
});

router.get('/dashboard-rango-fechas', async (req, res, next) => {
    try { res.json(await getDashboardRangoFechas()); } catch (err) { next(err); }
});

router.get('/impuestos-mes', async (req, res, next) => {
    try { res.json(await getImpuestosMes(req.query.desde, req.query.hasta)); } catch (err) { next(err); }
});

router.get('/impuestos-mes-real', async (req, res, next) => {
    try { res.json(await getImpuestosMesReal(req.query.desde, req.query.hasta)); } catch (err) { next(err); }
});

router.get('/ahorros-mes', async (req, res, next) => {
    try { res.json(await getAhorrosMes(req.query.desde, req.query.hasta, req.query.categoria_id)); } catch (err) { next(err); }
});

router.get('/ahorros-mes-real', async (req, res, next) => {
    try { res.json(await getAhorrosMesReal(req.query.desde, req.query.hasta, req.query.categoria_id)); } catch (err) { next(err); }
});

router.get('/categorias-periodo', async (req, res, next) => {
    try { res.json(await getCategoriasPeriodo(req.query.desde, req.query.hasta)); } catch (err) { next(err); }
});

router.get('/categorias-periodo-real', async (req, res, next) => {
    try { res.json(await getCategoriasPeriodoReal(req.query.desde, req.query.hasta)); } catch (err) { next(err); }
});

router.get('/gastos-categoria-mes', async (req, res, next) => {
    try { res.json(await getGastosCategoriaMes(req.query.desde, req.query.hasta)); } catch (err) { next(err); }
});

router.get('/gastos-categoria-mes-real', async (req, res, next) => {
    try { res.json(await getGastosCategoriaMesReal(req.query.desde, req.query.hasta)); } catch (err) { next(err); }
});

router.get('/resumen-periodos', async (req, res, next) => {
    try { res.json(await getResumenPeriodos()); } catch (err) { next(err); }
});

module.exports = router;
