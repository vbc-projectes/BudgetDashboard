/**
 * Abstract base service for common CRUD operations
 * Shared between MensualService and PuntualService
 */

const db = require('../config/database');
const { dbRun, dbGet, dbAll } = require('../utils/dbHelpers');
const logger = require('../utils/logger');

class BaseService {
    constructor(tableName, dateField = null) {
        this.tableName = tableName;
        this.dateField = dateField; // 'fecha' for puntual, 'desde' for mensual
        this.hasIncome = tableName.includes('ingresos');
        this.hasBruto = this.hasIncome && this.tableName !== 'ingresos_reales';
        this.hasIpc = this.tableName === 'gastos_mensuales';
        this.hasNotas = !tableName.includes('_reales') && tableName !== 'cuenta_remunerada';
    }

    /**
     * Get all records with category join
     * @param {number} limit - Limit results
     * @returns {Promise<Array>} Records with category info
     */
    async getAll(limit = 500) {
        const dateSelect = this.dateField ? `e.${this.dateField},` : '';
        const hastaField = this.tableName.includes('mensuales') ? 'e.hasta,' : '';
        const bruteField = this.hasBruto ? 'e.bruto,' : '';
        const ipcField = this.hasIpc ? 'e.ipc_porcentaje, e.frecuencia_meses,' : '';
        const notasField = this.hasNotas ? 'e.notas,' : '';

        return await dbAll(db, `
            SELECT
                e.id,
                ${dateSelect}
                ${hastaField}
                e.descripcion,
                e.monto,
                ${bruteField}
                ${ipcField}
                ${notasField}
                c.nombre AS categoria
            FROM ${this.tableName} e
            JOIN categorias c ON e.categoria_id = c.id
            ORDER BY ${this.dateField || 'id'} DESC
            LIMIT ?
        `, [limit]);
    }

    /**
     * Add new record
     * @param {Object} data - Record data
     */
    async add(data) {
        const { descripcion, monto, bruto, categoria_id, fecha, desde, hasta, archivo_origen, ipc_porcentaje, frecuencia_meses } = data;

        // Build INSERT based on table structure
        const columns = ['descripcion', 'monto', 'categoria_id'];
        const values = [descripcion, monto, categoria_id];
        const placeholders = ['?', '?', '?'];

        if (fecha) {
            columns.push('fecha');
            placeholders.push('?');
            values.push(fecha);
        }

        if (desde) {
            columns.push('desde');
            placeholders.push('?');
            values.push(desde);
        }

        if (hasta) {
            columns.push('hasta');
            placeholders.push('?');
            values.push(hasta);
        }

        if (this.hasBruto && bruto !== undefined) {
            columns.push('bruto');
            placeholders.push('?');
            values.push(bruto || null);
        }

        if (this.hasIpc) {
            if (ipc_porcentaje !== undefined) {
                columns.push('ipc_porcentaje');
                placeholders.push('?');
                values.push(parseFloat(ipc_porcentaje) || 0);
            }
            if (frecuencia_meses !== undefined) {
                columns.push('frecuencia_meses');
                placeholders.push('?');
                values.push(parseInt(frecuencia_meses) || 1);
            }
        }

        if (archivo_origen !== undefined) {
            columns.push('archivo_origen');
            placeholders.push('?');
            values.push(archivo_origen);
        }

        const sql = `INSERT INTO ${this.tableName} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
        logger.debug(`add ${this.tableName}: ${descripcion}`);
        await dbRun(db, sql, values);
    }

    /**
     * Update existing record
     * @param {Object} data - Update data including ID
     */
    async update(data) {
        const { id, descripcion, monto, bruto, categoria, categoria_id, fecha, desde, hasta, ipc_porcentaje, frecuencia_meses, notas } = data;

        // Determine category ID - prefer categoria_id if provided, otherwise look up by name
        let catId = categoria_id;
        
        if (!catId && categoria) {
            // Get category ID from name and type
            const tipoCat = this.tableName.includes('gasto') ? 'gasto' : 
                           this.tableName.includes('ingreso') ? 'ingreso' : 'impuestos';
            
            const cat = await dbGet(db, 
                "SELECT id FROM categorias WHERE nombre = ? AND tipo = ?", 
                [categoria, tipoCat]
            );
            if (!cat) throw new Error("Categoría no encontrada");
            catId = cat.id;
        }

        // Build UPDATE statement
        const updates = [];
        const values = [];

        if (descripcion !== undefined) {
            updates.push('descripcion = ?');
            values.push(descripcion);
        }
        if (monto !== undefined) {
            updates.push('monto = ?');
            values.push(monto);
        }
        if (fecha !== undefined) {
            updates.push('fecha = ?');
            values.push(fecha);
        }
        if (desde !== undefined) {
            updates.push('desde = ?');
            values.push(desde);
        }
        if (hasta !== undefined) {
            updates.push('hasta = ?');
            values.push(hasta);
        }
        if (this.hasBruto && bruto !== undefined) {
            updates.push('bruto = ?');
            values.push(bruto || null);
        }
        if (this.hasIpc) {
            if (ipc_porcentaje !== undefined) {
                updates.push('ipc_porcentaje = ?');
                values.push(parseFloat(ipc_porcentaje) || 0);
            }
            if (frecuencia_meses !== undefined) {
                updates.push('frecuencia_meses = ?');
                values.push(parseInt(frecuencia_meses) || 1);
            }
        }

        if (catId) {
            updates.push('categoria_id = ?');
            values.push(catId);
        }

        if (this.hasNotas && notas !== undefined) {
            updates.push('notas = ?');
            values.push(notas || null);
        }

        values.push(id);

        const sql = `UPDATE ${this.tableName} SET ${updates.join(', ')} WHERE id = ?`;
        logger.debug(`update ${this.tableName} id=${id}`);
        await dbRun(db, sql, values);
    }

    /**
     * Delete record by ID
     * @param {number|string} id - Record ID
     */
    async delete(id) {
        logger.debug(`delete ${this.tableName} id=${id}`);
        await dbRun(db, `DELETE FROM ${this.tableName} WHERE id = ?`, [id]);
    }

    /**
     * Get records filtered by category
     * @param {number} categoria_id - Category filter
     * @returns {Promise<Array>} Filtered records
     */
    async getByCategory(categoria_id) {
        let query = `SELECT monto, ${this.dateField || 'id'} FROM ${this.tableName}`;
        const params = [];
        
        if (categoria_id) {
            query += " WHERE categoria_id = ?";
            params.push(categoria_id);
        }
        
        return await dbAll(db, query, params);
    }
}

module.exports = BaseService;
