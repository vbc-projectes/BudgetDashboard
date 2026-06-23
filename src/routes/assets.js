/**
 * src/routes/assets.js
 */
'use strict';

const express = require('express');
const db = require('../config/database');
const { dbRun, dbGet, dbAll } = require('../utils/dbHelpers');
const yahooFinanceService = require('../services/yahooFinanceService');
const BolsaService = require('../services/BolsaService');

const router = express.Router();
const bolsaService = new BolsaService();

// Background: fetch 2y of history for a ticker the first time it appears
function fetchAndCacheHistoryBackground(ticker) {
    const norm = String(ticker || '').trim().toUpperCase();
    if (!norm) return;
    bolsaService.getTickerLastDate(norm).then(lastDate => {
        const today = new Date().toISOString().slice(0, 10);
        if (lastDate && lastDate >= today) return;
        const period = lastDate ? '3mo' : '2y';
        yahooFinanceService.getHistoricalData(norm, period)
            .then(result => { if (result?.data?.length) bolsaService.cacheTickerHistory(norm, result.data); })
            .catch(() => {});
    }).catch(() => {});
}

router.get('/assets', async (req, res, next) => {
    try {
        const rows = await dbAll(db, `
            SELECT a.*, c.nombre as categoria
            FROM assets a
            JOIN categorias c ON a.categoria_id = c.id
            ORDER BY a.created_at DESC
        `);
        res.json(rows || []);
    } catch (err) { next(err); }
});

async function getOrCreateAssetCategory(db) {
    let cat = await dbGet(db, "SELECT id FROM categorias WHERE nombre='Assets' AND tipo='ingreso'");
    if (!cat || !cat.id) {
        await dbRun(db, "INSERT INTO categorias (nombre, tipo) VALUES (?, ?)", ['Assets', 'ingreso']);
        cat = await dbGet(db, "SELECT id FROM categorias WHERE nombre='Assets' AND tipo='ingreso'");
    }
    return cat.id;
}

router.post('/add/asset', async (req, res, next) => {
    try {
        const { company, ticker, shares, purchase_price } = req.body;
        if (!company || !ticker || !shares || !purchase_price) {
            return res.status(400).json({ error: 'Todos los campos son requeridos' });
        }
        const catId = await getOrCreateAssetCategory(db);
        await dbRun(db,
            'INSERT INTO assets (company, ticker, shares, purchase_price, categoria_id) VALUES (?, ?, ?, ?, ?)',
            [company, ticker, parseFloat(shares), parseFloat(purchase_price), catId]
        );
        res.json({ success: true });
        fetchAndCacheHistoryBackground(ticker); // background
    } catch (err) { next(err); }
});

router.post('/update/asset', async (req, res, next) => {
    try {
        const { id, company, ticker, shares, purchase_price } = req.body;
        if (!id) return res.status(400).json({ error: 'ID es requerido' });
        const catId = await getOrCreateAssetCategory(db);
        await dbRun(db,
            'UPDATE assets SET company=?, ticker=?, shares=?, purchase_price=?, categoria_id=? WHERE id=?',
            [company, ticker, parseFloat(shares), parseFloat(purchase_price), catId, id]
        );
        res.json({ success: true });
    } catch (err) { next(err); }
});

router.post('/delete/asset', async (req, res, next) => {
    try {
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'ID es requerido' });
        await dbRun(db, 'DELETE FROM assets WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) { next(err); }
});

router.post('/sell/asset', async (req, res, next) => {
    try {
        const { id, sale_price } = req.body;
        if (!id || !sale_price) return res.status(400).json({ error: 'ID y precio de venta son requeridos' });

        const asset = await dbGet(db, 'SELECT * FROM assets WHERE id = ?', [id]);
        if (!asset) return res.status(404).json({ error: 'Asset no encontrado' });

        const profit = (asset.shares * parseFloat(sale_price)) - (asset.shares * asset.purchase_price);
        const fecha = new Date().toISOString().slice(0, 10);

        await dbRun(db, 'DELETE FROM assets WHERE id = ?', [id]);

        if (profit >= 0) {
            await dbRun(db,
                'INSERT INTO ingresos_puntuales (fecha, descripcion, monto, categoria_id) VALUES (?, ?, ?, ?)',
                [fecha, `Venta ${asset.ticker}: Ganancia`, profit, asset.categoria_id]
            );
        } else {
            await dbRun(db,
                'INSERT INTO gastos_puntuales (fecha, descripcion, monto, categoria_id) VALUES (?, ?, ?, ?)',
                [fecha, `Venta ${asset.ticker}: Pérdida`, Math.abs(profit), asset.categoria_id]
            );
        }
        res.json({ success: true, profit });
    } catch (err) { next(err); }
});

router.get('/asset-price/:ticker', async (req, res, next) => {
    try {
        const ticker = String(req.params.ticker || '').trim().toUpperCase();
        if (!ticker) return res.json({ ticker, currentPrice: null, currency: 'EUR', unavailable: true });
        try {
            const data = await yahooFinanceService.getAssetPrice(ticker);
            res.json(data);
            // Cache today's price in DB (fire-and-forget)
            if (data?.currentPrice) {
                bolsaService.cacheTodayPrice(ticker, data.currentPrice).catch(() => {});
            }
        } catch (err) {
            res.json({ ticker, currentPrice: null, currency: 'EUR', unavailable: true });
        }
    } catch (err) { next(err); }
});

router.get('/asset-history/:ticker', async (req, res, next) => {
    try {
        const ticker = String(req.params.ticker || '').trim().toUpperCase();
        const period = String(req.query.period || '1y').trim() || '1y';
        try {
            const data = await yahooFinanceService.getHistoricalData(ticker, period);
            res.json(data);
        } catch (err) {
            res.json({ ticker, period, currency: 'EUR', data: [], unavailable: true, mensaje: err.message });
        }
    } catch (err) { next(err); }
});

router.get('/asset-metadata/:ticker', async (req, res, next) => {
    try {
        const ticker = String(req.params.ticker || '').trim().toUpperCase();
        if (!ticker) return res.json({ sector: null, tipo_activo: null });
        const data = await yahooFinanceService.getAssetMetadata(ticker);
        res.json(data);
    } catch (err) { next(err); }
});

module.exports = router;
