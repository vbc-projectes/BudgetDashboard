const db = require('../config/database');
const { dbRun, dbGet, dbAll } = require('../utils/dbHelpers');
const BaseService = require('./BaseService');

/**
 * Service for CRUD operations on monthly entities
 * Eliminates duplication: gastos_mensuales, ingresos_mensuales, impuestos_mensuales
 */
class MensualService extends BaseService {
    constructor(tableName) {
        super(tableName, 'desde'); // 'desde' is the start date for monthly records
    }

    /**
     * Override add to validate that desde <= hasta before inserting.
     */
    async add(data) {
        const { desde, hasta } = data || {};
        if (desde && hasta && String(desde) > String(hasta)) {
            throw new Error('desde no puede ser posterior a hasta');
        }
        return super.add(data);
    }

    /**
     * Get total for a date range
     * @param {string} desde - Start date
     * @param {string} hasta - End date
     * @param {number} categoria_id - Optional category filter
     * @returns {Promise<number>} Total amount
     */
    async getTotalByPeriod(desde, hasta, categoria_id = null) {
        let query = `
            SELECT IFNULL(SUM(monto), 0) as total 
            FROM ${this.tableName} 
            WHERE desde <= ? AND hasta >= ?
        `;
        const params = [hasta, desde];
        
        if (categoria_id) {
            query += " AND categoria_id = ?";
            params.push(categoria_id);
        }
        
        return (await dbGet(db, query, params)).total;
    }

    /**
     * Get records active during a period
     * @param {string} desde - Start date
     * @param {string} hasta - End date
     * @param {number} categoria_id - Optional category filter
     * @returns {Promise<Array>} Active records
     */
    async getActiveDuring(desde, hasta, categoria_id = null) {
        let query = `
            SELECT * 
            FROM ${this.tableName}
            WHERE desde <= ? AND hasta >= ?
        `;
        const params = [hasta, desde];
        
        if (categoria_id) {
            query += " AND categoria_id = ?";
            params.push(categoria_id);
        }
        
        return await dbAll(db, query, params);
    }

    /**
     * Get all records for calculations (used in dashboard aggregations)
     * @param {number} categoria_id - Optional category filter
     * @returns {Promise<Array>} Records with monto, desde, hasta
     */
    async getAllForCalculations(categoria_id = null) {
        let query = `SELECT monto, desde, hasta FROM ${this.tableName}`;
        const params = [];
        
        if (categoria_id) {
            query += " WHERE categoria_id = ?";
            params.push(categoria_id);
        }
        
        return await dbAll(db, query, params);
    }
}

module.exports = MensualService;
