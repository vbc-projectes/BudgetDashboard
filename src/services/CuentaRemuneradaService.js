/**
 * CuentaRemuneradaService — único source of truth para el cálculo del saldo de la Cuenta Remunerada.
 *
 * Algoritmo de simulación (día a día):
 *   1. Obtiene la CR marcada como linked_to_bolsa=1 (o la primera si no hay ninguna vinculada).
 *   2. Construye un mapa de ops de bolsa por fecha (compras = efectivo negativo, ventas = positivo).
 *   3. Pre-aplica operaciones de bolsa anteriores a cuenta.desde al saldo inicial.
 *   4. Simula día a día desde cuenta.desde hasta min(hoy, cuenta.hasta):
 *      - El día 1 de cada mes (después del primero): suma aportacion_mensual.
 *      - En fechas con ops de bolsa: aplica el flujo neto de efectivo.
 *      - Cada día: acumula interés diario = saldo × (interes/100) / 365.
 */
'use strict';

const db = require('../config/database');
const { dbGet, dbAll } = require('../utils/dbHelpers');

// Caché corta de la simulación día-a-día — misma TTL que el resto de cachés
// de agregación del dashboard. Evita recorrer todo el histórico varias veces
// cuando el home/dashboard dispara varias llamadas seguidas (p.ej. periodo
// actual + anterior) que acaban pidiendo la misma simulación.
const CACHE_TTL_MS = 60000;
const _simulateCache = new Map();        // key: fullSeries|retencionDivPct|hastaFecha
const _interesesPorMesCache = new Map(); // key: desde|hasta
let _informeFiscalCache = null;          // { time, data }

function _pruneIfTooBig(map, maxSize = 20) {
    if (map.size > maxSize) map.clear();
}

// Igual que dashboardService: la caché se key-ea también por la ruta de la BD activa,
// para que un cambio de usuario (db.__setDbPath) no sirva datos de otro usuario.
function _dbPathKey() {
    return typeof db.__getDbPath === 'function' ? db.__getDbPath() : 'default';
}

class CuentaRemuneradaService {

    /**
     * Invalida la caché de simulación. Debe llamarse tras cualquier escritura que
     * afecte al cálculo (cuenta_remunerada, aportaciones, ajustes, tipos de interés,
     * operaciones de bolsa o dividendos), para que la siguiente lectura recalcule.
     */
    static invalidateCache() {
        _simulateCache.clear();
        _interesesPorMesCache.clear();
        _informeFiscalCache = null;
    }

    /** Formatea un Date como YYYY-MM-DD usando hora local (evita desfase UTC) */
    static _toLocalDateStr(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    /** Normaliza un valor de fecha inicio (YYYY-MM → primer día del mes) */
    static _parseDate(val, fallback) {
        if (!val) return fallback;
        return /^\d{4}-\d{2}$/.test(val) ? val + '-01' : val.slice(0, 10);
    }

    /** Normaliza un valor de fecha fin (YYYY-MM → último día del mes, no el primero) */
    static _parseDateEnd(val, fallback) {
        if (!val) return fallback;
        if (/^\d{4}-\d{2}$/.test(val)) {
            const [y, m] = val.split('-').map(Number);
            const lastDay = new Date(y, m, 0).getDate();
            return `${val}-${String(lastDay).padStart(2, '0')}`;
        }
        return val.slice(0, 10);
    }

    /**
     * Motor de simulación interno.
     * @param {boolean} fullSeries  - Si true, genera saldoSeries completo.
     * @param {number}  retencionDivPct - % retención sobre dividendos.
     * @param {string|null} hastaFecha  - YYYY-MM-DD. Si se especifica, sobreescribe "hoy" para
     *                                    permitir proyecciones futuras o balances históricos.
     */
    async _simulate(fullSeries, retencionDivPct = 0, hastaFecha = null) {
        const cacheKey = `${_dbPathKey()}|${fullSeries}|${retencionDivPct}|${hastaFecha || ''}`;
        const cached = _simulateCache.get(cacheKey);
        if (cached && (Date.now() - cached.time) < CACHE_TTL_MS) {
            return cached.data;
        }

        // Obtener CR vinculada (o la primera disponible si no hay ninguna vinculada)
        let cuenta = await dbGet(db,
            `SELECT * FROM cuenta_remunerada WHERE linked_to_bolsa = 1 ORDER BY created_at LIMIT 1`
        );
        if (!cuenta) {
            cuenta = await dbGet(db,
                `SELECT * FROM cuenta_remunerada ORDER BY created_at LIMIT 1`
            );
        }
        if (!cuenta) {
            return {
                cuenta: null,
                saldoSeries: [],
                saldoHoy: 0,
                saldoActual: 0,
                saldoInvertido: 0,
                interesAcumuladoBruto: 0,
                interesAcumuladoNeto: 0,
                tasaAnualEfectiva: 0
            };
        }

        const _now = hastaFecha ? new Date(hastaFecha + 'T00:00:00') : new Date();
        const hoy  = CuentaRemuneradaService._toLocalDateStr(_now);
        const toLD = CuentaRemuneradaService._toLocalDateStr;

        const fechaInicio = CuentaRemuneradaService._parseDate(cuenta.desde, hoy.slice(0, 7) + '-01');
        const fechaFin    = CuentaRemuneradaService._parseDateEnd(cuenta.hasta, hoy);

        // Operaciones de bolsa → mapa de flujo de efectivo neto por fecha
        const ops = await dbAll(db,
            `SELECT fecha, tipo, cantidad, precio_unitario, comision FROM operaciones_bolsa ORDER BY fecha ASC`
        );

        const movByDate = {};
        let totalInvertido = 0;
        for (const op of ops) {
            const f = (op.fecha || '').slice(0, 10); // normalizar a YYYY-MM-DD
            if (!movByDate[f]) movByDate[f] = 0;
            const importe = parseFloat(op.cantidad) * parseFloat(op.precio_unitario) + parseFloat(op.comision || 0);
            if (op.tipo === 'compra') {
                movByDate[f] -= importe;
                totalInvertido += importe;
            } else {
                const devuelto = parseFloat(op.cantidad) * parseFloat(op.precio_unitario) - parseFloat(op.comision || 0);
                movByDate[f] += devuelto;
                totalInvertido -= devuelto;
            }
        }
        const saldoInvertido = Math.max(0, totalInvertido);

        // Dividendos → ingresos netos que entran en la cuenta remunerada
        const dividendos = await dbAll(db,
            `SELECT fecha, importe_bruto, retencion FROM dividendos ORDER BY fecha ASC`
        );
        const divByDate = {};
        for (const div of (dividendos || [])) {
            const f = (div.fecha || '').slice(0, 10);
            const bruto = parseFloat(div.importe_bruto) || 0;
            const ret   = (parseFloat(div.retencion) || 0) !== 0
                ? parseFloat(div.retencion)
                : bruto * retencionDivPct / 100;
            const neto = bruto - ret;
            if (neto > 0) divByDate[f] = (divByDate[f] || 0) + neto;
        }

        const tasaBase   = parseFloat(cuenta.interes) || 0;
        const retencion  = parseFloat(cuenta.retencion) || 0;

        // Historial de tipos de interés: permite que la tasa cambie a lo largo del tiempo
        const tiposInteres = await dbAll(db,
            `SELECT desde, interes FROM historial_tipos_interes WHERE cuenta_remunerada_id = ? ORDER BY desde ASC`,
            [cuenta.id]
        );

        // fechaStr se pasa en orden ascendente (se recorre día a día), así que basta
        // con un puntero que avanza monotónicamente en vez de reescanear desde el inicio.
        let _tasaIdx = 0;
        let _tasaActual = tasaBase;
        function tasaEfectiva(fechaStr) {
            while (_tasaIdx < tiposInteres.length && tiposInteres[_tasaIdx].desde <= fechaStr) {
                _tasaActual = parseFloat(tiposInteres[_tasaIdx].interes);
                _tasaIdx++;
            }
            return _tasaActual;
        }

        const tasaAnual  = tasaBase; // kept for tasaAnualEfectiva KPI (base rate)

        // Saldo inicial: monto tal como está en cuenta.desde.
        // El usuario introduce el saldo disponible a esa fecha directamente,
        // ya reflejando cualquier inversión previa — no se re-aplican ops anteriores.
        let saldo = parseFloat(cuenta.monto) || 0;

        // Aportaciones variables: cambios de aportación mensual desde una fecha
        const aportaciones = await dbAll(db,
            `SELECT desde, cantidad FROM cuenta_remunerada_aportaciones WHERE cuenta_id = ? ORDER BY desde ASC`,
            [cuenta.id]
        );

        // Ajustes manuales de saldo: indexados por fecha para búsqueda O(1)
        const ajustesRows = await dbAll(db,
            `SELECT fecha, saldo FROM cuenta_remunerada_ajustes WHERE cuenta_id = ? ORDER BY fecha ASC`,
            [cuenta.id]
        );
        const ajusteByFecha = new Map((ajustesRows || []).map(a => [a.fecha.slice(0, 10), parseFloat(a.saldo)]));

        /**
         * Calcula la aportación efectiva en una fecha dada:
         * - Si hay aportaciones variables, usa la última cuyo `desde` <= fechaStr.
         * - Si no hay ninguna aplicable, usa cuenta.aportacion_mensual (valor base).
         */
        let _apIdx = 0;
        let _apActual = parseFloat(cuenta.aportacion_mensual) || 0;
        function aportacionEfectiva(fechaStr) {
            while (_apIdx < aportaciones.length && aportaciones[_apIdx].desde <= fechaStr) {
                _apActual = parseFloat(aportaciones[_apIdx].cantidad);
                _apIdx++;
            }
            return _apActual;
        }

        // Límite para saldoHoy: min(hoy, fechaFin)
        const endForHoy    = fechaFin < hoy ? fechaFin : hoy;
        // Límite para la serie: si fullSeries, hasta fechaFin (puede ser futuro); si no, hasta endForHoy
        const endForSeries = fullSeries ? (cuenta.hasta ? fechaFin : hoy) : endForHoy;

        const saldoSeries = [];
        const interesesMensuales = [];
        const aportacionesSeries = [];
        let interesAcum    = 0; // acumula toda la serie (puede incluir futuro si hay fechaFin)
        let interesAcumHoy = 0; // acumula sólo hasta min(hoy, fechaFin) → para los KPIs
        let interesDelMes  = 0; // acumula interés del mes en curso para la serie de marcadores
        let saldoHoyVal   = null; // se capturará al llegar a endForHoy

        let current  = new Date(fechaInicio + 'T00:00:00');
        const endDate = new Date(endForSeries + 'T00:00:00');
        if (endDate < current) endDate.setTime(current.getTime());

        let prevMonth = current.getMonth();

        while (current <= endDate) {
            const fechaStr = toLD(current);
            const curMonth = current.getMonth();

            // Aportación mensual: primer día del mes, después del mes inicial
            if (fechaStr > fechaInicio && current.getDate() === 1 && curMonth !== prevMonth) {
                const apMonto = aportacionEfectiva(fechaStr);
                saldo += apMonto;
                if (fullSeries && apMonto > 0) {
                    aportacionesSeries.push({ fecha: fechaStr, monto: parseFloat(apMonto.toFixed(2)) });
                }
            }
            prevMonth = curMonth;

            // Movimientos de bolsa en este día
            if (movByDate[fechaStr]) saldo += movByDate[fechaStr];

            // Ingresos por dividendos (neto de retención)
            if (divByDate[fechaStr]) saldo += divByDate[fechaStr];

            // Ajuste manual: sobreescribe el saldo calculado con el valor correcto del usuario
            if (ajusteByFecha.has(fechaStr)) saldo = ajusteByFecha.get(fechaStr);

            // Interés diario acumulado (usa la tasa vigente en este día)
            const tasaDiariaHoy = tasaEfectiva(fechaStr) / 100 / 365;
            if (saldo > 0) {
                const intDiario = saldo * tasaDiariaHoy;
                interesAcum   += intDiario;
                interesDelMes += intDiario;
                if (fechaStr <= endForHoy) interesAcumHoy += intDiario;
            }

            // Acreditar interés al saldo el último día del mes o al final de la simulación
            // (en cuentas reales el banco ingresa el interés bruto y retiene el impuesto aparte)
            const lastDayOfMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
            const isMonthEnd     = current.getDate() === lastDayOfMonth;
            const isSimEnd       = fechaStr === endForHoy;
            if ((isMonthEnd || isSimEnd) && interesDelMes > 0) {
                saldo += interesDelMes;
                if (fullSeries) {
                    interesesMensuales.push({
                        fecha:        fechaStr,
                        interesBruto: parseFloat(interesDelMes.toFixed(2)),
                        interesNeto:  parseFloat((interesDelMes * (1 - retencion / 100)).toFixed(2))
                    });
                }
                interesDelMes = 0;
            }

            const snapSaldo = parseFloat(saldo.toFixed(2));
            if (fullSeries) saldoSeries.push({ fecha: fechaStr, saldo: snapSaldo });

            // Capturar saldo del día "hoy" (o del último día de la cuenta si termina antes de hoy)
            if (fechaStr === endForHoy) saldoHoyVal = snapSaldo;

            current.setDate(current.getDate() + 1);
        }

        // Fallback: si nunca tocamos endForHoy (p.ej. fechaInicio > hoy), usar el último saldo calculado
        if (saldoHoyVal === null) saldoHoyVal = parseFloat(saldo.toFixed(2));

        // KPIs: interés real acumulado hasta hoy (no proyectado al futuro)
        const interesAcumuladoBruto = parseFloat(interesAcumHoy.toFixed(2));
        const interesAcumuladoNeto  = parseFloat((interesAcumHoy * (1 - retencion / 100)).toFixed(2));

        const result = {
            cuenta,
            saldoSeries,
            interesesMensuales,
            aportacionesSeries,
            saldoHoy:    saldoHoyVal,
            saldoActual: saldoHoyVal,
            saldoInvertido,
            interesAcumuladoBruto,
            interesAcumuladoNeto,
            tasaAnualEfectiva: tasaAnual,
            ajustes:      (ajustesRows  || []).map(a => ({ fecha: (a.fecha || '').slice(0, 10), saldo: parseFloat(a.saldo) })),
            tiposInteres: (tiposInteres || []).map(t => ({ desde: (t.desde || '').slice(0, 7), interes: parseFloat(t.interes) }))
        };

        _pruneIfTooBig(_simulateCache);
        _simulateCache.set(cacheKey, { time: Date.now(), data: result });
        return result;
    }

    /**
     * Genera el informe fiscal agrupado por año.
     * Ejecuta la simulación completa y acumula interés bruto/neto por año fiscal.
     * @returns {Promise<Array<{anio, interes_bruto, retencion_pct, interes_neto}>>}
     */
    async getInformeFiscal() {
        const dbKey = _dbPathKey();
        if (_informeFiscalCache && _informeFiscalCache.key === dbKey && (Date.now() - _informeFiscalCache.time) < CACHE_TTL_MS) {
            return _informeFiscalCache.data;
        }

        let cuenta = await dbGet(db, `SELECT * FROM cuenta_remunerada WHERE linked_to_bolsa = 1 ORDER BY created_at LIMIT 1`);
        if (!cuenta) cuenta = await dbGet(db, `SELECT * FROM cuenta_remunerada ORDER BY created_at LIMIT 1`);
        if (!cuenta) return [];

        const toLD = CuentaRemuneradaService._toLocalDateStr;
        const _now = new Date();
        const hoy  = toLD(_now);
        const fechaInicio = CuentaRemuneradaService._parseDate(cuenta.desde, hoy.slice(0, 7) + '-01');
        const fechaFin    = CuentaRemuneradaService._parseDateEnd(cuenta.hasta, hoy);
        const endForHoy   = fechaFin < hoy ? fechaFin : hoy;

        const retencion = parseFloat(cuenta.retencion) || 0;
        const tasaBase  = parseFloat(cuenta.interes) || 0;

        const [ops, dividendos, aportaciones, ajustesRows, tiposInteres] = await Promise.all([
            dbAll(db, `SELECT fecha, tipo, cantidad, precio_unitario, comision FROM operaciones_bolsa ORDER BY fecha ASC`),
            dbAll(db, `SELECT fecha, importe_bruto, retencion FROM dividendos ORDER BY fecha ASC`),
            dbAll(db, `SELECT desde, cantidad FROM cuenta_remunerada_aportaciones WHERE cuenta_id = ? ORDER BY desde ASC`, [cuenta.id]),
            dbAll(db, `SELECT fecha, saldo FROM cuenta_remunerada_ajustes WHERE cuenta_id = ? ORDER BY fecha ASC`, [cuenta.id]),
            dbAll(db, `SELECT desde, interes FROM historial_tipos_interes WHERE cuenta_remunerada_id = ? ORDER BY desde ASC`, [cuenta.id])
        ]);

        const movByDate = {};
        for (const op of (ops || [])) {
            const f = (op.fecha || '').slice(0, 10);
            if (!movByDate[f]) movByDate[f] = 0;
            const importe = parseFloat(op.cantidad) * parseFloat(op.precio_unitario) + parseFloat(op.comision || 0);
            movByDate[f] += op.tipo === 'compra' ? -importe : (parseFloat(op.cantidad) * parseFloat(op.precio_unitario) - parseFloat(op.comision || 0));
        }

        const divByDate = {};
        for (const div of (dividendos || [])) {
            const f = (div.fecha || '').slice(0, 10);
            const bruto = parseFloat(div.importe_bruto) || 0;
            const ret   = parseFloat(div.retencion) || bruto * 19 / 100;
            divByDate[f] = (divByDate[f] || 0) + Math.max(0, bruto - ret);
        }

        const ajusteMap = new Map((ajustesRows || []).map(a => [a.fecha.slice(0, 10), parseFloat(a.saldo)]));

        let _tasaFiscalIdx = 0;
        let _tasaFiscalActual = tasaBase;
        const tasaEfFiscal = (fechaStr) => {
            while (_tasaFiscalIdx < tiposInteres.length && tiposInteres[_tasaFiscalIdx].desde <= fechaStr) {
                _tasaFiscalActual = parseFloat(tiposInteres[_tasaFiscalIdx].interes);
                _tasaFiscalIdx++;
            }
            return _tasaFiscalActual;
        };

        let _apFiscalIdx = 0;
        let _apFiscalActual = parseFloat(cuenta.aportacion_mensual) || 0;
        const aportEf = (fechaStr) => {
            while (_apFiscalIdx < aportaciones.length && aportaciones[_apFiscalIdx].desde <= fechaStr) {
                _apFiscalActual = parseFloat(aportaciones[_apFiscalIdx].cantidad);
                _apFiscalIdx++;
            }
            return _apFiscalActual;
        };

        let saldo = parseFloat(cuenta.monto) || 0;
        const interesAnio = {};
        let current  = new Date(fechaInicio + 'T00:00:00');
        const endDate = new Date(endForHoy + 'T00:00:00');
        if (endDate < current) endDate.setTime(current.getTime());

        let prevMonth = current.getMonth();
        while (current <= endDate) {
            const fechaStr = toLD(current);
            const curMonth = current.getMonth();
            if (fechaStr > fechaInicio && current.getDate() === 1 && curMonth !== prevMonth) saldo += aportEf(fechaStr);
            prevMonth = curMonth;
            if (movByDate[fechaStr]) saldo += movByDate[fechaStr];
            if (divByDate[fechaStr]) saldo += divByDate[fechaStr];
            if (ajusteMap.has(fechaStr)) saldo = ajusteMap.get(fechaStr);
            if (saldo > 0) {
                const interesDia = saldo * tasaEfFiscal(fechaStr) / 100 / 365;
                const anio = fechaStr.slice(0, 4);
                interesAnio[anio] = (interesAnio[anio] || 0) + interesDia;
            }
            current.setDate(current.getDate() + 1);
        }

        const resultado = Object.entries(interesAnio).sort(([a], [b]) => a.localeCompare(b)).map(([anio, bruto]) => ({
            anio,
            interes_bruto: parseFloat(bruto.toFixed(2)),
            retencion_pct: retencion,
            interes_neto:  parseFloat((bruto * (1 - retencion / 100)).toFixed(2))
        }));

        _informeFiscalCache = { time: Date.now(), data: resultado, key: dbKey };
        return resultado;
    }

    /**
     * Serie diaria completa (para el gráfico en la pestaña Inversiones).
     * La serie se extiende hasta cuenta.hasta aunque sea una fecha futura.
     * Incluye saldoHoy = saldo en min(hoy, cuenta.hasta).
     */
    async getSaldoDiario(retencionDivPct = 0) {
        return this._simulate(true, retencionDivPct);
    }

    /**
     * Snapshot ligero del saldo de hoy (para la pestaña Hucha y KPIs sin gráfico).
     * No devuelve saldoSeries — mucho más rápido que getSaldoDiario().
     * Devuelve { cuenta, saldo, saldoInvertido, interesAcumuladoBruto, interesAcumuladoNeto, tasaAnualEfectiva }
     */
    async getSaldoHoy(retencionDivPct = 0, hastaFecha = null) {
        const r = await this._simulate(false, retencionDivPct, hastaFecha);
        return {
            cuenta:                r.cuenta,
            saldo:                 r.saldoHoy,
            saldoInvertido:        r.saldoInvertido,
            interesAcumuladoBruto: r.interesAcumuladoBruto,
            interesAcumuladoNeto:  r.interesAcumuladoNeto,
            tasaAnualEfectiva:     r.tasaAnualEfectiva
        };
    }

    /**
     * Devuelve el interés real (simulado día a día) desglosado por mes.
     * Tiene en cuenta: tasa variable, aportaciones variables, ajustes manuales,
     * operaciones de bolsa y dividendos que modifican el saldo base.
     * @param {string} desde  YYYY-MM-DD
     * @param {string} hasta  YYYY-MM-DD
     * @returns {Promise<Object>} { 'YYYY-MM': { bruto, neto } }
     */
    async getInteresesPorMes(desde, hasta) {
        const cacheKey = `${_dbPathKey()}|${desde}|${hasta}`;
        const cachedIPM = _interesesPorMesCache.get(cacheKey);
        if (cachedIPM && (Date.now() - cachedIPM.time) < CACHE_TTL_MS) {
            return cachedIPM.data;
        }

        let cuenta = await dbGet(db,
            `SELECT * FROM cuenta_remunerada WHERE linked_to_bolsa = 1 ORDER BY created_at LIMIT 1`
        );
        if (!cuenta) cuenta = await dbGet(db, `SELECT * FROM cuenta_remunerada ORDER BY created_at LIMIT 1`);
        if (!cuenta) return {};

        const toLD = CuentaRemuneradaService._toLocalDateStr;
        const hoy  = toLD(new Date());
        const fechaInicio = CuentaRemuneradaService._parseDate(cuenta.desde, hoy.slice(0, 7) + '-01');
        const fechaFin    = CuentaRemuneradaService._parseDateEnd(cuenta.hasta, hoy);
        const endForHoy   = fechaFin < hoy ? fechaFin : hoy;
        const simEnd      = hasta > endForHoy ? endForHoy : hasta;
        if (fechaInicio > simEnd) return {};

        const retencion = parseFloat(cuenta.retencion) || 0;
        const tasaBase  = parseFloat(cuenta.interes)   || 0;

        const [ops, dividendos, aportaciones, ajustesRows, tiposInteres] = await Promise.all([
            dbAll(db, `SELECT fecha, tipo, cantidad, precio_unitario, comision FROM operaciones_bolsa ORDER BY fecha ASC`),
            dbAll(db, `SELECT fecha, importe_bruto, retencion FROM dividendos ORDER BY fecha ASC`),
            dbAll(db, `SELECT desde, cantidad FROM cuenta_remunerada_aportaciones WHERE cuenta_id = ? ORDER BY desde ASC`, [cuenta.id]),
            dbAll(db, `SELECT fecha, saldo FROM cuenta_remunerada_ajustes WHERE cuenta_id = ? ORDER BY fecha ASC`, [cuenta.id]),
            dbAll(db, `SELECT desde, interes FROM historial_tipos_interes WHERE cuenta_remunerada_id = ? ORDER BY desde ASC`, [cuenta.id])
        ]);

        const movByDate = {};
        for (const op of ops) {
            const f = (op.fecha || '').slice(0, 10);
            if (!movByDate[f]) movByDate[f] = 0;
            const importe = parseFloat(op.cantidad) * parseFloat(op.precio_unitario) + parseFloat(op.comision || 0);
            if (op.tipo === 'compra') {
                movByDate[f] -= importe;
            } else {
                movByDate[f] += parseFloat(op.cantidad) * parseFloat(op.precio_unitario) - parseFloat(op.comision || 0);
            }
        }

        const divByDate = {};
        for (const div of (dividendos || [])) {
            const f = (div.fecha || '').slice(0, 10);
            const bruto = parseFloat(div.importe_bruto) || 0;
            const ret   = parseFloat(div.retencion)     || 0;
            const neto  = bruto - ret;
            if (neto > 0) divByDate[f] = (divByDate[f] || 0) + neto;
        }

        const ajusteByFecha = new Map((ajustesRows || []).map(a => [a.fecha.slice(0, 10), parseFloat(a.saldo)]));

        let _tasaIpmIdx = 0;
        let _tasaIpmActual = tasaBase;
        function tasaEfectiva(fechaStr) {
            while (_tasaIpmIdx < tiposInteres.length && tiposInteres[_tasaIpmIdx].desde <= fechaStr) {
                _tasaIpmActual = parseFloat(tiposInteres[_tasaIpmIdx].interes);
                _tasaIpmIdx++;
            }
            return _tasaIpmActual;
        }

        let _apIpmIdx = 0;
        let _apIpmActual = parseFloat(cuenta.aportacion_mensual) || 0;
        function aportacionEfectiva(fechaStr) {
            while (_apIpmIdx < aportaciones.length && aportaciones[_apIpmIdx].desde <= fechaStr) {
                _apIpmActual = parseFloat(aportaciones[_apIpmIdx].cantidad);
                _apIpmIdx++;
            }
            return _apIpmActual;
        }

        let saldo = parseFloat(cuenta.monto) || 0;
        const interesPorMes = {};

        let current  = new Date(fechaInicio + 'T00:00:00');
        const endDate = new Date(simEnd + 'T00:00:00');
        let prevMonth = current.getMonth();

        while (current <= endDate) {
            const fechaStr = toLD(current);
            const curMonth = current.getMonth();

            if (fechaStr > fechaInicio && current.getDate() === 1 && curMonth !== prevMonth) {
                saldo += aportacionEfectiva(fechaStr);
            }
            prevMonth = curMonth;

            if (movByDate[fechaStr]) saldo += movByDate[fechaStr];
            if (divByDate[fechaStr]) saldo += divByDate[fechaStr];
            if (ajusteByFecha.has(fechaStr)) saldo = ajusteByFecha.get(fechaStr);

            if (fechaStr >= desde && saldo > 0) {
                const interDia = saldo * tasaEfectiva(fechaStr) / 100 / 365;
                const mes = fechaStr.slice(0, 7);
                if (!interesPorMes[mes]) interesPorMes[mes] = { bruto: 0, neto: 0 };
                interesPorMes[mes].bruto += interDia;
            }

            current.setDate(current.getDate() + 1);
        }

        for (const v of Object.values(interesPorMes)) {
            v.neto  = parseFloat((v.bruto * (1 - retencion / 100)).toFixed(4));
            v.bruto = parseFloat(v.bruto.toFixed(4));
        }

        _pruneIfTooBig(_interesesPorMesCache);
        _interesesPorMesCache.set(cacheKey, { time: Date.now(), data: interesPorMes });
        return interesPorMes;
    }
}

module.exports = CuentaRemuneradaService;
