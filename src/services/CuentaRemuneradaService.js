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

class CuentaRemuneradaService {

    /** Formatea un Date como YYYY-MM-DD usando hora local (evita desfase UTC) */
    static _toLocalDateStr(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    /** Normaliza un valor de fecha (YYYY-MM o YYYY-MM-DD) a YYYY-MM-DD */
    static _parseDate(val, fallback) {
        if (!val) return fallback;
        return /^\d{4}-\d{2}$/.test(val) ? val + '-01' : val.slice(0, 10);
    }

    /**
     * Motor de simulación interno.
     * @param {boolean} fullSeries - Si true, genera saldoSeries completo hasta fechaFin (puede ser futuro).
     */
    async _simulate(fullSeries) {
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

        const _now = new Date();
        const hoy  = CuentaRemuneradaService._toLocalDateStr(_now);
        const toLD = CuentaRemuneradaService._toLocalDateStr;

        const fechaInicio = CuentaRemuneradaService._parseDate(cuenta.desde, hoy.slice(0, 7) + '-01');
        const fechaFin    = CuentaRemuneradaService._parseDate(cuenta.hasta, hoy);

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

        const tasaAnual  = parseFloat(cuenta.interes) || 0;
        const tasaDiaria = tasaAnual / 100 / 365;
        const retencion  = parseFloat(cuenta.retencion) || 0;

        // Saldo inicial: monto tal como está en cuenta.desde.
        // El usuario introduce el saldo disponible a esa fecha directamente,
        // ya reflejando cualquier inversión previa — no se re-aplican ops anteriores.
        let saldo = parseFloat(cuenta.monto) || 0;

        // Límite para saldoHoy: min(hoy, fechaFin)
        const endForHoy    = fechaFin < hoy ? fechaFin : hoy;
        // Límite para la serie: si fullSeries, hasta fechaFin (puede ser futuro); si no, hasta endForHoy
        const endForSeries = fullSeries ? (cuenta.hasta ? fechaFin : hoy) : endForHoy;

        const saldoSeries = [];
        let interesAcum   = 0;
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
                saldo += parseFloat(cuenta.aportacion_mensual) || 0;
            }
            prevMonth = curMonth;

            // Movimientos de bolsa en este día
            if (movByDate[fechaStr]) saldo += movByDate[fechaStr];

            // Interés diario acumulado
            if (saldo > 0) interesAcum += saldo * tasaDiaria;

            const snapSaldo = parseFloat(saldo.toFixed(2));
            if (fullSeries) saldoSeries.push({ fecha: fechaStr, saldo: snapSaldo });

            // Capturar saldo del día "hoy" (o del último día de la cuenta si termina antes de hoy)
            if (fechaStr === endForHoy) saldoHoyVal = snapSaldo;

            current.setDate(current.getDate() + 1);
        }

        // Fallback: si nunca tocamos endForHoy (p.ej. fechaInicio > hoy), usar el último saldo calculado
        if (saldoHoyVal === null) saldoHoyVal = parseFloat(saldo.toFixed(2));

        const interesAcumuladoBruto = parseFloat(interesAcum.toFixed(2));
        const interesAcumuladoNeto  = parseFloat((interesAcum * (1 - retencion / 100)).toFixed(2));

        return {
            cuenta,
            saldoSeries,
            saldoHoy:    saldoHoyVal,
            saldoActual: saldoHoyVal, // alias backward-compatible con código anterior
            saldoInvertido,
            interesAcumuladoBruto,
            interesAcumuladoNeto,
            tasaAnualEfectiva: tasaAnual  // tasa nominal de la CR
        };
    }

    /**
     * Serie diaria completa (para el gráfico en la pestaña Inversiones).
     * La serie se extiende hasta cuenta.hasta aunque sea una fecha futura.
     * Incluye saldoHoy = saldo en min(hoy, cuenta.hasta).
     */
    async getSaldoDiario() {
        return this._simulate(true);
    }

    /**
     * Snapshot ligero del saldo de hoy (para la pestaña Hucha y KPIs sin gráfico).
     * No devuelve saldoSeries — mucho más rápido que getSaldoDiario().
     * Devuelve { cuenta, saldo, saldoInvertido, interesAcumuladoBruto, interesAcumuladoNeto, tasaAnualEfectiva }
     */
    async getSaldoHoy() {
        const r = await this._simulate(false);
        return {
            cuenta:                r.cuenta,
            saldo:                 r.saldoHoy,
            saldoInvertido:        r.saldoInvertido,
            interesAcumuladoBruto: r.interesAcumuladoBruto,
            interesAcumuladoNeto:  r.interesAcumuladoNeto,
            tasaAnualEfectiva:     r.tasaAnualEfectiva
        };
    }
}

module.exports = CuentaRemuneradaService;
