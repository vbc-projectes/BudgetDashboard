/**
 * Dashboard Functions - Lógica de negocio para el dashboard
 * Extraído desde routes/dashboard.js para reutilización en IPC handlers
 */

const db = require('../config/database');
const config = require('../config/config');
const { dbAll, dbGet } = require('../utils/dbHelpers');
const PuntualService = require('../services/PuntualService');
const MensualService = require('../services/MensualService');
const { 
    calcularInteresGenerado, 
    calcularInteresesMensuales,
    restarFecha,
    contarMesesDesde28,
    generarArrayMeses,
    calcularMontoIpc,
    esMensualActivo,
    agregarPuntualesPorMes,
    agregarMensualesPorMes,
    agregarImpuestosPuntualesPorMes,
    agregarImpuestosMensualesPorMes
} = require('../utils/calculations');

// Cache para resumen de períodos
let resumenCache = null;
let resumenCacheTime = 0;
let resumenCacheKey = null;

// Servicios
const gastosPuntualesService = new PuntualService('gastos_puntuales');
const gastosMensualesService = new MensualService('gastos_mensuales');
const ingresosPuntualesService = new PuntualService('ingresos_puntuales');
const ingresosMensualesService = new MensualService('ingresos_mensuales');
const impuestosPuntualesService = new PuntualService('impuestos_puntuales');
const impuestosMensualesService = new MensualService('impuestos_mensuales');
const gastosRealesService = new PuntualService('gastos_reales');
const ingresosRealesService = new PuntualService('ingresos_reales');

/**
 * Obtener todos los datos para las tablas del dashboard
 */
async function getDashboardData() {
    const hoy = new Date();
    const [
        gastos_puntuales_raw,
        gastos_mensuales_raw,
        ingresos_puntuales,
        ingresos_mensuales,
        impuestos_puntuales,
        impuestos_mensuales,
        gastos_reales,
        ingresos_reales,
        cuenta_remunerada
    ] = await Promise.all([
        gastosPuntualesService.getAll(config.QUERY_LIMIT),
        gastosMensualesService.getAll(config.QUERY_LIMIT),
        ingresosPuntualesService.getAll(config.QUERY_LIMIT),
        ingresosMensualesService.getAll(config.QUERY_LIMIT),
        impuestosPuntualesService.getAll(config.QUERY_LIMIT),
        impuestosMensualesService.getAll(config.QUERY_LIMIT),
        gastosRealesService.getAll(config.QUERY_LIMIT),
        ingresosRealesService.getAll(config.QUERY_LIMIT),
        dbAll(db, `
        SELECT cr.id, cr.descripcion, cr.monto, cr.aportacion_mensual, cr.interes, cr.retencion, cr.desde, cr.hasta, cr.linked_to_bolsa, c.nombre AS categoria
        FROM cuenta_remunerada cr
        JOIN categorias c ON cr.categoria_id = c.id
        ORDER BY cr.desde DESC
        LIMIT ?
    `, [config.QUERY_LIMIT])
    ]);

    const hoyMes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    const cuenta_remunerada_con_interes = cuenta_remunerada.map(cr => ({
        ...cr,
        interes_generado: cr.interes ? (() => {
            const interesesMensuales = calcularInteresesMensuales(cr.monto, cr.aportacion_mensual || 0, cr.interes, cr.desde, cr.hasta || hoyMes);
            return Object.values(interesesMensuales).reduce((a, b) => a + (b || 0), 0);
        })() : 0
    }));

    const gastos_puntuales = gastos_puntuales_raw;

    const gastos_mensuales = gastos_mensuales_raw.map(g => ({
        ...g,
        ipc_porcentaje: g.ipc_porcentaje || 0,
        monto_ajustado: calcularMontoIpc(g.monto, g.ipc_porcentaje, g.desde, hoy)
    }));

    return {
        gastos_puntuales,
        gastos_mensuales,
        ingresos_puntuales,
        ingresos_mensuales,
        impuestos_puntuales,
        impuestos_mensuales,
        gastos_reales,
        ingresos_reales,
        cuenta_remunerada: cuenta_remunerada_con_interes
    };
}

/**
 * Obtener datos base para el dashboard real
 */
async function getDashboardRealData() {
    const [gastos_reales, ingresos_reales] = await Promise.all([
        gastosRealesService.getAll(config.QUERY_LIMIT),
        ingresosRealesService.getAll(config.QUERY_LIMIT)
    ]);

    return {
        gastos_reales,
        ingresos_reales,
        cuenta_remunerada: []
    };
}

/**
 * Obtener rango global de fechas para el dashboard
 */
async function getDashboardRangoFechas() {
    const formatDateLocal = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const row = await dbGet(db, `
        SELECT MIN(fecha) AS min, MAX(fecha) AS max
        FROM (
            SELECT fecha FROM gastos_puntuales
            UNION ALL SELECT fecha FROM ingresos_puntuales
            UNION ALL SELECT fecha FROM impuestos_puntuales
            UNION ALL SELECT fecha FROM gastos_reales
            UNION ALL SELECT fecha FROM ingresos_reales
            UNION ALL SELECT desde AS fecha FROM gastos_mensuales
            UNION ALL SELECT hasta AS fecha FROM gastos_mensuales
            UNION ALL SELECT desde AS fecha FROM ingresos_mensuales
            UNION ALL SELECT hasta AS fecha FROM ingresos_mensuales
            UNION ALL SELECT desde AS fecha FROM impuestos_mensuales
            UNION ALL SELECT hasta AS fecha FROM impuestos_mensuales
            UNION ALL SELECT desde AS fecha FROM cuenta_remunerada
            UNION ALL SELECT hasta AS fecha FROM cuenta_remunerada
        )
        WHERE fecha IS NOT NULL
    `);

    if (!row || !row.min || !row.max) {
        const hoy = new Date();
        const haceUnAnio = new Date(hoy.getFullYear() - 1, hoy.getMonth(), hoy.getDate());
        return { min: formatDateLocal(haceUnAnio), max: formatDateLocal(hoy) };
    }

    return { min: row.min, max: row.max };
}

/**
 * Obtener impuestos agrupados por mes
 */
async function getImpuestosMes(desde, hasta) {
    if (!desde || !hasta) {
        throw new Error("Debes enviar desde y hasta en formato YYYY-MM-DD");
    }

    const hastaDate = new Date(hasta);
    const meses = generarArrayMeses(desde, hasta, { impuestos: 0 });

    const ingresosPBruto = await dbAll(db, `
        SELECT bruto, monto, fecha 
        FROM ingresos_puntuales 
        WHERE fecha BETWEEN ? AND ? AND bruto IS NOT NULL AND bruto != monto
    `, [desde, hasta]);
    
    agregarImpuestosPuntualesPorMes(ingresosPBruto, meses, 'impuestos');

    const ingresosMBruto = await dbAll(db, `
        SELECT bruto, monto, desde, hasta 
        FROM ingresos_mensuales 
        WHERE bruto IS NOT NULL AND bruto != monto
    `);
    
    agregarImpuestosMensualesPorMes(ingresosMBruto, meses, hastaDate, 'impuestos');

    // Retención sobre intereses de cuentas remuneradas
    const cuentasRemuneradasImp = await dbAll(db, `
        SELECT monto, aportacion_mensual, interes, retencion, desde, hasta 
        FROM cuenta_remunerada 
        WHERE retencion IS NOT NULL AND retencion > 0
    `);
    const hastaDateImp = new Date(hasta);
    const hastaSliceImp = hasta.slice(0, 7);
    cuentasRemuneradasImp.forEach(cr => {
        const interesesMensuales = calcularInteresesMensuales(cr.monto, cr.aportacion_mensual || 0, cr.interes || 0, cr.desde, cr.hasta || hastaSliceImp);
        meses.forEach(m => {
            if (esMensualActivo(m.mes, hastaDateImp, cr.desde, cr.hasta)) {
                m.impuestos = (m.impuestos || 0) + (interesesMensuales[m.mes] || 0) * (cr.retencion / 100);
            }
        });
    });

    return meses;
}

/**
 * Obtener impuestos reales por mes (no aplica, retorna ceros)
 */
async function getImpuestosMesReal(desde, hasta) {
    if (!desde || !hasta) {
        throw new Error("Debes enviar desde y hasta en formato YYYY-MM-DD");
    }

    return generarArrayMeses(desde, hasta, { impuestos: 0 });
}

/**
 * Obtener ahorros mensuales
 */
async function getAhorrosMes(desde, hasta, categoria_id = null) {
    if (!desde || !hasta) {
        throw new Error("Debes enviar desde y hasta en formato YYYY-MM-DD");
    }

    const hastaDate = new Date(hasta);
    const meses = generarArrayMeses(desde, hasta, { 
        ingresos: 0, 
        cuentas_remuneradas: 0, 
        gastos: 0, 
        impuestos_ingresos: 0, 
        impuestos_otros: 0, 
        retencion_cr: 0,
        ahorros: 0 
    });

    // Ingresos
    const ingresosP = await ingresosPuntualesService.getByMonth(desde, hasta, categoria_id);
    agregarPuntualesPorMes(ingresosP, meses, 'ingresos');

    const ingresosM = await ingresosMensualesService.getAllForCalculations(categoria_id);
    agregarMensualesPorMes(ingresosM, meses, hastaDate, 'ingresos');

    // Cuenta remunerada
    const cuentasRemuneradas = await dbAll(db, "SELECT monto, aportacion_mensual, interes, retencion, desde, hasta FROM cuenta_remunerada");
    const hastaSliceCR = hasta.slice(0, 7);
    cuentasRemuneradas.forEach(cr => {
        const interesesMensuales = calcularInteresesMensuales(cr.monto, cr.aportacion_mensual || 0, cr.interes || 0, cr.desde, cr.hasta || hastaSliceCR);
        meses.forEach(m => {
            if (esMensualActivo(m.mes, hastaDate, cr.desde, cr.hasta)) {
                const interMes = interesesMensuales[m.mes] || 0;
                m.cuentas_remuneradas += interMes;
                // Retención sobre intereses de cuenta remunerada -> impuestos sobre ingresos
                if (cr.retencion && cr.retencion > 0) {
                    const ret = interMes * (cr.retencion / 100);
                    m.impuestos_ingresos += ret;
                    m.retencion_cr += ret;
                }
            }
        });
    });

    // Gastos puntuales (sin IPC)
    const gastosP = await gastosPuntualesService.getByMonth(desde, hasta, categoria_id);
    agregarPuntualesPorMes(gastosP, meses, 'gastos');

    let gastosMQuery = `SELECT monto, desde, hasta, ipc_porcentaje FROM gastos_mensuales`;
    const gastosMParams = [];
    if (categoria_id) {
        gastosMQuery += ' WHERE categoria_id = ?';
        gastosMParams.push(categoria_id);
    }
    const gastosM = await dbAll(db, gastosMQuery, gastosMParams);
    gastosM.forEach(g => {
        meses.forEach(m => {
            if (esMensualActivo(m.mes, hastaDate, g.desde, g.hasta)) {
                const targetDate = new Date(`${m.mes}-01`);
                m.gastos += calcularMontoIpc(g.monto, g.ipc_porcentaje, g.desde, targetDate);
            }
        });
    });

    // Impuestos desde ingresos (bruto - monto)
    const ingresosPBruto = await dbAll(db, `
        SELECT bruto, monto, fecha 
        FROM ingresos_puntuales 
        WHERE fecha BETWEEN ? AND ? AND bruto IS NOT NULL AND bruto != monto
    `, [desde, hasta]);
    agregarImpuestosPuntualesPorMes(ingresosPBruto, meses, 'impuestos_ingresos');

    const ingresosMBruto = await dbAll(db, `
        SELECT bruto, monto, desde, hasta 
        FROM ingresos_mensuales 
        WHERE bruto IS NOT NULL AND bruto != monto
    `);
    agregarImpuestosMensualesPorMes(ingresosMBruto, meses, hastaDate, 'impuestos_ingresos');

    // Impuestos otros (tabla impuestos)
    const impuestosP = await dbAll(db, `
        SELECT monto, fecha
        FROM impuestos_puntuales
        WHERE fecha BETWEEN ? AND ?
    `, [desde, hasta]);
    agregarPuntualesPorMes(impuestosP, meses, 'impuestos_otros');

    const impuestosM = await dbAll(db, `
        SELECT monto, desde, hasta
        FROM impuestos_mensuales
    `);
    agregarMensualesPorMes(impuestosM, meses, hastaDate, 'impuestos_otros');

    // Métricas contables consistentes por mes
    // total_ingreso: neto + renta + cuenta remunerada bruta
    // ingresos_netos: total_ingreso - impuesto_renta
    // ahorro: total_ingreso - total_gastos - impuesto_renta - impuesto_otros
    meses.forEach(m => {
        const totalIngreso = (m.ingresos || 0) + (m.impuestos_ingresos || 0) + (m.cuentas_remuneradas || 0);
        const impuestoRenta = (m.impuestos_ingresos || 0);
        const impuestoOtros = (m.impuestos_otros || 0);
        const totalGastos = (m.gastos || 0);
        const ingresosNetos = totalIngreso - impuestoRenta;
        const ahorro = totalIngreso - totalGastos - impuestoRenta - impuestoOtros;

        m.total_ingreso = totalIngreso;
        m.ingresos_netos = ingresosNetos;
        m.total_gastos = totalGastos;
        m.impuesto_renta = impuestoRenta;
        m.impuesto_otros = impuestoOtros;
        m.ahorros = ahorro;
    });

    return meses;
}

/**
 * Obtener ahorros mensuales usando ingresos/gastos reales
 */
async function getAhorrosMesReal(desde, hasta, categoria_id = null) {
    if (!desde || !hasta) {
        throw new Error("Debes enviar desde y hasta en formato YYYY-MM-DD");
    }

    const meses = generarArrayMeses(desde, hasta, {
        ingresos: 0,
        cuentas_remuneradas: 0,
        gastos: 0,
        impuestos_ingresos: 0,
        impuestos_otros: 0,
        ahorros: 0
    });

    const ingresosP = await ingresosRealesService.getByMonth(desde, hasta, categoria_id);
    agregarPuntualesPorMes(ingresosP, meses, 'ingresos');

    const gastosP = await gastosRealesService.getByMonth(desde, hasta, categoria_id);
    agregarPuntualesPorMes(gastosP, meses, 'gastos');

    meses.forEach(m => {
        const totalIngreso = (m.ingresos || 0) + (m.impuestos_ingresos || 0) + (m.cuentas_remuneradas || 0);
        const impuestoRenta = (m.impuestos_ingresos || 0);
        const impuestoOtros = (m.impuestos_otros || 0);
        const totalGastos = (m.gastos || 0);
        const ingresosNetos = totalIngreso - impuestoRenta;
        const ahorro = totalIngreso - totalGastos - impuestoRenta - impuestoOtros;

        m.total_ingreso = totalIngreso;
        m.ingresos_netos = ingresosNetos;
        m.total_gastos = totalGastos;
        m.impuesto_renta = impuestoRenta;
        m.impuesto_otros = impuestoOtros;
        m.ahorros = ahorro;
    });

    return meses;
}

/**
 * Obtener gastos e ingresos por categoría en un período
 */
async function getCategoriasPeriodo(desde, hasta) {
    if (!desde || !hasta) {
        throw new Error("Debes enviar desde y hasta en formato YYYY-MM-DD");
    }

    const desdeDate = new Date(desde);
    const hastaDate = new Date(hasta);

    // Gastos puntuales (sin IPC)
    const gastosP = await dbAll(db, `
        SELECT c.nombre AS categoria, gp.monto
        FROM gastos_puntuales gp
        JOIN categorias c ON gp.categoria_id = c.id
        WHERE gp.fecha BETWEEN ? AND ?
    `, [desde, hasta]);

    const gastosCombinados = {};
    gastosP.forEach(g => {
        gastosCombinados[g.categoria] = (gastosCombinados[g.categoria] || 0) + g.monto;
    });

    // Gastos mensuales con IPC
    const gastosM = await dbAll(db, `
        SELECT c.nombre AS categoria, gm.monto, gm.desde, gm.hasta, gm.ipc_porcentaje
        FROM gastos_mensuales gm
        JOIN categorias c ON gm.categoria_id = c.id
    `);

    // Generar array de meses una sola vez para toda la iteración
    const mesesGastos = generarArrayMeses(desde, hasta, { monto: 0 });
    gastosM.forEach(gm => {
        mesesGastos.forEach(m => {
            if (esMensualActivo(m.mes, hastaDate, gm.desde, gm.hasta)) {
                const targetDate = new Date(`${m.mes}-01`);
                const montoAdj = calcularMontoIpc(gm.monto, gm.ipc_porcentaje, gm.desde, targetDate);
                gastosCombinados[gm.categoria] = (gastosCombinados[gm.categoria] || 0) + montoAdj;
            }
        });
    });

    // Ingresos puntuales
    const ingresosP = await dbAll(db, `
        SELECT c.nombre AS categoria, SUM(ip.monto) AS total
        FROM ingresos_puntuales ip
        JOIN categorias c ON ip.categoria_id = c.id
        WHERE ip.fecha BETWEEN ? AND ?
        GROUP BY c.nombre
    `, [desde, hasta]);

    // Ingresos mensuales
    const ingresosM = await dbAll(db, `
        SELECT c.nombre AS categoria, im.monto, im.desde, im.hasta
        FROM ingresos_mensuales im
        JOIN categorias c ON im.categoria_id = c.id
    `);

    const ingresosMAgrupados = {};
    // Generar array de meses una sola vez para toda la iteración
    const mesesIngresos = generarArrayMeses(desde, hasta, { monto: 0 });
    ingresosM.forEach(im => {
        mesesIngresos.forEach(m => {
            if (esMensualActivo(m.mes, hastaDate, im.desde, im.hasta)) {
                if (!ingresosMAgrupados[im.categoria]) {
                    ingresosMAgrupados[im.categoria] = 0;
                }
                ingresosMAgrupados[im.categoria] += im.monto;
            }
        });
    });

    // Combinar ingresos
    const ingresosCombinados = {};
    ingresosP.forEach(i => {
        ingresosCombinados[i.categoria] = (ingresosCombinados[i.categoria] || 0) + i.total;
    });
    Object.entries(ingresosMAgrupados).forEach(([cat, total]) => {
        ingresosCombinados[cat] = (ingresosCombinados[cat] || 0) + total;
    });

    return {
        gastos: gastosCombinados,
        ingresos: ingresosCombinados
    };
}

/**
 * Obtener gastos e ingresos reales por categoria en un periodo
 */
async function getCategoriasPeriodoReal(desde, hasta) {
    if (!desde || !hasta) {
        throw new Error("Debes enviar desde y hasta en formato YYYY-MM-DD");
    }

    const gastos = await dbAll(db, `
        SELECT c.nombre AS categoria, SUM(gr.monto) AS total
        FROM gastos_reales gr
        JOIN categorias c ON gr.categoria_id = c.id
        WHERE gr.fecha BETWEEN ? AND ?
        GROUP BY c.nombre
    `, [desde, hasta]);

    const ingresos = await dbAll(db, `
        SELECT c.nombre AS categoria, SUM(ir.monto) AS total
        FROM ingresos_reales ir
        JOIN categorias c ON ir.categoria_id = c.id
        WHERE ir.fecha BETWEEN ? AND ?
        GROUP BY c.nombre
    `, [desde, hasta]);

    const gastosCat = {};
    const ingresosCat = {};
    gastos.forEach(g => gastosCat[g.categoria] = g.total);
    ingresos.forEach(i => ingresosCat[i.categoria] = i.total);

    return { gastos: gastosCat, ingresos: ingresosCat };
}

/**
 * Obtener gastos por categoría y mes
 */
async function getGastosCategoriaMes(desde, hasta) {
    if (!desde || !hasta) {
        throw new Error("Debes enviar desde y hasta en formato YYYY-MM-DD");
    }

    const hastaDate = new Date(hasta);

    const meses = generarArrayMeses(desde, hasta);
    const dataMesCat = {};
    meses.forEach(m => { dataMesCat[m.mes] = {}; });

    // Gastos puntuales
    const gastosP = await dbAll(db, `
        SELECT c.nombre AS categoria, gp.monto, gp.fecha
        FROM gastos_puntuales gp
        JOIN categorias c ON gp.categoria_id = c.id
        WHERE gp.fecha BETWEEN ? AND ?
    `, [desde, hasta]);

    gastosP.forEach(g => {
        const mes = g.fecha.slice(0, 7);
        if (dataMesCat[mes]) {
            dataMesCat[mes][g.categoria] = (dataMesCat[mes][g.categoria] || 0) + g.monto;
        }
    });

    // Gastos mensuales
    const gastosM = await dbAll(db, `
        SELECT c.nombre AS categoria, gm.monto, gm.desde, gm.hasta, gm.ipc_porcentaje
        FROM gastos_mensuales gm
        JOIN categorias c ON gm.categoria_id = c.id
    `);

    gastosM.forEach(g => {
        meses.forEach(m => {
            if (esMensualActivo(m.mes, hastaDate, g.desde, g.hasta)) {
                const targetDate = new Date(`${m.mes}-01`);
                const montoAdj = calcularMontoIpc(g.monto, g.ipc_porcentaje, g.desde, targetDate);
                dataMesCat[m.mes][g.categoria] = (dataMesCat[m.mes][g.categoria] || 0) + montoAdj;
            }
        });
    });

    // Impuestos puntuales como categoría "taxes"
    const impuestosP = await dbAll(db, `
        SELECT i.monto, i.fecha
        FROM impuestos_puntuales i
        WHERE i.fecha BETWEEN ? AND ?
    `, [desde, hasta]);

    impuestosP.forEach(i => {
        const mes = i.fecha.slice(0, 7);
        if (dataMesCat[mes]) {
            dataMesCat[mes]['taxes'] = (dataMesCat[mes]['taxes'] || 0) + i.monto;
        }
    });

    // Impuestos mensuales
    const impuestosM = await dbAll(db, `
        SELECT i.monto, i.desde, i.hasta
        FROM impuestos_mensuales i
    `);

    impuestosM.forEach(i => {
        meses.forEach(m => {
            if (esMensualActivo(m.mes, hastaDate, i.desde, i.hasta)) {
                dataMesCat[m.mes]['taxes'] = (dataMesCat[m.mes]['taxes'] || 0) + i.monto;
            }
        });
    });

    return dataMesCat;
}

/**
 * Obtener gastos reales por categoria y mes
 */
async function getGastosCategoriaMesReal(desde, hasta) {
    if (!desde || !hasta) {
        throw new Error("Debes enviar desde y hasta en formato YYYY-MM-DD");
    }

    const meses = generarArrayMeses(desde, hasta);
    const dataMesCat = {};
    meses.forEach(m => dataMesCat[m.mes] = {});

    const gastosP = await dbAll(db, `
        SELECT gr.monto, c.nombre AS categoria, gr.fecha
        FROM gastos_reales gr
        JOIN categorias c ON gr.categoria_id = c.id
        WHERE gr.fecha BETWEEN ? AND ?
    `, [desde, hasta]);

    gastosP.forEach(g => {
        const mes = g.fecha.slice(0, 7);
        if (dataMesCat[mes]) {
            dataMesCat[mes][g.categoria] = (dataMesCat[mes][g.categoria] || 0) + g.monto;
        }
    });

    return dataMesCat;
}

/**
 * Obtener resumen de múltiples períodos (con caché)
 */
async function getResumenPeriodos() {
    const ahora = Date.now();
    const CACHE_DURATION = 60000; // 1 minuto
    const cacheKey = typeof db.__getDbPath === 'function' ? db.__getDbPath() : 'default';
    
    if (resumenCache && resumenCacheKey === cacheKey && (ahora - resumenCacheTime) < CACHE_DURATION) {
        return resumenCache;
    }

    const hoy = new Date();
    const periodos = {
        '1mes': restarFecha(hoy, 1, 'months'),
        '3meses': restarFecha(hoy, 3, 'months'),
        '6meses': restarFecha(hoy, 6, 'months'),
        '1año': restarFecha(hoy, 1, 'years'),
        '5años': restarFecha(hoy, 5, 'years'),
        '10años': restarFecha(hoy, 10, 'years')
    };
    const resultado = {};

    const sumarMensualConIpc = (registro, desdeStr, hastaStr) => {
        const desdeDate = new Date(desdeStr);
        const hastaDate = new Date(hastaStr);
        const rDesde = new Date(registro.desde + "-28");
        const rHasta = registro.hasta ? new Date(registro.hasta + "-28") : new Date(9999, 11, 31);
        let current = new Date(Math.max(rDesde, desdeDate));
        current.setDate(28);
        const end = new Date(Math.min(rHasta, hastaDate));
        let total = 0;

        while (current <= end) {
            const targetDate = new Date(current.getFullYear(), current.getMonth(), 1);
            total += calcularMontoIpc(registro.monto, registro.ipc_porcentaje, registro.desde, targetDate);
            current.setMonth(current.getMonth() + 1);
        }

        return total;
    };

    const ingresosM = await dbAll(db, `SELECT monto, desde, hasta FROM ingresos_mensuales LIMIT 1000`);
    const cuentasRemuneradas = await dbAll(db, `SELECT monto, aportacion_mensual, interes, retencion, desde, hasta FROM cuenta_remunerada LIMIT 1000`);
    const gastosM = await dbAll(db, `SELECT monto, desde, hasta, ipc_porcentaje FROM gastos_mensuales LIMIT 1000`);
    const ingresosMBruto = await dbAll(db, `SELECT bruto, monto, desde, hasta FROM ingresos_mensuales WHERE bruto IS NOT NULL AND bruto != monto LIMIT 1000`);
    const impuestosMensuales = await dbAll(db, `SELECT monto, desde, hasta FROM impuestos_mensuales LIMIT 1000`);

    for(const [periodo, desde] of Object.entries(periodos)){
        const hasta = hoy;
        const desdeStr = desde.toISOString().slice(0,10);
        const hastaStr = hasta.toISOString().slice(0,10);

        const ingresosP = (await dbAll(db, `SELECT IFNULL(SUM(monto),0) as total FROM ingresos_puntuales WHERE fecha BETWEEN ? AND ? LIMIT 1000`, [desdeStr, hastaStr]))[0]?.total || 0;

        let totalIngresosMensuales = 0;
        ingresosM.forEach(i => totalIngresosMensuales += i.monto * contarMesesDesde28(desdeStr, hastaStr, i.desde, i.hasta));

        let totalCuentaRemunerada = 0;
        let totalRetencionCR = 0;
        cuentasRemuneradas.forEach(cr => {
            // Calcular intereses mensuales generados para la cuenta
            const interesesMensuales = calcularInteresesMensuales(cr.monto, cr.aportacion_mensual || 0, cr.interes || 0, cr.desde, cr.hasta || hastaStr.slice(0, 7));
            // Sumar solo los intereses de los meses dentro del periodo
            // Usar día 28 del mes (igual que esMensualActivo y contarMesesDesde28) para consistencia
            const desdePeriodo = new Date(desdeStr);
            const hastaPeriodo = new Date(hastaStr);
            Object.entries(interesesMensuales).forEach(([mes, interes]) => {
                const fechaMes28 = new Date(mes + '-28');
                if (fechaMes28 >= desdePeriodo && fechaMes28 <= hastaPeriodo) {
                    totalCuentaRemunerada += interes || 0;
                    if (cr.retencion && cr.retencion > 0) {
                        totalRetencionCR += (interes || 0) * (cr.retencion / 100);
                    }
                }
            });
        });


        const ingresosPBruto = await dbAll(db, `SELECT bruto, monto FROM ingresos_puntuales WHERE fecha BETWEEN ? AND ? AND bruto IS NOT NULL AND bruto != monto LIMIT 1000`, [desdeStr, hastaStr]);
        let totalImpuestosPuntuales = 0;
        ingresosPBruto.forEach(i => totalImpuestosPuntuales += i.bruto - i.monto);

        let totalImpuestosMensuales = 0;
        ingresosMBruto.forEach(i => {
            const meses = contarMesesDesde28(desdeStr, hastaStr, i.desde, i.hasta);
            totalImpuestosMensuales += (i.bruto - i.monto) * meses;
        });

        // Calcular ingresos brutos: netos + impuestos deducidos de ingresos
        const ingresosBruto = ingresosP + totalIngresosMensuales + totalImpuestosPuntuales + totalImpuestosMensuales;
        // El total de ingresos debe ser bruto + intereses cuentas remuneradas
        const totalIngresos = ingresosBruto + totalCuentaRemunerada;

        const gastosP = (await dbAll(db, `SELECT IFNULL(SUM(monto),0) as total FROM gastos_puntuales WHERE fecha BETWEEN ? AND ? LIMIT 1000`, [desdeStr, hastaStr]))[0]?.total || 0;

        let totalGastosMensuales = 0;
        gastosM.forEach(g => {
            totalGastosMensuales += sumarMensualConIpc(g, desdeStr, hastaStr);
        });

        const totalGastos = gastosP + totalGastosMensuales;

        const impuestosPuntuales = (await dbAll(db, `SELECT IFNULL(SUM(monto),0) as total FROM impuestos_puntuales WHERE fecha BETWEEN ? AND ? LIMIT 1000`, [desdeStr, hastaStr]))[0]?.total || 0;
        
        let totalImpuestosStandaloneMensuales = 0;
        impuestosMensuales.forEach(i => totalImpuestosStandaloneMensuales += i.monto * contarMesesDesde28(desdeStr, hastaStr, i.desde, i.hasta));

        const impuestoRenta = totalImpuestosPuntuales + totalImpuestosMensuales + totalRetencionCR;
        const impuestoOtros = impuestosPuntuales + totalImpuestosStandaloneMensuales;
        const totalImpuestos = impuestoRenta + impuestoOtros;
        const ingresosNetos = totalIngresos - impuestoRenta;
        const ahorro = totalIngresos - totalGastos - impuestoRenta - impuestoOtros;

        resultado[periodo] = {
            // Campos legacy
            ingresos: parseFloat(totalIngresos.toFixed(2)),
            gastos: parseFloat(totalGastos.toFixed(2)),
            ahorro: parseFloat(ahorro.toFixed(2)),
            impuestos: parseFloat(totalImpuestos.toFixed(2)),
            // Campos contables explícitos
            total_ingreso: parseFloat(totalIngresos.toFixed(2)),
            ingresos_netos: parseFloat(ingresosNetos.toFixed(2)),
            total_gastos: parseFloat(totalGastos.toFixed(2)),
            impuesto_renta: parseFloat(impuestoRenta.toFixed(2)),
            impuesto_otros: parseFloat(impuestoOtros.toFixed(2))
        };
    }

    resumenCache = resultado;
    resumenCacheTime = ahora;
    resumenCacheKey = cacheKey;

    return resultado;
}

module.exports = {
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
    getResumenPeriodos
};
