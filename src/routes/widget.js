/**
 * GET /widget/summary
 * Endpoint para widgets externos (Homepage, Homarr, etc.)
 * Devuelve saldo del mes, gasto del mes, total hucha y próximos gastos.
 *
 * Protección opcional: si la variable de entorno WIDGET_TOKEN está definida,
 * la petición debe incluir ?token=<valor> o el header Authorization: Bearer <valor>.
 */
'use strict';

const express  = require('express');
const db       = require('../config/database');
const { dbAll, dbGet } = require('../utils/dbHelpers');
const { getAhorrosMes, getNetWorth } = require('../services/dashboardService');

const router = express.Router();

// ── Middleware de token opcional ──────────────────────────────────────────────
function checkToken(req, res, next) {
    const required = process.env.WIDGET_TOKEN;
    if (!required) return next(); // sin protección

    const fromQuery  = req.query.token;
    const fromHeader = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (fromQuery === required || fromHeader === required) return next();

    res.status(401).json({ error: 'Unauthorized' });
}

// ── Helper de formato ─────────────────────────────────────────────────────────
const round2 = v => Math.round((v || 0) * 100) / 100;

// ── GET /widget/summary ───────────────────────────────────────────────────────
router.get('/widget/summary', checkToken, async (req, res, next) => {
    try {
        const hoy     = new Date();
        const hoyStr  = hoy.toISOString().slice(0, 10);
        const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
        const desde   = `${mesActual}-01`;
        const hasta   = `${mesActual}-31`;

        // ── 1. Saldo y gasto del mes ──────────────────────────────────────────
        let saldo_mes = 0, gasto_mes = 0, ingreso_mes = 0;
        try {
            const meses   = await getAhorrosMes(desde, hasta);
            const mesData = meses.find(m => m.mes === mesActual) || {};
            saldo_mes   = round2(mesData.ahorros     || 0);
            gasto_mes   = round2(mesData.total_gastos  || 0);
            ingreso_mes = round2(mesData.total_ingreso || 0);
        } catch (_) {}

        // ── 2. Total Hucha ────────────────────────────────────────────────────
        let hucha = { total: 0, hucha: 0, subhuchas: 0, cuenta_remunerada: 0, bolsa: 0 };
        try {
            hucha = await getNetWorth();
        } catch (_) {}

        // ── 3. Próximos gastos puntuales (siguientes 60 días) ─────────────────
        const limiteDias  = parseInt(req.query.dias || '60', 10);
        const proximoFin  = new Date(hoy);
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

        // ── 4. Total próximos ─────────────────────────────────────────────────
        const total_proximos = round2(proximos_gastos.reduce((s, g) => s + g.monto, 0));

        // ── Respuesta ─────────────────────────────────────────────────────────
        res.json({
            periodo:        mesActual,
            generado:       hoy.toISOString(),

            // KPIs del mes
            saldo_mes,
            gasto_mes,
            ingreso_mes,

            // Hucha / patrimonio
            total_hucha:            hucha.total,
            hucha_principal:        hucha.hucha,
            hucha_subhuchas:        hucha.subhuchas,
            hucha_cuenta_remunerada: hucha.cuenta_remunerada,
            hucha_bolsa:            hucha.bolsa,

            // Próximos gastos
            total_proximos,
            proximos_gastos
        });
    } catch (err) { next(err); }
});

module.exports = router;
