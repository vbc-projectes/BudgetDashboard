
function cargarDashboardForm() {
const dashboardCoreUtils = window.DashboardCoreUtils || {};
const dashboardDateRangeController = window.DashboardDateRangeController || {};
const dashboardChartHelpers = window.DashboardChartHelpers || {};

// ===== VARIABLES GLOBALES DEL DASHBOARD =====
let filtroGastoCategoria = null;
let dashDesde = null;
let dashHasta = null;
let hoy = new Date();

const charts = {
    totales: null,
    porcentajes: null,
    ingresos: null,
    gastos: null,
    ahorros: null,
    ingresosCat: null,
    gastosCat: null,
    gastosMes: null
};

const dashboardConfig = window.dashboardConfig || {};
const endpoints = {
    ahorros: '/ahorros-mes',
    categorias: '/categorias-periodo',
    dashboard: '/dashboard',
    rangoFechas: '/dashboard-rango-fechas',
    gastosMes: '/gastos-categoria-mes',
    impuestosMes: '/impuestos-mes',
    ...(dashboardConfig.endpoints || {})
};
const realEndpoints = {
    ahorros: '/ahorros-mes-real',
    gastosMes: '/gastos-categoria-mes-real',
    ...(dashboardConfig.realEndpoints || {})
};
const dashboardFeatures = {
    showTotals: true,
    showPorcentajes: true,
    showIngresos: true,
    showGastosMes: true,
    showAhorros: true,
    showIngresosCat: true,
    showGastosCat: true,
    useCategorias: true,
    simpleMode: false,
    simpleIngresos: false,
    simpleGastos: false,
    ...(dashboardConfig.features || {})
};

let dateRangeSlider = null;
let sliderUpdateFromInputs = false;
const DASHBOARD_RANGE_STORAGE_KEY = 'dashboardDateRange';
const DASHBOARD_UI_PREFS_KEY = 'dashboardUiPrefsV1';

const restarFecha = typeof dashboardCoreUtils.restarFecha === 'function'
    ? dashboardCoreUtils.restarFecha
    : (fecha, cantidad, unidad = 'days') => {
        const resultado = new Date(fecha);
        if (unidad === 'months') resultado.setMonth(resultado.getMonth() - cantidad);
        else if (unidad === 'years') resultado.setFullYear(resultado.getFullYear() - cantidad);
        else resultado.setDate(resultado.getDate() - cantidad);
        return resultado;
    };

const crearResumenPeriodo = typeof dashboardCoreUtils.crearResumenPeriodo === 'function'
    ? dashboardCoreUtils.crearResumenPeriodo
    : () => ({
        ingresosBrutos: 0,
        gastosConImpuestos: 0,
        ahorros: 0,
        ingresoNeto: 0,
        ratioAhorro: 0
    });

const formatearEuro = typeof dashboardCoreUtils.formatearEuro === 'function'
    ? dashboardCoreUtils.formatearEuro
    : (monto) => {
        if (typeof window.formatCurrency === 'function') {
            return window.formatCurrency(monto, { convert: false });
        }
        if (monto === null || monto === undefined) return '€0,00';
        return '€' + parseFloat(monto).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

const formatearFechaInput = typeof dashboardCoreUtils.formatearFechaInput === 'function'
    ? dashboardCoreUtils.formatearFechaInput
    : (date) => new Date(date).toISOString().slice(0, 10);

const formatearFechaDisplay = typeof dashboardCoreUtils.formatearFechaDisplay === 'function'
    ? dashboardCoreUtils.formatearFechaDisplay
    : (date) => {
        const d = new Date(date);
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    };

const parsearFechaInput = typeof dashboardCoreUtils.parsearFechaInput === 'function'
    ? dashboardCoreUtils.parsearFechaInput
    : (valor) => {
        if (!valor) return null;
        const date = /^\d{4}-\d{2}-\d{2}$/.test(valor) ? new Date(`${valor}T00:00:00`) : new Date(valor);
        return Number.isNaN(date.getTime()) ? null : date;
    };

const clampFecha = typeof dashboardCoreUtils.clampFecha === 'function'
    ? dashboardCoreUtils.clampFecha
    : (date, minDate, maxDate) => {
        const time = Math.min(Math.max(date.getTime(), minDate.getTime()), maxDate.getTime());
        return new Date(time);
    };

const obtenerRangoComparativo = typeof dashboardCoreUtils.obtenerRangoComparativo === 'function'
    ? dashboardCoreUtils.obtenerRangoComparativo
    : () => null;

function cargarPreferenciasDashboard() {
    if (typeof dashboardCoreUtils.cargarPreferenciasDashboard === 'function') {
        return dashboardCoreUtils.cargarPreferenciasDashboard(DASHBOARD_UI_PREFS_KEY);
    }
    return {};
}

function guardarPreferenciasDashboard(nextPrefs = {}) {
    if (typeof dashboardCoreUtils.guardarPreferenciasDashboard === 'function') {
        dashboardCoreUtils.guardarPreferenciasDashboard(DASHBOARD_UI_PREFS_KEY, nextPrefs);
        return;
    }
}

function actualizarEtiquetasSlider(desde, hasta) {
    if (typeof dashboardDateRangeController.actualizarEtiquetasSlider === 'function') {
        dashboardDateRangeController.actualizarEtiquetasSlider(desde, hasta);
    }
}

function guardarRangoSeleccionado(desde, hasta) {
    if (typeof dashboardCoreUtils.guardarRangoSeleccionado === 'function') {
        dashboardCoreUtils.guardarRangoSeleccionado(DASHBOARD_RANGE_STORAGE_KEY, desde, hasta);
    }
}

function cargarRangoSeleccionado() {
    if (typeof dashboardCoreUtils.cargarRangoSeleccionado === 'function') {
        return dashboardCoreUtils.cargarRangoSeleccionado(DASHBOARD_RANGE_STORAGE_KEY);
    }
    return null;
}

function actualizarQuickPeriodActivos() {
    if (typeof dashboardDateRangeController.actualizarQuickPeriodActivos === 'function') {
        dashboardDateRangeController.actualizarQuickPeriodActivos(parsearFechaInput, dashDesde, dashHasta);
    }
}

function syncSliderWithInputs() {
    if (typeof dashboardDateRangeController.syncSliderWithInputs === 'function') {
        dashboardDateRangeController.syncSliderWithInputs({
            dateRangeSlider,
            dashDesde,
            dashHasta,
            parsearFechaInput,
            setSliderUpdateFromInputs: (value) => { sliderUpdateFromInputs = !!value; },
            formatearFechaDisplay
        });
    }
}

async function obtenerRangoFechasDashboard() {
    if (typeof dashboardDateRangeController.obtenerRangoFechasDashboard === 'function') {
        return dashboardDateRangeController.obtenerRangoFechasDashboard(endpoints);
    }
    return null;
}

async function initDateRangeSlider() {
    if (typeof dashboardDateRangeController.initDateRangeSlider === 'function') {
        await dashboardDateRangeController.initDateRangeSlider({
            dashDesde,
            dashHasta,
            hoy,
            parsearFechaInput,
            formatearFechaInput,
            formatearFechaDisplay,
            clampFecha,
            cargarRangoSeleccionado,
            actualizarFechas,
            endpoints,
            isSliderUpdateFromInputs: () => sliderUpdateFromInputs,
            setSliderUpdateFromInputs: (value) => { sliderUpdateFromInputs = !!value; },
            setDateRangeSlider: (slider) => { dateRangeSlider = slider; }
        });
    }
}

// ===== HANDLER PARA RECALCULAR ESTADÍSTICAS AL OCULTAR/MOSTRAR SERIES =====
function crearLegendClickHandler() {
    return function(e, legendItem, legend) {
        const chart = legend.chart;
        const index = legendItem.datasetIndex;
        
        // Comportamiento por defecto: ocultar/mostrar serie
        const meta = chart.getDatasetMeta(index);
        meta.hidden = meta.hidden === null ? !chart.data.datasets[index].hidden : null;
        
        // Recalcular estadísticas si la función existe
        if (chart.updateChartStats) {
            chart.updateChartStats();
        }
        
        chart.update();
    };
}

// ===== FUNCIONES DE EVENT LISTENERS (GLOBALES) =====
function manejarClickPeriodo(e) {
    const btn = e.target.closest('.quick-period-btn');
    if (!btn) return;
    
    e.preventDefault();
    const days = parseInt(btn.getAttribute('data-days'));
    
    // Mapear días a períodos calendario para coincidir con el resumen
    let desde;
    if (days === 30) {
        desde = restarFecha(hoy, 1, 'months');
    } else if (days === 90) {
        desde = restarFecha(hoy, 3, 'months');
    } else if (days === 180) {
        desde = restarFecha(hoy, 6, 'months');
    } else if (days === 365) {
        desde = restarFecha(hoy, 1, 'years');
    } else if (days === 1825) {
        desde = restarFecha(hoy, 5, 'years');
    } else {
        // Fallback: usar días directamente
        desde = restarFecha(hoy, days, 'days');
    }

    dashDesde.value = desde.toISOString().slice(0, 10);
    dashHasta.value = hoy.toISOString().slice(0, 10);

    syncSliderWithInputs();
    guardarRangoSeleccionado(dashDesde.value, dashHasta.value);

    // Actualizar estado activo del botón
    document.querySelectorAll('.quick-period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    console.log(`📅 Período rápido: últimos ${days} días`);

    // Cargar datos
    if (dashboardFeatures.useCategorias) {
        cargarCategorias().then(() => actualizarDashboard());
    } else {
        actualizarDashboard();
    }
}

function actualizarFechas() {
    syncSliderWithInputs();
    actualizarQuickPeriodActivos();
    if (dashDesde?.value && dashHasta?.value) {
        guardarRangoSeleccionado(dashDesde.value, dashHasta.value);
    }
    if (dashboardFeatures.useCategorias) {
        cargarCategorias().then(() => actualizarDashboard());
    } else {
        actualizarDashboard();
    }
}

function manejarEnterDesde(e) {
    if (e.key === 'Enter') {
        dashDesde.blur();
    }
}

function manejarEnterHasta(e) {
    if (e.key === 'Enter') {
        dashHasta.blur();
    }
}

function manejarCambioCategoria() {
    if (!dashboardFeatures.useCategorias || !dashboardFeatures.showGastosMes) return;
    console.log('📁 Categoría seleccionada:', filtroGastoCategoria.value);
    guardarPreferenciasDashboard({ categoriaGasto: filtroGastoCategoria.value || '' });
    actualizarGraficoGastosMes();
}

function manejarCambioMostrarReales() {
    const toggleRealEl = document.getElementById('dashboardToggleReal');
    guardarPreferenciasDashboard({ mostrarReales: !!toggleRealEl?.checked });
    actualizarDashboard();
}

// ===== FUNCIONES PARA CONFIGURAR LISTENERS =====
const setupDateListeners = () => {
    const dashDesdeEl = document.getElementById('dashDesde');
    const dashHastaEl = document.getElementById('dashHasta');
    const filtroEl = document.getElementById('filtroGastoCategoria');
    const toggleRealEl = document.getElementById('dashboardToggleReal');
    
    if (dashDesdeEl) {
        dashDesdeEl.removeEventListener('blur', actualizarFechas);
        dashDesdeEl.removeEventListener('keydown', manejarEnterDesde);
        dashDesdeEl.addEventListener('blur', actualizarFechas);
        dashDesdeEl.addEventListener('keydown', manejarEnterDesde);
    }
    
    if (dashHastaEl) {
        dashHastaEl.removeEventListener('blur', actualizarFechas);
        dashHastaEl.removeEventListener('keydown', manejarEnterHasta);
        dashHastaEl.addEventListener('blur', actualizarFechas);
        dashHastaEl.addEventListener('keydown', manejarEnterHasta);
    }
    
    if (filtroEl) {
        filtroEl.removeEventListener('change', manejarCambioCategoria);
        filtroEl.addEventListener('change', manejarCambioCategoria);
    }

    if (toggleRealEl) {
        toggleRealEl.removeEventListener('change', manejarCambioMostrarReales);
        toggleRealEl.addEventListener('change', manejarCambioMostrarReales);
    }
};

const setupQuickPeriodListener = () => {
    const quickPeriodsContainer = document.querySelector('.quick-periods');
    if (quickPeriodsContainer) {
        quickPeriodsContainer.removeEventListener('click', manejarClickPeriodo);
        quickPeriodsContainer.addEventListener('click', manejarClickPeriodo);
    }
};

    // ===== Cargar categorías =====
    async function cargarCategorias() {
        if (!dashboardFeatures.useCategorias || !filtroGastoCategoria) {
            return;
        }
        const uiPrefs = cargarPreferenciasDashboard();
        const desde = document.getElementById('dashDesde').value;
        const hasta = document.getElementById('dashHasta').value;

        if (!desde || !hasta) {
            const mensaje = typeof gestorIdiomas !== 'undefined' ? gestorIdiomas.obtenerTexto('dashboard.seleccionaRango') : 'Por favor selecciona un rango de fechas';
            console.warn('⚠️ ' + mensaje);
            return;
        }

        try {
            let dataCat = null;
            const service = window.TabCategoryService;
            if (service && typeof service.fetchCategoriasConFallbackPeriodo === 'function') {
                dataCat = await service.fetchCategoriasConFallbackPeriodo(desde, hasta);
            } else {
                const resAll = await fetch('/categorias');
                if (resAll.ok) {
                    dataCat = await resAll.json();
                } else {
                    const resCat = await fetch(`/categorias-periodo?desde=${desde}&hasta=${hasta}`);
                    dataCat = await resCat.json();
                }
            }

            const textoTodas = typeof gestorIdiomas !== 'undefined' ? gestorIdiomas.obtenerTexto('dashboard.todasCategorias') : 'Todas las categorías';
            filtroGastoCategoria.innerHTML = `<option value="">${textoTodas}</option>`;

            const gastosCategorias = Array.isArray(dataCat?.gastos)
                ? dataCat.gastos.map(c => c.nombre)
                : Object.keys(dataCat?.gastos || {});

            if (gastosCategorias.length > 0) {
                gastosCategorias.forEach((c, i) => {
                    const opt = document.createElement('option');
                    opt.value = c;
                    opt.textContent = c;
                    filtroGastoCategoria.appendChild(opt);
                    obtenerColorCategoria(c, i);
                });

                if (uiPrefs?.categoriaGasto && gastosCategorias.includes(uiPrefs.categoriaGasto)) {
                    filtroGastoCategoria.value = uiPrefs.categoriaGasto;
                }

                console.log('✅ Categorías cargadas:', gastosCategorias);
            } else {
                console.warn('⚠️ No hay categorías de gastos');
            }
        } catch (error) {
            console.error('❌ Error cargando categorías:', error);
        }
    }

    // ===== DESTRUIR TODOS LOS GRÁFICOS EXISTENTES =====
    // Esto es necesario cuando se recarga el dashboard (ej: cambio de idioma)
    // Usar la API correcta de Chart.js para desregistrar gráficos
    var canvasIds = ['chartTotales', 'chartIngresosCat', 'chartGastosCat', 'chartGastosMes'];
    
    canvasIds.forEach(canvasId => {
        const canvas = document.getElementById(canvasId);
        if (canvas) {
            const existingChart = Chart.getChart(canvas);
            if (existingChart) {
                console.log(`🗑️ Destruyendo gráfico anterior: ${canvasId}`);
                existingChart.destroy();
            }
        }
    });
    
    // Limpiar array de tracking
    if (window.chartsInstances && Array.isArray(window.chartsInstances)) {
        window.chartsInstances = [];
    }
    
    // Verificar que los elementos necesarios existan
    filtroGastoCategoria = document.getElementById('filtroGastoCategoria');
    dashDesde = document.getElementById('dashDesde');
    dashHasta = document.getElementById('dashHasta');

    if (!dashDesde || !dashHasta || (!filtroGastoCategoria && !dashboardConfig.allowMissingCategoryFilter)) {
        console.warn('⚠️ Elementos del dashboard no encontrados. Reinintentando en 100ms...');
        setTimeout(() => cargarDashboardForm(), 100);
        return;
    }

    if (dashboardConfig.hideCategoryFilter && filtroGastoCategoria) {
        filtroGastoCategoria.style.display = 'none';
    }

    const hideChartCard = (canvasId) => {
        const canvas = document.getElementById(canvasId);
        const card = canvas ? canvas.closest('.chart-card') : null;
        if (card) {
            card.style.display = 'none';
        }
    };

    if (!dashboardFeatures.showTotals) hideChartCard('chartTotales');
    if (!dashboardFeatures.showPorcentajes) hideChartCard('chartPorcentajes');
    if (!dashboardFeatures.showGastosMes) hideChartCard('chartGastosMes');
    if (!dashboardFeatures.showIngresosCat) hideChartCard('chartIngresosCategoria');
    if (!dashboardFeatures.showGastosCat) hideChartCard('chartGastosCategoria');
    
    // Inicializar array global para rastrear gráficos
    if (!window.chartsInstances) {
        window.chartsInstances = [];
    }

    // ===== Colores del tema actual =====
    let temasGraficos = {
        primary: getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),
        primaryDark: getComputedStyle(document.documentElement).getPropertyValue('--primary-dark').trim(),
        success: getComputedStyle(document.documentElement).getPropertyValue('--success').trim(),
        danger: getComputedStyle(document.documentElement).getPropertyValue('--danger').trim(),
        warning: getComputedStyle(document.documentElement).getPropertyValue('--warning').trim(),
        info: getComputedStyle(document.documentElement).getPropertyValue('--info').trim()
    };

    // ===== Paleta de colores dinámica =====
    const coloresCategorias = {};
    let paletaColores = [
        temasGraficos.primary,
        temasGraficos.success,
        temasGraficos.info,
        temasGraficos.warning,
        temasGraficos.primaryDark,
        temasGraficos.danger,
        '#667eea', '#764ba2', '#f093fb', '#f5576c',
        '#4facfe', '#00f2fe', '#fa709a', '#fee140'
    ];

    

    function obtenerColorCategoria(categoria, index) {
        if (!coloresCategorias[categoria]) {
            coloresCategorias[categoria] = paletaColores[index % paletaColores.length];
        }
        return coloresCategorias[categoria];
    }

    // ===== Aclarar color para fondos semitransparentes =====
    function aclararColor(color, porcentaje = 0.2) {
        const hex = color.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        return `rgba(${r}, ${g}, ${b}, ${porcentaje})`;
    }

function calcularMedia(arr) {
    const validos = arr.filter(v => !isNaN(v));
    if (validos.length === 0) return 0;
    return validos.reduce((a, b) => a + b, 0) / validos.length;
}

function calcularVarianza(arr) {
    const validos = arr.filter(v => !isNaN(v));
    const n = validos.length;
    if (n <= 1) return 0;

    const media = calcularMedia(validos);

    // Varianza muestral (n - 1) → correcta para análisis financiero
    const suma = validos.reduce((acc, val) => {
        return acc + Math.pow(val - media, 2);
    }, 0);

    return suma / (n - 1);
}


function calcularDesviacion(arr) {
    return Math.sqrt(calcularVarianza(arr));
}

// ===== FUNCIONES AUXILIARES PARA CREAR GRÁFICOS =====
function crearOpcionesGrafico(optComun, titulo, apilado = false, conLegend = true) {
    if (typeof dashboardChartHelpers.crearOpcionesGrafico === 'function') {
        return dashboardChartHelpers.crearOpcionesGrafico(optComun, titulo, apilado, crearLegendClickHandler);
    }
    return optComun;
}

function crearDataset(label, data, color, apilado = false) {
    if (typeof dashboardChartHelpers.crearDataset === 'function') {
        return dashboardChartHelpers.crearDataset(label, data, color, apilado, aclararColor);
    }
    return { label, data, borderColor: color };
}

function crearUpdateChartStats(datosOriginales, calcularFn) {
    if (typeof dashboardChartHelpers.crearUpdateChartStats === 'function') {
        return dashboardChartHelpers.crearUpdateChartStats(datosOriginales, calcularFn);
    }
    return function() {
        const datos = calcularFn.call(this, datosOriginales);
        if (this?.options?.plugins?.title) this.options.plugins.title.text = datos.titulo;
    };
}

function crearSparklineKpi(canvasId, chartKey, data) {
    if (typeof dashboardChartHelpers.crearSparklineKpi === 'function') {
        dashboardChartHelpers.crearSparklineKpi(canvasId, chartKey, data);
    }
}

function limpiarSparklinesKpi() {
    if (typeof dashboardChartHelpers.limpiarSparklinesKpi === 'function') {
        dashboardChartHelpers.limpiarSparklinesKpi();
    }
}

function renderCilindrosPorcentajes(containerId, config) {
    if (typeof dashboardChartHelpers.renderCilindrosPorcentajes === 'function') {
        return dashboardChartHelpers.renderCilindrosPorcentajes(containerId, config);
    }
    return null;
}

function renderDashboardCategoriasLista(containerId, categorias, palette) {
    if (typeof dashboardChartHelpers.renderDashboardCategoriasLista === 'function') {
        return dashboardChartHelpers.renderDashboardCategoriasLista(containerId, categorias, palette);
    }
    return null;
}

function actualizarResumenKpis({ totalIngresos = 0, totalGastosConImpuestos = 0, totalAhorros = 0, ingresoNeto = 0, ratioAhorro = 0, desde = '', hasta = '', comparativa = null }) {
    const kpiIngresos = document.getElementById('dashKpiIngresos');
    const kpiGastos = document.getElementById('dashKpiGastos');
    const kpiAhorros = document.getElementById('dashKpiAhorros');
    const kpiNeto = document.getElementById('dashKpiNeto');
    const kpiRatio = document.getElementById('dashKpiRatio');
    const kpiPeriodoIngresos = document.getElementById('dashKpiPeriodoIngresos');
    const kpiPeriodoGastos = document.getElementById('dashKpiPeriodoGastos');
    const kpiPeriodoNeto = document.getElementById('dashKpiPeriodoNeto');
    const kpiDeltaIngresos = document.getElementById('dashKpiDeltaIngresos');
    const kpiDeltaGastos = document.getElementById('dashKpiDeltaGastos');
    const kpiDeltaAhorros = document.getElementById('dashKpiDeltaAhorros');
    const kpiDeltaNeto = document.getElementById('dashKpiDeltaNeto');

    const desdeDate = parsearFechaInput(desde);
    const hastaDate = parsearFechaInput(hasta);
    const periodoTexto = (desdeDate && hastaDate)
        ? `${formatearFechaDisplay(desdeDate)} - ${formatearFechaDisplay(hastaDate)}`
        : (typeof gestorIdiomas !== 'undefined' ? gestorIdiomas.obtenerTexto('dashboard.periodoActivo') : 'Periodo activo');

    if (kpiIngresos) kpiIngresos.textContent = formatearEuro(totalIngresos);
    if (kpiGastos) kpiGastos.textContent = formatearEuro(totalGastosConImpuestos);
    if (kpiAhorros) kpiAhorros.textContent = formatearEuro(totalAhorros);
    if (kpiNeto) kpiNeto.textContent = formatearEuro(ingresoNeto);
    if (kpiRatio) kpiRatio.textContent = `${typeof gestorIdiomas !== 'undefined' ? gestorIdiomas.obtenerTexto('dashboard.ratioAhorro') : 'Ratio ahorro'} ${ratioAhorro.toFixed(1)}%`;
    if (kpiPeriodoIngresos) kpiPeriodoIngresos.textContent = periodoTexto;
    if (kpiPeriodoGastos) kpiPeriodoGastos.textContent = periodoTexto;
    if (kpiPeriodoNeto) kpiPeriodoNeto.textContent = periodoTexto;

    const formatDeltaEuro = (current, previous) => {
        const delta = (Number(current) || 0) - (Number(previous) || 0);
        const sign = delta > 0 ? '+' : '';
        return `${sign}${formatearEuro(delta)}`;
    };

    const applyDelta = (el, text, delta) => {
        if (!el) return;
        el.textContent = text;
        el.classList.remove('is-positive', 'is-negative', 'is-neutral');
        if (delta > 0) el.classList.add('is-positive');
        else if (delta < 0) el.classList.add('is-negative');
        else el.classList.add('is-neutral');
    };

    if (comparativa && typeof comparativa === 'object') {
        const labelVs = typeof gestorIdiomas !== 'undefined'
            ? (gestorIdiomas.obtenerTexto('dashboard.vsPeriodoAnterior') || 'vs periodo anterior')
            : 'vs periodo anterior';

        const deltaIngresos = (Number(totalIngresos) || 0) - (Number(comparativa.totalIngresos) || 0);
        const deltaGastos = (Number(totalGastosConImpuestos) || 0) - (Number(comparativa.totalGastosConImpuestos) || 0);
        const deltaAhorros = (Number(totalAhorros) || 0) - (Number(comparativa.totalAhorros) || 0);
        const deltaNeto = (Number(ingresoNeto) || 0) - (Number(comparativa.ingresoNeto) || 0);

        applyDelta(kpiDeltaIngresos, `${labelVs}: ${formatDeltaEuro(totalIngresos, comparativa.totalIngresos)}`, deltaIngresos);
        applyDelta(kpiDeltaGastos, `${labelVs}: ${formatDeltaEuro(totalGastosConImpuestos, comparativa.totalGastosConImpuestos)}`, deltaGastos);
        applyDelta(kpiDeltaAhorros, `${labelVs}: ${formatDeltaEuro(totalAhorros, comparativa.totalAhorros)}`, deltaAhorros);
        applyDelta(kpiDeltaNeto, `${labelVs}: ${formatDeltaEuro(ingresoNeto, comparativa.ingresoNeto)}`, deltaNeto);
    } else {
        const textoBase = typeof gestorIdiomas !== 'undefined'
            ? (gestorIdiomas.obtenerTexto('dashboard.sinComparativa') || 'Sin comparativa')
            : 'Sin comparativa';
        applyDelta(kpiDeltaIngresos, textoBase, 0);
        applyDelta(kpiDeltaGastos, textoBase, 0);
        applyDelta(kpiDeltaAhorros, textoBase, 0);
        applyDelta(kpiDeltaNeto, textoBase, 0);
    }
}

function setDashboardLoadingState(isLoading) {
    const dashboardContainer = document.getElementById('dashboard');
    const loader = document.getElementById('dashboardLoader');

    if (dashboardContainer) {
        dashboardContainer.classList.toggle('is-loading', !!isLoading);
    }
    if (loader) {
        loader.classList.toggle('hidden', !isLoading);
    }
}

function actualizarIndicadorGastosDonut(mostrar, labelBudget, labelReal) {
    const canvas = document.getElementById('chartGastosCategoria');
    const card = canvas ? canvas.closest('.chart-card') : null;
    if (!card) return;

    const indicator = card.querySelector('.ring-indicator');
    if (indicator) indicator.remove();
}

// ===== Función para obtener labels traducidos =====
function obtenerLabelsTraducidos() {
    const textos = {
        ingresos: typeof gestorIdiomas !== 'undefined' ? gestorIdiomas.obtenerTexto('dashboard.totalIngresos') : 'Total Ingreso',
        gastos: typeof gestorIdiomas !== 'undefined' ? gestorIdiomas.obtenerTexto('dashboard.gastos') : 'Gastos',
        ahorros: typeof gestorIdiomas !== 'undefined' ? gestorIdiomas.obtenerTexto('dashboard.ahorros') : 'Ahorros',
        impuestosTotales: typeof gestorIdiomas !== 'undefined' ? gestorIdiomas.obtenerTexto('resumen.totalImpuestos') : 'Total Impuestos',
        impuestosCategoria: typeof gestorIdiomas !== 'undefined' ? gestorIdiomas.obtenerTexto('dashboard.impuestosCategoria') : 'Impuestos',
        ingresosPorCategoria: typeof gestorIdiomas !== 'undefined' ? gestorIdiomas.obtenerTexto('dashboard.ingresosPorCategoria') : 'Ingresos por Categoría',
        gastosPorCategoria: typeof gestorIdiomas !== 'undefined' ? gestorIdiomas.obtenerTexto('dashboard.gastosPorCategoria') : 'Gastos por Categoría',
        media: typeof gestorIdiomas !== 'undefined' ? gestorIdiomas.obtenerTexto('dashboard.media') : 'Media',
        varianza: typeof gestorIdiomas !== 'undefined' ? gestorIdiomas.obtenerTexto('dashboard.varianza') : 'Varianza',
        desviacion: typeof gestorIdiomas !== 'undefined' ? gestorIdiomas.obtenerTexto('dashboard.desviacion') : 'Desviación',
        desviacionAbrev: typeof gestorIdiomas !== 'undefined' ? gestorIdiomas.obtenerTexto('dashboard.desviacionAbrev') : 'Desv',
        mediaTotal: typeof gestorIdiomas !== 'undefined' ? gestorIdiomas.obtenerTexto('dashboard.mediaTotal') : 'Media Total',
        mediaMensualTotal: typeof gestorIdiomas !== 'undefined' ? gestorIdiomas.obtenerTexto('dashboard.mediaMensualTotal') : 'Media mensual total',
        cuentasRemuneradas: typeof gestorIdiomas !== 'undefined' ? gestorIdiomas.obtenerTexto('dashboard.cuentasRemuneradas') : 'Cuentas Remuneradas',
        cuentasRemuneradasNeto: typeof gestorIdiomas !== 'undefined' ? gestorIdiomas.obtenerTexto('dashboard.cuentasRemuneradasNeto') : 'Ctas. Rem. (neto)',
        retencionCR: typeof gestorIdiomas !== 'undefined' ? gestorIdiomas.obtenerTexto('dashboard.retencionCR') : 'Retención CR',
        impuestosIngresos: typeof gestorIdiomas !== 'undefined' ? gestorIdiomas.obtenerTexto('dashboard.impuestosIngresos') : 'Impuesto Renta',
        impuestosOtros: typeof gestorIdiomas !== 'undefined' ? gestorIdiomas.obtenerTexto('dashboard.impuestosOtros') : 'Impuesto Otros'
    };
    return textos;
}

    // ===== Actualizar dashboard =====
    async function actualizarDashboard() {

        const desde = document.getElementById('dashDesde').value;
        const hasta = document.getElementById('dashHasta').value;
        const uiPrefs = cargarPreferenciasDashboard();
        let catSel = filtroGastoCategoria ? filtroGastoCategoria.value : '';
        if (!catSel && uiPrefs?.categoriaGasto) {
            catSel = String(uiPrefs.categoriaGasto);
        }

        if (!desde || !hasta) {
            const mensaje = typeof gestorIdiomas !== 'undefined' ? gestorIdiomas.obtenerTexto('dashboard.seleccionaRango') : 'Por favor selecciona un rango de fechas';
            console.warn('⚠️ ' + mensaje);
            return;
        }

        // Control: hasta no puede ser menor que desde
        if (hasta < desde) {
            const mensajeError = typeof gestorIdiomas !== 'undefined' && gestorIdiomas 
                ? gestorIdiomas.obtenerTexto('dashboard.errorHastaMenorDesde')
                : 'La fecha "hasta" no puede ser menor que "desde"';
            console.warn('⚠️ ' + mensajeError);
            showAlert(mensajeError);
            return;
        }

        console.log(`📊 Actualizando dashboard de ${desde} a ${hasta}`);
        setDashboardLoadingState(true);

        try {
            // ⚡ Paralelizar todas las llamadas fetch para mayor velocidad
            const showReales = document.getElementById('dashboardToggleReal')?.checked;
            const rangoComparativo = obtenerRangoComparativo(desde, hasta);
            const [resTotales, resTotalesPrev, resCat, resDashboard, resGastoMes, resImpuestosMes, resAhorrosReal, resGastosMesReal] = await Promise.all([
                fetch(`${endpoints.ahorros}?desde=${desde}&hasta=${hasta}`),
                rangoComparativo
                    ? fetch(`${endpoints.ahorros}?desde=${rangoComparativo.desde}&hasta=${rangoComparativo.hasta}`)
                    : Promise.resolve(null),
                fetch(`${endpoints.categorias}?desde=${desde}&hasta=${hasta}`),
                fetch(endpoints.dashboard),
                fetch(`${endpoints.gastosMes}?desde=${desde}&hasta=${hasta}`),
                fetch(`${endpoints.impuestosMes}?desde=${desde}&hasta=${hasta}`),
                showReales ? fetch(`${realEndpoints.ahorros}?desde=${desde}&hasta=${hasta}`) : Promise.resolve(null),
                showReales ? fetch(`${realEndpoints.gastosMes}?desde=${desde}&hasta=${hasta}`) : Promise.resolve(null)
            ]);
            
            if (!resTotales.ok) {
                throw new Error(`Error ${resTotales.status}: ${resTotales.statusText}`);
            }
            
            // Parsear todas las respuestas en paralelo
            const [dataTotales, dataTotalesPrev, dataCat, dataDashboard, dataGastoMes, dataImpuestosMes, dataAhorrosReal, dataGastosMesReal] = await Promise.all([
                resTotales.json(),
                (resTotalesPrev && resTotalesPrev.ok) ? resTotalesPrev.json() : Promise.resolve([]),
                resCat.json(),
                resDashboard.json(),
                resGastoMes.json(),
                resImpuestosMes.json(),
                resAhorrosReal ? resAhorrosReal.json() : Promise.resolve(null),
                resGastosMesReal ? resGastosMesReal.json() : Promise.resolve(null)
            ]);
            
            if (!Array.isArray(dataTotales) || dataTotales.length === 0) {
                console.warn('⚠️ No hay datos para este período');
                actualizarResumenKpis({ desde, hasta });
                limpiarSparklinesKpi();
                return;
            }

            const resumenAnterior = crearResumenPeriodo(dataTotalesPrev);

            const totalIngresos = dataTotales.reduce((sum, m) => sum + (m.ingresos || 0), 0); // ingresos netos base
            const totalGastos = dataTotales.reduce((sum, m) => sum + (m.total_gastos ?? m.gastos ?? 0), 0);
            const totalCuentasRemuneradas = dataTotales.reduce((sum, m) => sum + (m.cuentas_remuneradas || 0), 0);
            const totalAhorros = dataTotales.reduce((sum, m) => sum + (m.ahorros || 0), 0);

            const meses = dataTotales.map(m => m.mes);
            const ingresosMes = dataTotales.map(m => m.ingresos || 0);
            const cuentasRemuneradasMes = dataTotales.map(m => m.cuentas_remuneradas || 0);
            const gastosMes = dataTotales.map(m => m.gastos || 0);
            const ahorrosMes = dataTotales.map(m => m.ahorros || 0);
            const retencionCRMes = dataTotales.map(m => m.retencion_cr || 0);
            const cuentasRemuneradasNetasMes = cuentasRemuneradasMes.map((cr, idx) => cr - retencionCRMes[idx]);
            const totalRetencionCR = retencionCRMes.reduce((sum, m) => sum + m, 0);
            const totalCuentasRemuneradasNetas = totalCuentasRemuneradas - totalRetencionCR;

            const ingresosRealesMes = Array.isArray(dataAhorrosReal) ? dataAhorrosReal.map(m => m.ingresos || 0) : [];
            const gastosRealesMes = Array.isArray(dataAhorrosReal) ? dataAhorrosReal.map(m => m.gastos || 0) : [];
            const ahorrosRealesMes = Array.isArray(dataAhorrosReal) ? dataAhorrosReal.map(m => m.ahorros || 0) : [];

            // Categorías (ya cargadas en paralelo)
            const catIngresos = Object.keys(dataCat.ingresos || {});
            const valIngresos = Object.values(dataCat.ingresos || {});
            const catGastos = Object.keys(dataCat.gastos || {});
            const valGastos = Object.values(dataCat.gastos || {});

            // Cuentas remuneradas (ya cargadas en paralelo)
            const cuentasRemuneradasPorCategoria = {};
            const cuentaRemunerada = Array.isArray(dataDashboard?.cuenta_remunerada) ? dataDashboard.cuenta_remunerada : [];
            cuentaRemunerada.forEach(cr => {
                const crDesde = new Date(cr.desde + "-28");
                const crHasta = cr.hasta ? new Date(cr.hasta + "-28") : new Date(9999,11,31);
                const desdeDate = new Date(desde);
                const hastaDate = new Date(hasta);
                
                // Calcular el solapamiento entre el período de la cuenta y el período seleccionado
                const overlapDesde = desdeDate > crDesde ? desdeDate : crDesde;
                const overlapHasta = hastaDate < crHasta ? hastaDate : crHasta;
                
                // Verificar si hay solapamiento con el período
                if (overlapDesde <= overlapHasta) {
                    const categoriaKey = cr.categoria;
                    // Calcular los días totales del período de la cuenta
                    const diasTotalCuenta = Math.max(1, Math.floor((crHasta - crDesde) / (1000 * 60 * 60 * 24)));
                    // Calcular los días de solapamiento
                    const diasSolapamiento = Math.max(1, Math.floor((overlapHasta - overlapDesde) / (1000 * 60 * 60 * 24)));
                    // Calcular los intereses proporcionales al período seleccionado
                    const interesProporcional = (cr.interes_generado || 0) * (diasSolapamiento / diasTotalCuenta);
                    
                    cuentasRemuneradasPorCategoria[categoriaKey] = (cuentasRemuneradasPorCategoria[categoriaKey] || 0) + interesProporcional;
                }
            });

            // Gastos por mes (ya cargados en paralelo)
            const labelsMeses = dashboardFeatures.simpleGastos ? meses : Object.keys(dataGastoMes).sort();
            let datasetsMesCat = [];

            if (filtroGastoCategoria) {
                const textoTodas = typeof gestorIdiomas !== 'undefined'
                    ? gestorIdiomas.obtenerTexto('dashboard.todasCategorias')
                    : 'Todas las categorías';
                const categoriasConDatos = new Set();

                labelsMeses.forEach((mes) => {
                    const mesData = dataGastoMes?.[mes] || {};
                    Object.entries(mesData).forEach(([categoria, valor]) => {
                        if (Number(valor) !== 0) {
                            categoriasConDatos.add(categoria);
                        }
                    });

                    if (showReales) {
                        const mesRealData = dataGastosMesReal?.[mes] || {};
                        Object.entries(mesRealData).forEach(([categoria, valor]) => {
                            if (Number(valor) !== 0) {
                                categoriasConDatos.add(categoria);
                            }
                        });
                    }
                });

                const categoriasOrdenadas = Array.from(categoriasConDatos).sort((a, b) => a.localeCompare(b));
                const categoriaSeleccionadaAnterior = catSel;
                filtroGastoCategoria.innerHTML = `<option value="">${textoTodas}</option>`;

                categoriasOrdenadas.forEach((categoria, idx) => {
                    const opt = document.createElement('option');
                    opt.value = categoria;
                    opt.textContent = categoria === 'taxes'
                        ? (typeof gestorIdiomas !== 'undefined' ? gestorIdiomas.obtenerTexto('dashboard.impuestosCategoria') : 'Impuestos')
                        : categoria;
                    filtroGastoCategoria.appendChild(opt);

                    if (categoria === 'taxes') {
                        coloresCategorias['taxes'] = temasGraficos.warning;
                    } else {
                        obtenerColorCategoria(categoria, idx);
                    }
                });

                if (categoriaSeleccionadaAnterior && categoriasConDatos.has(categoriaSeleccionadaAnterior)) {
                    filtroGastoCategoria.value = categoriaSeleccionadaAnterior;
                } else {
                    filtroGastoCategoria.value = '';
                }
                catSel = filtroGastoCategoria.value;
            }

            // Verificar si existe "taxes" en los datos y agregarlo al select si no está
            const tieneImpuestos = labelsMeses.some(m => dataGastoMes[m]['taxes']);
            if(tieneImpuestos) {
                const taxesOption = document.querySelector('option[value="taxes"]');
                if(!taxesOption) {
                    const opt = document.createElement('option');
                    opt.value = 'taxes';
                    const textoImpuestos = typeof gestorIdiomas !== 'undefined' ? gestorIdiomas.obtenerTexto('dashboard.impuestosCategoria') : 'Impuestos';
                    opt.textContent = textoImpuestos;
                    filtroGastoCategoria.appendChild(opt);
                    obtenerColorCategoria('taxes', coloresCategorias.size || 0);
                    coloresCategorias['taxes'] = temasGraficos.warning;
                }
            }

            if(catSel){ 
                const data = labelsMeses.map(m => dataGastoMes[m]?.[catSel] || 0);
                const labelCategoria = catSel === 'taxes'
                    ? (typeof gestorIdiomas !== 'undefined' ? gestorIdiomas.obtenerTexto('dashboard.impuestosCategoria') : 'Impuestos')
                    : catSel;
                datasetsMesCat.push({ 
                    label: labelCategoria, 
                    data, 
                    backgroundColor: aclararColor(coloresCategorias[catSel], 0.7),
                    borderColor: coloresCategorias[catSel],
                    borderWidth: 2,
                    borderRadius: 0,
                    tension: 0.4,
                    stack: showReales ? 'main' : undefined
                });
            }
            else {
                const categoriasSet = new Set();
                labelsMeses.forEach(m => {
                    if (dataGastoMes[m]) {
                        Object.keys(dataGastoMes[m]).forEach(c => categoriasSet.add(c));
                    }
                });
                Array.from(categoriasSet).forEach((c,i)=>{
                    const data = labelsMeses.map(m => dataGastoMes[m]?.[c] || 0);
                    let color = coloresCategorias[c];
                    if(!color) {
                        if(c === 'taxes') {
                            color = temasGraficos.warning;
                            coloresCategorias['taxes'] = color;
                        } else {
                            color = obtenerColorCategoria(c,i);
                        }
                    }
                    const labelCategoria = c === 'taxes'
                        ? (typeof gestorIdiomas !== 'undefined' ? gestorIdiomas.obtenerTexto('dashboard.impuestosCategoria') : 'Impuestos')
                        : c;
                    datasetsMesCat.push({ 
                        label: labelCategoria, 
                        data, 
                        backgroundColor: aclararColor(color, 0.7),
                        borderColor: color,
                        borderWidth: 2,
                        borderRadius: 0,
                        tension: 0.4,
                        stack: showReales ? 'main' : undefined
                    });
                });
            }

            if (showReales && catSel !== 'taxes') {
                const sufijoReal = typeof gestorIdiomas !== 'undefined'
                    ? gestorIdiomas.obtenerTexto('dashboard.realesSuffix')
                    : 'Real';

                if (catSel) {
                    const realData = labelsMeses.map(m => dataGastosMesReal?.[m]?.[catSel] || 0);
                    const color = coloresCategorias[catSel] || temasGraficos.primaryDark || '#475569';
                    const labelCategoria = `${catSel} (${sufijoReal})`;

                    datasetsMesCat.push({
                        label: labelCategoria,
                        data: realData,
                        backgroundColor: aclararColor(color, 0.45),
                        borderColor: color,
                        borderWidth: 2,
                        borderRadius: 0,
                        tension: 0.4,
                        stack: 'real'
                    });
                } else {
                    const categoriasRealSet = new Set();
                    labelsMeses.forEach(m => {
                        if (dataGastosMesReal?.[m]) {
                            Object.keys(dataGastosMesReal[m]).forEach(c => categoriasRealSet.add(c));
                        }
                    });

                    Array.from(categoriasRealSet).forEach((c, i) => {
                        if (c === 'taxes') return;
                        const data = labelsMeses.map(m => dataGastosMesReal?.[m]?.[c] || 0);
                        const color = coloresCategorias[c] || obtenerColorCategoria(c, i);
                        const labelCategoria = `${c} (${sufijoReal})`;

                        datasetsMesCat.push({
                            label: labelCategoria,
                            data,
                            backgroundColor: aclararColor(color, 0.45),
                            borderColor: color,
                            borderWidth: 2,
                            borderRadius: 0,
                            tension: 0.4,
                            stack: 'real'
                        });
                    });
                }
            }

            // Destruir gráficos previos
            Object.values(charts).forEach(chart => {
                if (chart) {
                    try {
                        chart.destroy();
                    } catch (e) {
                        console.warn('⚠️ Error destruyendo gráfico:', e);
                    }
                }
            });

            // Opciones comunes para todos los gráficos
            const css = getComputedStyle(document.documentElement);
            const chartTextColor = (css.getPropertyValue('--text-secondary') || '#475569').trim();
            const chartGridSoft = (css.getPropertyValue('--border-light') || '#e2e8f0').trim();

            const optComun = {
                responsive: true,
                maintainAspectRatio: true,
                elements: {
                    line: {
                        tension: 0.38,
                        borderWidth: 2.2
                    },
                    point: {
                        radius: 2,
                        hoverRadius: 4
                    }
                },
                plugins: {
                    legend: { 
                        display: true, 
                        position: 'bottom',
                        labels: {
                            color: chartTextColor,
                            font: { size: 11, weight: '600' },
                            padding: 11,
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.92)',
                        padding: 10,
                        titleFont: { size: 12, weight: '700' },
                        bodyFont: { size: 11 },
                        borderColor: 'rgba(148, 163, 184, 0.45)',
                        borderWidth: 1,
                        callbacks: {
                            label: function(ctx) {
                                return formatearEuro(ctx.raw);
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        ticks: { 
                            color: chartTextColor, 
                            font: { size: 11 },
                            callback: function(value) {
                                return formatearEuro(value);
                            }
                        },
                        grid: { color: chartGridSoft }
                    },
                    x: {
                        ticks: { color: chartTextColor, font: { size: 11 } },
                        grid: { color: 'rgba(148, 163, 184, 0.18)' }
                    }
                }
            };

            // ===== OBTENER IMPUESTOS POR MES (ya cargados en paralelo) =====
            const impuestosMes = (Array.isArray(dataImpuestosMes) ? dataImpuestosMes : []).map(m => m.impuestos || 0); 
            const totalImpuestosIngresos = impuestosMes.reduce((sum, m) => sum + m, 0);
            // Restar CR retention de impuestosIngresos donde se muestra por separado (evitar doble conteo)
            const totalImpuestosIngresosNoCR = Math.max(0, totalImpuestosIngresos - totalRetencionCR);
            const impuestosIngresosNetMes = impuestosMes.map((imp, idx) => Math.max(0, imp - retencionCRMes[idx]));
            
            // ===== OBTENER IMPUESTOS STANDALONE (de tablas impuestos_puntuales/mensuales) =====  
            const totalImpuestosStandalone = dashboardFeatures.simpleMode ? 0 : labelsMeses.reduce((sum, mes) => { 
                return sum + (dataGastoMes[mes]?.['taxes'] || 0);
            }, 0);

            const impuestosStandaloneMes = meses.map(mes => dataGastoMes?.[mes]?.['taxes'] || 0);
            const gastosConImpuestosMes = gastosMes.map((g, idx) => g + (impuestosStandaloneMes[idx] || 0));
            const ingresosBrutosMes = ingresosMes.map((ing, idx) => ing + (impuestosMes[idx] || 0));
            const ingresosTotalesMes = ingresosMes.map((ing, idx) => ing + (cuentasRemuneradasMes[idx] || 0) + (impuestosMes[idx] || 0));
            const ingresoNetoMes = ingresosTotalesMes.map((ingBruto, idx) => ingBruto - (impuestosMes[idx] || 0));
            const incomeBruto = totalIngresos + totalCuentasRemuneradas + totalImpuestosIngresos;
            const incomeNeto = incomeBruto - totalImpuestosIngresos;
            const totalGastosConImpuestos = totalGastos + totalImpuestosStandalone;
            const ratioAhorro = incomeBruto > 0 ? (totalAhorros / incomeBruto) * 100 : 0;

            guardarPreferenciasDashboard({
                categoriaGasto: catSel || '',
                mostrarReales: !!showReales
            });

            actualizarResumenKpis({
                totalIngresos: incomeBruto,
                totalGastosConImpuestos,
                totalAhorros,
                ingresoNeto: incomeNeto,
                ratioAhorro,
                desde,
                hasta,
                comparativa: {
                    totalIngresos: resumenAnterior.ingresosBrutos,
                    totalGastosConImpuestos: resumenAnterior.gastosConImpuestos,
                    totalAhorros: resumenAnterior.ahorros,
                    ingresoNeto: resumenAnterior.ingresoNeto,
                    ratioAhorro: resumenAnterior.ratioAhorro
                }
            });

            crearSparklineKpi('dashSparkIngresos', 'ingresos', ingresosTotalesMes);
            crearSparklineKpi('dashSparkGastos', 'gastos', gastosConImpuestosMes);
            crearSparklineKpi('dashSparkAhorros', 'ahorros', ahorrosMes);
            crearSparklineKpi('dashSparkNeto', 'neto', ingresoNetoMes);

            const labelsTraducidos = obtenerLabelsTraducidos();

            if (dashboardFeatures.simpleMode) {
                const mediaGastos = calcularMedia(gastosMes);
                const desvGastos = calcularDesviacion(gastosMes);
                const tituloGastos = `${labelsTraducidos.media}: ${formatearEuro(mediaGastos)}   |   ${labelsTraducidos.desviacion}: ${formatearEuro(desvGastos)}`;

                charts.gastosMes = new Chart(document.getElementById('chartGastosMes'), {
                    type: 'bar',
                    data: {
                        labels: meses,
                        datasets: [crearDataset(labelsTraducidos.gastos + ' €', gastosMes, temasGraficos.danger, false)]
                    },
                    options: crearOpcionesGrafico(optComun, tituloGastos, false)
                });
                window.chartsInstances.push(charts.gastosMes);
                return;
            }

            // ===== GRÁFICO INGRESOS (SERIES INGRESO) =====
            const tituloTotales = typeof gestorIdiomas !== 'undefined'
                ? gestorIdiomas.obtenerTexto('dashboard.totalIngresos')
                : 'Total Ingreso';
            const chartTotalesCanvas = document.getElementById('chartTotales');
            const chartTotalesCtx = chartTotalesCanvas?.getContext?.('2d');
            const crearGradienteTotales = (color, alphaTop, alphaBottom) => {
                if (!chartTotalesCtx || !chartTotalesCanvas) {
                    return aclararColor(color, alphaTop);
                }
                const h = chartTotalesCanvas.clientHeight || chartTotalesCanvas.height || 320;
                const gradient = chartTotalesCtx.createLinearGradient(0, 0, 0, h);
                gradient.addColorStop(0, aclararColor(color, alphaTop));
                gradient.addColorStop(1, aclararColor(color, alphaBottom));
                return gradient;
            };

            charts.totales = new Chart(document.getElementById('chartTotales'), {
                type: 'line',
                data: {
                    labels: meses,
                    datasets: [
                        {
                            label: labelsTraducidos.ingresos,
                            data: ingresosTotalesMes,
                            borderColor: temasGraficos.success,
                            backgroundColor: crearGradienteTotales(temasGraficos.success, 0.24, 0.03),
                            borderWidth: 2.2,
                            fill: true,
                            tension: 0.42,
                            cubicInterpolationMode: 'monotone',
                            pointRadius: 1.8,
                            pointHoverRadius: 5,
                            pointHitRadius: 12
                        },
                        {
                            label: labelsTraducidos.cuentasRemuneradasNeto,
                            data: cuentasRemuneradasNetasMes,
                            borderColor: temasGraficos.primary,
                            backgroundColor: crearGradienteTotales(temasGraficos.primary, 0.22, 0.03),
                            borderWidth: 2.1,
                            fill: true,
                            tension: 0.42,
                            cubicInterpolationMode: 'monotone',
                            pointRadius: 1.8,
                            pointHoverRadius: 5,
                            pointHitRadius: 12
                        },
                        {
                            label: labelsTraducidos.retencionCR,
                            data: retencionCRMes,
                            borderColor: '#9b59b6',
                            backgroundColor: 'rgba(155, 89, 182, 0.12)',
                            borderWidth: 2.1,
                            fill: false,
                            tension: 0.4,
                            cubicInterpolationMode: 'monotone',
                            pointRadius: 1.8,
                            pointHoverRadius: 4,
                            borderDash: [4, 3]
                        },
                        {
                            label: labelsTraducidos.impuestosIngresos,
                            data: impuestosIngresosNetMes,
                            borderColor: temasGraficos.warning,
                            backgroundColor: aclararColor(temasGraficos.warning, 0.12),
                            borderWidth: 2.1,
                            fill: false,
                            tension: 0.4,
                            cubicInterpolationMode: 'monotone',
                            pointRadius: 1.8,
                            pointHoverRadius: 4,
                            borderDash: [5, 4]
                        },
                        {
                            label: labelsTraducidos.ahorros,
                            data: ahorrosMes,
                            borderColor: temasGraficos.info,
                            backgroundColor: crearGradienteTotales(temasGraficos.info, 0.2, 0.03),
                            borderWidth: 2.2,
                            fill: true,
                            tension: 0.42,
                            cubicInterpolationMode: 'monotone',
                            pointRadius: 1.8,
                            pointHoverRadius: 5,
                            pointHitRadius: 12
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: {
                            display: false
                        },
                        legend: {
                            display: true,
                            position: 'top',
                            align: 'center',
                            labels: {
                                usePointStyle: true,
                                boxWidth: 8,
                                color: chartTextColor,
                                font: { size: 10, weight: '600' },
                                padding: 9
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(ctx) {
                                    return `${ctx.dataset.label}: ${formatearEuro(ctx.raw || 0)}`;
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            ticks: {
                                color: chartTextColor,
                                font: { size: 10 },
                                callback: function(value) {
                                    return formatearEuro(value);
                                }
                            },
                            grid: { color: chartGridSoft }
                        },
                        x: {
                            ticks: { color: chartTextColor, font: { size: 10 } },
                            grid: { color: 'rgba(148, 163, 184, 0.18)' }
                        }
                    }
                }
            });

            if (showReales) {
                const realColor = temasGraficos.primaryDark || '#475569';
                const labelIngresosRealesTop = typeof gestorIdiomas !== 'undefined'
                    ? gestorIdiomas.obtenerTexto('dashboard.ingresosReales')
                    : 'Ingresos Reales';
                charts.totales.data.datasets.push({
                    label: labelIngresosRealesTop,
                    data: ingresosRealesMes,
                    borderColor: realColor,
                    backgroundColor: aclararColor(realColor, 0.12),
                    borderWidth: 2,
                    fill: false,
                    tension: 0.36,
                    pointRadius: 1.8,
                    borderDash: [7, 4]
                });

                const labelAhorrosRealesTop = typeof gestorIdiomas !== 'undefined'
                    ? gestorIdiomas.obtenerTexto('dashboard.ahorrosReales')
                    : 'Ahorros Reales';
                charts.totales.data.datasets.push({
                    label: labelAhorrosRealesTop,
                    data: ahorrosRealesMes,
                    borderColor: temasGraficos.info,
                    backgroundColor: aclararColor(temasGraficos.info, 0.1),
                    borderWidth: 2,
                    fill: false,
                    tension: 0.36,
                    pointRadius: 1.8,
                    borderDash: [3, 3]
                });
                charts.totales.update();
            }

            window.chartsInstances.push(charts.totales);

            // ===== GRÁFICO PORCENTAJES BRUTO/NETO (CILINDROS VERTICALES) =====
            const porcentajeAhorroBruto = incomeBruto > 0 ? (totalAhorros / incomeBruto * 100) : 0;
            const porcentajeGastosBruto = incomeBruto > 0 ? (totalGastos / incomeBruto * 100) : 0;
            const porcentajeImpSalarioBruto = incomeBruto > 0 ? (totalImpuestosIngresosNoCR / incomeBruto * 100) : 0;
            const porcentajeRetencionCRBruto = incomeBruto > 0 ? (totalRetencionCR / incomeBruto * 100) : 0;
            const porcentajeImpOtrosBruto = incomeBruto > 0 ? (totalImpuestosStandalone / incomeBruto * 100) : 0;

            const porcentajeAhorroNeto = incomeNeto > 0 ? (totalAhorros / incomeNeto * 100) : 0;
            const porcentajeGastosNeto = incomeNeto > 0 ? (totalGastos / incomeNeto * 100) : 0;

            const labelIngresoBruto = typeof gestorIdiomas !== 'undefined' ? gestorIdiomas.obtenerTexto('dashboard.ingresoBruto') : 'Ingreso Bruto';
            const labelIngresoNeto = typeof gestorIdiomas !== 'undefined' ? gestorIdiomas.obtenerTexto('dashboard.ingresoNeto') : 'Ingresos Netos';
            const labelAhorro = typeof gestorIdiomas !== 'undefined' ? gestorIdiomas.obtenerTexto('dashboard.ahorros') : 'Ahorro';
            const labelGastos = typeof gestorIdiomas !== 'undefined' ? gestorIdiomas.obtenerTexto('dashboard.gastos') : 'Gastos';
            const labelImpRetenciones = typeof gestorIdiomas !== 'undefined' ? gestorIdiomas.obtenerTexto('dashboard.impuestosIngresos') : 'Impuesto Renta';
            const labelImpOtros = typeof gestorIdiomas !== 'undefined' ? gestorIdiomas.obtenerTexto('dashboard.impuestosOtros') : 'Impuesto Otros';
            const labelRetencionCR = typeof gestorIdiomas !== 'undefined' ? gestorIdiomas.obtenerTexto('dashboard.retencionCR') : 'Retención CR';
            const tituloPorcentajes = typeof gestorIdiomas !== 'undefined'
                ? gestorIdiomas.obtenerTexto('dashboard.porcentajes')
                : 'Análisis de Porcentajes';

            charts.porcentajes = renderCilindrosPorcentajes('chartPorcentajes', {
                title: tituloPorcentajes,
                columns: [
                    {
                        name: labelIngresoBruto,
                        segments: [
                            { label: labelGastos, value: porcentajeGastosBruto, color: temasGraficos.danger },
                            { label: labelImpRetenciones, value: porcentajeImpSalarioBruto, color: temasGraficos.warning },
                            { label: labelRetencionCR, value: porcentajeRetencionCRBruto, color: '#9b59b6' },
                            { label: labelImpOtros, value: porcentajeImpOtrosBruto, color: '#e7a33c' },
                            { label: labelAhorro, value: porcentajeAhorroBruto, color: temasGraficos.info }
                        ]
                    },
                    {
                        name: labelIngresoNeto,
                        segments: [
                            { label: labelGastos, value: porcentajeGastosNeto, color: temasGraficos.danger },
                            { label: labelAhorro, value: porcentajeAhorroNeto, color: temasGraficos.info }
                        ]
                    }
                ],
                legend: [
                    { label: labelAhorro, color: temasGraficos.info },
                    { label: labelGastos, color: temasGraficos.danger },
                    { label: labelImpRetenciones, color: temasGraficos.warning },
                    { label: labelRetencionCR, color: '#9b59b6' },
                    { label: labelImpOtros, color: '#e7a33c' }
                ]
            });




            // ===== LISTA INGRESOS POR CATEGORÍA (ESTILO HOME) =====
            // Combinar ingresos y cuentas remuneradas en el mismo reparto
            const todasLasCategoriasIngresos = new Set([...catIngresos, ...Object.keys(cuentasRemuneradasPorCategoria)]);
            const valIngresosTotal = Array.from(todasLasCategoriasIngresos).map(cat => {
                const ingresos = valIngresos.find((v,i) => catIngresos[i] === cat) || 0;
                const cuentasRem = cuentasRemuneradasPorCategoria[cat] || 0;
                return ingresos + cuentasRem;
            });
            const ingresosMap = {};
            Array.from(todasLasCategoriasIngresos).forEach((cat, i) => {
                ingresosMap[cat] = valIngresosTotal[i] || 0;
            });

            charts.ingresosCat = renderDashboardCategoriasLista(
                'chartIngresosCategoria',
                ingresosMap,
                Array.from(todasLasCategoriasIngresos).map((c, i) => obtenerColorCategoria(c, i))
            );
            window.chartsInstances.push(charts.ingresosCat);

            // ===== LISTA GASTOS POR CATEGORÍA (ESTILO HOME) =====
            const gastosRealesPorCategoria = {};
            if (showReales && dataGastosMesReal) {
                Object.values(dataGastosMesReal).forEach((mesData) => {
                    if (!mesData) return;
                    Object.entries(mesData).forEach(([cat, val]) => {
                        gastosRealesPorCategoria[cat] = (gastosRealesPorCategoria[cat] || 0) + (val || 0);
                    });
                });
            }

            const categoriasGastosSet = new Set([
                ...catGastos,
                ...Object.keys(gastosRealesPorCategoria)
            ]);
            const gastosLabels = Array.from(categoriasGastosSet);
            const gastosBudgetData = gastosLabels.map(cat => {
                const idx = catGastos.indexOf(cat);
                return idx >= 0 ? (valGastos[idx] || 0) : 0;
            });
            const gastosRealData = gastosLabels.map(cat => gastosRealesPorCategoria[cat] || 0);

            const labelGastosBudget = typeof gestorIdiomas !== 'undefined'
                ? gestorIdiomas.obtenerTexto('dashboard.gastos')
                : 'Gastos';
            const labelGastosReal = typeof gestorIdiomas !== 'undefined'
                ? gestorIdiomas.obtenerTexto('dashboard.gastosReales')
                : 'Gastos Reales';

            const gastosMap = {};
            gastosLabels.forEach((cat, idx) => {
                const budget = gastosBudgetData[idx] || 0;
                const real = gastosRealData[idx] || 0;
                gastosMap[cat] = showReales ? Math.max(budget, real) : budget;
            });

            charts.gastosCat = renderDashboardCategoriasLista(
                'chartGastosCategoria',
                gastosMap,
                gastosLabels.map((c, i) => obtenerColorCategoria(c, i))
            );
            window.chartsInstances.push(charts.gastosCat);


            // ===== GRÁFICO GASTOS POR MES Y CATEGORÍA =====

            // Calcular totales por mes (suma de categorías)
            const totalesMes = labelsMeses.map((mes, idx) => {
                return datasetsMesCat.reduce((sum, ds) => sum + (ds.data[idx] || 0), 0);
            });

            // Media y varianza sobre el total mensual
            const mediaGastosMes = calcularMedia(totalesMes);
            const varianzaGastosMes = calcularDesviacion(totalesMes);

            const tituloGastosMes = `${labelsTraducidos.mediaMensualTotal}: ${formatearEuro(mediaGastosMes)}   |   ${labelsTraducidos.desviacion}: ${formatearEuro(varianzaGastosMes)}`;
            const usarBarrasApiladas = true;
            const datasetsGastosGrafico = datasetsMesCat.map((ds) => ({
                ...ds,
                type: 'bar',
                tension: 0,
                pointRadius: 0,
                borderDash: [],
                borderSkipped: false,
                barPercentage: 0.82,
                categoryPercentage: 0.72,
                order: 2
            }));

            const textoTotalMes = typeof gestorIdiomas !== 'undefined'
                ? gestorIdiomas.obtenerTexto('dashboard.totalMes')
                : '';
            const labelTotalMesLinea = (textoTotalMes && textoTotalMes !== 'dashboard.totalMes')
                ? textoTotalMes
                : 'Total mes';
            datasetsGastosGrafico.push({
                label: labelTotalMesLinea,
                data: totalesMes,
                type: 'line',
                borderColor: '#0f172a',
                backgroundColor: 'rgba(15, 23, 42, 0)',
                borderWidth: 2.2,
                tension: 0.35,
                fill: false,
                pointRadius: 2,
                pointHoverRadius: 4,
                pointBackgroundColor: '#0f172a',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 1,
                order: 1,
                isOverlayTotalMes: true
            });
            const opcionesGastosMes = crearOpcionesGrafico(optComun, tituloGastosMes, usarBarrasApiladas, false);
            
            charts.gastosMes = new Chart(document.getElementById('chartGastosMes'), {
                type: 'bar',
                data: { 
                    labels: labelsMeses, 
                    datasets: datasetsGastosGrafico 
                },
                options: opcionesGastosMes
            });

charts.gastosMes.updateChartStats = function() {
    const totalesMesBis = labelsMeses.map((mes, idx) => {
        return this.data.datasets.reduce((sum, ds, dsIdx) => {
            if (!this.isDatasetVisible(dsIdx) || ds.isOverlayTotalMes) return sum;
            return sum + (ds.data[idx] || 0);
        }, 0);
    });
    
    const mediaGM = calcularMedia(totalesMesBis);
    const desvGM = calcularDesviacion(totalesMesBis);
    this.options.plugins.title.text = `${labelsTraducidos.mediaMensualTotal}: ${formatearEuro(mediaGM)}   |   ${labelsTraducidos.desviacion}: ${formatearEuro(desvGM)}`;
};

            console.log('✅ Dashboard actualizado correctamente');
            window.chartsInstances.push(charts.gastosMes);
        } catch (error) {
            console.error('❌ Error actualizando dashboard:', error);
            actualizarResumenKpis({ desde, hasta });
            limpiarSparklinesKpi();
        } finally {
            setDashboardLoadingState(false);
        }
    }
    
    // ===== INICIALIZACIÓN =====
    const unAnioAtras = new Date(hoy.getFullYear()-1, hoy.getMonth(), hoy.getDate());

    const rangoGuardado = cargarRangoSeleccionado();
    const uiPrefs = cargarPreferenciasDashboard();
    if (rangoGuardado?.desde && rangoGuardado?.hasta) {
        document.getElementById('dashDesde').value = rangoGuardado.desde;
        document.getElementById('dashHasta').value = rangoGuardado.hasta;
    } else {
        document.getElementById('dashDesde').value = '';
        document.getElementById('dashHasta').value = '';
    }

    const dashboardToggleReal = document.getElementById('dashboardToggleReal');
    if (dashboardToggleReal) {
        dashboardToggleReal.checked = !!uiPrefs?.mostrarReales;
    }

    initDateRangeSlider();

    console.log('📅 Fechas iniciales:', {
        desde: document.getElementById('dashDesde').value || unAnioAtras.toISOString().slice(0,10),
        hasta: document.getElementById('dashHasta').value || hoy.toISOString().slice(0,10)
    });

    actualizarQuickPeriodActivos();

    // ===== ACTUALIZAR SOLO GRÁFICO DE GASTOS POR CATEGORÍA =====
    async function actualizarGraficoGastosMes() {
        const desde = document.getElementById('dashDesde').value;
        const hasta = document.getElementById('dashHasta').value;
        const catSel = filtroGastoCategoria.value;
        const showReales = document.getElementById('dashboardToggleReal')?.checked;

        if (!desde || !hasta) return;

        try {
            // Obtener labels traducidos
            const labelsTraducidos = obtenerLabelsTraducidos();
            
            // Obtener gastos por mes y categoría
            const resGastoMes = await fetch(`/gastos-categoria-mes?desde=${desde}&hasta=${hasta}`);
            const resGastoMesReal = showReales
                ? await fetch(`${realEndpoints.gastosMes}?desde=${desde}&hasta=${hasta}`)
                : null;
            const dataGastoMes = await resGastoMes.json();
            const dataGastoMesReal = resGastoMesReal ? await resGastoMesReal.json() : null;

            const labelsMeses = Object.keys(dataGastoMes).sort();
            let datasetsMesCat = [];

            if(catSel){ 
                const data = labelsMeses.map(m => dataGastoMes[m]?.[catSel] || 0);
                datasetsMesCat.push({ 
                    label: catSel === 'taxes'
                        ? (typeof gestorIdiomas !== 'undefined' ? gestorIdiomas.obtenerTexto('dashboard.impuestosCategoria') : 'Impuestos')
                        : catSel, 
                    data, 
                    backgroundColor: aclararColor(coloresCategorias[catSel], 0.7),
                    borderColor: coloresCategorias[catSel],
                    borderWidth: 2,
                    borderRadius: 0,
                    tension: 0.4,
                    stack: showReales ? 'main' : undefined
                });
            }
            else {
                const categoriasSet = new Set();
                labelsMeses.forEach(m => {
                    if (dataGastoMes[m]) {
                        Object.keys(dataGastoMes[m]).forEach(c => categoriasSet.add(c));
                    }
                });
                Array.from(categoriasSet).forEach((c,i)=>{
                    const data = labelsMeses.map(m => dataGastoMes[m]?.[c] || 0);
                    let color = coloresCategorias[c];
                    if(!color) {
                        if(c === 'taxes') {
                            color = temasGraficos.warning;
                            coloresCategorias['taxes'] = color;
                        } else {
                            color = obtenerColorCategoria(c,i);
                        }
                    }
                    const labelCategoria = c === 'taxes'
                        ? (typeof gestorIdiomas !== 'undefined' ? gestorIdiomas.obtenerTexto('dashboard.impuestosCategoria') : 'Impuestos')
                        : c;
                    datasetsMesCat.push({ 
                        label: labelCategoria, 
                        data, 
                        backgroundColor: aclararColor(color, 0.7),
                        borderColor: color,
                        borderWidth: 2,
                        borderRadius: 0,
                        tension: 0.4,
                        stack: showReales ? 'main' : undefined
                    });
                });
            }

            if (showReales && catSel !== 'taxes') {
                const sufijoReal = typeof gestorIdiomas !== 'undefined'
                    ? gestorIdiomas.obtenerTexto('dashboard.realesSuffix')
                    : 'Real';

                if (catSel) {
                    const realData = labelsMeses.map(m => dataGastoMesReal?.[m]?.[catSel] || 0);
                    const color = coloresCategorias[catSel] || temasGraficos.primaryDark || '#475569';
                    const labelCategoria = `${catSel} (${sufijoReal})`;

                    datasetsMesCat.push({
                        label: labelCategoria,
                        data: realData,
                        backgroundColor: aclararColor(color, 0.45),
                        borderColor: color,
                        borderWidth: 2,
                        borderRadius: 0,
                        tension: 0.4,
                        stack: 'real'
                    });
                } else {
                    const categoriasRealSet = new Set();
                    labelsMeses.forEach(m => {
                        if (dataGastoMesReal?.[m]) {
                            Object.keys(dataGastoMesReal[m]).forEach(c => categoriasRealSet.add(c));
                        }
                    });

                    Array.from(categoriasRealSet).forEach((c, i) => {
                        if (c === 'taxes') return;
                        const data = labelsMeses.map(m => dataGastoMesReal?.[m]?.[c] || 0);
                        const color = coloresCategorias[c] || obtenerColorCategoria(c, i);
                        const labelCategoria = `${c} (${sufijoReal})`;

                        datasetsMesCat.push({
                            label: labelCategoria,
                            data,
                            backgroundColor: aclararColor(color, 0.45),
                            borderColor: color,
                            borderWidth: 2,
                            borderRadius: 0,
                            tension: 0.4,
                            stack: 'real'
                        });
                    });
                }
            }

            // Destruir gráfico anterior
            if(charts.gastosMes) {
                try {
                    charts.gastosMes.destroy();
                } catch (e) {
                    console.warn('⚠️ Error destruyendo gráfico:', e);
                }
            }

            // Calcular totales por mes y media
            const totalesMes = labelsMeses.map((mes, idx) => {
                return datasetsMesCat.reduce((sum, ds) => sum + (ds.data[idx] || 0), 0);
            });
            const mediaGastosMes = calcularMedia(totalesMes);
            const varianzaGastosMes = calcularDesviacion(totalesMes);
            const usarBarrasApiladas = true;
            const datasetsGastosGrafico = datasetsMesCat.map((ds) => ({
                ...ds,
                type: 'bar',
                tension: 0,
                pointRadius: 0,
                borderDash: [],
                borderSkipped: false,
                barPercentage: 0.82,
                categoryPercentage: 0.72,
                order: 2
            }));

            const textoTotalMes = typeof gestorIdiomas !== 'undefined'
                ? gestorIdiomas.obtenerTexto('dashboard.totalMes')
                : '';
            const labelTotalMesLinea = (textoTotalMes && textoTotalMes !== 'dashboard.totalMes')
                ? textoTotalMes
                : 'Total mes';
            datasetsGastosGrafico.push({
                label: labelTotalMesLinea,
                data: totalesMes,
                type: 'line',
                borderColor: '#0f172a',
                backgroundColor: 'rgba(15, 23, 42, 0)',
                borderWidth: 2.2,
                tension: 0.35,
                fill: false,
                pointRadius: 2,
                pointHoverRadius: 4,
                pointBackgroundColor: '#0f172a',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 1,
                order: 1,
                isOverlayTotalMes: true
            });

            // Recrear gráfico
            charts.gastosMes = new Chart(document.getElementById('chartGastosMes'), {
                type: 'bar',
                data:{ 
                    labels: labelsMeses, 
                    datasets: datasetsGastosGrafico 
                },
                options:{ 
                    responsive: true,
                    maintainAspectRatio: true,
                    scales: {
                        x: { stacked: usarBarrasApiladas },
                        y: { stacked: usarBarrasApiladas }
                    },
                    plugins: {
                        legend: { 
                            display: true, 
                            position: 'bottom',
                            labels: {
                                color: '#333',
                                font: { size: 12, weight: '600' },
                                padding: 15,
                                usePointStyle: true
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            padding: 12,
                            titleFont: { size: 13, weight: 'bold' },
                            bodyFont: { size: 12 },
                            borderColor: 'rgba(255, 255, 255, 0.3)',
                            borderWidth: 1,
                            callbacks: {
                                label: function(ctx) {
                                    return formatearEuro(ctx.raw);
                                }
                            }
                        },
                        title: {
                            display: true,
                            text: `${labelsTraducidos.mediaMensualTotal}: ${formatearEuro(mediaGastosMes)}   |   ${labelsTraducidos.desviacion}: ${formatearEuro(varianzaGastosMes)}`,
                            font: { size: 13, weight: '600' },
                            padding: { top: 5, bottom: 10 }
                        }
                    }
                }
            });

            console.log('✅ Gráfico de gastos actualizado');
            window.chartsInstances.push(charts.gastosMes);
        } catch (error) {
            console.error('❌ Error actualizando gráfico de gastos:', error);
        }
    }

    // Cargar inicial - con pequeño delay para asegurar que el DOM esté listo
    console.log('⏳ Iniciando carga del dashboard...');
    setTimeout(() => {
        cargarCategorias().then(() => {
            actualizarDashboard();
        });
    }, 50);
    
    // Configurar listeners después de que el HTML esté disponible
    setupDateListeners();
    setupQuickPeriodListener();



}
    
