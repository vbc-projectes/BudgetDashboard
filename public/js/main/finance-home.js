// ===== CACHE DE PRECIOS DE ACTIVOS =====
const assetPriceCache = {};
const ASSET_CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

async function getAssetPrice(ticker) {
    const normalizedTicker = String(ticker || '').trim().toUpperCase();
    if (!normalizedTicker) return null;

    const now = Date.now();
    if (assetPriceCache[normalizedTicker] && (now - assetPriceCache[normalizedTicker].timestamp) < ASSET_CACHE_DURATION) {
        return assetPriceCache[normalizedTicker].price;
    }
    
    try {
        const res = await fetch(`/asset-price/${encodeURIComponent(normalizedTicker)}`);
        if (res.ok) {
            const data = await res.json();
            const parsedPrice = Number(data?.currentPrice);
            const price = Number.isFinite(parsedPrice) ? parsedPrice : null;
            assetPriceCache[normalizedTicker] = {
                price,
                timestamp: now
            };
            return price;
        }
    } catch (e) {
        console.error(`Error obteniendo precio para ${normalizedTicker}:`, e);
    }
    return null;
}

// ===== CONFIGURACIÓN DE MONEDA (extensible a futuro) =====
const BASE_CURRENCY = 'EUR';
const currencyOptions = {
    EUR: { code: 'EUR', symbol: '€', locale: 'es-ES' },
    USD: { code: 'USD', symbol: '$', locale: 'en-US' }
};

let currentCurrency = localStorage.getItem('currency') || 'EUR';
let fxState = {
    base: BASE_CURRENCY,
    rates: { [BASE_CURRENCY]: 1 },
    lastUpdated: 0
};

async function ensureFxRates(base = BASE_CURRENCY) {
    const ONE_HOUR = 60 * 60 * 1000;
    if (fxState.base === base && Date.now() - fxState.lastUpdated < ONE_HOUR && fxState.rates) {
        return fxState.rates;
    }
    try {
        const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${base}`);
        const data = await res.json();
        if (data && data.rates) {
            fxState = { base, rates: data.rates, lastUpdated: Date.now() };
            return fxState.rates;
        }
    } catch (err) {
        console.warn('⚠️ No se pudieron obtener tasas FX, usando caché previa', err.message);
    }
    return fxState.rates;
}

function convertAmount(amount) {
    const numeric = parseFloat(amount || 0);
    if (!isFinite(numeric)) return 0;
    const rate = fxState.rates?.[currentCurrency] || 1;
    return numeric * rate;
}

function formatCurrency(amount, { convert = false } = {}) {
    const cfg = currencyOptions[currentCurrency] || currencyOptions[BASE_CURRENCY];
    const baseValue = parseFloat(amount || 0);
    const value = convert ? convertAmount(baseValue) : baseValue;
    try {
        return new Intl.NumberFormat(cfg.locale, { style: 'currency', currency: cfg.code }).format(isFinite(value) ? value : 0);
    } catch (_) {
        // Fallback simple en caso de fallo de Intl
        return `${cfg.symbol}${(isFinite(value) ? value : 0).toFixed(2)}`;
    }
}

window.formatCurrency = formatCurrency;
window.getSelectedCurrency = () => currentCurrency;
window.convertAmount = convertAmount;

async function setCurrency(code, { silent = false } = {}) {
    if (!currencyOptions[code]) return;
    currentCurrency = code;
    localStorage.setItem('currency', code);
    await ensureFxRates(BASE_CURRENCY);
    if (!silent) {
        await cargarResumenPeriodos();
        const tabActiva = document.querySelector('.tablink.active');
        if (tabActiva) {
            loadTab(tabActiva.dataset.tab);
        }
    }
    console.log(`💱 Moneda activa: ${code}`);
}

let inicioEvolucionChart = null;

// ===== CACHE DE PORTFOLIO =====
const PORTFOLIO_CACHE_TTL = 20 * 60 * 1000; // 20 minutos
let portfolioResultCache = null;

function getPeriodLabel(periodo) {
    const labels = {
        '1mes': { key: 'periodos.label_mes_actual', fallback: 'Mes actual' },
        '3meses': { key: 'periodos.label_ultimos_3_meses', fallback: 'Últimos 3 meses' },
        '6meses': { key: 'periodos.label_ultimos_6_meses', fallback: 'Últimos 6 meses' },
        '1año': { key: 'periodos.label_ultimos_12_meses', fallback: 'Últimos 12 meses' },
        '5años': { key: 'periodos.label_ultimos_5_anios', fallback: 'Últimos 5 años' },
        '10años': { key: 'periodos.label_ultimos_10_anios', fallback: 'Últimos 10 años' },
        'proximo1mes': { key: 'periodos.label_proximo_mes', fallback: 'Próximo mes' },
        'proximos3meses': { key: 'periodos.label_proximos_3_meses', fallback: 'Próximos 3 meses' },
        'proximos6meses': { key: 'periodos.label_proximos_6_meses', fallback: 'Próximos 6 meses' }
    };
    const selected = labels[periodo] || { key: 'periodos.label_periodo_seleccionado', fallback: 'Período seleccionado' };
    if (typeof gestorIdiomas !== 'undefined') {
        return gestorIdiomas.obtenerTexto(selected.key);
    }
    return selected.fallback;
}

function getMonthCountForPeriod(periodo) {
    const monthsByPeriod = {
        '1mes': 1,
        '3meses': 3,
        '6meses': 6,
        '1año': 12,
        '5años': 60,
        '10años': 120,
        'proximo1mes': 1,
        'proximos3meses': 3,
        'proximos6meses': 6
    };
    return monthsByPeriod[periodo] || 1;
}

function clipPeriodMonths(data, monthCount) {
    return (Array.isArray(data) ? data : [])
        .filter((m) => m && m.mes)
        .sort((a, b) => String(a.mes).localeCompare(String(b.mes)))
        .slice(-monthCount);
}

function getInicioDateRange(periodo) {
    const now = new Date();
    const monthCount = getMonthCountForPeriod(periodo);
    const isFuture = ['proximo1mes', 'proximos3meses', 'proximos6meses'].includes(periodo);

    // Período actual o futuro en meses completos
    const desdeDate = isFuture
        ? new Date(now.getFullYear(), now.getMonth() + 1, 1)
        : new Date(now.getFullYear(), now.getMonth() - (monthCount - 1), 1);
    const hastaDate = isFuture
        ? new Date(now.getFullYear(), now.getMonth() + monthCount + 1, 0)
        : new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Formato local YYYY-MM-DD para evitar desfases por zona horaria de toISOString()
    const toISODate = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    // Período anterior: misma cantidad de meses completos
    const prevHastaDate = new Date(desdeDate.getFullYear(), desdeDate.getMonth(), 0);
    const prevDesdeDate = new Date(desdeDate.getFullYear(), desdeDate.getMonth() - monthCount, 1);

    return {
        desde: toISODate(desdeDate),
        hasta: toISODate(hastaDate),
        prevDesde: toISODate(prevDesdeDate),
        prevHasta: toISODate(prevHastaDate)
    };
}

function getReferenceMonthForPeriod(periodo) {
    const { hasta } = getInicioDateRange(periodo);
    return String(hasta || '').slice(0, 7);
}

async function getStatsForPeriodo(periodo) {
    if (resumenData && resumenData[periodo]) {
        const stats = resumenData[periodo];
        return {
            ingresos: Number(stats?.total_ingreso ?? stats?.ingresos ?? 0),
            gastos: Number(stats?.total_gastos ?? stats?.gastos ?? 0),
            ahorro: Number(stats?.ahorro ?? 0),
            impuestos: Number((stats?.impuesto_renta ?? 0) + (stats?.impuesto_otros ?? 0) || stats?.impuestos || 0)
        };
    }

    const { desde, hasta } = getInicioDateRange(periodo);
    const res = await fetch(`/ahorros-mes?desde=${desde}&hasta=${hasta}`);
    if (!res.ok) return null;

    const rows = await res.json();
    const sumField = (arr, field) => (Array.isArray(arr) ? arr : []).reduce((acc, item) => acc + (Number(item?.[field]) || 0), 0);

    const ingresos = sumField(rows, 'total_ingreso') || (sumField(rows, 'ingresos') + sumField(rows, 'impuestos_ingresos') + sumField(rows, 'cuentas_remuneradas'));
    const gastos = sumField(rows, 'total_gastos') || sumField(rows, 'gastos');
    const ahorro = sumField(rows, 'ahorros');
    const impuestos = (sumField(rows, 'impuesto_renta') + sumField(rows, 'impuesto_otros')) || (sumField(rows, 'impuestos_otros') + sumField(rows, 'impuestos_ingresos'));

    return { ingresos, gastos, ahorro, impuestos };
}

function renderInicioCategorias(gastosPorCategoria = {}) {
    const container = document.getElementById('inicioCategoriasList');
    if (!container) return;

    const entries = Object.entries(gastosPorCategoria)
        .map(([categoria, total]) => ({ categoria, total: Number(total) || 0 }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 6);

    const total = entries.reduce((acc, item) => acc + item.total, 0);
    if (entries.length === 0 || total <= 0) {
        const emptyText = typeof gestorIdiomas !== 'undefined'
            ? gestorIdiomas.obtenerTexto('inicio.sinDatosPeriodo')
            : 'Sin datos para este período';
        container.innerHTML = `<p class="inicio-empty">${emptyText}</p>`;
        return;
    }

    const palette = ['#4f8ef7', '#3fcf77', '#f472b6', '#fbbf24', '#a78bfa', '#9ca3af'];
    container.innerHTML = entries.map((item, idx) => {
        const percentage = (item.total / total) * 100;
        return `
            <div class="inicio-categoria-row">
                <span class="inicio-categoria-name">${item.categoria}</span>
                <div class="inicio-categoria-bar-wrap">
                    <div class="inicio-categoria-bar" style="width:${Math.max(4, percentage)}%; background:${palette[idx % palette.length]};"></div>
                </div>
                <span class="inicio-categoria-pct">${percentage.toFixed(0)}%</span>
            </div>
        `;
    }).join('');
}

function renderInicioEvolucion(ahorrosMes = [], ahorrosPrev = []) {
    const canvas = document.getElementById('inicioEvolucionChart');
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const css = getComputedStyle(document.documentElement);
    const successColor = (css.getPropertyValue('--success') || '#22c55e').trim();
    const dangerColor = (css.getPropertyValue('--danger') || '#ef4444').trim();
    const primaryColor = (css.getPropertyValue('--primary') || '#3b82f6').trim();
    const textColor = (css.getPropertyValue('--text-secondary') || '#4b5563').trim();
    const borderLight = (css.getPropertyValue('--border-light') || '#e5e7eb').trim();

    const hexToRgba = (hex, alpha) => {
        const clean = String(hex || '').replace('#', '').trim();
        if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
            return `rgba(59,130,246,${alpha})`;
        }
        const r = parseInt(clean.slice(0, 2), 16);
        const g = parseInt(clean.slice(2, 4), 16);
        const b = parseInt(clean.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    const monthCount = getMonthCountForPeriod(periodoActual);

    const formatMesLabel = (mes) => {
        if (!mes || typeof mes !== 'string') return '';
        const [year, month] = mes.split('-');
        return `${month}/${String(year).slice(2)}`;
    };

    // Incluir período actual + período de comparación (anterior equivalente)
    const currentClipped = clipPeriodMonths(ahorrosMes, monthCount);
    const prevClipped = clipPeriodMonths(ahorrosPrev, monthCount);
    const puntos = [...prevClipped, ...currentClipped]
        .sort((a, b) => String(a.mes).localeCompare(String(b.mes)))
        .slice(-(monthCount * 2));

    const labels = puntos.map((m) => formatMesLabel(m.mes));
    const ingresos = puntos.map((m) => Number(m.total_ingreso) || ((Number(m.ingresos) || 0) + (Number(m.impuestos_ingresos) || 0) + (Number(m.cuentas_remuneradas) || 0)));
    const gastos = puntos.map((m) => Number(m.total_gastos) || (Number(m.gastos) || 0));
    const ahorros = puntos.map((m) => Number(m.ahorros) || 0);

    const makeGradient = (color, alphaTop, alphaBottom) => {
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height || 220);
        gradient.addColorStop(0, hexToRgba(color, alphaTop));
        gradient.addColorStop(1, hexToRgba(color, alphaBottom));
        return gradient;
    };

    const ingresosGradient = makeGradient(successColor, 0.35, 0.03);
    const gastosGradient = makeGradient(dangerColor, 0.33, 0.03);
    const ahorrosGradient = makeGradient(primaryColor, 0.3, 0.03);

    if (inicioEvolucionChart) {
        try { inicioEvolucionChart.destroy(); } catch (_) {}
        inicioEvolucionChart = null;
    }

    inicioEvolucionChart = new Chart(canvas, {
        type: 'line',
        devicePixelRatio: Math.max(1, window.devicePixelRatio || 1),
        data: {
            labels,
            datasets: [
                {
                    label: (typeof gestorIdiomas !== 'undefined') ? gestorIdiomas.obtenerTexto('inicio.graficoIngresosBrutos') : 'Ingresos brutos',
                    data: ingresos,
                    borderColor: successColor,
                    backgroundColor: ingresosGradient,
                    pointBackgroundColor: successColor,
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 1,
                    tension: 0.38,
                    borderWidth: 2.4,
                    pointRadius: 2.2,
                    pointHoverRadius: 4,
                    fill: true
                },
                {
                    label: (typeof gestorIdiomas !== 'undefined') ? gestorIdiomas.obtenerTexto('dashboard.gastos') : 'Gastos',
                    data: gastos,
                    borderColor: dangerColor,
                    backgroundColor: gastosGradient,
                    pointBackgroundColor: dangerColor,
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 1,
                    tension: 0.38,
                    borderWidth: 2.4,
                    pointRadius: 2.2,
                    pointHoverRadius: 4,
                    fill: true
                },
                {
                    label: (typeof gestorIdiomas !== 'undefined') ? gestorIdiomas.obtenerTexto('dashboard.ahorros') : 'Ahorros',
                    data: ahorros,
                    borderColor: primaryColor,
                    backgroundColor: ahorrosGradient,
                    pointBackgroundColor: primaryColor,
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 1,
                    tension: 0.38,
                    borderWidth: 2.4,
                    borderDash: [5, 4],
                    pointRadius: 2.2,
                    pointHoverRadius: 4,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    borderColor: 'rgba(148, 163, 184, 0.45)',
                    borderWidth: 1,
                    padding: 10,
                    titleFont: { size: 12, weight: '700' },
                    bodyFont: { size: 12 },
                    callbacks: {
                        label: function(ctxItem) {
                            return `${ctxItem.dataset.label}: ${formatearEuro(ctxItem.raw || 0)}`;
                        }
                    }
                },
                legend: {
                    position: 'top',
                    labels: {
                        boxWidth: 10,
                        boxHeight: 10,
                        usePointStyle: true,
                        color: textColor,
                        font: {
                            size: 11,
                            weight: '600',
                            family: 'Segoe UI, system-ui, sans-serif'
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: hexToRgba(primaryColor, 0.08) },
                    ticks: {
                        color: textColor,
                        font: { size: 11, weight: '600', family: 'Segoe UI, system-ui, sans-serif' }
                    }
                },
                y: {
                    grid: { color: hexToRgba(primaryColor, 0.12) },
                    ticks: {
                        color: textColor,
                        font: { size: 11, family: 'Segoe UI, system-ui, sans-serif' },
                        callback: function(value) {
                            return formatearEuro(value);
                        }
                    }
                }
            }
        }
    });
}

function renderInicioDeltas(currentMes, prevMes) {
    const sumField = (arr, field) => (Array.isArray(arr) ? arr : []).reduce((acc, m) => acc + (Number(m[field]) || 0), 0);

    const cur = {
        ingresos: sumField(currentMes, 'total_ingreso') || (sumField(currentMes, 'ingresos') + sumField(currentMes, 'impuestos_ingresos') + sumField(currentMes, 'cuentas_remuneradas')),
        gastos: sumField(currentMes, 'total_gastos') || sumField(currentMes, 'gastos'),
        ahorro: sumField(currentMes, 'ahorros'),
        impuestos: (sumField(currentMes, 'impuesto_renta') + sumField(currentMes, 'impuesto_otros')) || (sumField(currentMes, 'impuestos_otros') + sumField(currentMes, 'impuestos_ingresos'))
    };
    const prev = {
        ingresos: sumField(prevMes, 'total_ingreso') || (sumField(prevMes, 'ingresos') + sumField(prevMes, 'impuestos_ingresos') + sumField(prevMes, 'cuentas_remuneradas')),
        gastos: sumField(prevMes, 'total_gastos') || sumField(prevMes, 'gastos'),
        ahorro: sumField(prevMes, 'ahorros'),
        impuestos: (sumField(prevMes, 'impuesto_renta') + sumField(prevMes, 'impuesto_otros')) || (sumField(prevMes, 'impuestos_otros') + sumField(prevMes, 'impuestos_ingresos'))
    };

    const label = getPeriodLabel(periodoActual);

    const deltaBadge = (cur, prev) => {
        const variation = cur - prev;
        const sign = variation >= 0 ? '+' : '-';
        const cls = variation >= 0 ? 'pos' : 'neg';
        const amount = formatearEuro(Math.abs(variation));

        if (prev === 0) {
            return `<span class="inicio-delta ${cls}">${sign}${amount}</span>`;
        }

        const pct = ((cur / prev) - 1) * 100;
        return `<span class="inicio-delta ${cls}">${sign}${amount} (${sign}${Math.abs(pct).toFixed(1)}%)</span>`;
    };

    const setNote = (id, label, badge) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = badge ? `${label} ${badge}` : label;
    };

    setNote('inicio-note-saldo', label, deltaBadge(cur.ahorro, prev.ahorro));
    setNote('inicio-note-ingresos', label, deltaBadge(cur.ingresos, prev.ingresos));
    setNote('inicio-note-gastos', label, deltaBadge(cur.gastos, prev.gastos));
    setNote('inicio-note-taxes', label, deltaBadge(cur.impuestos, prev.impuestos));
}

function renderInicioProximosGastos(gastosPuntuales, desde, hasta) {
    const section   = document.getElementById('inicio-proximos-section');
    const titleEl   = document.getElementById('inicio-proximos-title');
    const subtitleEl = document.getElementById('inicio-proximos-subtitle');
    const listEl    = document.getElementById('inicio-proximos-list');
    const totalEl   = document.getElementById('inicio-proximos-total');
    if (!section || !listEl) return;

    const isFuture = ['proximo1mes', 'proximos3meses', 'proximos6meses'].includes(periodoActual);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const desdeDate = desde ? new Date(desde + 'T00:00:00') : null;
    const hastaDate = hasta ? new Date(hasta + 'T23:59:59') : null;

    const filtered = (gastosPuntuales || [])
        .filter(g => {
            if (!g.fecha) return false;
            const d = new Date(g.fecha + 'T00:00:00');
            return (!desdeDate || d >= desdeDate) && (!hastaDate || d <= hastaDate);
        })
        .map(g => ({ ...g, _date: new Date(g.fecha + 'T00:00:00') }))
        .sort((a, b) => isFuture ? a._date - b._date : b._date - a._date);

    const MAX_ITEMS = 15;
    const shown = filtered.slice(0, MAX_ITEMS);
    const remaining = filtered.length - shown.length;
    const allTotal = filtered.reduce((s, g) => s + (g.monto || 0), 0);
    const shownTotal = shown.reduce((s, g) => s + (g.monto || 0), 0);

    if (titleEl) {
        titleEl.innerHTML = isFuture
            ? '<i class="fas fa-clock"></i> Próximos gastos'
            : '<i class="fas fa-calendar-day"></i> Gastos del período';
    }
    if (subtitleEl) subtitleEl.textContent = getPeriodLabel(periodoActual);
    if (totalEl) totalEl.textContent = filtered.length > 0 ? formatearEuro(allTotal) : '';

    if (filtered.length === 0) {
        listEl.innerHTML = `
            <div class="inicio-prox-empty">
                <i class="fas fa-check-circle"></i>
                Sin gastos puntuales para este período
            </div>`;
        return;
    }

    const escH = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    listEl.innerHTML = shown.map(g => {
        const diffDays = Math.round((g._date - today) / (1000 * 60 * 60 * 24));
        const dateLabel = g._date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
        const dateLabelShort = g._date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });

        let badgeHtml = '';
        let rowClass = '';
        if (isFuture) {
            const urgency = diffDays <= 3 ? 'urgent' : diffDays <= 7 ? 'soon' : '';
            const badgeText = diffDays === 0 ? 'Hoy'
                : diffDays === 1 ? 'Mañana'
                : diffDays < 0  ? 'Vencido'
                : `${diffDays}d`;
            badgeHtml = `<span class="gcal-proximo-badge ${urgency}">${badgeText}</span>`;
            rowClass = urgency;
        } else {
            badgeHtml = `<span class="gcal-proximo-badge">${dateLabel}</span>`;
        }

        return `<div class="gcal-proximo-item ${rowClass}">
            <span class="gcal-proximo-date">${isFuture ? dateLabel : dateLabelShort}</span>
            ${badgeHtml}
            <span class="gcal-proximo-desc">${escH(g.descripcion)}</span>
            ${g.categoria ? `<span class="gcal-proximo-cat">${escH(g.categoria)}</span>` : ''}
            <span class="gcal-proximo-amount">${formatearEuro(g.monto)}</span>
        </div>`;
    }).join('')
    + (remaining > 0
        ? `<div class="inicio-prox-more">y ${remaining} más — ${formatearEuro(allTotal - shownTotal)} adicionales</div>`
        : '');
}

async function renderInicioInsights() {
    if (!document.getElementById('inicioCategoriasList')) return;

    let ahorrosMes = [], ahorrosPrev = [], categoriasData = { gastos: {} }, gastosPuntuales = [];
    let _desdeRange = '', _hastaRange = '';

    try {
        const { desde, hasta, prevDesde, prevHasta } = getInicioDateRange(periodoActual);
        _desdeRange = desde;
        _hastaRange = hasta;
        const [ahorrosRes, categoriasRes, ahorrosPrevRes, dashboardRes] = await Promise.all([
            fetch(`/ahorros-mes?desde=${desde}&hasta=${hasta}`),
            fetch(`/categorias-periodo?desde=${desde}&hasta=${hasta}`),
            fetch(`/ahorros-mes?desde=${prevDesde}&hasta=${prevHasta}`),
            fetch('/dashboard')
        ]);
        if (ahorrosRes.ok) ahorrosMes = (await ahorrosRes.json()) || [];
        if (categoriasRes.ok) categoriasData = (await categoriasRes.json()) || { gastos: {} };
        if (ahorrosPrevRes.ok) ahorrosPrev = (await ahorrosPrevRes.json()) || [];
        if (dashboardRes.ok) {
            const dashData = await dashboardRes.json();
            gastosPuntuales = dashData?.gastos_puntuales || [];
        }
    } catch (error) {
        console.error('❌ Error cargando insights de inicio:', error);
    }

    const monthCount = getMonthCountForPeriod(periodoActual);
    const ahorrosMesClipped = clipPeriodMonths(ahorrosMes, monthCount);
    const ahorrosPrevClipped = clipPeriodMonths(ahorrosPrev, monthCount);

    // Cards de Inicio alineadas al mismo rango calendario del gráfico
    const sumField = (arr, field) => (Array.isArray(arr) ? arr : []).reduce((acc, m) => acc + (Number(m[field]) || 0), 0);
    const ingresosTotal = sumField(ahorrosMesClipped, 'total_ingreso') || (sumField(ahorrosMesClipped, 'ingresos') + sumField(ahorrosMesClipped, 'impuestos_ingresos') + sumField(ahorrosMesClipped, 'cuentas_remuneradas'));
    const gastosTotal = sumField(ahorrosMesClipped, 'total_gastos') || sumField(ahorrosMesClipped, 'gastos');
    const ahorroTotal = sumField(ahorrosMesClipped, 'ahorros');
    const impuestosTotal = (sumField(ahorrosMesClipped, 'impuesto_renta') + sumField(ahorrosMesClipped, 'impuesto_otros')) || (sumField(ahorrosMesClipped, 'impuestos_otros') + sumField(ahorrosMesClipped, 'impuestos_ingresos'));

    const ingresosEl = document.getElementById('total-ingresos');
    const gastosEl = document.getElementById('total-gastos');
    const saldoEl = document.getElementById('saldo');
    const taxesEl = document.getElementById('total-taxes');

    if (ingresosEl) ingresosEl.textContent = formatearEuro(ingresosTotal);
    if (gastosEl) gastosEl.textContent = formatearEuro(gastosTotal);
    if (saldoEl) saldoEl.textContent = formatearEuro(ahorroTotal);
    if (taxesEl) taxesEl.textContent = formatearEuro(impuestosTotal);

    // Siempre renderizar aunque los datos estén vacíos (para mostrar el label del período)
    renderInicioEvolucion(ahorrosMesClipped, ahorrosPrevClipped);
    renderInicioCategorias(categoriasData?.gastos || {});
    renderInicioDeltas(ahorrosMesClipped, ahorrosPrevClipped);
    renderInicioProximosGastos(gastosPuntuales, _desdeRange, _hastaRange);
}

function initInicio() {
    cargarResumenPeriodos();
    renderInicioInsights();
}

function initAjustes() {
    setUserLabel(activeUser);

    const currencySelect = document.getElementById('currencySelect');
    if (currencySelect && !currencySelect.dataset.listenerAdded) {
        const monedaGuardada = localStorage.getItem('currency') || 'EUR';
        currencySelect.value = monedaGuardada;
        currencySelect.addEventListener('change', (e) => {
            setCurrency(e.target.value);
        });
        currencySelect.dataset.listenerAdded = 'true';
    }

    const languageSelect = document.getElementById('languageSelect');
    if (languageSelect && !languageSelect.dataset.listenerAdded) {
        languageSelect.value = gestorIdiomas?.getIdioma() || 'es';
        languageSelect.addEventListener('change', (e) => {
            if (typeof gestorIdiomas !== 'undefined') {
                gestorIdiomas.cambiarIdioma(e.target.value);
                const tabActiva = document.querySelector('.tablink.active');
                if (tabActiva) {
                    loadTab(tabActiva.dataset.tab);
                }
            }
        });
        languageSelect.dataset.listenerAdded = 'true';
    }

    const retencionInput = document.getElementById('retencionDividendosInput');
    if (retencionInput && !retencionInput.dataset.listenerAdded) {
        retencionInput.value = parseFloat(localStorage.getItem('retencionDividendos') || '0');
        retencionInput.addEventListener('change', (e) => {
            const val = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
            e.target.value = val;
            localStorage.setItem('retencionDividendos', val);
        });
        retencionInput.dataset.listenerAdded = 'true';
    }

    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect && !themeSelect.dataset.listenerAdded) {
        const temaGuardado = localStorage.getItem('tema') || 'azul';
        themeSelect.value = temaGuardado;
        themeSelect.addEventListener('change', (e) => {
            const nuevoTema = e.target.value;
            if (typeof gestorTemas !== 'undefined') {
                gestorTemas.cambiarTema(nuevoTema);
            }
            const tabActiva = document.querySelector('.tablink.active');
            if (tabActiva) {
                loadTab(tabActiva.dataset.tab);
            }
        });
        themeSelect.dataset.listenerAdded = 'true';
    }
}

const tableSearchRegistry = new WeakMap();
const TABLE_FILTER_STATE_KEY = 'dashboardTableFilterStateV1';

