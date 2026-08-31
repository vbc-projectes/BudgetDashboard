/**
 * src/routes/index.js
 * Central router — mounts all sub-routers and creates entity routes via factory
 */
'use strict';

const express = require('express');
const { createEntityRoutes, createRealEntityRoutes } = require('./routeFactory');
const PuntualService = require('../services/PuntualService');
const MensualService = require('../services/MensualService');

const router = express.Router();

// ── Services for factory-generated routes ────────────────────────────
const gastosPuntualesService   = new PuntualService('gastos_puntuales');
const gastosMensualesService   = new MensualService('gastos_mensuales');
const ingresosPuntualesService = new PuntualService('ingresos_puntuales');
const ingresosMensualesService = new MensualService('ingresos_mensuales');
const impuestosPuntualesService = new PuntualService('impuestos_puntuales');
const impuestosMensualesService = new MensualService('impuestos_mensuales');
const gastosRealesService      = new PuntualService('gastos_reales');
const ingresosRealesService    = new PuntualService('ingresos_reales');

// ── Factory routes (gastos / ingresos / impuestos / reales) ──────────
router.use('/', createEntityRoutes('gasto', gastosPuntualesService, gastosMensualesService));
router.use('/', createEntityRoutes('ingreso', ingresosPuntualesService, ingresosMensualesService));
router.use('/', createEntityRoutes('impuesto', impuestosPuntualesService, impuestosMensualesService));
router.use('/', createRealEntityRoutes('gasto_real', gastosRealesService));
router.use('/', createRealEntityRoutes('ingreso_real', ingresosRealesService));

// ── Domain routes ─────────────────────────────────────────────────────
router.use('/', require('./categorias'));
router.use('/', require('./hucha'));
router.use('/', require('./cuentaRemunerada'));
router.use('/', require('./assets'));
router.use('/', require('./dashboard'));
router.use('/', require('./users'));
router.use('/', require('./importacion'));
router.use('/', require('./bolsa'));
router.use('/', require('./presupuestos'));
router.use('/', require('./backup'));
router.use('/', require('./widget'));
router.use('/', require('./settings'));
router.use('/', require('./push'));

// ── Health / diagnostics ──────────────────────────────────────────────
router.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        protocol: req.protocol,         // 'https' if trust proxy working
        secure: req.secure,
        ip: req.ip,
        hostname: req.hostname,
        forwarded: {
            proto: req.headers['x-forwarded-proto'],
            for: req.headers['x-forwarded-for'],
            host: req.headers['x-forwarded-host'],
        },
    });
});

module.exports = router;
