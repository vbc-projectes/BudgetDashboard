const db = require('../config/database');
const { dbRun, dbGet, dbAll } = require('../utils/dbHelpers');

/**
 * Service for Hucha operations
 * Simplifies hucha.js routes
 */
class HuchaService {
    constructor() {
        this.tableName = 'hucha';
    }

    /**
     * Get all hucha records
     * @returns {Promise<Array>} All hucha records
     */
    async getAll() {
        return await dbAll(db, `
            SELECT * FROM ${this.tableName} 
            ORDER BY created_at DESC
        `);
    }

    /**
     * Add new hucha record
     * @param {Object} data - { concepto, cantidad }
     * @returns {Promise<void>}
     */
    async add(data) {
        const { concepto, cantidad } = data;
        
        if (!concepto || cantidad === undefined || cantidad === null || isNaN(cantidad)) {
            throw new Error('Datos inválidos: concepto y cantidad son requeridos');
        }
        if (parseFloat(cantidad) <= 0) throw new Error('La cantidad debe ser mayor que cero');
        
        await dbRun(db, `
            INSERT INTO ${this.tableName} (concepto, cantidad) 
            VALUES (?, ?)
        `, [concepto, cantidad]);
    }

    /**
     * Update hucha record
     * @param {Object} data - { id, concepto, cantidad }
     * @returns {Promise<void>}
     */
    async update(data) {
        const { id, concepto, cantidad } = data;
        
        if (!id || !concepto || cantidad === undefined || cantidad === null || isNaN(cantidad)) {
            throw new Error('Datos inválidos: id, concepto y cantidad son requeridos');
        }
        if (parseFloat(cantidad) <= 0) throw new Error('La cantidad debe ser mayor que cero');
        
        await dbRun(db, `
            UPDATE ${this.tableName} 
            SET concepto = ?, cantidad = ? 
            WHERE id = ?
        `, [concepto, cantidad, id]);
    }

    /**
     * Delete hucha record
     * @param {number} id - Record ID
     * @returns {Promise<void>}
     */
    async delete(id) {
        if (!id) {
            throw new Error('ID requerido');
        }
        
        await dbRun(db, `
            DELETE FROM ${this.tableName} 
            WHERE id = ?
        `, [id]);
    }
}

module.exports = HuchaService;
