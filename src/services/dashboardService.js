/**
 * Dashboard Functions - Lógica de negocio para el dashboard
 * Extraído desde routes/dashboard.js para reutilización en IPC handlers
 */

const db = require('../config/database');
const config = require('../config/config');
const { dbAll, dbGet } = require('../utils/dbHelpers');
const PuntualService = require('../services/PuntualService');
const MensualService = require('../services/MensualService');
const CuentaRemuneradaService = require('../services/CuentaRemuneradaService');
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
        dividendos: 0,
        dividendos_ret: 0,
        ingresos_bolsa: 0,
        gastos_bolsa: 0,
        ahorros: 0
    });
    const mesesPorNombre = new Map(meses.map(m => [m.mes, m]));

    // Ingresos
    const ingresosP = await ingresosPuntualesService.getByMonth(desde, hasta, categoria_id);
    agregarPuntualesPorMes(ingresosP, meses, 'ingresos');

    const ingresosM = await ingresosMensualesService.getAllForCalculations(categoria_id);
    agregarMensualesPorMes(ingresosM, meses, hastaDate, 'ingresos');

    // ── Cuenta remunerada: interés real (simulación diaria) para la cuenta principal ──
    const crService = new CuentaRemuneradaService();
    const cuentaPrincipal = await dbGet(db,
        `SELECT id FROM cuenta_remunerada WHERE linked_to_bolsa = 1 ORDER BY created_at LIMIT 1`
    ) || await dbGet(db, `SELECT id FROM cuenta_remunerada ORDER BY created_at LIMIT 1`);
    const idPrincipal = cuentaPrincipal?.id || null;

    if (idPrincipal) {
        const interesesReales = await crService.getInteresesPorMes(desde, hasta);
        meses.forEach(m => {
            const cr = interesesReales[m.mes];
            if (cr && cr.bruto > 0) {
                m.cuentas_remuneradas += cr.bruto;
                const ret = cr.bruto - cr.neto;
                if (ret > 0) { m.impuestos_ingresos += ret; m.retencion_cr += ret; }
            }
        });
    }

    // Cuentas secundarias (no principal): fórmula simple
    const hastaSliceCR = hasta.slice(0, 7);
    const cuentasSecundarias = idPrincipal
        ? await dbAll(db, `SELECT monto, aportacion_mensual, interes, retencion, desde, hasta FROM cuenta_remunerada WHERE id != ?`, [idPrincipal])
        : [];
    cuentasSecundarias.forEach(cr => {
        const im = calcularInteresesMensuales(cr.monto, cr.aportacion_mensual || 0, cr.interes || 0, cr.desde, cr.hasta || hastaSliceCR);
        meses.forEach(m => {
            if (esMensualActivo(m.mes, hastaDate, cr.desde, cr.hasta)) {
                const interMes = im[m.mes] || 0;
                m.cuentas_remuneradas += interMes;
                if (cr.retencion && cr.retencion > 0) {
                    const ret = interMes * (cr.retencion / 100);
                    m.impuestos_ingresos += ret;
                    m.retencion_cr += ret;
                }
            }
        });
    });

    // ── Dividendos de bolsa ──
    const dividendosBolsa = await dbAll(db,
        `SELECT fecha, importe_bruto, retencion FROM dividendos WHERE fecha >= ? AND fecha <= ? ORDER BY fecha ASC`,
        [desde, hasta]
    );
    dividendosBolsa.forEach(div => {
        const mes = (div.fecha || '').slice(0, 7);
        const mesData = mesesPorNombre.get(mes);
        if (!mesData) return;
        const bruto = parseFloat(div.importe_bruto) || 0;
        const ret   = parseFloat(div.retencion)     || 0;
        const neto  = bruto - ret;
        mesData.dividendos     += neto;
        mesData.dividendos_ret += ret;
        if (ret > 0) mesData.impuestos_ingresos += ret;
    });

    // ── Operaciones de bolsa (solo si NO hay CR vinculada — evita doble cómputo) ──
    const tieneLinkedCR = await dbGet(db, `SELECT id FROM cuenta_remunerada WHERE linked_to_bolsa = 1 LIMIT 1`);
    if (!tieneLinkedCR) {
        const opsBolsa = await dbAll(db,
            `SELECT fecha, tipo, cantidad, precio_unitario, comision FROM operaciones_bolsa WHERE fecha >= ? AND fecha <= ? ORDER BY fecha ASC`,
            [desde, hasta]
        );
        opsBolsa.forEach(op => {
            const mes = (op.fecha || '').slice(0, 7);
            const mesData = mesesPorNombre.get(mes);
            if (!mesData) return;
            const importe = parseFloat(op.cantidad) * parseFloat(op.precio_unitario);
            const comision = parseFloat(op.comision || 0);
            if (op.tipo === 'compra') {
                mesData.gastos_bolsa += importe + comision;
            } else {
                mesData.ingresos_bolsa += importe - comision;
            }
        });
    }

    // Gastos puntuales (sin IPC)
    const gastosP = await gastosPuntualesService.getByMonth(desde, hasta, categoria_id);
    agregarPuntualesPorMes(gastosP, meses, 'gastos');

    let gastosMQuery = `SELECT monto, desde, hasta, ipc_porcentaje, frecuencia_meses FROM gastos_mensuales`;
    const gastosMParams = [];
    if (categoria_id) {
        gastosMQuery += ' WHERE categoria_id = ?';
        gastosMParams.push(categoria_id);
    }
    const gastosM = await dbAll(db, gastosMQuery, gastosMParams);
    gastosM.forEach(g => {
        meses.forEach(m => {
            if (esMensualActivo(m.mes, hastaDate, g.desde, g.hasta, g.frecuencia_meses || 1)) {
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

    // Métricas contables — total_ingreso incluye todo el ingreso bruto:
    //   salary + cr_interest_bruto + dividendos_bruto + bolsa_ventas_neto
    // ahorros = total_ingreso - gastos_total - impuestos
    meses.forEach(m => {
        const impuestoRenta = (m.impuestos_ingresos || 0);
        const impuestoOtros = (m.impuestos_otros || 0);
        // dividendos_bruto = neto + retención (la retención ya está en impuestos_ingresos)
        const dividendosBruto = (m.dividendos || 0) + (m.dividendos_ret || 0);
        const totalIngreso = (m.ingresos || 0) + impuestoRenta + (m.cuentas_remuneradas || 0)
            + dividendosBruto + (m.ingresos_bolsa || 0);
        const totalGastos  = (m.gastos || 0) + (m.gastos_bolsa || 0);
        const ahorro = totalIngreso - totalGastos - impuestoRenta - impuestoOtros;

        m.total_ingreso  = totalIngreso;
        m.ingresos_netos = totalIngreso - impuestoRenta;
        m.total_gastos   = totalGastos;
        m.impuesto_renta = impuestoRenta;
        m.impuesto_otros = impuestoOtros;
        m.ahorros        = ahorro;
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
        retencion_cr: 0,
        dividendos: 0,
        dividendos_ret: 0,
        ingresos_bolsa: 0,
        gastos_bolsa: 0,
        ahorros: 0
    });
    const mesesPorNombreR = new Map(meses.map(m => [m.mes, m]));

    const ingresosP = await ingresosRealesService.getByMonth(desde, hasta, categoria_id);
    agregarPuntualesPorMes(ingresosP, meses, 'ingresos');

    const gastosP = await gastosRealesService.getByMonth(desde, hasta, categoria_id);
    agregarPuntualesPorMes(gastosP, meses, 'gastos');

    // CR interés real
    const crServiceR = new CuentaRemuneradaService();
    const cuentaPrinR = await dbGet(db,
        `SELECT id FROM cuenta_remunerada WHERE linked_to_bolsa = 1 ORDER BY created_at LIMIT 1`
    ) || await dbGet(db, `SELECT id FROM cuenta_remunerada ORDER BY created_at LIMIT 1`);
    if (cuentaPrinR?.id) {
        const irR = await crServiceR.getInteresesPorMes(desde, hasta);
        meses.forEach(m => {
            const cr = irR[m.mes];
            if (cr && cr.bruto > 0) {
                m.cuentas_remuneradas += cr.bruto;
                const ret = cr.bruto - cr.neto;
                if (ret > 0) { m.impuestos_ingresos += ret; m.retencion_cr += ret; }
            }
        });
    }

    // Dividendos
    const divsR = await dbAll(db,
        `SELECT fecha, importe_bruto, retencion FROM dividendos WHERE fecha >= ? AND fecha <= ?`,
        [desde, hasta]
    );
    divsR.forEach(div => {
        const mes = (div.fecha || '').slice(0, 7);
        const md  = mesesPorNombreR.get(mes);
        if (!md) return;
        const bruto = parseFloat(div.importe_bruto) || 0;
        const ret   = parseFloat(div.retencion)     || 0;
        md.dividendos     += bruto - ret;
        md.dividendos_ret += ret;
        if (ret > 0) md.impuestos_ingresos += ret;
    });

    // Ops de bolsa (solo si no hay CR vinculada)
    const linkedR = await dbGet(db, `SELECT id FROM cuenta_remunerada WHERE linked_to_bolsa = 1 LIMIT 1`);
    if (!linkedR) {
        const opsR = await dbAll(db,
            `SELECT fecha, tipo, cantidad, precio_unitario, comision FROM operaciones_bolsa WHERE fecha >= ? AND fecha <= ?`,
            [desde, hasta]
        );
        opsR.forEach(op => {
            const mes = (op.fecha || '').slice(0, 7);
            const md  = mesesPorNombreR.get(mes);
            if (!md) return;
            const imp = parseFloat(op.cantidad) * parseFloat(op.precio_unitario);
            const com = parseFloat(op.comision || 0);
            if (op.tipo === 'compra') md.gastos_bolsa   += imp + com;
            else                      md.ingresos_bolsa += imp - com;
        });
    }

    meses.forEach(m => {
        const impuestoRenta  = (m.impuestos_ingresos || 0);
        const impuestoOtros  = (m.impuestos_otros    || 0);
        const dividendosBruto = (m.dividendos || 0) + (m.dividendos_ret || 0);
        const totalIngreso = (m.ingresos || 0) + impuestoRenta + (m.cuentas_remuneradas || 0)
            + dividendosBruto + (m.ingresos_bolsa || 0);
        const totalGastos  = (m.gastos || 0) + (m.gastos_bolsa || 0);

        m.total_ingreso  = totalIngreso;
        m.ingresos_netos = totalIngreso - impuestoRenta;
        m.total_gastos   = totalGastos;
        m.impuesto_renta = impuestoRenta;
        m.impuesto_otros = impuestoOtros;
        m.ahorros        = totalIngreso - totalGastos - impuestoRenta - impuestoOtros;
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
        SELECT c.nombre AS categoria, gm.monto, gm.desde, gm.hasta, gm.ipc_porcentaje, gm.frecuencia_meses
        FROM gastos_mensuales gm
        JOIN categorias c ON gm.categoria_id = c.id
    `);

    // Generar array de meses una sola vez para toda la iteración
    const mesesGastos = generarArrayMeses(desde, hasta, { monto: 0 });
    gastosM.forEach(gm => {
        mesesGastos.forEach(m => {
            if (esMensualActivo(m.mes, hastaDate, gm.desde, gm.hasta, gm.frecuencia_meses || 1)) {
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
        SELECT c.nombre AS categoria, gm.monto, gm.desde, gm.hasta, gm.ipc_porcentaje, gm.frecuencia_meses
        FROM gastos_mensuales gm
        JOIN categorias c ON gm.categoria_id = c.id
    `);

    gastosM.forEach(g => {
        meses.forEach(m => {
            if (esMensualActivo(m.mes, hastaDate, g.desde, g.hasta, g.frecuencia_meses || 1)) {
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
        const fm = registro.frecuencia_meses > 1 ? registro.frecuencia_meses : 1;
        const [dy, dm] = registro.desde.split('-').map(Number);
        let total = 0;

        while (current <= end) {
            const cy = current.getFullYear();
            const cm = current.getMonth() + 1;
            const monthsElapsed = (cy - dy) * 12 + (cm - dm);
            if (monthsElapsed % fm === 0) {
                const targetDate = new Date(cy, current.getMonth(), 1);
                total += calcularMontoIpc(registro.monto, registro.ipc_porcentaje, registro.desde, targetDate);
            }
            current.setMonth(current.getMonth() + 1);
        }

        return total;
    };

    const periodoEntries = Object.entries(periodos);
    const hastaStr = hoy.toISOString().slice(0, 10);
    const desdeStrs = periodoEntries.map(([, d]) => d.toISOString().slice(0, 10));

    // Construye una query con CASE WHEN para obtener sumas de todos los periodos en una sola pasada
    const buildMultiPeriodSumQuery = (table) => {
        const cases = desdeStrs.map((_, i) =>
            `IFNULL(SUM(CASE WHEN fecha >= ? THEN monto ELSE 0 END),0) AS p${i}`
        ).join(', ');
        return { sql: `SELECT ${cases} FROM ${table} WHERE fecha <= ?`, params: [...desdeStrs, hastaStr] };
    };

    const qIngP = buildMultiPeriodSumQuery('ingresos_puntuales');
    const qGasP = buildMultiPeriodSumQuery('gastos_puntuales');
    const qImpP = buildMultiPeriodSumQuery('impuestos_puntuales');

    // 8 queries en total (5 mensuales + 3 puntuales multi-periodo), en paralelo
    const [
        ingresosM,
        cuentasRemuneradas,
        gastosM,
        ingresosMBruto,
        impuestosMensuales,
        ingPRow,
        gasPRow,
        impPRow,
        ingPBrutoAll
    ] = await Promise.all([
        dbAll(db, `SELECT monto, desde, hasta FROM ingresos_mensuales LIMIT 1000`),
        dbAll(db, `SELECT monto, aportacion_mensual, interes, retencion, desde, hasta FROM cuenta_remunerada LIMIT 1000`),
        dbAll(db, `SELECT monto, desde, hasta, ipc_porcentaje, frecuencia_meses FROM gastos_mensuales LIMIT 1000`),
        dbAll(db, `SELECT bruto, monto, desde, hasta FROM ingresos_mensuales WHERE bruto IS NOT NULL AND bruto != monto LIMIT 1000`),
        dbAll(db, `SELECT monto, desde, hasta FROM impuestos_mensuales LIMIT 1000`),
        dbAll(db, qIngP.sql, qIngP.params),
        dbAll(db, qGasP.sql, qGasP.params),
        dbAll(db, qImpP.sql, qImpP.params),
        dbAll(db, `SELECT fecha, bruto, monto FROM ingresos_puntuales WHERE fecha <= ? AND bruto IS NOT NULL AND bruto != monto LIMIT 1000`, [hastaStr])
    ]);

    // Pre-calcular intereses de cuentas remuneradas por mes (evita recalcular en cada periodo)
    const crInteresesCache = cuentasRemuneradas.map(cr => ({
        cr,
        interesesMensuales: calcularInteresesMensuales(cr.monto, cr.aportacion_mensual || 0, cr.interes || 0, cr.desde, cr.hasta || hastaStr.slice(0, 7))
    }));

    for(let idx = 0; idx < periodoEntries.length; idx++){
        const [periodo] = periodoEntries[idx];
        const desdeStr = desdeStrs[idx];

        const ingresosP = ingPRow[0]?.[`p${idx}`] || 0;

        let totalIngresosMensuales = 0;
        ingresosM.forEach(i => totalIngresosMensuales += i.monto * contarMesesDesde28(desdeStr, hastaStr, i.desde, i.hasta));

        let totalCuentaRemunerada = 0;
        let totalRetencionCR = 0;
        const desdePeriodo = new Date(desdeStr);
        const hastaPeriodo = new Date(hastaStr);
        crInteresesCache.forEach(({ cr, interesesMensuales }) => {
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

        // Filtrar en JS los registros brutos del periodo (sin nueva query a la BD)
        let totalImpuestosPuntuales = 0;
        ingPBrutoAll.forEach(i => {
            if (i.fecha >= desdeStr && i.fecha <= hastaStr) totalImpuestosPuntuales += i.bruto - i.monto;
        });

        let totalImpuestosMensuales = 0;
        ingresosMBruto.forEach(i => {
            const meses = contarMesesDesde28(desdeStr, hastaStr, i.desde, i.hasta);
            totalImpuestosMensuales += (i.bruto - i.monto) * meses;
        });

        const ingresosBruto = ingresosP + totalIngresosMensuales + totalImpuestosPuntuales + totalImpuestosMensuales;
        const totalIngresos = ingresosBruto + totalCuentaRemunerada;

        const gastosP = gasPRow[0]?.[`p${idx}`] || 0;

        let totalGastosMensuales = 0;
        gastosM.forEach(g => {
            totalGastosMensuales += sumarMensualConIpc(g, desdeStr, hastaStr);
        });

        const totalGastos = gastosP + totalGastosMensuales;

        const impuestosPuntuales = impPRow[0]?.[`p${idx}`] || 0;

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

async function getNetWorth() {
    const hoy = new Date();
    const hoyMes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;

    const [huchaRow, subHuchas, subHuchasPuntuales, crs, bolsaRow] = await Promise.all([
        dbGet(db, `SELECT IFNULL(SUM(cantidad),0) AS total FROM hucha`),
        dbAll(db, `SELECT id, aportacion_inicial, aportacion_mensual, desde, hasta FROM sub_huchas`),
        dbAll(db, `SELECT sub_hucha_id, IFNULL(SUM(monto),0) AS total FROM sub_huchas_puntuales GROUP BY sub_hucha_id`),
        dbAll(db, `SELECT monto, aportacion_mensual, interes, retencion, desde, hasta FROM cuenta_remunerada`),
        dbGet(db, `
            SELECT IFNULL(SUM(CASE WHEN tipo='compra' THEN cantidad*precio_unitario+comision ELSE -(cantidad*precio_unitario-comision) END),0) AS total
            FROM operaciones_bolsa
        `)
    ]);

    const puntualMap = {};
    for (const p of subHuchasPuntuales) puntualMap[p.sub_hucha_id] = p.total;

    let totalSubHuchas = 0;
    for (const sh of subHuchas) {
        const hasta = sh.hasta === '9999-12' ? hoyMes : sh.hasta;
        const meses = contarMesesDesde28(sh.desde, hasta);
        const saldo = (sh.aportacion_inicial || 0) + meses * (sh.aportacion_mensual || 0) + (puntualMap[sh.id] || 0);
        totalSubHuchas += saldo;
    }

    let totalCR = 0;
    for (const cr of crs) {
        const hasta = cr.hasta === '9999-12' ? hoyMes : cr.hasta;
        const intereses = calcularInteresesMensuales(cr.monto, cr.aportacion_mensual || 0, cr.interes || 0, cr.desde, hasta);
        const totalIntereses = Object.values(intereses).reduce((s, v) => s + (v || 0), 0);
        const netosIntereses = totalIntereses * (1 - (cr.retencion || 0) / 100);
        totalCR += cr.monto + netosIntereses;
    }

    const totalHucha = huchaRow?.total || 0;
    const totalBolsa = Math.max(0, bolsaRow?.total || 0);

    return {
        hucha:           Math.round(totalHucha      * 100) / 100,
        subhuchas:       Math.round(totalSubHuchas  * 100) / 100,
        cuenta_remunerada: Math.round(totalCR       * 100) / 100,
        bolsa:           Math.round(totalBolsa      * 100) / 100,
        total:           Math.round((totalHucha + totalSubHuchas + totalCR + totalBolsa) * 100) / 100
    };
}

async function getPresupuestosConGasto(mes, desde, hasta) {
    // Resolve date range — prefer explicit desde/hasta, fall back to single month
    let desdeStr, hastaStr, desdesMes, hastasMes, numMeses;

    if (desde && hasta) {
        desdeStr  = desde;
        hastaStr  = hasta;
        desdesMes = desde.slice(0, 7);
        hastasMes = hasta.slice(0, 7);
        const [sy, sm] = desdesMes.split('-').map(Number);
        const [ey, em] = hastasMes.split('-').map(Number);
        numMeses = (ey - sy) * 12 + (em - sm) + 1;
    } else {
        const mesFiltro = mes || (() => {
            const hoy = new Date();
            return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
        })();
        desdeStr  = `${mesFiltro}-01`;
        hastaStr  = `${mesFiltro}-31`;
        desdesMes = mesFiltro;
        hastasMes = mesFiltro;
        numMeses  = 1;
    }

    let presupuestos;
    try {
        presupuestos = await dbAll(db, `
            SELECT pc.id, pc.categoria_id, pc.limite_mensual, c.nombre AS categoria
            FROM presupuestos_categoria pc
            JOIN categorias c ON pc.categoria_id = c.id
            ORDER BY c.nombre
        `);
    } catch (_) {
        return [];
    }

    // Gastos puntuales: suma directa del rango
    const gastosPunt = await dbAll(db, `
        SELECT categoria_id, IFNULL(SUM(monto),0) AS total
        FROM gastos_puntuales WHERE fecha >= ? AND fecha <= ?
        GROUP BY categoria_id
    `, [desdeStr, hastaStr]);

    // Gastos mensuales: contar meses de pago reales (respeta frecuencia)
    const gastosMensRows = await dbAll(db, `
        SELECT categoria_id, monto, desde, hasta, frecuencia_meses
        FROM gastos_mensuales
        WHERE desde <= ? AND (hasta >= ? OR hasta = '9999-12')
    `, [hastasMes, desdesMes]);

    const gastoMap = {};
    for (const g of gastosPunt) {
        gastoMap[g.categoria_id] = (gastoMap[g.categoria_id] || 0) + g.total;
    }
    for (const gm of gastosMensRows) {
        const gmHasta      = gm.hasta === '9999-12' ? hastasMes : gm.hasta;
        const overlapStart = gm.desde  > desdesMes  ? gm.desde  : desdesMes;
        const overlapEnd   = gmHasta   < hastasMes  ? gmHasta   : hastasMes;
        if (overlapStart > overlapEnd) continue;
        const fm = gm.frecuencia_meses > 1 ? gm.frecuencia_meses : 1;
        const [dy, dm] = gm.desde.split('-').map(Number);
        let [sy, sm] = overlapStart.split('-').map(Number);
        const [ey, em] = overlapEnd.split('-').map(Number);
        let paymentMonths = 0;
        while (sy < ey || (sy === ey && sm <= em)) {
            const monthsElapsed = (sy - dy) * 12 + (sm - dm);
            if (monthsElapsed % fm === 0) paymentMonths++;
            sm++;
            if (sm > 12) { sm = 1; sy++; }
        }
        gastoMap[gm.categoria_id] = (gastoMap[gm.categoria_id] || 0) + gm.monto * paymentMonths;
    }

    return presupuestos.map(p => {
        const limite_periodo = Math.round(p.limite_mensual * numMeses * 100) / 100;
        const gasto_real     = Math.round((gastoMap[p.categoria_id] || 0) * 100) / 100;
        const pct            = limite_periodo > 0
            ? Math.round(gasto_real / limite_periodo * 10000) / 100
            : 0;
        return {
            id:             p.id,
            categoria_id:   p.categoria_id,
            categoria:      p.categoria,
            limite_mensual: p.limite_mensual,
            limite_periodo,
            num_meses:      numMeses,
            gasto_real,
            porcentaje:     pct,
            superado:       gasto_real > limite_periodo
        };
    });
}

async function getAnomalias(meses = 6) {
    const hoy = new Date();
    const hoyMes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    const hoyStr = hoy.toISOString().slice(0, 10);

    // Meses de referencia (los N meses anteriores al actual)
    const mesesRef = [];
    for (let i = 1; i <= meses; i++) {
        const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
        mesesRef.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const desdeRef = `${mesesRef[mesesRef.length - 1]}-01`;
    const hastaRef = `${mesesRef[0]}-31`;

    const [puntRef, mensRef, puntActual, mensActualRaw, categorias] = await Promise.all([
        dbAll(db, `SELECT categoria_id, fecha, monto FROM gastos_puntuales WHERE fecha >= ? AND fecha <= ?`, [desdeRef, hastaRef]),
        dbAll(db, `SELECT categoria_id, monto, desde, hasta, frecuencia_meses FROM gastos_mensuales`),
        dbAll(db, `SELECT categoria_id, IFNULL(SUM(monto),0) AS total FROM gastos_puntuales WHERE fecha >= ? AND fecha <= ? GROUP BY categoria_id`, [`${hoyMes}-01`, hoyStr]),
        dbAll(db, `SELECT categoria_id, monto, desde, hasta, frecuencia_meses FROM gastos_mensuales WHERE desde <= ? AND (hasta >= ? OR hasta = '9999-12')`, [hoyMes, hoyMes]),
        dbAll(db, `SELECT id, nombre FROM categorias`)
    ]);

    // Filtrar mensActual por frecuencia (solo incluir si hoyMes es mes de pago)
    const mensActual = [];
    for (const g of mensActualRaw) {
        const fm = g.frecuencia_meses > 1 ? g.frecuencia_meses : 1;
        const [dy, dm] = g.desde.split('-').map(Number);
        const [ty, tm] = hoyMes.split('-').map(Number);
        const monthsElapsed = (ty - dy) * 12 + (tm - dm);
        if (monthsElapsed % fm === 0) {
            mensActual.push({ categoria_id: g.categoria_id, total: g.monto });
        }
    }

    const catMap = {};
    for (const c of categorias) catMap[c.id] = c.nombre;

    // Calcular gasto por categoría por mes de referencia
    const gastoByMesCat = {};
    for (const g of puntRef) {
        const mes = g.fecha.slice(0, 7);
        if (!gastoByMesCat[mes]) gastoByMesCat[mes] = {};
        gastoByMesCat[mes][g.categoria_id] = (gastoByMesCat[mes][g.categoria_id] || 0) + g.monto;
    }
    for (const g of mensRef) {
        const fm = g.frecuencia_meses > 1 ? g.frecuencia_meses : 1;
        const [dy, dm] = g.desde.split('-').map(Number);
        for (const mes of mesesRef) {
            if (g.desde <= mes && (g.hasta >= mes || g.hasta === '9999-12')) {
                const [ty, tm] = mes.split('-').map(Number);
                const monthsElapsed = (ty - dy) * 12 + (tm - dm);
                if (monthsElapsed % fm === 0) {
                    if (!gastoByMesCat[mes]) gastoByMesCat[mes] = {};
                    gastoByMesCat[mes][g.categoria_id] = (gastoByMesCat[mes][g.categoria_id] || 0) + g.monto;
                }
            }
        }
    }

    // Promedio por categoría sobre los meses de referencia
    const promedios = {};
    for (const mes of mesesRef) {
        const byMes = gastoByMesCat[mes] || {};
        for (const [catId, total] of Object.entries(byMes)) {
            if (!promedios[catId]) promedios[catId] = { suma: 0, count: 0 };
            promedios[catId].suma  += total;
            promedios[catId].count += 1;
        }
    }

    // Gasto actual por categoría
    const gastoActual = {};
    for (const g of puntActual)  gastoActual[g.categoria_id] = (gastoActual[g.categoria_id] || 0) + g.total;
    for (const g of mensActual)  gastoActual[g.categoria_id] = (gastoActual[g.categoria_id] || 0) + g.total;

    // Detectar anomalías (>50% sobre la media)
    const anomalias = [];
    for (const [catId, gasto] of Object.entries(gastoActual)) {
        const p = promedios[catId];
        if (!p || p.count === 0) continue;
        const promedio = p.suma / p.count;
        if (promedio <= 0) continue;
        const desviacion_pct = ((gasto - promedio) / promedio) * 100;
        if (desviacion_pct > 50) {
            anomalias.push({
                categoria_id:   parseInt(catId),
                categoria:      catMap[catId] || `Cat ${catId}`,
                gasto_actual:   Math.round(gasto * 100) / 100,
                promedio_mensual: Math.round(promedio * 100) / 100,
                desviacion_pct: Math.round(desviacion_pct * 100) / 100
            });
        }
    }

    return anomalias.sort((a, b) => b.desviacion_pct - a.desviacion_pct);
}

// ── Caché de agregaciones pesadas ───────────────────────────────────────────
// Mismo patrón que getResumenPeriodos: TTL corto, sin invalidación activa en
// escritura (el coste de servir datos con hasta 60s de antigüedad tras una
// edición ya es el comportamiento aceptado en producción para resumen-periodos).
// Evita recalcular desde cero — incluyendo la simulación día-a-día de la CR —
// en cada llamada cuando el home dispara varias peticiones seguidas.
const _aggCache = new Map();
const AGG_CACHE_TTL_MS = 60000;

function _aggDbKey() {
    return typeof db.__getDbPath === 'function' ? db.__getDbPath() : 'default';
}

function withAggCache(name, fn) {
    return async (...args) => {
        const key = `${_aggDbKey()}|${name}|${JSON.stringify(args)}`;
        const cached = _aggCache.get(key);
        const now = Date.now();
        if (cached && (now - cached.time) < AGG_CACHE_TTL_MS) return cached.data;
        const data = await fn(...args);
        if (_aggCache.size > 200) _aggCache.clear();
        _aggCache.set(key, { time: now, data });
        return data;
    };
}

module.exports = {
    getDashboardData,
    getDashboardRealData,
    getDashboardRangoFechas,
    getImpuestosMes,
    getImpuestosMesReal,
    getAhorrosMes: withAggCache('getAhorrosMes', getAhorrosMes),
    getAhorrosMesReal: withAggCache('getAhorrosMesReal', getAhorrosMesReal),
    getCategoriasPeriodo: withAggCache('getCategoriasPeriodo', getCategoriasPeriodo),
    getCategoriasPeriodoReal: withAggCache('getCategoriasPeriodoReal', getCategoriasPeriodoReal),
    getGastosCategoriaMes: withAggCache('getGastosCategoriaMes', getGastosCategoriaMes),
    getGastosCategoriaMesReal: withAggCache('getGastosCategoriaMesReal', getGastosCategoriaMesReal),
    getResumenPeriodos,
    getNetWorth: withAggCache('getNetWorth', getNetWorth),
    getPresupuestosConGasto: withAggCache('getPresupuestosConGasto', getPresupuestosConGasto),
    getAnomalias: withAggCache('getAnomalias', getAnomalias)
};
