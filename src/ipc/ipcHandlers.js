/**
 * IPC Handlers - Maneja todas las comunicaciones entre renderer y main process
 */

const { ipcMain, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const db = require('../config/database');
const { dbRun, dbGet, dbAll } = require('../utils/dbHelpers');
const { calcularInteresGenerado, generarDescripcionRandom } = require('../utils/calculations');
const logger = require('../utils/logger');
const { runMigrations } = require('../database/migrationRunner');
const {
    normalizeUserName,
    listUsers,
    ensureUserFolders,
    readLastUser,
    saveLastUser,
    readUserProfile,
    setUserIcon,
    hasUserPin,
    setUserPin,
    removeUserPin,
    verifyUserPin
} = require('../config/userManager');

// Services
const PuntualService = require('../services/PuntualService');
const MensualService = require('../services/MensualService');
const HuchaService = require('../services/HuchaService');
const SubHuchaService = require('../services/SubHuchaService');
const yahooFinanceService = require('../services/yahooFinanceService');
const CuentaRemuneradaService = require('../services/CuentaRemuneradaService');
const {
    getDashboardData,
    getDashboardRealData,
    getDashboardRangoFechas,
    getImpuestosMes,
    getImpuestosMesReal,
    getAhorrosMes,
    getAhorrosMesReal,
    getCategoriasPeriodo,
    getCategoriasPeriodoReal,
    getGastosCategoriaMes,
    getGastosCategoriaMesReal,
    getResumenPeriodos,
    getNetWorth,
    getPresupuestosConGasto,
    getAnomalias
} = require('../services/dashboardService');

// Inicializar servicios
const gastosPuntualesService = new PuntualService('gastos_puntuales');
const gastosMensualesService = new MensualService('gastos_mensuales');
const ingresosPuntualesService = new PuntualService('ingresos_puntuales');
const ingresosMensualesService = new MensualService('ingresos_mensuales');
const impuestosPuntualesService = new PuntualService('impuestos_puntuales');
const impuestosMensualesService = new MensualService('impuestos_mensuales');
const huchaService = new HuchaService();
    const subHuchaService = new SubHuchaService();
const gastosRealesService = new PuntualService('gastos_reales');
const ingresosRealesService = new PuntualService('ingresos_reales');

let currentUser = null;
try { currentUser = readLastUser(); } catch (_) {}

function getActiveUser() {
    return currentUser || readLastUser();
}

function setActiveUser(name) {
    currentUser = name;
    saveLastUser(name);
}

function getUploadsDir() {
    const user = getActiveUser();
    if (!user) {
        throw new Error('Usuario no seleccionado');
    }
    const paths = ensureUserFolders(user);
    return paths.uploadsDir;
}

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
        if (String(item.descripcion).length > 500) {
            throw new Error('descripcion excede 500 caracteres');
        }
    }
}

async function importBatchWithTransaction(service, datos) {
    if (!Array.isArray(datos) || datos.length === 0) {
        throw new Error('No hay datos para importar');
    }

    const resultados = [];
    let exitosos = 0;
    let fallidos = 0;

    await dbRun(db, 'BEGIN TRANSACTION');
    try {
        for (const item of datos) {
            try {
                validateImportItem(item);
                await service.add(item);
                resultados.push({ ...item, ok: true });
                exitosos += 1;
            } catch (err) {
                resultados.push({ ...item, ok: false, error: err.message });
                fallidos += 1;
                throw err;
            }
        }

        await dbRun(db, 'COMMIT');
        return {
            success: true,
            total: datos.length,
            exitosos,
            fallidos,
            detalles: resultados
        };
    } catch (error) {
        try {
            await dbRun(db, 'ROLLBACK');
        } catch (rollbackError) {
            logger.warn('import rollback failed:', rollbackError.message);
        }

        return {
            success: false,
            total: datos.length,
            exitosos,
            fallidos: fallidos || Math.max(0, datos.length - exitosos),
            error: error.message,
            detalles: resultados
        };
    }
}

/**
 * Registrar todos los handlers IPC
 */
function registerIpcHandlers() {
    // Central error logging wrapper for all IPC handlers.
    // Electrons catches handler rejections and forwards them to the renderer,
    // but this ensures every error is logged with the channel name for easier debugging.
    const _origHandle = ipcMain.handle.bind(ipcMain);
    const safeHandle = (channel, fn) => _origHandle(channel, async (...args) => {
        try {
            return await fn(...args);
        } catch (err) {
            logger.error(`IPC [${channel}]:`, err.message ?? err);
            throw err;
        }
    });

        // Limpiar caché de dashboardService al iniciar la app
        try {
            const dashboardService = require('../services/dashboardService');
            if ('resumenCache' in dashboardService) dashboardService.resumenCache = null;
            if ('resumenCacheTime' in dashboardService) dashboardService.resumenCacheTime = 0;
            if ('resumenCacheKey' in dashboardService) dashboardService.resumenCacheKey = null;
        } catch (e) {
            logger.warn('could not clear dashboardService cache:', e.message);
        }
    // ============= USUARIOS =============

    // ============= WINDOW CONTROLS =============
    safeHandle('window-minimize', async (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) return { success: false };
        win.minimize();
        return { success: true };
    });

    safeHandle('window-maximize-toggle', async (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) return { success: false, isMaximized: false };

        if (win.isMaximized()) {
            win.unmaximize();
        } else {
            win.maximize();
        }

        return { success: true, isMaximized: win.isMaximized() };
    });

    safeHandle('window-close', async (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) return { success: false };
        win.close();
        return { success: true };
    });

    safeHandle('window-is-maximized', async (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        return { isMaximized: !!win && win.isMaximized() };
    });

    safeHandle('list-users', async () => {
        return { users: listUsers(), currentUser: getActiveUser() || null };
    });

    safeHandle('create-user', async (event, data) => {
        const name = normalizeUserName(data?.name);
        ensureUserFolders(name);
        return { success: true, name };
    });

    safeHandle('get-current-user', async () => {
        return { name: getActiveUser() || null };
    });

    safeHandle('set-current-user', async (event, data) => {
        const name = normalizeUserName(data?.name);
        const paths = ensureUserFolders(name);
        await db.__setDbPath(paths.dbPath);
        await runMigrations();
        setActiveUser(name);
        return { success: true, name, paths };
    });

    safeHandle('get-user-profile', async (event, data) => {
        const name = normalizeUserName(data?.name);
        return { profile: readUserProfile(name) };
    });

    safeHandle('set-user-icon', async (event, data) => {
        const name = normalizeUserName(data?.name);
        const icon = typeof data?.icon === 'string' ? data.icon.trim() : '';
        if (!icon) throw new Error('Icono de usuario requerido');
        ensureUserFolders(name);
        const profile = setUserIcon(name, icon);
        return { success: true, profile };
    });

    safeHandle('has-user-pin', async (event, data) => {
        const name = normalizeUserName(data?.name);
        return { hasPin: hasUserPin(name) };
    });

    safeHandle('verify-user-pin', async (event, data) => {
        const name = normalizeUserName(data?.name);
        const pin = String(data?.pin ?? '');
        return { success: verifyUserPin(name, pin) };
    });

    safeHandle('set-user-pin', async (event, data) => {
        const name = normalizeUserName(data?.name);
        const pin = String(data?.pin ?? '');
        setUserPin(name, pin);
        return { success: true };
    });

    safeHandle('remove-user-pin', async (event, data) => {
        const name = normalizeUserName(data?.name);
        removeUserPin(name);
        return { success: true };
    });

    // ============= CATEGORIAS =============
    
    safeHandle('add-categoria', async (event, data) => {
        const { nombre, tipo } = data;
        
        if (!nombre || !tipo) {
            throw new Error('Nombre y tipo son requeridos');
        }
        
        if (!['gasto', 'ingreso', 'impuestos'].includes(tipo)) {
            throw new Error('Tipo de categoría inválido');
        }
        
        try {
            await dbRun(db, "INSERT INTO categorias (nombre, tipo) VALUES (?, ?)", [nombre.trim(), tipo]);
            return { success: true, message: 'Categoría agregada' };
        } catch (err) {
            if (err.message.includes('UNIQUE')) {
                throw new Error('La categoría ya existe para este tipo');
            }
            throw err;
        }
    });

    safeHandle('get-categorias', async () => {
        const gastos = await dbAll(db, "SELECT * FROM categorias WHERE tipo='gasto' ORDER BY nombre");
        const ingresos = await dbAll(db, "SELECT * FROM categorias WHERE tipo='ingreso' ORDER BY nombre");
        const impuestos = await dbAll(db, "SELECT * FROM categorias WHERE tipo='impuestos' ORDER BY nombre");
        return { 
            gastos: gastos || [], 
            ingresos: ingresos || [], 
            impuestos: impuestos || [] 
        };
    });

    safeHandle('update-categoria', async (event, data) => {
        const { id, nombre } = data;
        if (!id || !nombre) {
            throw new Error('ID y nombre son requeridos');
        }
        await dbRun(db, "UPDATE categorias SET nombre = ? WHERE id = ?", [nombre.trim(), id]);
        return { success: true, message: 'Categoría actualizada' };
    });

    safeHandle('delete-categoria', async (event, data) => {
        const { id } = data;
        if (!id) {
            throw new Error('ID es requerido');
        }
        await dbRun(db, "DELETE FROM categorias WHERE id = ?", [id]);
        return { success: true, message: 'Categoría eliminada' };
    });

    // ============= GASTOS =============
    
    safeHandle('add-gasto-puntual', async (event, data) => {
        await gastosPuntualesService.add(data);
        return { success: true };
    });

    safeHandle('delete-gasto-puntual', async (event, data) => {
        await gastosPuntualesService.delete(data.id);
        return { success: true };
    });

    safeHandle('update-gasto-puntual', async (event, data) => {
        await gastosPuntualesService.update(data);
        return { success: true };
    });

    safeHandle('add-gasto-mensual', async (event, data) => {
        await gastosMensualesService.add(data);
        return { success: true };
    });

    safeHandle('delete-gasto-mensual', async (event, data) => {
        await gastosMensualesService.delete(data.id);
        return { success: true };
    });

    safeHandle('update-gasto-mensual', async (event, data) => {
        await gastosMensualesService.update(data);
        return { success: true };
    });

    // ============= INGRESOS =============
    
    safeHandle('add-ingreso-puntual', async (event, data) => {
        await ingresosPuntualesService.add(data);
        return { success: true };
    });

    safeHandle('delete-ingreso-puntual', async (event, data) => {
        await ingresosPuntualesService.delete(data.id);
        return { success: true };
    });

    safeHandle('update-ingreso-puntual', async (event, data) => {
        await ingresosPuntualesService.update(data);
        return { success: true };
    });

    safeHandle('add-ingreso-mensual', async (event, data) => {
        await ingresosMensualesService.add(data);
        return { success: true };
    });

    safeHandle('delete-ingreso-mensual', async (event, data) => {
        await ingresosMensualesService.delete(data.id);
        return { success: true };
    });

    safeHandle('update-ingreso-mensual', async (event, data) => {
        await ingresosMensualesService.update(data);
        return { success: true };
    });

    // ============= GASTOS REALES =============

    safeHandle('add-gasto-real', async (event, data) => {
        await gastosRealesService.add(data);
        return { success: true };
    });

    safeHandle('delete-gasto-real', async (event, data) => {
        await gastosRealesService.delete(data.id);
        return { success: true };
    });

    safeHandle('update-gasto-real', async (event, data) => {
        await gastosRealesService.update(data);
        return { success: true };
    });

    // ============= INGRESOS REALES =============

    safeHandle('add-ingreso-real', async (event, data) => {
        await ingresosRealesService.add(data);
        return { success: true };
    });

    safeHandle('delete-ingreso-real', async (event, data) => {
        await ingresosRealesService.delete(data.id);
        return { success: true };
    });

    safeHandle('update-ingreso-real', async (event, data) => {
        await ingresosRealesService.update(data);
        return { success: true };
    });

    // ============= IMPORT BANCO =============
    
    safeHandle('import-gastos-puntuales', async (event, data) => {
        return importBatchWithTransaction(gastosPuntualesService, data?.datos);
    });

    safeHandle('import-ingresos-puntuales', async (event, data) => {
        return importBatchWithTransaction(ingresosPuntualesService, data?.datos);
    });

    // ============= IMPORT REAL (BANCO) =============

    safeHandle('import-gastos-reales', async (event, data) => {
        return importBatchWithTransaction(gastosRealesService, data?.datos);
    });

    safeHandle('import-ingresos-reales', async (event, data) => {
        return importBatchWithTransaction(ingresosRealesService, data?.datos);
    });

    // ============= IMPUESTOS =============
    
    safeHandle('add-impuesto-puntual', async (event, data) => {
        await impuestosPuntualesService.add(data);
        return { success: true };
    });

    safeHandle('delete-impuesto-puntual', async (event, data) => {
        await impuestosPuntualesService.delete(data.id);
        return { success: true };
    });

    safeHandle('update-impuesto-puntual', async (event, data) => {
        await impuestosPuntualesService.update(data);
        return { success: true };
    });

    safeHandle('add-impuesto-mensual', async (event, data) => {
        await impuestosMensualesService.add(data);
        return { success: true };
    });

    safeHandle('delete-impuesto-mensual', async (event, data) => {
        await impuestosMensualesService.delete(data.id);
        return { success: true };
    });

    safeHandle('update-impuesto-mensual', async (event, data) => {
        await impuestosMensualesService.update(data);
        return { success: true };
    });

    // ============= HUCHA =============
    
    safeHandle('get-hucha', async () => {
        return await huchaService.getAll();
    });

    safeHandle('add-hucha', async (event, data) => {
        await huchaService.add(data);
        return { success: true };
    });

    safeHandle('update-hucha', async (event, data) => {
        await huchaService.update(data);
        return { success: true };
    });

    safeHandle('delete-hucha', async (event, data) => {
        await huchaService.delete(data.id);
        return { success: true };
    });

    // ============= SUB-HUCHAS =============

    safeHandle('get-sub-huchas', async () => {
        return await subHuchaService.getAll();
    });

    safeHandle('add-sub-hucha', async (event, data) => {
        await subHuchaService.add(data);
        return { success: true };
    });

    safeHandle('update-sub-hucha', async (event, data) => {
        await subHuchaService.update(data);
        return { success: true };
    });

    safeHandle('delete-sub-hucha', async (event, data) => {
        await subHuchaService.delete(data.id);
        return { success: true };
    });

    safeHandle('get-sub-hucha-puntuales', async (event, id) => {
        return await subHuchaService.getPuntuales(id);
    });

    safeHandle('add-sub-hucha-puntual', async (event, data) => {
        await subHuchaService.addPuntual(data);
        return { success: true };
    });

    safeHandle('delete-sub-hucha-puntual', async (event, data) => {
        await subHuchaService.deletePuntual(data.id);
        return { success: true };
    });

    safeHandle('get-sub-huchas-total', async (event, mes) => {
        const total = await subHuchaService.calcularTotalSubHuchas(mes);
        return { total };
    });

    // ============= CUENTA REMUNERADA =============
    
    safeHandle('get-cuenta-remunerada', async () => {
        const rows = await dbAll(db, "SELECT * FROM cuenta_remunerada ORDER BY created_at DESC");
        return rows || [];
    });

    safeHandle('add-cuenta-remunerada', async (event, data) => {
        const { descripcion, monto, aportacion_mensual, interes, retencion, categoria_id, desde, hasta, linked_to_bolsa } = data;
        if (monto === undefined || categoria_id === undefined || !desde) {
            throw new Error('Monto, categoría y desde son requeridos');
        }

        const descripcionFinal = (descripcion || '').trim() || generarDescripcionRandom();
        const interesGenerado = calcularInteresGenerado(monto, aportacion_mensual || 0, interes || 0, desde, hasta);
        const linkedVal = linked_to_bolsa ? 1 : 0;
        if (linkedVal === 1) {
            await dbRun(db, `UPDATE cuenta_remunerada SET linked_to_bolsa = 0`);
        }

        await dbRun(db, `
            INSERT INTO cuenta_remunerada (descripcion, monto, aportacion_mensual, interes, retencion, interes_generado, categoria_id, desde, hasta, linked_to_bolsa)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [descripcionFinal, monto, aportacion_mensual || null, interes || null, retencion || 0, interesGenerado, categoria_id, desde, hasta || null, linkedVal]);
        return { success: true };
    });

    safeHandle('update-cuenta-remunerada', async (event, data) => {
        const { id, desde, hasta, monto, aportacion_mensual, interes, retencion, categoria_id, categoria, descripcion, linked_to_bolsa } = data;
        if (!id) {
            throw new Error('ID es requerido');
        }

        let catId = categoria_id;
        if (!catId && categoria) {
            const cat = await dbGet(db, "SELECT id FROM categorias WHERE nombre = ? AND tipo = 'ingreso'", [categoria]);
            if (!cat) {
                throw new Error('Categoría no encontrada');
            }
            catId = cat.id;
        }

        if (!catId) {
            throw new Error('Categoría es requerida');
        }

        let descripcionFinal = (descripcion || '').trim();
        if (!descripcionFinal) {
            const existing = await dbGet(db, "SELECT descripcion FROM cuenta_remunerada WHERE id = ?", [id]);
            descripcionFinal = existing?.descripcion || generarDescripcionRandom();
        }
        const interesGenerado = calcularInteresGenerado(monto, aportacion_mensual, interes, desde, hasta);

        // Si se activa linked_to_bolsa, desactivar en las demás cuentas
        const linkedVal = linked_to_bolsa !== undefined ? (linked_to_bolsa ? 1 : 0) : undefined;
        if (linkedVal === 1) {
            await dbRun(db, `UPDATE cuenta_remunerada SET linked_to_bolsa = 0 WHERE id != ?`, [id]);
        }

        const linkedSet = linkedVal !== undefined ? ', linked_to_bolsa=?' : '';
        const linkedParam = linkedVal !== undefined ? [linkedVal] : [];

        await dbRun(db, `
            UPDATE cuenta_remunerada 
            SET descripcion = ?, desde = ?, hasta = ?, monto = ?, aportacion_mensual = ?, interes = ?, retencion = ?, interes_generado = ?, categoria_id = ?${linkedSet}
            WHERE id = ?
        `, [descripcionFinal, desde, hasta, monto, aportacion_mensual || null, interes || null, retencion !== undefined ? (parseFloat(retencion) || 0) : 0, interesGenerado, catId, ...linkedParam, id]);

        return { success: true };
    });

    safeHandle('delete-cuenta-remunerada', async (event, data) => {
        const { id } = data;
        if (!id) {
            throw new Error('ID es requerido');
        }
        await dbRun(db, "DELETE FROM cuenta_remunerada WHERE id = ?", [id]);
        return { success: true };
    });

    safeHandle('cuenta-remunerada-set-link', async (event, data) => {
        const { id, linked } = data;
        if (!id) throw new Error('ID requerido');
        await dbRun(db, 'BEGIN');
        await dbRun(db, 'UPDATE cuenta_remunerada SET linked_to_bolsa = 0');
        if (linked) {
            await dbRun(db, 'UPDATE cuenta_remunerada SET linked_to_bolsa = 1 WHERE id = ?', [id]);
        }
        await dbRun(db, 'COMMIT');
        return { success: true };
    });

    safeHandle('cr-get-saldo-hoy', async () => {
        return new CuentaRemuneradaService().getSaldoHoy();
    });

    // ── CR aportaciones variables ────────────────────────────────────────────
    safeHandle('cr-get-aportaciones', async (event, data) => {
        return await dbAll(db, `SELECT * FROM cuenta_remunerada_aportaciones WHERE cuenta_id = ? ORDER BY desde ASC`, [data.id]);
    });
    safeHandle('cr-add-aportacion', async (event, data) => {
        const { id, desde, cantidad } = data;
        await dbRun(db, `INSERT INTO cuenta_remunerada_aportaciones (cuenta_id, desde, cantidad) VALUES (?, ?, ?)`, [id, desde, cantidad]);
        return { success: true };
    });
    safeHandle('cr-delete-aportacion', async (event, data) => {
        await dbRun(db, `DELETE FROM cuenta_remunerada_aportaciones WHERE id = ?`, [data.id]);
        return { success: true };
    });

    // ── CR ajustes manuales de saldo ─────────────────────────────────────────
    safeHandle('cr-get-ajustes', async (event, data) => {
        return await dbAll(db, `SELECT * FROM cuenta_remunerada_ajustes WHERE cuenta_id = ? ORDER BY fecha ASC`, [data.id]);
    });
    safeHandle('cr-add-ajuste', async (event, data) => {
        const { id, fecha, saldo, descripcion } = data;
        await dbRun(db, `INSERT INTO cuenta_remunerada_ajustes (cuenta_id, fecha, saldo, descripcion) VALUES (?, ?, ?, ?)`, [id, fecha, saldo, descripcion || null]);
        return { success: true };
    });
    safeHandle('cr-delete-ajuste', async (event, data) => {
        await dbRun(db, `DELETE FROM cuenta_remunerada_ajustes WHERE id = ?`, [data.id]);
        return { success: true };
    });

    // ── CR tipos de interés ──────────────────────────────────────────────────
    safeHandle('cr-get-tipos-interes', async (event, data) => {
        return await dbAll(db, `SELECT * FROM historial_tipos_interes WHERE cuenta_remunerada_id = ? ORDER BY desde ASC`, [data.id]) || [];
    });
    safeHandle('cr-add-tipo-interes', async (event, data) => {
        const { id, desde, interes } = data;
        await dbRun(db, `INSERT INTO historial_tipos_interes (cuenta_remunerada_id, desde, interes) VALUES (?, ?, ?)`, [id, desde, interes]);
        return { success: true };
    });
    safeHandle('cr-delete-tipo-interes', async (event, data) => {
        await dbRun(db, `DELETE FROM historial_tipos_interes WHERE id = ?`, [data.id]);
        return { success: true };
    });
    safeHandle('cr-informe-fiscal', async () => {
        const service = new CuentaRemuneradaService();
        return await service.getInformeFiscal();
    });

    // ============= ASSETS (Yahoo Finance) =============
    
    safeHandle('get-assets', async () => {
        const rows = await dbAll(db, `
            SELECT a.*, c.nombre as categoria
            FROM assets a
            JOIN categorias c ON a.categoria_id = c.id
            ORDER BY a.created_at DESC
        `);
        return rows || [];
    });

    safeHandle('add-asset', async (event, data) => {
        const { company, ticker, shares, purchase_price } = data;
        if (!company || !ticker || !shares || !purchase_price) {
            throw new Error('Todos los campos son requeridos');
        }
        
        // Obtener o crear categoría Assets
        let cat = await dbGet(db, 'SELECT id FROM categorias WHERE nombre=? AND tipo="ingreso"', ['Assets']);
        if (!cat || !cat.id) {
            await dbRun(db, 'INSERT INTO categorias (nombre, tipo) VALUES (?, ?)', ['Assets', 'ingreso']);
            cat = await dbGet(db, 'SELECT id FROM categorias WHERE nombre=? AND tipo="ingreso"', ['Assets']);
        }
        
        await dbRun(db, 
            "INSERT INTO assets (company, ticker, shares, purchase_price, categoria_id) VALUES (?, ?, ?, ?, ?)",
            [company, ticker, parseFloat(shares), parseFloat(purchase_price), cat.id]
        );
        return { success: true };
    });

    safeHandle('update-asset', async (event, data) => {
        const { id, company, ticker, shares, purchase_price } = data;
        if (!id) {
            throw new Error('ID es requerido');
        }
        
        // Obtener o crear categoría Assets
        let cat = await dbGet(db, 'SELECT id FROM categorias WHERE nombre=? AND tipo="ingreso"', ['Assets']);
        if (!cat || !cat.id) {
            await dbRun(db, 'INSERT INTO categorias (nombre, tipo) VALUES (?, ?)', ['Assets', 'ingreso']);
            cat = await dbGet(db, 'SELECT id FROM categorias WHERE nombre=? AND tipo="ingreso"', ['Assets']);
        }
        
        await dbRun(db,
            "UPDATE assets SET company=?, ticker=?, shares=?, purchase_price=?, categoria_id=? WHERE id=?",
            [company, ticker, parseFloat(shares), parseFloat(purchase_price), cat.id, id]
        );
        return { success: true };
    });

    safeHandle('delete-asset', async (event, data) => {
        const { id } = data;
        if (!id) {
            throw new Error('ID es requerido');
        }
        await dbRun(db, "DELETE FROM assets WHERE id = ?", [id]);
        return { success: true };
    });

    safeHandle('sell-asset', async (event, data) => {
        const { id, sale_price } = data;
        if (!id || !sale_price) {
            throw new Error('ID y precio de venta son requeridos');
        }

        const asset = await dbGet(db, "SELECT * FROM assets WHERE id = ?", [id]);
        if (!asset) {
            throw new Error('Asset no encontrado');
        }

        const totalInvested = asset.shares * asset.purchase_price;
        const totalSale = asset.shares * sale_price;
        const profit = totalSale - totalInvested;

        // Eliminar el asset
        await dbRun(db, "DELETE FROM assets WHERE id = ?", [id]);

        // Registrar la ganancia o pérdida como ingreso/gasto puntual
        const categoria_id = asset.categoria_id;
        const fecha = new Date().toISOString().slice(0, 10);
        
        if (profit >= 0) {
            // Registrar como ingreso
            await dbRun(db,
                "INSERT INTO ingresos_puntuales (fecha, descripcion, monto, categoria_id) VALUES (?, ?, ?, ?)",
                [fecha, `Venta ${asset.ticker}: Ganancia`, profit, categoria_id]
            );
        } else {
            // Registrar como gasto
            await dbRun(db,
                "INSERT INTO gastos_puntuales (fecha, descripcion, monto, categoria_id) VALUES (?, ?, ?, ?)",
                [fecha, `Venta ${asset.ticker}: Pérdida`, Math.abs(profit), categoria_id]
            );
        }

        return { success: true, profit };
    });

    safeHandle('get-asset-price', async (event, ticker) => {
        const safeTicker = String(ticker || '').trim().toUpperCase();
        if (!safeTicker) {
            return { ticker: safeTicker, currentPrice: null, currency: 'EUR', unavailable: true };
        }

        try {
            return await yahooFinanceService.getAssetPrice(safeTicker);
        } catch (err) {
            logger.warn(`get-asset-price no data for ${safeTicker}: ${err.message}`);
            return { ticker: safeTicker, currentPrice: null, currency: 'EUR', unavailable: true };
        }
    });

    safeHandle('get-asset-history', async (event, ticker, period) => {
        const safeTicker = String(ticker || '').trim().toUpperCase();
        const safePeriod = String(period || '1y').trim() || '1y';
        try {
            return await yahooFinanceService.getHistoricalData(safeTicker, safePeriod);
        } catch (err) {
            logger.warn(`get-asset-history no data for ${safeTicker} (${safePeriod}): ${err.message}`);
            return {
                ticker: safeTicker,
                period: safePeriod,
                currency: 'EUR',
                data: [],
                unavailable: true,
                mensaje: err.message || 'No se pudieron obtener datos historicos'
            };
        }
    });

    // ============= DASHBOARD =============
    
    safeHandle('get-dashboard-data', async () => {
        return await getDashboardData();
    });

    safeHandle('get-dashboard-real-data', async () => {
        return await getDashboardRealData();
    });

    safeHandle('get-dashboard-rango-fechas', async () => {
        return await getDashboardRangoFechas();
    });

    safeHandle('get-impuestos-mes', async (event, params) => {
        return await getImpuestosMes(params.desde, params.hasta);
    });

    safeHandle('get-impuestos-mes-real', async (event, params) => {
        return await getImpuestosMesReal(params.desde, params.hasta);
    });

    safeHandle('get-ahorros-mes', async (event, params) => {
        return await getAhorrosMes(params.desde, params.hasta, params.categoria_id);
    });

    safeHandle('get-ahorros-mes-real', async (event, params) => {
        return await getAhorrosMesReal(params.desde, params.hasta, params.categoria_id);
    });

    safeHandle('get-categorias-periodo', async (event, params) => {
        return await getCategoriasPeriodo(params.desde, params.hasta);
    });

    safeHandle('get-categorias-periodo-real', async (event, params) => {
        return await getCategoriasPeriodoReal(params.desde, params.hasta);
    });

    safeHandle('get-gastos-categoria-mes', async (event, params) => {
        return await getGastosCategoriaMes(params.desde, params.hasta);
    });

    safeHandle('get-gastos-categoria-mes-real', async (event, params) => {
        return await getGastosCategoriaMesReal(params.desde, params.hasta);
    });

    safeHandle('get-resumen-periodos', async () => {
        return await getResumenPeriodos();
    });

    // ============= IMPORTACION BANCARIA =============
    
    safeHandle('import-list', async () => {
        try {
            const uploadsDir = getUploadsDir();
            
            if (!fs.existsSync(uploadsDir)) {
                fs.mkdirSync(uploadsDir, { recursive: true });
            }

            const archivos = fs.readdirSync(uploadsDir);
            
            const lista = archivos.map(archivo => {
                const rutaCompleta = path.join(uploadsDir, archivo);
                const stats = fs.statSync(rutaCompleta);
                
                // Intentar extraer timestamp del nombre (formato: timestamp_nombre.ext)
                const parts = archivo.split('_');
                const timestamp = parseInt(parts[0]);
                
                let nombre, fechaGuardado;
                
                // Si el primer segmento es un timestamp válido (número de 13 dígitos)
                if (!isNaN(timestamp) && timestamp.toString().length === 13) {
                    nombre = archivo.substring(timestamp.toString().length + 1); // Sin timestamp
                    fechaGuardado = new Date(timestamp).toISOString();
                } else {
                    // Archivo sin timestamp, usar nombre completo y fecha de modificación
                    nombre = archivo;
                    fechaGuardado = stats.mtime.toISOString();
                }
                
                return {
                    id: archivo,
                    nombre,
                    archivo: archivo,
                    fechaGuardado,
                    tamaño: stats.size,
                    tipo: path.extname(archivo).toLowerCase()
                };
            }).sort((a, b) => new Date(b.fechaGuardado) - new Date(a.fechaGuardado));
            
            logger.debug(`import-list: ${lista.length} files`);
            return { success: true, archivos: lista };
        } catch (error) {
            logger.error('import-list failed:', error.message ?? error);
            throw error;
        }
    });

    safeHandle('import-content', async (event, id) => {
        logger.debug('import-content called, id:', id);
        
        // Asegurar que id es un string
        const idStr = String(id);
        const rutaArchivo = path.join(getUploadsDir(), idStr);
        
        if (!fs.existsSync(rutaArchivo)) {
            throw new Error('Archivo no encontrado: ' + idStr);
        }
        
        const contenido = fs.readFileSync(rutaArchivo, 'base64');
        
        // Extraer nombre sin timestamp si existe
        let nombreSinTimestamp = idStr;
        const parts = idStr.split('_');
        const timestamp = parseInt(parts[0]);
        
        // Si tiene timestamp válido, quitarlo del nombre
        if (!isNaN(timestamp) && timestamp.toString().length === 13) {
            nombreSinTimestamp = idStr.substring(timestamp.toString().length + 1);
        }
        
        logger.debug('import-content served:', idStr);
        return { success: true, nombre: nombreSinTimestamp, contenido };
    });

    safeHandle('import-delete', async (event, id) => {
        logger.debug('import-delete called, id:', id);
        
        // Asegurar que id es un string
        const idStr = String(id);
        const rutaArchivo = path.join(getUploadsDir(), idStr);
        
        if (!fs.existsSync(rutaArchivo)) {
            throw new Error('Archivo no encontrado: ' + idStr);
        }
        
        fs.unlinkSync(rutaArchivo);
        logger.debug('import-delete done:', idStr);
        return { success: true };
    });

    safeHandle('import-save', async (event, data) => {
        const { filename, contenido } = data;
        if (!filename || !contenido) {
            throw new Error('Filename y contenido son requeridos');
        }

        const uploadsDir = getUploadsDir();
        
        // Asegurar que el directorio existe
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }
        
        // Generar nombre único para el archivo
        const timestamp = Date.now();
        const sanitizedName = filename.replace(/\s+/g, '_');
        const uniqueFilename = `${timestamp}_${sanitizedName}`;
        const filePath = path.join(uploadsDir, uniqueFilename);
        
        // Guardar archivo físico
        const buffer = Buffer.from(contenido, 'base64');
        fs.writeFileSync(filePath, buffer);
        logger.debug(`import-save stored: ${uniqueFilename}`);
        
        return { success: true, message: 'Archivo guardado correctamente', filename: uniqueFilename };
    });

    // ============= BOLSA / INVERSIONES =============

    const BolsaService = require('../services/BolsaService');
    const bolsaService = new BolsaService();

    // Ensure bolsa tables exist (runs pending migrations)
    safeHandle('bolsa-ensure-setup', async () => {
        await runMigrations();
        return { success: true };
    });

    safeHandle('bolsa-get-operaciones', async () => {
        return await bolsaService.getOperaciones();
    });

    safeHandle('bolsa-add-operacion', async (event, data) => {
        await bolsaService.addOperacion(data);
        // background: fetch ticker history if missing/stale
        const ticker = String(data?.ticker || '').trim().toUpperCase();
        if (ticker) {
            bolsaService.getTickerLastDate(ticker).then(lastDate => {
                const today = new Date().toISOString().slice(0, 10);
                if (lastDate && lastDate >= today) return;
                const period = lastDate ? '3mo' : '2y';
                yahooFinanceService.getHistoricalData(ticker, period)
                    .then(r => { if (r?.data?.length) bolsaService.cacheTickerHistory(ticker, r.data); })
                    .catch(() => {});
            }).catch(() => {});
        }
        return { success: true };
    });

    safeHandle('bolsa-update-operacion', async (event, data) => {
        await bolsaService.updateOperacion(data);
        return { success: true };
    });

    safeHandle('bolsa-delete-operacion', async (event, id) => {
        await bolsaService.deleteOperacion(id);
        return { success: true };
    });

    safeHandle('bolsa-get-dividendos', async () => {
        return await bolsaService.getDividendos();
    });

    safeHandle('bolsa-get-posiciones', async () => {
        return await bolsaService.getPosiciones();
    });

    safeHandle('bolsa-get-resumen', async () => {
        return await bolsaService.getResumen();
    });

    safeHandle('bolsa-get-estadisticas', async () => {
        return await bolsaService.getEstadisticasOperaciones();
    });

    safeHandle('bolsa-get-ticker-history', async (event, ticker) => {
        const norm = String(ticker || '').trim().toUpperCase();
        if (!norm) throw new Error('Ticker requerido');

        const lastDate = await bolsaService.getTickerLastDate(norm);
        const today = new Date().toISOString().slice(0, 10);
        if (!lastDate || lastDate < today) {
            try {
                const period = lastDate ? '3mo' : '2y';
                const result = await yahooFinanceService.getHistoricalData(norm, period);
                if (result?.data?.length) await bolsaService.cacheTickerHistory(norm, result.data);
            } catch (_) {}
        }
        const history = await bolsaService.getTickerHistoryFromDb(norm);
        return { ticker: norm, data: history };
    });

    safeHandle('bolsa-get-cr-saldo-diario', async () => {
        return await bolsaService.getSaldoDiarioCR();
    });

    safeHandle('bolsa-sync-dividendos', async () => {
        const result = await bolsaService.syncDividendosAuto(yahooFinanceService);
        return { success: true, stats: result.stats, totalAdded: result.totalAdded, totalUpdated: result.totalUpdated };
    });

    safeHandle('bolsa-get-desglose-sector', async () => {
        return await bolsaService.getDesgloseSector();
    });

    safeHandle('bolsa-get-estadisticas-fiscales', async () => {
        return await bolsaService.getEstadisticasFiscales();
    });

    safeHandle('asset-get-metadata', async (event, ticker) => {
        return await yahooFinanceService.getAssetMetadata(ticker);
    });

    // ============= DASHBOARD EXTENSIONES =============

    safeHandle('dashboard-get-net-worth', async () => {
        return await getNetWorth();
    });

    safeHandle('dashboard-get-presupuestos', async (event, params) => {
        return await getPresupuestosConGasto(params?.mes, params?.desde, params?.hasta);
    });

    safeHandle('dashboard-get-anomalias', async (event, meses) => {
        return await getAnomalias(meses || 6);
    });

    // ============= PRESUPUESTOS =============

    safeHandle('presupuestos-get-all', async () => {
        return await dbAll(db, `
            SELECT pc.id, pc.categoria_id, pc.limite_mensual, pc.created_at, c.nombre AS categoria
            FROM presupuestos_categoria pc JOIN categorias c ON pc.categoria_id = c.id ORDER BY c.nombre
        `);
    });

    safeHandle('presupuestos-save', async (event, data) => {
        const { categoria_id, limite_mensual } = data;
        await dbRun(db,
            `INSERT INTO presupuestos_categoria (categoria_id, limite_mensual) VALUES (?, ?)
             ON CONFLICT(categoria_id) DO UPDATE SET limite_mensual = excluded.limite_mensual`,
            [parseInt(categoria_id), parseFloat(limite_mensual)]
        );
        return { success: true };
    });

    safeHandle('presupuestos-delete', async (event, id) => {
        await dbRun(db, `DELETE FROM presupuestos_categoria WHERE id=?`, [id]);
        return { success: true };
    });

    // ============= BACKUP =============

    safeHandle('backup-download', async (event) => {
        const { dialog } = require('electron');
        const fsExtra = require('fs');
        const dbPath = db.__getDbPath();
        if (!dbPath || dbPath === ':memory:') throw new Error('Backup no disponible para DB en memoria');
        const today = new Date().toISOString().slice(0, 10);
        const defaultName = `finanzas_backup_${today}.db`;
        const win = BrowserWindow.fromWebContents(event.sender);
        const { canceled, filePath: destPath } = await dialog.showSaveDialog(win, {
            title: 'Guardar copia de seguridad',
            defaultPath: defaultName,
            filters: [{ name: 'SQLite Database', extensions: ['db'] }]
        });
        if (canceled || !destPath) return { success: false, canceled: true };
        fsExtra.copyFileSync(dbPath, destPath);
        return { success: true, path: destPath };
    });

    logger.info('IPC handlers registered');
}

module.exports = { registerIpcHandlers };
