/**
 * Factory for creating CRUD routes
 * Eliminates duplication in gastos.js, ingresos.js, impuestos.js routes
 */

const express = require('express');
const db = require('../config/database');
const { dbRun } = require('../utils/dbHelpers');

/**
 * Validate a single import item at the Express boundary.
 * Mirrors the IPC-side validateImportItem in ipcHandlers.js.
 */
function validateImportItem(item) {
    if (item.monto !== undefined && item.monto !== null) {
        const monto = parseFloat(item.monto);
        if (isNaN(monto) || monto <= 0) throw new Error(`monto inválido: ${item.monto}`);
    }
    if (item.fecha !== undefined && item.fecha !== null) {
        const s = String(item.fecha);
        if (!/^\d{4}-\d{2}(-\d{2})?$/.test(s)) throw new Error(`fecha inválida: ${item.fecha}`);
        const parts = s.split('-');
        const month = Number(parts[1]);
        if (month < 1 || month > 12) throw new Error(`mes fuera de rango: ${item.fecha}`);
        if (parts[2]) {
            const day = Number(parts[2]);
            if (day < 1 || day > 31) throw new Error(`día fuera de rango: ${item.fecha}`);
        }
    }
    if (item.descripcion !== undefined && item.descripcion !== null) {
        if (String(item.descripcion).length > 500) throw new Error('descripcion excede 500 caracteres');
    }
}

/**
 * Create standard CRUD routes for a given entity type
 * @param {string} entityName - Entity name (e.g., 'gasto', 'ingreso')
 * @param {PuntualService} puntualService - Service instance for punctual operations
 * @param {MensualService} mensualService - Service instance for monthly operations
 * @returns {express.Router} Configured router
 */
function createEntityRoutes(entityName, puntualService, mensualService) {
    const router = express.Router();

    /**
     * Add puntual (one-time) entity
     */
    router.post(`/add/${entityName}_puntual`, async (req, res) => {
        try {
            await puntualService.add(req.body);
            res.json({ success: true });
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    /**
     * Delete puntual entity
     */
    router.post(`/delete/${entityName}_puntual`, async (req, res) => {
        try {
            await puntualService.delete(req.body.id);
            res.json({ success: true });
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    /**
     * Update puntual entity
     */
    router.post(`/update/${entityName}_puntual`, async (req, res) => {
        try {
            await puntualService.update(req.body);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message || 'Error al actualizar' });
        }
    });

    /**
     * Add mensual (monthly) entity
     */
    router.post(`/add/${entityName}_mensual`, async (req, res) => {
        try {
            const { desde, hasta } = req.body || {};
            if (desde && hasta && String(desde) > String(hasta)) {
                return res.status(400).json({ error: 'desde no puede ser posterior a hasta' });
            }
            await mensualService.add(req.body);
            res.json({ success: true });
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    /**
     * Delete mensual entity
     */
    router.post(`/delete/${entityName}_mensual`, async (req, res) => {
        try {
            await mensualService.delete(req.body.id);
            res.json({ success: true });
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    /**
     * Update mensual entity
     */
    router.post(`/update/${entityName}_mensual`, async (req, res) => {
        try {
            await mensualService.update(req.body);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message || 'Error al actualizar' });
        }
    });

    /**
     * Import multiple puntual entities (for bank import)
     * Runs inside a single DB transaction — all succeed or all roll back.
     */
    router.post(`/import/${entityName}_puntual`, async (req, res) => {
        const { datos } = req.body || {};
        if (!Array.isArray(datos) || datos.length === 0) {
            return res.status(400).json({ error: 'No hay datos para importar' });
        }

        const resultados = [];
        let exitosos = 0;
        let fallidos = 0;

        await dbRun(db, 'BEGIN TRANSACTION');
        try {
            for (const item of datos) {
                validateImportItem(item);
                await puntualService.add(item);
                resultados.push({ ...item, ok: true });
                exitosos++;
            }
            await dbRun(db, 'COMMIT');
            res.json({ success: true, total: datos.length, exitosos, fallidos, detalles: resultados });
        } catch (err) {
            try { await dbRun(db, 'ROLLBACK'); } catch (_) {}
            fallidos = datos.length - exitosos;
            res.status(400).json({
                success: false,
                error: err.message,
                total: datos.length,
                exitosos,
                fallidos,
                detalles: resultados
            });
        }
    });

    return router;
}

/**
 * Create CRUD routes for a "reales" entity (puntual-only, no mensual variant)
 * Used for gastos_reales and ingresos_reales (bank-imported records)
 * @param {string} entityName - e.g. 'gasto_real'
 * @param {PuntualService} puntualService
 * @returns {express.Router}
 */
function createRealEntityRoutes(entityName, puntualService) {
    const router = express.Router();

    router.post(`/add/${entityName}`, async (req, res) => {
        try {
            await puntualService.add(req.body);
            res.json({ success: true });
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    router.post(`/delete/${entityName}`, async (req, res) => {
        try {
            await puntualService.delete(req.body.id);
            res.json({ success: true });
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    router.post(`/update/${entityName}`, async (req, res) => {
        try {
            await puntualService.update(req.body);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message || 'Error al actualizar' });
        }
    });

    return router;
}

module.exports = { createEntityRoutes, createRealEntityRoutes };
