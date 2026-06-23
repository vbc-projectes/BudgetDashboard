/**
 * BolsaService — operaciones de bolsa, dividendos y posiciones de cartera
 */
'use strict';

const db = require('../config/database');
const { dbRun, dbGet, dbAll } = require('../utils/dbHelpers');
const CuentaRemuneradaService = require('./CuentaRemuneradaService');
const yahooFinanceService = require('./yahooFinanceService');

class BolsaService {

    // ── Operaciones ────────────────────────────────────────────────────

    async getOperaciones(limit = 500) {
        return await dbAll(db, `
            SELECT id, ticker, empresa, tipo, fecha, cantidad, precio_unitario, comision, notas, sector, tipo_activo, created_at
            FROM operaciones_bolsa ORDER BY fecha DESC, created_at DESC LIMIT ?
        `, [limit]);
    }

    async addOperacion(data) {
        const { ticker, empresa, tipo, fecha, cantidad, precio_unitario, comision, notas, sector, tipo_activo } = data;
        if (!ticker || !tipo || !fecha || !cantidad || !precio_unitario) {
            throw new Error('ticker, tipo, fecha, cantidad y precio_unitario son requeridos');
        }
        if (!['compra', 'venta'].includes(tipo)) {
            throw new Error('tipo debe ser "compra" o "venta"');
        }
        if (parseFloat(cantidad) <= 0) throw new Error('La cantidad debe ser mayor que cero');
        if (parseFloat(precio_unitario) <= 0) throw new Error('El precio debe ser mayor que cero');

        const normalizedTicker = ticker.trim().toUpperCase();
        const result = await dbRun(db,
            `INSERT INTO operaciones_bolsa (ticker, empresa, tipo, fecha, cantidad, precio_unitario, comision, notas, sector, tipo_activo)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                normalizedTicker,
                empresa || null,
                tipo,
                fecha,
                parseFloat(cantidad),
                parseFloat(precio_unitario),
                parseFloat(comision) || 0,
                notas || null,
                sector || null,
                tipo_activo || null
            ]
        );

        // Auto-detectar sector/tipo_activo si no se proporcionaron
        if (!sector || !tipo_activo) {
            const insertedId = result?.lastID;
            if (insertedId) {
                yahooFinanceService.getAssetMetadata(normalizedTicker).then(meta => {
                    const updates = [];
                    const params = [];
                    if (!sector && meta.sector) { updates.push('sector=?'); params.push(meta.sector); }
                    if (!tipo_activo && meta.tipo_activo) { updates.push('tipo_activo=?'); params.push(meta.tipo_activo); }
                    if (updates.length > 0) {
                        params.push(insertedId);
                        dbRun(db, `UPDATE operaciones_bolsa SET ${updates.join(',')} WHERE id=?`, params).catch(() => {});
                    }
                }).catch(() => {});
            }
        }
    }

    async updateOperacion(data) {
        const { id, ticker, empresa, tipo, fecha, cantidad, precio_unitario, comision, notas, sector, tipo_activo } = data;
        if (!id) throw new Error('ID es requerido');
        const normalizedTicker = ticker.trim().toUpperCase();
        await dbRun(db,
            `UPDATE operaciones_bolsa SET ticker=?, empresa=?, tipo=?, fecha=?, cantidad=?, precio_unitario=?, comision=?, notas=?, sector=?, tipo_activo=? WHERE id=?`,
            [
                normalizedTicker,
                empresa || null,
                tipo,
                fecha,
                parseFloat(cantidad),
                parseFloat(precio_unitario),
                parseFloat(comision) || 0,
                notas || null,
                sector || null,
                tipo_activo || null,
                id
            ]
        );

        // Re-detectar metadatos si cambia el ticker
        const existing = await dbGet(db, `SELECT sector, tipo_activo FROM operaciones_bolsa WHERE id=?`, [id]);
        if (!existing?.sector || !existing?.tipo_activo) {
            yahooFinanceService.getAssetMetadata(normalizedTicker).then(meta => {
                const updates = [];
                const params = [];
                if (!existing?.sector && meta.sector) { updates.push('sector=?'); params.push(meta.sector); }
                if (!existing?.tipo_activo && meta.tipo_activo) { updates.push('tipo_activo=?'); params.push(meta.tipo_activo); }
                if (updates.length > 0) {
                    params.push(id);
                    dbRun(db, `UPDATE operaciones_bolsa SET ${updates.join(',')} WHERE id=?`, params).catch(() => {});
                }
            }).catch(() => {});
        }
    }

    async deleteOperacion(id) {
        if (!id) throw new Error('ID es requerido');
        await dbRun(db, `DELETE FROM operaciones_bolsa WHERE id = ?`, [id]);
    }

    // ── Dividendos ─────────────────────────────────────────────────────

    async getDividendos(limit = 500) {
        return await dbAll(db, `
            SELECT id, ticker, empresa, fecha, importe_bruto, retencion, notas, source, importe_por_accion, created_at
            FROM dividendos ORDER BY fecha DESC, created_at DESC LIMIT ?
        `, [limit]);
    }

    async addDividendo(data) {
        const { ticker, empresa, fecha, importe_bruto, retencion, notas } = data;
        if (!ticker || !fecha || !importe_bruto) {
            throw new Error('ticker, fecha e importe_bruto son requeridos');
        }
        await dbRun(db,
            `INSERT INTO dividendos (ticker, empresa, fecha, importe_bruto, retencion, notas) VALUES (?, ?, ?, ?, ?, ?)`,
            [
                ticker.trim().toUpperCase(),
                empresa || null,
                fecha,
                parseFloat(importe_bruto),
                parseFloat(retencion) || 0,
                notas || null
            ]
        );
    }

    async updateDividendo(data) {
        const { id, ticker, empresa, fecha, importe_bruto, retencion, notas } = data;
        if (!id) throw new Error('ID es requerido');
        await dbRun(db,
            `UPDATE dividendos SET ticker=?, empresa=?, fecha=?, importe_bruto=?, retencion=?, notas=? WHERE id=?`,
            [ticker.trim().toUpperCase(), empresa || null, fecha, parseFloat(importe_bruto), parseFloat(retencion) || 0, notas || null, id]
        );
    }

    async deleteDividendo(id) {
        if (!id) throw new Error('ID es requerido');
        await dbRun(db, `DELETE FROM dividendos WHERE id = ?`, [id]);
    }

    // ── Posiciones (cartera actual) ────────────────────────────────────
    /**
     * Calcula la posición actual por ticker a partir de las operaciones.
     * Usa coste medio ponderado (weighted average cost): en ventas se reduce la base
     * de coste proporcionalmente al precio medio actual, no al precio de venta.
     * Returns array of { ticker, empresa, cantidad, coste_total, precio_medio, dividendos_netos }
     */

    // ── Private: replay all operations to compute weighted-avg positions ─────
    // Used by getPosiciones() and getResumen() to avoid duplicating the loop.
    async _replayOperaciones() {
        const operaciones = await dbAll(db, `
            SELECT ticker, empresa, tipo, cantidad, precio_unitario, comision, fecha, sector, tipo_activo
            FROM operaciones_bolsa ORDER BY ticker, fecha ASC, id ASC
        `);

        const map = {};
        const today = new Date().toISOString().slice(0, 10);
        for (const op of operaciones) {
            if (!map[op.ticker]) {
                map[op.ticker] = { ticker: op.ticker, empresa: op.empresa, cantidad: 0, base_coste: 0, precio_base: 0, comisiones: 0, ganancia_realizada: 0, primera_compra: null, sector: op.sector || null, tipo_activo: op.tipo_activo || null };
            }
            const pos = map[op.ticker];
            if (op.empresa) pos.empresa = op.empresa;
            if (op.sector && !pos.sector) pos.sector = op.sector;
            if (op.tipo_activo && !pos.tipo_activo) pos.tipo_activo = op.tipo_activo;
            pos.comisiones += op.comision || 0;

            if (op.tipo === 'compra') {
                if (!pos.primera_compra) pos.primera_compra = op.fecha;
                pos.base_coste  += op.cantidad * op.precio_unitario + (op.comision || 0);
                pos.precio_base += op.cantidad * op.precio_unitario;
                pos.cantidad    += op.cantidad;
            } else {
                if (pos.cantidad > 0) {
                    const costeRatio  = pos.base_coste  / pos.cantidad;
                    const precioRatio = pos.precio_base / pos.cantidad;
                    const costeBase   = op.cantidad * costeRatio;
                    const ingresoNeto = op.cantidad * op.precio_unitario - (op.comision || 0);
                    pos.ganancia_realizada += ingresoNeto - costeBase;
                    pos.base_coste  -= costeBase;
                    pos.precio_base -= op.cantidad * precioRatio;
                }
                pos.cantidad -= op.cantidad;
                if (pos.cantidad < 0.0001) { pos.cantidad = 0; pos.base_coste = 0; pos.precio_base = 0; }
            }
        }

        const dividendos = await dbAll(db, `
            SELECT ticker, SUM(importe_bruto - retencion) AS neto FROM dividendos GROUP BY ticker
        `);
        const divMap = {};
        for (const d of dividendos) divMap[d.ticker] = d.neto;

        const posicionesAbiertas = Object.values(map)
            .filter(p => p.cantidad > 0.0001)
            .map(p => {
                const dias_en_posicion = p.primera_compra
                    ? Math.floor((new Date(today) - new Date(p.primera_compra)) / 86400000)
                    : null;
                return {
                    ticker:           p.ticker,
                    empresa:          p.empresa || p.ticker,
                    cantidad:         Math.round(p.cantidad   * 10000) / 10000,
                    coste_total:      Math.round(p.base_coste * 100)   / 100,
                    precio_medio:     p.cantidad > 0 ? Math.round((p.base_coste / p.cantidad) * 100) / 100 : 0,
                    comisiones:       Math.round(p.comisiones * 100)   / 100,
                    dividendos_netos: Math.round((divMap[p.ticker] || 0) * 100) / 100,
                    primera_compra:   p.primera_compra,
                    dias_en_posicion: dias_en_posicion,
                    sector:           p.sector,
                    tipo_activo:      p.tipo_activo
                };
            });

        return { map, posicionesAbiertas, divMap };
    }

    async getDesgloseSector() {
        const { posicionesAbiertas } = await this._replayOperaciones();
        const total = posicionesAbiertas.reduce((s, p) => s + p.coste_total, 0);

        const bySector = {};
        const byTipo = {};
        for (const p of posicionesAbiertas) {
            const s = p.sector || 'Desconocido';
            const t = p.tipo_activo || 'otro';
            bySector[s] = (bySector[s] || 0) + p.coste_total;
            byTipo[t]   = (byTipo[t]   || 0) + p.coste_total;
        }

        const toArr = (obj) => Object.entries(obj)
            .map(([nombre, coste]) => ({ nombre, coste: Math.round(coste * 100) / 100, pct: total > 0 ? Math.round(coste / total * 10000) / 100 : 0 }))
            .sort((a, b) => b.coste - a.coste);

        return { total: Math.round(total * 100) / 100, por_sector: toArr(bySector), por_tipo: toArr(byTipo) };
    }

    async getEstadisticasFiscales() {
        const operaciones = await dbAll(db, `
            SELECT ticker, empresa, tipo, cantidad, precio_unitario, comision, fecha
            FROM operaciones_bolsa ORDER BY ticker, fecha ASC, id ASC
        `);

        const map = {};
        const ventas = [];

        for (const op of operaciones) {
            if (!map[op.ticker]) {
                map[op.ticker] = { ticker: op.ticker, empresa: op.empresa || op.ticker, cantidad: 0, base_coste: 0, primera_compra: null, lotes: [] };
            }
            const pos = map[op.ticker];
            if (op.empresa) pos.empresa = op.empresa;

            if (op.tipo === 'compra') {
                if (!pos.primera_compra) pos.primera_compra = op.fecha;
                pos.lotes.push({ fecha: op.fecha, cantidad: op.cantidad, precio: op.precio_unitario, comision: op.comision || 0 });
                pos.base_coste += op.cantidad * op.precio_unitario + (op.comision || 0);
                pos.cantidad   += op.cantidad;
            } else if (pos.cantidad > 0) {
                const costePorAccion = pos.base_coste / pos.cantidad;
                const costeBase      = op.cantidad * costePorAccion;
                const ingreso        = op.cantidad * op.precio_unitario - (op.comision || 0);
                const ganancia_neta  = ingreso - costeBase;
                const dias_tenencia  = pos.primera_compra
                    ? Math.floor((new Date(op.fecha) - new Date(pos.primera_compra)) / 86400000)
                    : null;
                ventas.push({
                    ticker:         op.ticker,
                    empresa:        pos.empresa,
                    fecha_compra:   pos.primera_compra,
                    fecha_venta:    op.fecha,
                    precio_compra:  Math.round(costePorAccion * 100) / 100,
                    precio_venta:   Math.round(op.precio_unitario * 100) / 100,
                    cantidad:       Math.round(op.cantidad * 10000) / 10000,
                    coste_base:     Math.round(costeBase * 100) / 100,
                    ingreso_neto:   Math.round(ingreso * 100) / 100,
                    ganancia_neta:  Math.round(ganancia_neta * 100) / 100,
                    ganancia_pct:   costeBase > 0 ? Math.round(ganancia_neta / costeBase * 10000) / 100 : 0,
                    dias_tenencia:  dias_tenencia
                });
                pos.base_coste -= costeBase;
                pos.cantidad   -= op.cantidad;
                if (pos.cantidad < 0.0001) { pos.cantidad = 0; pos.base_coste = 0; pos.primera_compra = null; }
            }
        }

        const total_ganancia = ventas.reduce((s, v) => s + v.ganancia_neta, 0);
        return { ventas, total_ganancia: Math.round(total_ganancia * 100) / 100 };
    }

    async getPosiciones() {
        const { posicionesAbiertas } = await this._replayOperaciones();
        return posicionesAbiertas;
    }

    // ── Resumen global ─────────────────────────────────────────────────
    async getResumen() {
        const { map, posicionesAbiertas } = await this._replayOperaciones();

        const totalInvertido    = posicionesAbiertas.reduce((s, p) => s + p.coste_total, 0);
        const [divTotalRow]     = await dbAll(db, `SELECT SUM(importe_bruto - retencion) AS neto FROM dividendos`);
        const totalDividendos   = divTotalRow?.neto || 0;
        const totalGananciaReal = Object.values(map).reduce((s, p) => s + p.ganancia_realizada, 0);

        const [capitalRow]     = await dbAll(db, `
            SELECT SUM(cantidad * precio_unitario + comision) AS total
            FROM operaciones_bolsa WHERE tipo = 'compra'
        `);
        const capitalTotalDesplegado = capitalRow?.total || 0;

        const [totalComisiones] = await dbAll(db, `SELECT SUM(comision) AS total FROM operaciones_bolsa`);
        const [numOperaciones]  = await dbAll(db, `SELECT COUNT(*) AS total FROM operaciones_bolsa`);

        return {
            posiciones:               posicionesAbiertas,
            total_invertido:          Math.round(totalInvertido         * 100) / 100,
            total_dividendos:         Math.round(totalDividendos        * 100) / 100,
            total_comisiones:         Math.round((totalComisiones?.total || 0) * 100) / 100,
            ganancia_realizada:       Math.round(totalGananciaReal      * 100) / 100,
            capital_total_desplegado: Math.round(capitalTotalDesplegado * 100) / 100,
            num_operaciones:          numOperaciones?.total || 0,
            num_posiciones:           posicionesAbiertas.length
        };
    }
    // ── Estadísticas de operaciones ────────────────────────────────────

    /**
     * Ranking de operaciones de venta: top/bottom por % y por €,
     * más tickers ordenados por actividad y volumen.
     */
    async getEstadisticasOperaciones() {
        const operaciones = await dbAll(db, `
            SELECT id, ticker, empresa, tipo, fecha, cantidad, precio_unitario, comision
            FROM operaciones_bolsa ORDER BY ticker, fecha ASC, id ASC
        `);

        // Por ticker: coste ponderado y métricas de actividad
        const map = {};
        // Array de cada venta con su P&L calculado con FIFO de coste ponderado
        const ventas = [];

        for (const op of operaciones) {
            if (!map[op.ticker]) {
                map[op.ticker] = { ticker: op.ticker, empresa: op.empresa || op.ticker, cantidad: 0, base_coste: 0, num_ops: 0, vol_eur: 0 };
            }
            const pos = map[op.ticker];
            if (op.empresa) pos.empresa = op.empresa;
            pos.num_ops++;
            pos.vol_eur += op.cantidad * op.precio_unitario;

            if (op.tipo === 'compra') {
                pos.base_coste += op.cantidad * op.precio_unitario + (op.comision || 0);
                pos.cantidad   += op.cantidad;
            } else {
                if (pos.cantidad > 0) {
                    const costePorAccion = pos.base_coste / pos.cantidad;
                    const costeBase      = op.cantidad * costePorAccion;
                    const ingreso        = op.cantidad * op.precio_unitario - (op.comision || 0);
                    const ganancia_eur   = ingreso - costeBase;
                    const ganancia_pct   = costeBase > 0 ? (ganancia_eur / costeBase) * 100 : 0;
                    ventas.push({
                        ticker:       op.ticker,
                        empresa:      pos.empresa,
                        fecha:        op.fecha,
                        cantidad:     parseFloat(op.cantidad.toFixed(6)),
                        precio_venta: parseFloat(op.precio_unitario.toFixed(4)),
                        precio_coste: parseFloat(costePorAccion.toFixed(4)),
                        ganancia_eur: parseFloat(ganancia_eur.toFixed(2)),
                        ganancia_pct: parseFloat(ganancia_pct.toFixed(2))
                    });
                    pos.base_coste -= costeBase;
                }
                pos.cantidad -= op.cantidad;
                if (pos.cantidad < 0.0001) { pos.cantidad = 0; pos.base_coste = 0; }
            }
        }

        const N = 5;
        const byPct = [...ventas].sort((a, b) => b.ganancia_pct - a.ganancia_pct);
        const byEur = [...ventas].sort((a, b) => b.ganancia_eur - a.ganancia_eur);

        const tickerStats = Object.values(map)
            .map(t => ({ ticker: t.ticker, empresa: t.empresa, num_ops: t.num_ops, vol_eur: parseFloat(t.vol_eur.toFixed(2)) }))
            .sort((a, b) => b.num_ops - a.num_ops);

        const numCompras = operaciones.filter(o => o.tipo === 'compra').length;
        const numVentas  = operaciones.filter(o => o.tipo === 'venta').length;

        return {
            num_operaciones:      operaciones.length,
            num_compras:          numCompras,
            num_ventas:           numVentas,
            num_tickers:          Object.keys(map).length,
            num_ventas_con_pnl:   ventas.length,
            ganancia_total_ventas: parseFloat(ventas.reduce((s, v) => s + v.ganancia_eur, 0).toFixed(2)),
            top_pct:    byPct.slice(0, N),
            bottom_pct: byPct.slice(-N).reverse(),
            top_eur:    byEur.slice(0, N),
            bottom_eur: byEur.slice(-N).reverse(),
            mas_movidos: tickerStats.slice(0, 10)
        };
    }

    // ── Histórico de precios (ticker_history) ──────────────────────────

    /**
     * Upsert a batch of {date, price} rows for a ticker.
     * Called after fetching historical data from Yahoo Finance / stooq.
     */
    async cacheTickerHistory(ticker, rows) {
        const norm = String(ticker || '').trim().toUpperCase();
        if (!norm || !Array.isArray(rows) || rows.length === 0) return;
        for (const row of rows) {
            if (!row.date || row.price == null) continue;
            await dbRun(db,
                `INSERT OR REPLACE INTO ticker_history (ticker, fecha, precio_cierre, updated_at)
                 VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
                [norm, row.date, parseFloat(row.price)]
            );
        }
    }

    /**
     * Save a single current price point for today.
     */
    async cacheTodayPrice(ticker, price) {
        const norm = String(ticker || '').trim().toUpperCase();
        if (!norm || price == null) return;
        const today = new Date().toISOString().slice(0, 10);
        await dbRun(db,
            `INSERT OR REPLACE INTO ticker_history (ticker, fecha, precio_cierre, updated_at)
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
            [norm, today, parseFloat(price)]
        );
    }

    /**
     * Get all cached history for a ticker, ordered by date ascending.
     */
    async getTickerHistoryFromDb(ticker) {
        const norm = String(ticker || '').trim().toUpperCase();
        return await dbAll(db,
            `SELECT fecha, precio_cierre FROM ticker_history WHERE ticker = ? ORDER BY fecha ASC`,
            [norm]
        );
    }

    /**
     * Get the most recent date stored for a ticker (or null if none).
     */
    async getTickerLastDate(ticker) {
        const norm = String(ticker || '').trim().toUpperCase();
        const row = await dbGet(db,
            `SELECT MAX(fecha) AS last_date FROM ticker_history WHERE ticker = ?`,
            [norm]
        );
        return row?.last_date || null;
    }

    // ── Dividendos automáticos ─────────────────────────────────────────

    /**
     * Returns how many shares of a ticker the user held at a given date.
     * Uses FIFO: sum of compras - ventas up to and including that date.
     */
    async getSharesHeldAtDate(ticker, date) {
        const norm = String(ticker || '').trim().toUpperCase();
        const row = await dbGet(db,
            `SELECT SUM(CASE WHEN tipo='compra' THEN cantidad ELSE -cantidad END) AS held
             FROM operaciones_bolsa WHERE ticker = ? AND fecha <= ?`,
            [norm, date]
        );
        const held = Number(row?.held || 0);
        return held > 0.0001 ? held : 0;
    }

    /**
     * Sync dividends from Yahoo Finance for ALL tickers that ever had a compra.
     * Re-calculates shares held at each ex-dividend date and upserts existing auto
     * records (so changing operations retroactively updates dividend amounts).
     * Deletes auto records where shares held was 0.
     * Returns { stats, totalAdded, totalUpdated }.
     */
    async syncDividendosAuto(yahooFinanceService) {
        // Include ALL tickers that ever had a compra, not just open positions
        const allTickers = await dbAll(db,
            `SELECT DISTINCT ticker FROM operaciones_bolsa WHERE tipo = 'compra'`
        );
        const stats = [];
        let totalAdded = 0, totalUpdated = 0;
        // Track which Yahoo-resolved tickers were already processed to avoid duplicate dividend rows
        const processedResolvedTickers = new Set();

        for (const { ticker } of allTickers) {
            // Earliest buy date for this ticker
            const firstBuy = await dbGet(db,
                `SELECT MIN(fecha) AS first_date FROM operaciones_bolsa WHERE ticker = ? AND tipo = 'compra'`,
                [ticker]
            );
            const since = firstBuy?.first_date ? new Date(firstBuy.first_date) : new Date('2000-01-01');

            // Best empresa name from latest operation
            const latestOp = await dbGet(db,
                `SELECT empresa FROM operaciones_bolsa WHERE ticker = ? AND empresa IS NOT NULL ORDER BY fecha DESC LIMIT 1`,
                [ticker]
            );
            const empresa = latestOp?.empresa || ticker;

            let result;
            try {
                result = await yahooFinanceService.getDividendEvents(ticker, since);
            } catch (_) {
                stats.push({ ticker, added: 0, updated: 0, skipped: 0, error: 'fetch_failed' });
                continue;
            }
            const events         = result.events || [];
            const resolvedTicker = (result.resolvedTicker || ticker).toUpperCase();

            const alreadyProcessed = processedResolvedTickers.has(resolvedTicker);
            processedResolvedTickers.add(resolvedTicker);

            let added = 0, updated = 0, skipped = 0;
            for (const ev of events) {
                const sharesHeld = await this.getSharesHeldAtDate(ticker, ev.date);
                if (sharesHeld <= 0) { skipped++; continue; }

                if (alreadyProcessed) {
                    // Another app ticker for the same underlying stock was already processed.
                    // Add this ticker's shares to the existing row for that date.
                    const extraAmount = parseFloat((ev.dividendPerShare * sharesHeld).toFixed(2));
                    const existing = await dbGet(db,
                        `SELECT id FROM dividendos WHERE fecha = ? AND source = 'auto' LIMIT 1`,
                        [ev.date]
                    );
                    if (existing) {
                        await dbRun(db,
                            `UPDATE dividendos SET importe_bruto = importe_bruto + ? WHERE id = ?`,
                            [extraAmount, existing.id]
                        );
                        updated++;
                    } else {
                        // Edge case: no row yet for this date — insert normally
                        const importeBruto = parseFloat((ev.dividendPerShare * sharesHeld).toFixed(2));
                        await dbRun(db,
                            `INSERT INTO dividendos (ticker, empresa, fecha, importe_bruto, retencion, notas, source, importe_por_accion)
                             VALUES (?, ?, ?, ?, 0, 'Auto-sincronizado', 'auto', ?)`,
                            [ticker, empresa, ev.date, importeBruto, ev.dividendPerShare]
                        );
                        added++;
                    }
                } else {
                    const importeBruto = parseFloat((ev.dividendPerShare * sharesHeld).toFixed(2));
                    // Check existence before UPSERT to correctly track add vs update
                    const prevRow = await dbGet(db,
                        `SELECT id FROM dividendos WHERE ticker = ? AND fecha = ?`,
                        [ticker, ev.date]
                    );
                    // UPSERT: insert or update existing row for the same (ticker, fecha)
                    await dbRun(db,
                        `INSERT INTO dividendos (ticker, empresa, fecha, importe_bruto, retencion, notas, source, importe_por_accion)
                         VALUES (?, ?, ?, ?, 0, 'Auto-sincronizado', 'auto', ?)
                         ON CONFLICT(ticker, fecha) DO UPDATE SET
                             importe_bruto       = excluded.importe_bruto,
                             empresa             = excluded.empresa,
                             notas               = excluded.notas,
                             source              = excluded.source,
                             importe_por_accion  = excluded.importe_por_accion`,
                        [ticker, empresa, ev.date, importeBruto, ev.dividendPerShare]
                    );
                    if (prevRow) updated++; else added++;
                }
            }
            stats.push({ ticker, added, updated, skipped });
            totalAdded   += added;
            totalUpdated += updated;
        }
        return { stats, totalAdded, totalUpdated };
    }

    // ── Cuenta Remunerada — saldo diario vinculado a bolsa ─────────────

    /**
     * Delegado a CuentaRemuneradaService.getSaldoDiario().
     * Mantenido por compatibilidad con código existente.
     */
    async getSaldoDiarioCR(retencionDivPct = 0) {
        return new CuentaRemuneradaService().getSaldoDiario(retencionDivPct);
    }
}

module.exports = BolsaService;
