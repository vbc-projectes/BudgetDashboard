/**
 * GET /widget/summary
 * Endpoint para widgets externos (Homepage, Homarr, etc.)
 *
 * El cálculo de total_hucha replica EXACTAMENTE la lógica de periodos-resumen.js:
 *   total_hucha = hucha_table + CR_saldo + bolsa_valor_mercado
 * (sin sub_huchas en el total principal, igual que el inicio)
 *
 * Protección opcional: define WIDGET_TOKEN en .env y pasa ?token=<valor>
 * o el header Authorization: Bearer <valor>.
 */
'use strict';

const express  = require('express');
const db       = require('../config/database');
const { dbAll } = require('../utils/dbHelpers');
const { getAhorrosMes } = require('../services/dashboardService');
const CuentaRemuneradaService = require('../services/CuentaRemuneradaService');
const yahooFinanceService = require('../services/yahooFinanceService');

const router = express.Router();

// ── Middleware de token opcional ──────────────────────────────────────────────
function checkToken(req, res, next) {
    const required = process.env.WIDGET_TOKEN;
    if (!required) return next();
    const fromQuery  = req.query.token;
    const fromHeader = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (fromQuery === required || fromHeader === required) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

const round2 = v => Math.round((v || 0) * 100) / 100;

// ── GET /widget/summary ───────────────────────────────────────────────────────
router.get('/widget/summary', checkToken, async (req, res, next) => {
    try {
        const hoy       = new Date();
        const hoyStr    = hoy.toISOString().slice(0, 10);
        const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;

        // ── 1. Saldo y gasto del mes actual ──────────────────────────────────
        let saldo_mes = 0, gasto_mes = 0, ingreso_mes = 0;
        try {
            const meses   = await getAhorrosMes(`${mesActual}-01`, `${mesActual}-31`);
            const mesData = meses.find(m => m.mes === mesActual) || {};
            saldo_mes   = round2(mesData.ahorros      || 0);
            gasto_mes   = round2(mesData.total_gastos  || 0);
            ingreso_mes = round2(mesData.total_ingreso || 0);
        } catch (_) {}

        // ── 2. Total Hucha — MISMO cálculo que periodos-resumen.js ───────────
        // total_hucha = hucha_table + CR_saldo + bolsa_market (sin sub_huchas)
        let total_hucha = 0;
        let hucha_principal = 0, hucha_cr = 0, hucha_bolsa = 0;

        try {
            // 2a. Hucha manual (tabla hucha)
            const huchaRows = await dbAll(db, `SELECT cantidad FROM hucha`);
            hucha_principal = huchaRows.reduce((s, r) => s + (parseFloat(r.cantidad) || 0), 0);

            // 2b. Saldo real de CR via simulación diaria (misma fuente que pestaña Hucha)
            try {
                const crService = new CuentaRemuneradaService();
                const crData    = await crService.getSaldoHoy();
                hucha_cr = parseFloat(crData?.saldo) || 0;
            } catch (_) {}

            // 2c. Bolsa — posiciones abiertas a precio de mercado (coste como fallback)
            const posiciones = await dbAll(db, `
                SELECT ticker, SUM(CASE WHEN tipo='compra' THEN cantidad ELSE -cantidad END) AS cantidad,
                       SUM(CASE WHEN tipo='compra' THEN cantidad*precio_unitario+comision ELSE -(cantidad*precio_unitario-comision) END) AS coste_total
                FROM operaciones_bolsa
                GROUP BY ticker
                HAVING cantidad > 0
            `);

            for (const pos of posiciones) {
                try {
                    const precio = await yahooFinanceService.getPrice(pos.ticker);
                    if (precio && Number.isFinite(precio)) {
                        hucha_bolsa += (parseFloat(pos.cantidad) || 0) * precio;
                    } else {
                        hucha_bolsa += parseFloat(pos.coste_total) || 0;
                    }
                } catch (_) {
                    hucha_bolsa += parseFloat(pos.coste_total) || 0;
                }
            }

            total_hucha = hucha_principal + hucha_cr + hucha_bolsa;
        } catch (_) {}

        // ── 3. Próximos gastos puntuales ──────────────────────────────────────
        const limiteDias = parseInt(req.query.dias || '60', 10);
        const proximoFin = new Date(hoy);
        proximoFin.setDate(proximoFin.getDate() + limiteDias);
        const proximoFinStr = proximoFin.toISOString().slice(0, 10);

        const proximosRows = await dbAll(db, `
            SELECT gp.descripcion, gp.monto, gp.fecha,
                   COALESCE(c.nombre, '') AS categoria
            FROM gastos_puntuales gp
            LEFT JOIN categorias c ON gp.categoria_id = c.id
            WHERE gp.fecha >= ? AND gp.fecha <= ?
            ORDER BY gp.fecha ASC
            LIMIT 10
        `, [hoyStr, proximoFinStr]);

        const proximos_gastos = proximosRows.map(g => ({
            descripcion: g.descripcion || '',
            monto:       round2(g.monto),
            fecha:       g.fecha,
            categoria:   g.categoria,
            dias:        Math.round((new Date(g.fecha + 'T00:00:00') - hoy) / 86400000)
        }));

        const total_proximos = round2(proximos_gastos.reduce((s, g) => s + g.monto, 0));

        // ── Respuesta ─────────────────────────────────────────────────────────
        res.json({
            periodo:   mesActual,
            generado:  hoy.toISOString(),

            saldo_mes,
            gasto_mes,
            ingreso_mes,

            total_hucha:     round2(total_hucha),
            hucha_principal: round2(hucha_principal),
            hucha_cr:        round2(hucha_cr),
            hucha_bolsa:     round2(hucha_bolsa),

            total_proximos,
            proximos_gastos
        });
    } catch (err) { next(err); }
});

module.exports = router;
