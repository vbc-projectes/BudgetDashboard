/**
 * Bolsa module — operaciones de bolsa, dividendos y cartera
 */

let operaciones = [];
let dividendos = [];
let posiciones = [];
let resumen = {};
const priceCache = {};
const metadataCache = {};

let chartTipo = null;
let chartSector = null;
let chartBenchmarkInstance = null;
let chartDivCrecimiento = null;

// ── Helpers ───────────────────────────────────────────────────────────
function fmt(val, decimals = 2) {
    const n = Number(val);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + ' €';
}

function fmtNum(val, decimals = 4) {
    const n = Number(val);
    return Number.isFinite(n) ? n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: decimals }) : '—';
}

function fmtPct(val) {
    const n = Number(val);
    if (!Number.isFinite(n)) return '—';
    const sign = n >= 0 ? '+' : '';
    return `${sign}${n.toFixed(2)} %`;
}

async function getPrice(ticker) {
    if (!ticker) return null;
    const norm = ticker.toUpperCase();
    if (priceCache[norm] && Date.now() - priceCache[norm].ts < 5 * 60 * 1000) return priceCache[norm].price;
    try {
        const res = await fetch(`/asset-price/${encodeURIComponent(norm)}`);
        if (res.ok) {
            const data = await res.json();
            const price = Number(data?.currentPrice);
            priceCache[norm] = { price: Number.isFinite(price) ? price : null, ts: Date.now() };
            return priceCache[norm].price;
        }
    } catch (_) {}
    return null;
}

async function getMetadata(ticker) {
    if (!ticker) return {};
    const norm = ticker.toUpperCase();
    if (metadataCache[norm] && Date.now() - metadataCache[norm].ts < 24 * 60 * 60 * 1000) return metadataCache[norm].data;
    try {
        const res = await fetch(`/asset-metadata/${encodeURIComponent(norm)}`);
        if (res.ok) {
            const data = await res.json();
            metadataCache[norm] = { data, ts: Date.now() };
            return data;
        }
    } catch (_) {}
    return {};
}

// ── Load data ─────────────────────────────────────────────────────────
async function loadBolsaData() {
    try {
        const [opRes, divRes, posRes, resRes] = await Promise.all([
            fetch('/bolsa/operaciones').then(r => r.json()),
            fetch('/bolsa/dividendos').then(r => r.json()),
            fetch('/bolsa/posiciones').then(r => r.json()),
            fetch('/bolsa/resumen').then(r => r.json())
        ]);
        operaciones = opRes || [];
        dividendos = divRes || [];
        posiciones = posRes || [];
        resumen = resRes || {};
    } catch (err) {
        console.error('Error cargando datos de bolsa:', err);
        operaciones = []; dividendos = []; posiciones = []; resumen = {};
    }
}

// ── Render cartera ────────────────────────────────────────────────────
async function renderCartera() {
    const tbody = document.getElementById('tbodyCartera');
    if (!tbody) return;

    document.getElementById('bolsaTotalInvertido').textContent = fmt(resumen.total_invertido);
    document.getElementById('bolsaDividendosTotal').textContent = fmt(resumen.total_dividendos);
    document.getElementById('bolsaComisiones').textContent = fmt(resumen.total_comisiones);

    const colCount = 13;
    tbody.innerHTML = `<tr><td colspan="${colCount}" class="text-center">${gestorIdiomas?.obtenerTexto('bolsa.obteniendoPrecios') || 'Obteniendo precios...'}</td></tr>`;

    let totalValorActual = 0;
    const rows = [];
    const umbral = parseFloat(document.getElementById('umbralRebalanceo')?.value || 25);
    const rebalanceoAlertas = [];

    for (const pos of posiciones) {
        const precio = await getPrice(pos.ticker);
        const valorActual = precio !== null ? precio * pos.cantidad : null;
        const pnl = valorActual !== null ? valorActual - pos.coste_total : null;
        const pnlPct = pnl !== null && pos.coste_total > 0 ? (pnl / pos.coste_total) * 100 : null;
        if (valorActual !== null) totalValorActual += valorActual;
        pos._valorActual = valorActual;
        const pnlClass = pnl === null ? '' : (pnl >= 0 ? 'text-green' : 'text-red');
        const diasStr = pos.dias_en_posicion != null ? `${pos.dias_en_posicion}d` : '—';

        rows.push({ pos, precio, valorActual, pnl, pnlPct, pnlClass, diasStr });
    }

    // Rebalanceo check after all values computed
    const rowsHtml = rows.map(({ pos, precio, valorActual, pnl, pnlPct, pnlClass, diasStr }) => {
        const pct = totalValorActual > 0 && valorActual !== null ? (valorActual / totalValorActual) * 100 : 0;
        let badge = '';
        if (pct > umbral) {
            rebalanceoAlertas.push(`${pos.ticker} (${pct.toFixed(1)}%)`);
            badge = ` <span title="Supera ${umbral}%" style="color:var(--danger,#ef4444);font-size:0.8rem;">⚠️</span>`;
        }
        return `<tr>
            <td><strong>${pos.ticker}</strong>${badge}</td>
            <td>${pos.empresa || '—'}</td>
            <td>${pos.sector || '—'}</td>
            <td>${pos.tipo_activo || '—'}</td>
            <td>${fmtNum(pos.cantidad)}</td>
            <td>${fmt(pos.precio_medio)}</td>
            <td>${fmt(pos.coste_total)}</td>
            <td>${precio !== null ? fmt(precio) : '—'}</td>
            <td>${valorActual !== null ? fmt(valorActual) : '—'}</td>
            <td class="${pnlClass}">${pnl !== null ? fmt(pnl) : '—'}</td>
            <td class="${pnlClass}">${pnlPct !== null ? fmtPct(pnlPct) : '—'}</td>
            <td>${fmt(pos.dividendos_netos)}</td>
            <td>${diasStr}</td>
        </tr>`;
    });

    tbody.innerHTML = rowsHtml.length ? rowsHtml.join('') :
        `<tr><td colspan="${colCount}" class="text-center text-muted">${gestorIdiomas?.obtenerTexto('bolsa.sinPosiciones') || 'Sin posiciones abiertas'}</td></tr>`;

    const pnlTotal = totalValorActual - (resumen.total_invertido || 0);
    document.getElementById('bolsaValorActual').textContent = fmt(totalValorActual);
    const pnlEl = document.getElementById('bolsaPnl');
    pnlEl.textContent = fmt(pnlTotal);
    pnlEl.style.color = pnlTotal >= 0 ? 'var(--color-ingreso, #22c55e)' : 'var(--color-gasto, #ef4444)';

    const alertaEl = document.getElementById('bolsaRebalanceoAlerta');
    if (alertaEl) {
        if (rebalanceoAlertas.length > 0) {
            alertaEl.style.display = '';
            alertaEl.textContent = `⚠️ Rebalanceo sugerido: ${rebalanceoAlertas.join(', ')} superan el ${umbral}% de la cartera.`;
            if (typeof notifyInfo === 'function') notifyInfo(`Rebalanceo: ${rebalanceoAlertas.join(', ')}`);
        } else {
            alertaEl.style.display = 'none';
        }
    }

    renderAllocationCharts();
}

// ── Allocation charts ─────────────────────────────────────────────────
async function renderAllocationCharts() {
    if (typeof Chart === 'undefined') return;
    try {
        const res = await fetch('/bolsa/desglose-sector');
        if (!res.ok) return;
        const data = await res.json();

        const PALETTE = ['#4f8ef7','#3fcf77','#f472b6','#fbbf24','#a78bfa','#9ca3af','#f97316','#06b6d4','#84cc16','#ec4899'];

        const makeDonut = (canvasId, items, existingChart) => {
            const canvas = document.getElementById(canvasId);
            if (!canvas) return existingChart;
            if (existingChart) { try { existingChart.destroy(); } catch (_) {} }
            if (!items || items.length === 0) return null;
            return new Chart(canvas, {
                type: 'doughnut',
                data: {
                    labels: items.map(i => i.nombre),
                    datasets: [{ data: items.map(i => i.pct), backgroundColor: PALETTE.slice(0, items.length), borderWidth: 2 }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, animation: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 8 } },
                        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed.toFixed(1)}%` } }
                    }
                }
            });
        };

        chartTipo   = makeDonut('chartBolsaTipo',   data.por_tipo,   chartTipo);
        chartSector = makeDonut('chartBolsaSector', data.por_sector, chartSector);
    } catch (_) {}
}

// ── Benchmark chart ───────────────────────────────────────────────────
async function renderBenchmarkChart() {
    if (typeof Chart === 'undefined') return;
    const ticker  = document.getElementById('benchmarkSelector')?.value || 'IWDA.AS';
    const periodo = document.getElementById('benchmarkPeriodo')?.value || '1y';

    const canvas = document.getElementById('chartBenchmark');
    if (!canvas) return;
    canvas.parentElement.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-secondary,#475569);font-size:0.88rem;">Cargando...</div><canvas id="chartBenchmark"></canvas>';

    try {
        const res = await fetch(`/asset-history/${encodeURIComponent(ticker)}?period=${periodo}`);
        if (!res.ok) return;
        const hist = await res.json();
        const raw = hist?.data || [];
        if (raw.length === 0) return;

        // Normalize benchmark to base 100
        const base = raw[0].price;
        const benchLabels = raw.map(d => d.date);
        const benchValues = raw.map(d => base > 0 ? (d.price / base * 100) : 100);

        // Approximate portfolio performance: sum current positions × historical prices
        // Fetch history for each position ticker
        const portfolioByDate = {};
        const totalCoste = posiciones.reduce((s, p) => s + p.coste_total, 0);

        for (const pos of posiciones) {
            try {
                const r2 = await fetch(`/bolsa/ticker-history/${encodeURIComponent(pos.ticker)}`);
                if (!r2.ok) continue;
                const h2 = await r2.json();
                for (const row of (h2?.data || [])) {
                    portfolioByDate[row.fecha] = (portfolioByDate[row.fecha] || 0) + pos.cantidad * row.precio_cierre;
                }
            } catch (_) {}
        }

        const portfolioValues = benchLabels.map(d => portfolioByDate[d] ?? null);
        const firstPortVal = portfolioValues.find(v => v !== null);
        const portNormalized = firstPortVal
            ? portfolioValues.map(v => v !== null ? (v / firstPortVal * 100) : null)
            : null;

        if (chartBenchmarkInstance) { try { chartBenchmarkInstance.destroy(); } catch (_) {} }

        const newCanvas = document.getElementById('chartBenchmark');
        if (!newCanvas) return;

        const datasets = [{
            label: ticker,
            data: benchValues,
            borderColor: '#4f8ef7',
            backgroundColor: 'rgba(79,142,247,0.1)',
            borderWidth: 2, tension: 0.3, fill: false, pointRadius: 0
        }];

        if (portNormalized) {
            datasets.push({
                label: 'Mi cartera (aprox.)',
                data: portNormalized,
                borderColor: '#3fcf77',
                borderDash: [5, 3],
                backgroundColor: 'rgba(63,207,119,0.08)',
                borderWidth: 2, tension: 0.3, fill: false, pointRadius: 0,
                spanGaps: true
            });
        }

        chartBenchmarkInstance = new Chart(newCanvas, {
            type: 'line',
            data: { labels: benchLabels, datasets },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                plugins: {
                    legend: { position: 'top' },
                    tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(1) ?? '—'}` } }
                },
                scales: {
                    x: { ticks: { maxTicksLimit: 8, maxRotation: 0 } },
                    y: { ticks: { callback: v => v.toFixed(0) } }
                }
            }
        });
    } catch (err) {
        console.warn('Benchmark chart error:', err.message);
    }
}

// ── Dividend growth chart ─────────────────────────────────────────────
function renderDividendGrowthChart() {
    if (typeof Chart === 'undefined') return;
    const canvas = document.getElementById('chartDividendosCrecimiento');
    if (!canvas) return;

    // Group dividends netos by YYYY-MM
    const byMonth = {};
    for (const d of dividendos) {
        const mes = String(d.fecha || '').slice(0, 7);
        if (!mes) continue;
        const neto = (d.importe_bruto || 0) - (d.retencion || 0);
        byMonth[mes] = (byMonth[mes] || 0) + neto;
    }

    const sortedKeys = Object.keys(byMonth).sort();
    if (sortedKeys.length === 0) return;

    if (chartDivCrecimiento) { try { chartDivCrecimiento.destroy(); } catch (_) {} }
    chartDivCrecimiento = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: sortedKeys,
            datasets: [{
                label: 'Dividendo neto (€)',
                data: sortedKeys.map(k => Math.round(byMonth[k] * 100) / 100),
                backgroundColor: 'rgba(63,207,119,0.7)',
                borderColor: '#3fcf77',
                borderWidth: 1, borderRadius: 4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { maxTicksLimit: 12, maxRotation: 45 } },
                y: { ticks: { callback: v => v + ' €' } }
            }
        }
    });
}

// ── Render operaciones ────────────────────────────────────────────────
function renderOperaciones() {
    const tbody = document.getElementById('tbodyOperaciones');
    if (!tbody) return;

    if (!operaciones.length) {
        tbody.innerHTML = `<tr><td colspan="10" class="text-center text-muted">${gestorIdiomas?.obtenerTexto('bolsa.sinOperaciones') || 'Sin operaciones registradas'}</td></tr>`;
        return;
    }

    tbody.innerHTML = operaciones.map(op => {
        const total = op.cantidad * op.precio_unitario + (op.comision || 0);
        const tipoClass = op.tipo === 'compra' ? 'text-green' : 'text-red';
        return `<tr data-id="${op.id}">
            <td><span class="${tipoClass}">${op.tipo === 'compra' ? `▲ ${gestorIdiomas?.obtenerTexto('inversiones.compra') || 'Compra'}` : `▼ ${gestorIdiomas?.obtenerTexto('inversiones.venta') || 'Venta'}`}</span></td>
            <td><strong>${op.ticker}</strong>${op.sector ? `<br><small style="color:var(--text-secondary,#475569)">${op.sector}</small>` : ''}</td>
            <td>${op.empresa || '—'}</td>
            <td>${op.fecha}</td>
            <td>${fmtNum(op.cantidad)}</td>
            <td>${fmt(op.precio_unitario)}</td>
            <td>${fmt(op.comision || 0)}</td>
            <td>${fmt(total)}</td>
            <td>${op.notas || '—'}</td>
            <td>
                <button class="btn-icon btn-delete-op" data-id="${op.id}" title="Eliminar"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('');
}

// ── Render dividendos ─────────────────────────────────────────────────
function renderDividendos() {
    const tbody = document.getElementById('tbodyDividendos');
    if (!tbody) return;

    if (!dividendos.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">${gestorIdiomas?.obtenerTexto('bolsa.sinDividendos') || 'Sin dividendos registrados'}</td></tr>`;
        return;
    }

    tbody.innerHTML = dividendos.map(d => {
        const neto = (d.importe_bruto || 0) - (d.retencion || 0);
        return `<tr data-id="${d.id}">
            <td><strong>${d.ticker}</strong></td>
            <td>${d.empresa || '—'}</td>
            <td>${d.fecha}</td>
            <td>${fmt(d.importe_bruto)}</td>
            <td>${fmt(d.retencion || 0)}</td>
            <td>${fmt(neto)}</td>
            <td>${d.notas || '—'}</td>
            <td>
                <button class="btn-icon btn-delete-div" data-id="${d.id}" title="Eliminar"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('');

    renderDividendGrowthChart();
}

// ── Export fiscal CSV ─────────────────────────────────────────────────
async function exportarFiscal() {
    try {
        const res = await fetch('/bolsa/estadisticas-fiscales');
        if (!res.ok) throw new Error('Error cargando datos');
        const data = await res.json();
        const ventas = data?.ventas || [];
        if (ventas.length === 0) {
            if (typeof notifyInfo === 'function') notifyInfo('No hay ventas registradas para exportar.');
            return;
        }

        const headers = ['Ticker','Empresa','Fecha compra','Fecha venta','Precio compra (€)','Precio venta (€)','Cantidad','Coste base (€)','Ingreso neto (€)','Ganancia/Pérdida (€)','Ganancia %','Días tenencia'];
        const rows = ventas.map(v => [
            v.ticker, v.empresa || '', v.fecha_compra || '', v.fecha_venta || '',
            v.precio_compra, v.precio_venta, v.cantidad,
            v.coste_base, v.ingreso_neto, v.ganancia_neta, v.ganancia_pct,
            v.dias_tenencia ?? ''
        ].map(String).map(s => `"${s.replace(/"/g, '""')}"`).join(';'));

        const csv = [headers.join(';'), ...rows].join('\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const year = new Date().getFullYear();
        a.download = `bolsa_fiscalidad_${year}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        if (typeof notifySuccess === 'function') notifySuccess('Export fiscal descargado.');
    } catch (err) {
        if (typeof notifyError === 'function') notifyError('Error al exportar: ' + err.message);
    }
}

// ── Actions ────────────────────────────────────────────────────────────
async function addOperacion() {
    const tipo     = document.getElementById('tipoOperacion').value;
    const ticker   = document.getElementById('tickerOperacion').value.trim().toUpperCase();
    const empresa  = document.getElementById('empresaOperacion').value.trim();
    const fecha    = document.getElementById('fechaOperacion').value;
    const cantidad = parseFloat(document.getElementById('cantidadOperacion').value);
    const precio   = parseFloat(document.getElementById('precioOperacion').value);
    const comision = parseFloat(document.getElementById('comisionOperacion').value) || 0;
    const notas    = document.getElementById('notasOperacion').value.trim();

    if (!ticker || !fecha || !cantidad || !precio) {
        alert(gestorIdiomas?.obtenerTexto('bolsa.camposObligatorios') || 'Ticker, fecha, cantidad y precio son obligatorios.');
        return;
    }

    // Get cached metadata (may have been pre-fetched on blur)
    const meta = metadataCache[ticker]?.data || {};

    try {
        const res = await fetch('/bolsa/operaciones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tipo, ticker, empresa, fecha, cantidad, precio_unitario: precio, comision, notas, sector: meta.sector || null, tipo_activo: meta.tipo_activo || null })
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.error); }

        const display = document.getElementById('tickerMetaDisplay');
        if (display) display.textContent = '';

        ['tickerOperacion', 'empresaOperacion', 'fechaOperacion', 'cantidadOperacion', 'precioOperacion', 'comisionOperacion', 'notasOperacion'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = '';
        });
        await refreshAll();
    } catch (err) { alert('Error: ' + err.message); }
}

async function deleteOperacion(id) {
    const msg = gestorIdiomas?.obtenerTexto('bolsa.confirmarEliminarOp') || '¿Eliminar esta operación?';
    if (!confirm(msg)) return;
    try {
        await fetch(`/bolsa/operaciones/${id}`, { method: 'DELETE' });
        await refreshAll();
    } catch (err) { alert('Error: ' + err.message); }
}

async function addDividendo() {
    const ticker  = document.getElementById('tickerDividendo').value.trim().toUpperCase();
    const empresa = document.getElementById('empresaDividendo').value.trim();
    const fecha   = document.getElementById('fechaDividendo').value;
    const bruto   = parseFloat(document.getElementById('importeBrutoDividendo').value);
    const ret     = parseFloat(document.getElementById('retencionDividendo').value) || 0;
    const notas   = document.getElementById('notasDividendo').value.trim();

    if (!ticker || !fecha || !bruto) {
        alert(gestorIdiomas?.obtenerTexto('bolsa.camposDividendoObligatorios') || 'Ticker, fecha e importe bruto son obligatorios.');
        return;
    }

    try {
        const res = await fetch('/bolsa/dividendos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticker, empresa, fecha, importe_bruto: bruto, retencion: ret, notas })
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
        ['tickerDividendo', 'empresaDividendo', 'fechaDividendo', 'importeBrutoDividendo', 'retencionDividendo', 'notasDividendo'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = '';
        });
        await refreshAll();
    } catch (err) { alert('Error: ' + err.message); }
}

async function deleteDividendo(id) {
    const msg = gestorIdiomas?.obtenerTexto('bolsa.confirmarEliminarDiv') || '¿Eliminar este dividendo?';
    if (!confirm(msg)) return;
    try {
        await fetch(`/bolsa/dividendos/${id}`, { method: 'DELETE' });
        await refreshAll();
    } catch (err) { alert('Error: ' + err.message); }
}

async function refreshAll() {
    await loadBolsaData();
    renderOperaciones();
    renderDividendos();
    await renderCartera();
}

// ── Init ───────────────────────────────────────────────────────────────
async function initBolsa() {
    await refreshAll();

    const btnOp = document.getElementById('btnAgregarOperacion');
    if (btnOp) btnOp.addEventListener('click', addOperacion);

    const btnDiv = document.getElementById('btnAgregarDividendo');
    if (btnDiv) btnDiv.addEventListener('click', addDividendo);

    const btnFiscal = document.getElementById('btnExportarFiscal');
    if (btnFiscal) btnFiscal.addEventListener('click', exportarFiscal);

    const btnBenchmark = document.getElementById('btnCargarBenchmark');
    if (btnBenchmark) btnBenchmark.addEventListener('click', renderBenchmarkChart);

    // Auto-detect metadata on ticker blur
    const tickerInput = document.getElementById('tickerOperacion');
    const metaDisplay = document.getElementById('tickerMetaDisplay');
    if (tickerInput && metaDisplay) {
        tickerInput.addEventListener('blur', async () => {
            const t = tickerInput.value.trim().toUpperCase();
            if (!t) { metaDisplay.textContent = ''; return; }
            metaDisplay.textContent = '⏳';
            try {
                const meta = await getMetadata(t);
                const parts = [meta.tipo_activo, meta.sector].filter(Boolean);
                metaDisplay.textContent = parts.length ? parts.join(' · ') : '';
            } catch (_) { metaDisplay.textContent = ''; }
        });
    }

    // Rebalanceo threshold change triggers re-render
    document.getElementById('umbralRebalanceo')?.addEventListener('change', () => renderCartera());

    const today = new Date().toISOString().slice(0, 10);
    ['fechaOperacion', 'fechaDividendo'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.value) el.value = today;
    });

    document.getElementById('tbodyOperaciones')?.addEventListener('click', e => {
        const btn = e.target.closest('.btn-delete-op');
        if (btn) deleteOperacion(btn.dataset.id);
    });

    document.getElementById('tbodyDividendos')?.addEventListener('click', e => {
        const btn = e.target.closest('.btn-delete-div');
        if (btn) deleteDividendo(btn.dataset.id);
    });

    document.querySelectorAll('#bolsa .subtab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#bolsa .subtab-btn').forEach(b => b.classList.remove('active-subtab'));
            document.querySelectorAll('#bolsa .subtab').forEach(s => s.classList.add('display-none'));
            btn.classList.add('active-subtab');
            const target = document.getElementById(btn.dataset.target);
            if (target) target.classList.remove('display-none');
            // Render charts when switching to their tab
            if (btn.dataset.target === 'tabBolsaDividendos') renderDividendGrowthChart();
        });
    });
}

if (typeof module !== 'undefined') module.exports = { initBolsa };
