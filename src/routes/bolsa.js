/**
 * src/routes/bolsa.js
 * Rutas para operaciones de bolsa, dividendos, cartera e histórico de tickers
 */
'use strict';

const express = require('express');
const BolsaService = require('../services/BolsaService');
const yahooFinanceService = require('../services/yahooFinanceService');
const logger = require('../utils/logger');

const router = express.Router();
const bolsaService = new BolsaService();

// ── Helper: fetch + cache history in background ────────────────────────
function fetchAndCacheHistory(ticker) {
    const norm = String(ticker || '').trim().toUpperCase();
    if (!norm) return;
    bolsaService.getTickerLastDate(norm).then(lastDate => {
        const today = new Date().toISOString().slice(0, 10);
        if (lastDate && lastDate >= today) return; // already fresh
        const period = lastDate ? '3mo' : '2y';
        yahooFinanceService.getHistoricalData(norm, period)
            .then(result => {
                if (result?.data?.length) {
                    bolsaService.cacheTickerHistory(norm, result.data);
                }
            })
            .catch(err => { logger.warn(`fetchAndCacheHistory [${norm}]:`, err.message ?? err); });
    }).catch(() => {});
}

// ── Operaciones ────────────────────────────────────────────────────────
router.get('/bolsa/operaciones', async (req, res, next) => {
    try { res.json(await bolsaService.getOperaciones()); } catch (err) { next(err); }
});

router.post('/bolsa/operaciones', async (req, res, next) => {
    try {
        await bolsaService.addOperacion(req.body);
        res.json({ success: true });
        fetchAndCacheHistory(req.body.ticker); // background
    } catch (err) { next(err); }
});

router.put('/bolsa/operaciones/:id', async (req, res, next) => {
    try { await bolsaService.updateOperacion({ ...req.body, id: req.params.id }); res.json({ success: true }); } catch (err) { next(err); }
});

router.delete('/bolsa/operaciones/:id', async (req, res, next) => {
    try { await bolsaService.deleteOperacion(req.params.id); res.json({ success: true }); } catch (err) { next(err); }
});

// ── Dividendos ─────────────────────────────────────────────────────────
router.get('/bolsa/dividendos', async (req, res, next) => {
    try { res.json(await bolsaService.getDividendos()); } catch (err) { next(err); }
});

router.post('/bolsa/dividendos', async (req, res, next) => {
    try { await bolsaService.addDividendo(req.body); res.json({ success: true }); } catch (err) { next(err); }
});

router.put('/bolsa/dividendos/:id', async (req, res, next) => {
    try { await bolsaService.updateDividendo({ ...req.body, id: req.params.id }); res.json({ success: true }); } catch (err) { next(err); }
});

router.delete('/bolsa/dividendos/:id', async (req, res, next) => {
    try { await bolsaService.deleteDividendo(req.params.id); res.json({ success: true }); } catch (err) { next(err); }
});

// Auto-sync dividends from Yahoo Finance for all active positions
router.post('/bolsa/sync-dividendos', async (req, res, next) => {
    try {
        const result = await bolsaService.syncDividendosAuto(yahooFinanceService);
        res.json({ success: true, stats: result.stats, totalAdded: result.totalAdded, totalUpdated: result.totalUpdated });
    } catch (err) { next(err); }
});

// ── Posiciones y resumen ───────────────────────────────────────────────
router.get('/bolsa/posiciones', async (req, res, next) => {
    try { res.json(await bolsaService.getPosiciones()); } catch (err) { next(err); }
});

router.get('/bolsa/resumen', async (req, res, next) => {
    try { res.json(await bolsaService.getResumen()); } catch (err) { next(err); }
});

router.get('/bolsa/estadisticas', async (req, res, next) => {
    try { res.json(await bolsaService.getEstadisticasOperaciones()); } catch (err) { next(err); }
});

// ── Cuenta Remunerada — saldo diario vinculado a bolsa ──────────────────
router.get('/bolsa/cuenta-remunerada/saldo-diario', async (req, res, next) => {
    try {
        const retencionDivPct = Math.max(0, Math.min(100, parseFloat(req.query.retencionDivPct) || 0));
        res.json(await bolsaService.getSaldoDiarioCR(retencionDivPct));
    } catch (err) { next(err); }
});

// ── Ticker history (DB-cached) ─────────────────────────────────────────
// Returns cached history for a ticker. Fetches from Yahoo if stale/missing.
router.get('/bolsa/ticker-history/:ticker', async (req, res, next) => {
    try {
        const ticker = String(req.params.ticker || '').trim().toUpperCase();
        if (!ticker) return res.status(400).json({ error: 'Ticker requerido' });
        // Must start with a letter and contain only letters, digits, dots and hyphens
        if (!/^[A-Z][A-Z0-9.\.\-]{0,19}$/.test(ticker)) return res.status(400).json({ error: 'Ticker inválido' });

        const lastDate = await bolsaService.getTickerLastDate(ticker);
        const today = new Date().toISOString().slice(0, 10);

        if (!lastDate || lastDate < today) {
            // Fetch and cache synchronously (user is waiting for chart data)
            try {
                const period = lastDate ? '3mo' : '2y';
                const result = await yahooFinanceService.getHistoricalData(ticker, period);
                if (result?.data?.length) {
                    await bolsaService.cacheTickerHistory(ticker, result.data);
                }
            } catch (_) {}
        }

        const history = await bolsaService.getTickerHistoryFromDb(ticker);
        res.json({ ticker, data: history });
    } catch (err) { next(err); }
});

router.get('/bolsa/desglose-sector', async (req, res, next) => {
    try { res.json(await bolsaService.getDesgloseSector()); } catch (err) { next(err); }
});

router.get('/bolsa/estadisticas-fiscales', async (req, res, next) => {
    try { res.json(await bolsaService.getEstadisticasFiscales()); } catch (err) { next(err); }
});

module.exports = router;
