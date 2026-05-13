const db = require('../config/database');
const { dbRun, dbGet, dbAll } = require('../utils/dbHelpers');

class SubHuchaService {
    async getAll() {
        return await dbAll(db, `SELECT * FROM sub_huchas ORDER BY created_at DESC`);
    }

    async getById(id) {
        return await dbGet(db, `SELECT * FROM sub_huchas WHERE id = ?`, [id]);
    }

    async add(data) {
        const { nombre, aportacion_inicial, aportacion_mensual, desde, hasta } = data;
        if (!nombre || !desde || !hasta) {
            throw new Error('nombre, desde y hasta son requeridos');
        }
        if (String(desde) > String(hasta)) {
            throw new Error('desde no puede ser posterior a hasta');
        }
        await dbRun(db, `
            INSERT INTO sub_huchas (nombre, aportacion_inicial, aportacion_mensual, desde, hasta)
            VALUES (?, ?, ?, ?, ?)
        `, [nombre, Number(aportacion_inicial) || 0, Number(aportacion_mensual) || 0, desde, hasta]);
    }

    async update(data) {
        const { id, nombre, aportacion_inicial, aportacion_mensual, desde, hasta } = data;
        if (!id || !nombre || !desde || !hasta) {
            throw new Error('id, nombre, desde y hasta son requeridos');
        }
        if (String(desde) > String(hasta)) {
            throw new Error('desde no puede ser posterior a hasta');
        }
        await dbRun(db, `
            UPDATE sub_huchas SET nombre = ?, aportacion_inicial = ?, aportacion_mensual = ?, desde = ?, hasta = ?
            WHERE id = ?
        `, [nombre, Number(aportacion_inicial) || 0, Number(aportacion_mensual) || 0, desde, hasta, id]);
    }

    async delete(id) {
        if (!id) throw new Error('ID requerido');
        await dbRun(db, `DELETE FROM sub_huchas WHERE id = ?`, [id]);
    }

    // --- Aportaciones puntuales ---

    async getPuntuales(subHuchaId) {
        return await dbAll(db, `
            SELECT * FROM sub_huchas_puntuales WHERE sub_hucha_id = ? ORDER BY fecha DESC
        `, [subHuchaId]);
    }

    async getAllPuntuales() {
        return await dbAll(db, `SELECT * FROM sub_huchas_puntuales ORDER BY fecha DESC`);
    }

    async addPuntual(data) {
        const { sub_hucha_id, fecha, descripcion, monto } = data;
        if (!sub_hucha_id || !fecha || !monto || isNaN(monto)) {
            throw new Error('sub_hucha_id, fecha y monto son requeridos');
        }
        if (parseFloat(monto) <= 0) throw new Error('El monto debe ser mayor que cero');
        await dbRun(db, `
            INSERT INTO sub_huchas_puntuales (sub_hucha_id, fecha, descripcion, monto)
            VALUES (?, ?, ?, ?)
        `, [sub_hucha_id, fecha, descripcion || '', Number(monto)]);
    }

    async deletePuntual(id) {
        if (!id) throw new Error('ID requerido');
        await dbRun(db, `DELETE FROM sub_huchas_puntuales WHERE id = ?`, [id]);
    }

    /**
     * Calcula el saldo actual de una sub-hucha a un mes de referencia
     * = aportacion_inicial + aportaciones_mensuales_acumuladas + puntuales
     */
    calcularSaldo(subHucha, puntuales, mesReferencia) {
        const inicial = Number(subHucha.aportacion_inicial) || 0;
        const mensual = Number(subHucha.aportacion_mensual) || 0;

        // Meses transcurridos entre desde y mesReferencia (inclusive)
        const [desdeY, desdeM] = subHucha.desde.split('-').map(Number);
        const [hastaY, hastaM] = subHucha.hasta.split('-').map(Number);
        const [refY, refM] = mesReferencia.split('-').map(Number);

        const desdeDate = new Date(desdeY, desdeM - 1);
        const hastaDate = new Date(hastaY, hastaM - 1);
        const refDate = new Date(refY, refM - 1);

        // Si aún no ha empezado
        if (refDate < desdeDate) return 0;

        const limiteDate = refDate < hastaDate ? refDate : hastaDate;
        const MAX_MONTHS = 1200; // 100 years cap — prevents memory exhaustion on bad data
        const meses = Math.min(MAX_MONTHS, Math.max(0,
            (limiteDate.getFullYear() - desdeDate.getFullYear()) * 12 +
            (limiteDate.getMonth() - desdeDate.getMonth())
        ));

        const totalMensual = meses * mensual;

        // Sumar puntuales hasta mesReferencia
        const totalPuntual = (puntuales || [])
            .filter(p => {
                const pFecha = p.fecha.substring(0, 7); // YYYY-MM
                return pFecha <= mesReferencia;
            })
            .reduce((acc, p) => acc + (Number(p.monto) || 0), 0);

        return inicial + totalMensual + totalPuntual;
    }

    /**
     * Calcula el total de todas las sub-huchas para un mes dado
     */
    async calcularTotalSubHuchas(mesReferencia) {
        const [huchas, puntuales] = await Promise.all([
            this.getAll(),
            this.getAllPuntuales()
        ]);

        let total = 0;
        for (const h of huchas) {
            const puntH = puntuales.filter(p => p.sub_hucha_id === h.id);
            total += this.calcularSaldo(h, puntH, mesReferencia);
        }
        return total;
    }
}

module.exports = SubHuchaService;
