/**
 * Inversiones — pestaña unificada: Activos, Cartera, Operaciones, Dividendos
 *
 * Activos:     posiciones abiertas computadas desde operaciones (no editable aquí)
 * Cartera:     KPIs + gráfica distribución + gráfica P&L por activo + evolución histórica
 * Operaciones: registro de compras/ventas (aquí se crean/borran posiciones)
 * Dividendos:  auto-sincronizados desde Yahoo Finance para posiciones activas
 */

// ── State (persiste en window para sobrevivir reconstrucciones del DOM) ─
if (!window._inv) {
    window._inv = {
        operaciones: [],
        dividendos:  [],
        posiciones:  [],
        resumen:     {},
        priceCache:  {},    // ticker → { price, ts }
        chartAlloc:  null,
        chartPnl:    null,
        chartEvol:   null,
        chartCR:     null,
        crData:      null,
        evolPeriod:  '3mo',
        dataTs:      0      // timestamp del último fetch completo
    };
}
const _inv = window._inv;

// ── Format helpers ─────────────────────────────────────────────────────
function _fmt(val, decimals = 2) {
    const n = Number(val);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + ' €';
}
function _fmtNum(val, decimals = 4) {
    const n = Number(val);
    return Number.isFinite(n) ? n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: decimals }) : '—';
}
function _fmtPct(val) {
    const n = Number(val);
    if (!Number.isFinite(n)) return '—';
    return (n >= 0 ? '+' : '') + n.toFixed(2) + ' %';
}

// ── Current price (5-min cache) ────────────────────────────────────────
async function _getPrice(ticker) {
    if (!ticker) return null;
    const k = ticker.toUpperCase();
    const cached = _inv.priceCache[k];
    if (cached && Date.now() - cached.ts < 5 * 60 * 1000) return cached.price;
    try {
        const res = await fetch(`/asset-price/${encodeURIComponent(k)}`);
        if (res.ok) {
            const data = await res.json();
            const price = Number(data?.currentPrice);
            _inv.priceCache[k] = { price: Number.isFinite(price) && price > 0 ? price : null, ts: Date.now() };
            return _inv.priceCache[k].price;
        }
    } catch (_) {}
    return null;
}

// ── Load bolsa data (reutiliza cache si tiene < 60 s) ────────────────
async function _loadBolsaData(force = false) {
    if (!force && _inv.dataTs && Date.now() - _inv.dataTs < 60_000) return;
    try {
        const [opRes, divRes, posRes, resRes] = await Promise.all([
            fetch('/bolsa/operaciones').then(r => r.json()),
            fetch('/bolsa/dividendos').then(r => r.json()),
            fetch('/bolsa/posiciones').then(r => r.json()),
            fetch('/bolsa/resumen').then(r => r.json())
        ]);
        _inv.operaciones = opRes || [];
        _inv.dividendos  = divRes || [];
        _inv.posiciones  = posRes || [];
        _inv.resumen     = resRes || {};
        _inv.dataTs      = Date.now();
    } catch (_) {}
}

// ── Sub-tab switching helper ───────────────────────────────────────────
function _showSubtab(targetId) {
    document.querySelectorAll('#inversiones .subtab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('#inversiones .subtab').forEach(s => s.classList.add('display-none'));
    const btn = document.querySelector(`#inversiones .subtab-btn[data-target="${targetId}"]`);
    if (btn) btn.classList.add('active');
    const panel = document.getElementById(targetId);
    if (panel) panel.classList.remove('display-none');
    // Resize charts after panel becomes visible (display:none causes 0×0 render)
    requestAnimationFrame(() => {
        if (_inv.chartAlloc) _inv.chartAlloc.resize();
        if (_inv.chartPnl)   _inv.chartPnl.resize();
        if (_inv.chartEvol)  _inv.chartEvol.resize();
        if (_inv.chartCR)    _inv.chartCR.resize();
    });
}

// ── Sub-tab ACTIVOS: render open positions (read-only) ─────────────────
async function _renderActivos() {
    const tbody = document.getElementById('tbodyActivos');
    if (!tbody) return;
    if (!_inv.posiciones.length) {
        tbody.innerHTML = `<tr><td colspan="10" class="text-center text-muted">${gestorIdiomas?.obtenerTexto('inversiones.sinPosicionesAbiertas') || 'Sin posiciones abiertas. Añade operaciones de compra.'}</td></tr>`;
        return;
    }
    tbody.innerHTML = `<tr><td colspan="10" class="text-center text-muted">${gestorIdiomas?.obtenerTexto('inversiones.cargando') || 'Cargando precios…'}</td></tr>`;

    const rows = await Promise.all(_inv.posiciones.map(async pos => {
        const precio  = await _getPrice(pos.ticker);
        const valor   = precio !== null ? precio * pos.cantidad : null;
        const pnl     = valor !== null ? valor - pos.coste_total : null;
        const pnlPct  = pnl !== null && pos.coste_total > 0 ? (pnl / pos.coste_total) * 100 : null;
        const cls     = pnl === null ? '' : (pnl >= 0 ? 'text-green' : 'text-red');

        return `<tr>
            <td><strong>${pos.ticker}</strong></td>
            <td>${pos.empresa || '—'}</td>
            <td>${_fmtNum(pos.cantidad)}</td>
            <td>${_fmt(pos.precio_medio)}</td>
            <td>${_fmt(pos.coste_total)}</td>
            <td>${precio !== null ? _fmt(precio) : '<span style="color:#888">—</span>'}</td>
            <td>${valor  !== null ? _fmt(valor)  : '—'}</td>
            <td class="${cls}">${pnl    !== null ? _fmt(pnl)    : '—'}</td>
            <td class="${cls}">${pnlPct !== null ? _fmtPct(pnlPct) : '—'}</td>
            <td>${_fmt(pos.dividendos_netos)}</td>
            <td>
                <button class="btn-icon btn-cerrar-posicion"
                    data-ticker="${pos.ticker}"
                    data-empresa="${pos.empresa || ''}"
                    data-cantidad="${pos.cantidad}"
                    data-precio="${precio !== null ? precio : ''}"
                    title="Cerrar posición"
                    style="color:var(--color-gasto,#ef4444);">
                    <i class="fas fa-sign-out-alt"></i>
                </button>
            </td>
        </tr>`;
    }));

    tbody.innerHTML = rows.join('');
}

// ── Sub-tab CARTERA: KPIs + charts ────────────────────────────────────
async function _renderCartera() {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

    // KPIs that don't need live price
    set('invTotalInvertido',  _fmt(_inv.resumen.total_invertido));
    set('invDividendosTotal', _fmt(_inv.resumen.total_dividendos));
    set('invComisiones',      _fmt(_inv.resumen.total_comisiones));
    const gpRealEl = document.getElementById('invGananciaRealizada');
    if (gpRealEl) {
        const gr = _inv.resumen.ganancia_realizada ?? 0;
        gpRealEl.textContent = _fmt(gr);
        gpRealEl.style.color = gr >= 0 ? 'var(--color-ingreso,#22c55e)' : 'var(--color-gasto,#ef4444)';
    }

    // Compute live values + P&L for charts
    const allocData = {};
    const pnlData   = {};
    let   totalValor = 0;

    await Promise.all(_inv.posiciones.map(async pos => {
        const precio = await _getPrice(pos.ticker);
        if (precio === null) return;
        const valor = precio * pos.cantidad;
        const pnl   = valor - pos.coste_total;
        totalValor          += valor;
        allocData[pos.ticker] = valor;
        pnlData[pos.ticker]   = pnl;
    }));

    // Coste base de posiciones abiertas (lo que está actualmente en mercado)
    const invested = Number(_inv.resumen.total_invertido) || 0;
    // G/P latente = valor actual − coste base posiciones abiertas
    const pnlLatente = totalValor - invested;
    // Capital total histórico (todas las compras, aunque luego se vendiera)
    const capitalTotal = Number(_inv.resumen.capital_total_desplegado) || invested;
    // G/P realizado de ventas pasadas
    const grReal  = Number(_inv.resumen.ganancia_realizada) || 0;
    // Dividendos cobrados
    const divNetos = Number(_inv.resumen.total_dividendos) || 0;

    // Rendimiento total € = latente + realizado + dividendos
    const rendTotalEur = pnlLatente + grReal + divNetos;
    // Rentabilidad % = rendimiento total € / capital total histórico desplegado
    const rentPct = capitalTotal > 0 ? (rendTotalEur / capitalTotal) * 100 : 0;

    set('invValorActual',  _fmt(totalValor));
    const pnlEl = document.getElementById('invPnl');
    if (pnlEl) { pnlEl.textContent = _fmt(pnlLatente); pnlEl.style.color = pnlLatente >= 0 ? 'var(--color-ingreso,#22c55e)' : 'var(--color-gasto,#ef4444)'; }

    const rentEl = document.getElementById('invRentabilidad');
    if (rentEl) { rentEl.textContent = _fmtPct(rentPct); rentEl.style.color = rentPct >= 0 ? 'var(--color-ingreso,#22c55e)' : 'var(--color-gasto,#ef4444)'; }

    const rendTotalEl = document.getElementById('invRendimientoTotalEur');
    if (rendTotalEl) { rendTotalEl.textContent = _fmt(rendTotalEur); rendTotalEl.style.color = rendTotalEur >= 0 ? 'var(--color-ingreso,#22c55e)' : 'var(--color-gasto,#ef4444)'; }

    _renderAllocationChart(allocData);
    _renderPnlChart(pnlData);
    await _renderEvolutionChart(_inv.evolPeriod);
}

// ── Chart: donut allocation ────────────────────────────────────────────
function _renderAllocationChart(allocData) {
    const canvas  = document.getElementById('invChartAllocation');
    const emptyEl = document.getElementById('invChartAllocationEmpty');
    if (!canvas) return;
    const labels = Object.keys(allocData);
    if (!labels.length) {
        canvas.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'flex';
        return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    canvas.style.display = 'block';
    if (_inv.chartAlloc) { try { _inv.chartAlloc.destroy(); } catch (_) {} _inv.chartAlloc = null; }
    const COLORS = ['#6366f1','#22c55e','#f59e0b','#ef4444','#3b82f6','#ec4899','#14b8a6','#a855f7','#f97316','#84cc16'];
    _inv.chartAlloc = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{ data: labels.map(k => allocData[k]), backgroundColor: labels.map((_, i) => COLORS[i % COLORS.length]), borderWidth: 1 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { color: '#333', boxWidth: 12 } },
                tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${_fmt(ctx.parsed)}` } },
                background: { color: 'white' }
            }
        }
    });
}

// ── Chart: horizontal bar P&L ─────────────────────────────────────────
function _renderPnlChart(pnlData) {
    const canvas  = document.getElementById('invChartPnl');
    const emptyEl = document.getElementById('invChartPnlEmpty');
    if (!canvas) return;
    const labels = Object.keys(pnlData);
    if (!labels.length) {
        canvas.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'flex';
        return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    canvas.style.display = 'block';
    if (_inv.chartPnl) { try { _inv.chartPnl.destroy(); } catch (_) {} _inv.chartPnl = null; }
    const values = labels.map(k => pnlData[k]);
    _inv.chartPnl = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: values.map(v => v >= 0 ? 'rgba(34,197,94,0.7)' : 'rgba(239,68,68,0.7)'),
                borderColor:     values.map(v => v >= 0 ? '#22c55e' : '#ef4444'),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${_fmt(ctx.parsed.x)}` } } },
            scales: {
                x: { ticks: { color: '#333', callback: v => _fmt(v) }, grid: { color: 'rgba(0,0,0,0.07)' } },
                y: { ticks: { color: '#333' } }
            }
        }
    });
}

// ── Chart: portfolio historical evolution (line, as % vs initial) ──────
async function _renderEvolutionChart(period) {
    const canvas   = document.getElementById('invChartEvolution');
    const loadEl   = document.getElementById('invChartEvolutionLoading');
    const emptyEl  = document.getElementById('invChartEvolutionEmpty');
    const labelEl  = document.getElementById('invEvolLabel');
    if (!canvas) return;

    if (!_inv.posiciones.length) {
        canvas.style.display = 'none';
        if (loadEl)  { loadEl.style.display  = 'none'; }
        if (emptyEl) { emptyEl.style.display = 'flex'; }
        return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    canvas.style.display = 'none';
    if (loadEl) loadEl.style.display = 'flex';

    try {
        // Use ALL tickers ever traded (including closed positions) so historical P&L is accurate
        const allTickers = [...new Set(_inv.operaciones.map(o => o.ticker).filter(Boolean))];

        // Fetch cached history per ticker in parallel
        const historias = {};
        await Promise.all(allTickers.map(async ticker => {
            try {
                const r = await fetch(`/bolsa/ticker-history/${encodeURIComponent(ticker)}`);
                if (r.ok) { const j = await r.json(); historias[ticker] = j.data || []; }
            } catch (_) {}
        }));

        // Period cutoff
        const monthsMap = { '3mo': 3, '6mo': 6, '1y': 12, '2y': 24 };
        const months = monthsMap[period] || 3;
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - months);
        const cutoffStr = cutoff.toISOString().slice(0, 10);

        // Collect all dates in range
        const allDates = new Set();
        for (const rows of Object.values(historias)) {
            for (const r of rows) { if (r.fecha >= cutoffStr) allDates.add(r.fecha); }
        }
        const sortedDates = Array.from(allDates).sort();
        if (!sortedDates.length) throw new Error('no-data');

        // Forward-fill price maps
        const priceMaps = {};
        for (const [ticker, rows] of Object.entries(historias)) {
            const m = {};
            for (const r of rows) m[r.fecha] = r.precio_cierre;
            priceMaps[ticker] = m;
        }
        function getPriceFill(ticker, date) {
            const m = priceMaps[ticker] || {};
            if (m[date] != null) return m[date];
            const sorted = Object.keys(m).sort();
            let last = null;
            for (const d of sorted) { if (d <= date) last = m[d]; else break; }
            return last;
        }

        // Build per-ticker shares-held map from ALL operations (including closed positions)
        const sharesAtDate = {};
        for (const ticker of allTickers) {
            const ops = _inv.operaciones
                .filter(o => o.ticker === ticker)
                .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
            let cum = 0;
            const changes = [];
            for (const o of ops) {
                cum += o.tipo === 'compra' ? o.cantidad : -o.cantidad;
                changes.push({ fecha: o.fecha, shares: Math.max(0, cum) });
            }
            sharesAtDate[ticker] = changes;
        }
        function getSharesAt(ticker, date) {
            const changes = sharesAtDate[ticker] || [];
            let held = 0;
            for (const c of changes) { if (c.fecha <= date) held = c.shares; else break; }
            return held;
        }

        // Build cumulative net-invested series per date:
        //   compra  → +cantidad × precio + comision
        //   venta   → −(cantidad × precio − comision)  (devuelve cash neto)
        const allOps = _inv.operaciones.slice().sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
        let cumulInvested = 0;
        let opPtr = 0;
        const investedByDate = {};
        for (const date of sortedDates) {
            while (opPtr < allOps.length && allOps[opPtr].fecha <= date) {
                const o = allOps[opPtr++];
                const cashFlow = o.cantidad * o.precio_unitario + (o.comision || 0);
                cumulInvested += o.tipo === 'compra' ? cashFlow : -cashFlow;
            }
            investedByDate[date] = cumulInvested;
        }

        // Build P&L series: absolute € (seriesEur) and % of net invested (seriesPct)
        const seriesEur = [];
        const seriesPct = [];
        for (const date of sortedDates) {
            const invested = investedByDate[date];
            if (!invested || invested <= 0) { seriesEur.push(null); seriesPct.push(null); continue; }
            let portfolioVal = 0;
            let found = false;
            for (const ticker of allTickers) {
                const shares = getSharesAt(ticker, date);
                if (shares <= 0) continue;
                const p = getPriceFill(ticker, date);
                if (p != null) { portfolioVal += p * shares; found = true; }
            }
            if (!found) { seriesEur.push(null); seriesPct.push(null); continue; }
            const pnl = portfolioVal - invested;
            seriesEur.push(parseFloat(pnl.toFixed(2)));
            seriesPct.push(parseFloat((pnl / invested * 100).toFixed(4)));
        }

        // Trim leading nulls
        const firstValid = seriesEur.findIndex(v => v !== null);
        if (firstValid < 0) throw new Error('no-data');
        const labels  = sortedDates.slice(firstValid);
        const dataEur = seriesEur.slice(firstValid);
        const dataPct = seriesPct.slice(firstValid);

        if (_inv.chartEvol) { try { _inv.chartEvol.destroy(); } catch (_) {} _inv.chartEvol = null; }
        if (loadEl) loadEl.style.display = 'none';
        canvas.style.display = 'block';

        // Period label: P&L € y % acumulados al final de la ventana seleccionada
        const lastEur = [...dataEur].reverse().find(v => v !== null) ?? null;
        const lastPct = [...dataPct].reverse().find(v => v !== null) ?? null;
        if (labelEl) {
            if (lastEur !== null && lastPct !== null) {
                labelEl.textContent = (lastEur >= 0 ? '+' : '') + _fmt(lastEur) + '  /  ' + _fmtPct(lastPct);
                labelEl.style.color = lastEur >= 0 ? 'var(--color-ingreso,#22c55e)' : 'var(--color-gasto,#ef4444)';
            } else {
                labelEl.textContent = '—';
                labelEl.style.color = '';
            }
        }

        const lineColor = (lastEur ?? 0) >= 0 ? '#22c55e' : '#ef4444';
        _inv.chartEvol = new Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'P&L €', data: dataEur,
                    borderColor: lineColor, backgroundColor: lineColor + '28',
                    borderWidth: 2, fill: true, tension: 0.1,
                    pointRadius: 0, pointHoverRadius: 5,
                    spanGaps: true, yAxisID: 'y'
                }, {
                    label: 'P&L %', data: dataPct,
                    borderColor: lineColor + 'aa', backgroundColor: 'transparent',
                    borderWidth: 1.5, fill: false, tension: 0.1,
                    pointRadius: 0, pointHoverRadius: 5,
                    spanGaps: true, borderDash: [5, 3], yAxisID: 'y1'
                }, {
                    // Zero line reference
                    label: '_zero', data: labels.map(() => 0),
                    borderColor: 'rgba(0,0,0,0.15)', backgroundColor: 'transparent',
                    borderWidth: 1, borderDash: [4, 4], pointRadius: 0, fill: false, yAxisID: 'y'
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        mode: 'index', intersect: false,
                        filter: item => item.datasetIndex <= 1,
                        callbacks: {
                            label: ctx => {
                                if (ctx.datasetIndex === 0) {
                                    const v = ctx.parsed.y;
                                    return ` P&L: ${v >= 0 ? '+' : ''}${_fmt(v)}`;
                                }
                                const v = ctx.parsed.y;
                                return ` ${v >= 0 ? '+' : ''}${v.toFixed(2)} %`;
                            }
                        }
                    }
                },
                scales: {
                    x: { ticks: { color: '#333', maxTicksLimit: 10, maxRotation: 45 }, grid: { color: 'rgba(0,0,0,0.07)' } },
                    y: {
                        position: 'left',
                        ticks: { color: '#333', callback: v => _fmt(v, 0) },
                        grid: { color: 'rgba(0,0,0,0.07)' }
                    },
                    y1: {
                        position: 'right',
                        ticks: { color: '#333', callback: v => (v >= 0 ? '+' : '') + v.toFixed(1) + ' %' },
                        grid: { drawOnChartArea: false }
                    }
                },
                interaction: { mode: 'nearest', axis: 'x', intersect: false }
            }
        });
    } catch (err) {
        if (loadEl) loadEl.style.display = 'none';
        if (err.message === 'no-data') {
            if (emptyEl) emptyEl.style.display = 'flex';
        } else {
            canvas.style.display = 'block';
        }
    }
}

// ── Sub-tab OPERACIONES ────────────────────────────────────────────────
function _renderOperaciones() {
    const tbody = document.getElementById('tbodyOperaciones');
    if (!tbody) return;
    if (!_inv.operaciones.length) {
        tbody.innerHTML = `<tr><td colspan="10" class="text-center text-muted">${gestorIdiomas?.obtenerTexto('inversiones.sinOperaciones') || 'Sin operaciones registradas'}</td></tr>`;
        return;
    }
    tbody.innerHTML = _inv.operaciones.map(op => {
        const total = op.cantidad * op.precio_unitario + (op.comision || 0);
        const cls   = op.tipo === 'compra' ? 'text-green' : 'text-red';
        return `<tr data-id="${op.id}">
            <td class="editable-op" data-field="tipo"><span class="${cls}">${op.tipo === 'compra' ? `▲ ${gestorIdiomas?.obtenerTexto('inversiones.compra') || 'Compra'}` : `▼ ${gestorIdiomas?.obtenerTexto('inversiones.venta') || 'Venta'}`}</span></td>
            <td class="editable-op" data-field="ticker"><strong>${op.ticker}</strong></td>
            <td class="editable-op" data-field="empresa">${op.empresa || '—'}</td>
            <td class="editable-op" data-field="fecha">${op.fecha}</td>
            <td class="editable-op" data-field="cantidad">${_fmtNum(op.cantidad)}</td>
            <td class="editable-op" data-field="precio_unitario">${_fmt(op.precio_unitario)}</td>
            <td class="editable-op" data-field="comision">${_fmt(op.comision || 0)}</td>
            <td>${_fmt(total)}</td>
            <td class="editable-op" data-field="notas">${op.notas || '—'}</td>
            <td>
                <button class="btn-icon btn-edit-op" data-id="${op.id}" title="Editar" style="margin-right:4px;"><i class="fas fa-edit"></i></button>
                <button class="btn-icon btn-delete-op" data-id="${op.id}" title="Eliminar"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('');
}

async function _editOperacion(id) {
    const tr = document.querySelector(`#tbodyOperaciones tr[data-id="${id}"]`);
    if (!tr) return;
    const op = _inv.operaciones.find(o => String(o.id) === String(id));
    if (!op) return;

    const cells = tr.querySelectorAll('td.editable-op');
    cells.forEach(cell => {
        const field = cell.dataset.field;
        let input;
        if (field === 'tipo') {
            input = document.createElement('select');
            input.style.width = '90px';
            ['compra','venta'].forEach(v => {
                const opt = document.createElement('option');
                opt.value = v; opt.textContent = v.charAt(0).toUpperCase() + v.slice(1);
                if (op.tipo === v) opt.selected = true;
                input.appendChild(opt);
            });
        } else if (field === 'fecha') {
            input = document.createElement('input');
            input.type = 'date'; input.value = op.fecha || ''; input.style.width = '130px';
        } else if (field === 'cantidad' || field === 'precio_unitario' || field === 'comision') {
            input = document.createElement('input');
            input.type = 'number'; input.step = '0.0001'; input.min = '0';
            input.value = op[field] || 0; input.style.width = '90px';
        } else {
            input = document.createElement('input');
            input.type = 'text';
            const raw = field === 'ticker' ? op.ticker : (op[field] || '');
            input.value = raw;
            if (field === 'ticker') { input.style.width = '70px'; input.style.textTransform = 'uppercase'; }
        }
        cell.innerHTML = '';
        cell.appendChild(input);
    });

    // Replace action buttons
    const actCell = tr.querySelector('td:last-child');
    actCell.innerHTML = `
        <button class="btn-icon btn-save-op" data-id="${id}" title="Guardar" style="margin-right:4px;"><i class="fas fa-check"></i></button>
        <button class="btn-icon btn-cancel-op" data-id="${id}" title="Cancelar"><i class="fas fa-times"></i></button>
    `;
    actCell.querySelector('.btn-save-op').onclick = () => _saveOperacion(id);
    actCell.querySelector('.btn-cancel-op').onclick = () => _renderOperaciones();
}

async function _saveOperacion(id) {
    const tr = document.querySelector(`#tbodyOperaciones tr[data-id="${id}"]`);
    if (!tr) return;
    const op = _inv.operaciones.find(o => String(o.id) === String(id));
    if (!op) return;

    const data = { id: Number(id) };
    tr.querySelectorAll('td.editable-op').forEach(cell => {
        const field = cell.dataset.field;
        const input = cell.querySelector('input, select');
        if (!input) return;
        let val = input.value;
        if (field === 'ticker') val = val.trim().toUpperCase();
        else if (field === 'cantidad' || field === 'precio_unitario' || field === 'comision') val = parseFloat(val) || 0;
        data[field] = val;
    });
    if (!data.ticker) data.ticker = op.ticker;

    if (!data.ticker || !data.fecha || !data.cantidad || !data.precio_unitario) {
        alert(gestorIdiomas?.obtenerTexto('inversiones.camposObligatorios') || 'Ticker, fecha, cantidad y precio son obligatorios.');
        return;
    }
    try {
        const res = await fetch(`/bolsa/operaciones/${id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Error desconocido'); }
        delete _inv.priceCache[data.ticker];
        await _refreshAll(true);
    } catch (err) { alert(gestorIdiomas?.obtenerTexto('inversiones.camposObligatorios') ? err.message : 'Error al guardar: ' + err.message); }
}

async function _addOperacion() {
    const tipo     = document.getElementById('tipoOperacion')?.value;
    const ticker   = document.getElementById('tickerOperacion')?.value.trim().toUpperCase();
    const empresa  = document.getElementById('empresaOperacion')?.value.trim();
    const fecha    = document.getElementById('fechaOperacion')?.value;
    const cantidad = parseFloat(document.getElementById('cantidadOperacion')?.value);
    const precio   = parseFloat(document.getElementById('precioOperacion')?.value);
    const comision = parseFloat(document.getElementById('comisionOperacion')?.value) || 0;
    const notas    = document.getElementById('notasOperacion')?.value.trim();

    if (!ticker || !fecha || isNaN(cantidad) || isNaN(precio)) {
        alert(gestorIdiomas?.obtenerTexto('inversiones.camposObligatorios') || 'Ticker, fecha, cantidad y precio son obligatorios.');
        return;
    }
    try {
        const res = await fetch('/bolsa/operaciones', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tipo, ticker, empresa, fecha, cantidad, precio_unitario: precio, comision, notas })
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Error desconocido'); }
        ['tickerOperacion','empresaOperacion','cantidadOperacion','precioOperacion','comisionOperacion','notasOperacion']
            .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        // Invalidate price cache for this ticker so refresh gets live price
        delete _inv.priceCache[ticker];
        await _refreshAll(true);
    } catch (err) { alert('Error al guardar: ' + err.message); }
}

async function _deleteOperacion(id) {
    const msg = gestorIdiomas?.obtenerTexto('inversiones.confirmarEliminarOp') || '¿Eliminar esta operación?';
    if (!confirm(msg)) return;
    try { await fetch(`/bolsa/operaciones/${id}`, { method: 'DELETE' }); await _refreshAll(true); }
    catch (err) { alert('Error: ' + err.message); }
}

// ── Sub-tab DIVIDENDOS ─────────────────────────────────────────────────
function _renderDividendos() {
    const tbody = document.getElementById('tbodyDividendos');
    if (!tbody) return;
    if (!_inv.dividendos.length) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted">${gestorIdiomas?.obtenerTexto('inversiones.sinDividendos') || 'Sin dividendos. Pulsa "Sincronizar" para obtenerlos de Yahoo Finance.'}</td></tr>`;
        return;
    }

    // Sort by date desc
    const sorted = [..._inv.dividendos].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

    const retencionGlobal = parseFloat(localStorage.getItem('retencionDividendos') || '0');

    tbody.innerHTML = sorted.map(d => {
        const bruto     = d.importe_bruto || 0;
        const retencion = (d.retencion || 0) !== 0 ? (d.retencion || 0) : bruto * retencionGlobal / 100;
        const neto      = bruto - retencion;
        const badge = d.source === 'auto'
            ? '<span style="font-size:10px;background:#6366f120;color:#818cf8;padding:2px 6px;border-radius:4px;">Auto</span>'
            : '<span style="font-size:10px;background:#f59e0b20;color:#f59e0b;padding:2px 6px;border-radius:4px;">Manual</span>';
        // Estimate shares held: importe_bruto / importe_por_accion (if available)
        const acciones = d.importe_por_accion > 0
            ? _fmtNum(d.importe_bruto / d.importe_por_accion, 0)
            : '—';
        return `<tr>
            <td><strong>${d.ticker}</strong></td>
            <td>${d.empresa || '—'}</td>
            <td>${d.fecha}</td>
            <td>${d.importe_por_accion ? _fmt(d.importe_por_accion, 4) : '—'}</td>
            <td>${acciones}</td>
            <td>${_fmt(bruto)}</td>
            <td>${_fmt(retencion)}</td>
            <td>${_fmt(neto)}</td>
            <td>${badge}</td>
        </tr>`;
    }).join('');
}

async function _syncDividendos() {
    const btn    = document.getElementById('btnSyncDividendos');
    const status = document.getElementById('invDivSyncStatus');
    if (btn) { btn.disabled = true; btn.querySelector('i').className = 'fas fa-spinner fa-spin'; }
    if (status) status.textContent = gestorIdiomas?.obtenerTexto('inversiones.sincronizando') || 'Sincronizando…';
    try {
        const res = await fetch('/bolsa/sync-dividendos', { method: 'POST' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Error desconocido');
        const added = json.totalAdded || 0;
        if (status) status.textContent = added > 0 ? `${added} dividendo${added !== 1 ? 's' : ''} importado${added !== 1 ? 's' : ''}` : (gestorIdiomas?.obtenerTexto('inversiones.sinDividendosEncontrados') || 'Sin dividendos encontrados');
        // Full reload of all data so every KPI and table reflects the new state
        await _refreshAll(true);
    } catch (err) {
        if (status) status.textContent = 'Error: ' + err.message;
    } finally {
        if (btn) { btn.disabled = false; btn.querySelector('i').className = 'fas fa-sync-alt'; }
        setTimeout(() => { if (status) status.textContent = ''; }, 4000);
    }
}

// ── Refresh all data ───────────────────────────────────────────────────
async function _refreshAll(force = false) {
    await _loadBolsaData(force);
    _renderOperaciones();
    _renderDividendos();
    const active = document.querySelector('#inversiones .subtab:not(.display-none)');
    if (!active) return;
    if (active.id === 'tabInvActivos') await _renderActivos();
    if (active.id === 'tabInvCartera') await _renderCartera();
    if (active.id === 'tabInvResumen') await _renderResumen();
    if (active.id === 'tabInvCuentaRemunerada') await loadCuentaRemuneradaTab();
}

// ── Cerrar posición ────────────────────────────────────────────────────
function _openClosePositionModal(ticker, empresa, cantidad, precioActual) {
    const modal = document.getElementById('invClosePositionModal');
    if (!modal) return;
    document.getElementById('cpTicker').value   = ticker;
    document.getElementById('cpEmpresa').value  = empresa || ticker;
    document.getElementById('cpCantidad').value = cantidad;
    document.getElementById('cpPrecio').value   = precioActual !== '' ? Number(precioActual).toFixed(4) : '';
    document.getElementById('cpComision').value = '0';
    document.getElementById('cpNotas').value    = '';
    document.getElementById('cpFecha').value    = new Date().toISOString().slice(0, 10);
    modal.style.display = 'flex';
    document.getElementById('cpPrecio').focus();
}

async function _confirmClosePosition() {
    const ticker   = document.getElementById('cpTicker').value.trim().toUpperCase();
    const empresa  = document.getElementById('cpEmpresa').value.trim();
    const cantidad = parseFloat(document.getElementById('cpCantidad').value);
    const precio   = parseFloat(document.getElementById('cpPrecio').value);
    const fecha    = document.getElementById('cpFecha').value;
    const comision = parseFloat(document.getElementById('cpComision').value) || 0;
    const notas    = document.getElementById('cpNotas').value.trim();

    if (!ticker || !cantidad || cantidad <= 0 || !precio || precio <= 0 || !fecha) {
        window.showToast?.(gestorIdiomas?.obtenerTexto('formularios.completaCampos') || 'Completa todos los campos obligatorios.', 'warning');
        return;
    }

    const btn = document.getElementById('invClosePositionConfirm');
    if (btn) { btn.disabled = true; btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${gestorIdiomas?.obtenerTexto('formularios.guardando') || 'Guardando…'}`; }

    try {
        const res = await fetch('/bolsa/operaciones', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tipo: 'venta', ticker, empresa, fecha, cantidad, precio_unitario: precio, comision, notas })
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Error'); }
        document.getElementById('invClosePositionModal').style.display = 'none';
        window.showToast?.(`Posición de ${ticker} cerrada`, 'success');
        _inv.priceCache = {};
        await _refreshAll(true);
    } catch (err) {
        window.showToast?.('Error: ' + err.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = `<i class="fas fa-sign-out-alt"></i> ${gestorIdiomas?.obtenerTexto('inversiones.confirmarVenta') || 'Confirmar venta'}`; }
    }
}

// ── Importación CSV (Trade Republic y formato genérico) ───────────────

// Mapa estático ISIN → ticker estándar (ampliable)
const ISIN_TICKER_MAP = {
    'US67066G1040': 'NVDA',   // NVIDIA
    'US0378331005': 'AAPL',   // Apple
    'KYG9830T1067': '1810.HK',// Xiaomi (HK)
    'US36162J1060': 'GEO',    // GEO Group
    'US0231351067': 'AMZN',   // Amazon
    'US02079K3059': 'GOOGL',  // Alphabet A
    'US0079031078': 'AMD',    // AMD
    'US88160R1014': 'TSLA',   // Tesla
    'US4330001060': 'HIMS',   // Hims & Hers
    'US69608A1088': 'PLTR',   // Palantir
    'US38259P5089': 'GOOG',   // Alphabet C
    'US5949181045': 'MSFT',   // Microsoft
    'US4592001014': 'IBM',    // IBM
    'US4781601046': 'JNJ',    // J&J
    'US46625H1005': 'JPM',    // JPMorgan
    'US30303M1027': 'META',   // Meta
    'US9311421039': 'WMT',    // Walmart
    'US1912161007': 'KO',     // Coca-Cola
    'US7427181091': 'PG',     // P&G
    'US4592001014': 'IBM',
    'US17275R1023': 'CSCO',   // Cisco
    'US0605051046': 'BA',     // Boeing
    'US2546871060': 'DIS',    // Disney
    'US6311031081': 'NKE',    // Nike
    'US7170811035': 'PFE',    // Pfizer
    'US4781601046': 'JNJ',
    'US57636Q1040': 'MA',     // Mastercard
    'US92343V1044': 'V',      // Visa (no, wrong ISIN)
    'US92826C8394': 'V',      // Visa
    'US0846707026': 'BRK-B',  // Berkshire B
    'US1255231003': 'CI',     // Cigna
};

/** Parsea un CSV con campos entre comillas, devuelve array de objetos */
function _parseCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];

    function parseRow(line) {
        const fields = [];
        let cur = '', inQ = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
                else inQ = !inQ;
            } else if (ch === ',' && !inQ) {
                fields.push(cur); cur = '';
            } else {
                cur += ch;
            }
        }
        fields.push(cur);
        return fields;
    }

    const headers = parseRow(lines[0]);
    return lines.slice(1).map(line => {
        const vals = parseRow(line);
        const obj = {};
        headers.forEach((h, i) => { obj[h.trim()] = (vals[i] || '').trim(); });
        return obj;
    });
}

/** Convierte filas CSV de Trade Republic a estructura de operacion_bolsa */
function _mapTradeRepublicRow(row) {
    // Solo BUY y SELL de TRADING con asset_class STOCK
    if (row.category !== 'TRADING') return null;
    if (row.type !== 'BUY' && row.type !== 'SELL') return null;
    if (row.asset_class !== 'STOCK') return null;

    const isin   = (row.symbol || '').trim();
    const name   = (row.name   || '').trim();
    const tipo   = row.type === 'BUY' ? 'compra' : 'venta';
    const fecha  = (row.date || '').slice(0, 10);

    // Ticker: ISIN map → existing ticker in DB (resolved later) → ISIN fallback
    const ticker = ISIN_TICKER_MAP[isin] || isin;

    const cantidad = Math.abs(parseFloat(row.shares) || 0);
    const precio   = Math.abs(parseFloat(row.price)  || 0);
    const comision = Math.abs(parseFloat(row.fee)    || 0);

    if (!fecha || cantidad <= 0 || precio <= 0) return null;

    return { tipo, ticker, empresa: name, fecha, cantidad, precio_unitario: precio, comision, isin, _raw: row };
}

let _importPendingRows = [];

function _openImportModal(rows) {
    _importPendingRows = rows;
    const modal  = document.getElementById('invImportModal');
    const tbody  = document.getElementById('invImportPreviewBody');
    const sumEl  = document.getElementById('invImportSummary');
    const btnLbl = document.getElementById('invImportBtnLabel');
    if (!modal || !tbody) return;

    // Match ISIN against known app tickers by empresa name
    const appTickers = {};
    for (const op of _inv.operaciones) {
        if (op.empresa) appTickers[op.empresa.toLowerCase()] = op.ticker;
        appTickers[op.ticker.toLowerCase()] = op.ticker;
    }

    // Enrich with app ticker if known
    rows.forEach(r => {
        const nameKey = r.empresa.toLowerCase();
        if (appTickers[nameKey]) r.ticker = appTickers[nameKey];
    });

    const compras = rows.filter(r => r.tipo === 'compra').length;
    const ventas  = rows.filter(r => r.tipo === 'venta').length;
    sumEl.textContent = `${rows.length} operaciones encontradas: ${compras} compras, ${ventas} ventas. Puedes editar los tickers antes de importar.`;
    btnLbl.textContent = `Importar ${rows.length}`;

    tbody.innerHTML = rows.map((r, idx) => {
        const cls = r.tipo === 'compra' ? 'color:#16a34a' : 'color:#dc2626';
        const total = (r.cantidad * r.precio_unitario + r.comision).toFixed(2);
        return `<tr data-idx="${idx}" style="border-bottom:1px solid #f3f4f6;">
            <td style="padding:6px 10px;"><input type="checkbox" class="imp-chk" data-idx="${idx}" checked></td>
            <td style="padding:6px 10px;font-weight:600;${cls}">${r.tipo === 'compra' ? '▲' : '▼'} ${r.tipo}</td>
            <td style="padding:6px 10px;white-space:nowrap;">${r.fecha}</td>
            <td style="padding:6px 10px;">${r.empresa}</td>
            <td style="padding:6px 10px;">
                <input type="text" class="imp-ticker" data-idx="${idx}" value="${r.ticker}"
                    style="width:90px;text-transform:uppercase;font-weight:600;padding:3px 6px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;">
                <span style="font-size:10px;color:#9ca3af;">${r.isin}</span>
            </td>
            <td style="padding:6px 10px;text-align:right;">${_fmtNum(r.cantidad, 6)}</td>
            <td style="padding:6px 10px;text-align:right;">${_fmt(r.precio_unitario, 4)}</td>
            <td style="padding:6px 10px;text-align:right;">${r.comision > 0 ? _fmt(r.comision) : '—'}</td>
            <td style="padding:6px 10px;" class="imp-status-${idx}"></td>
        </tr>`;
    }).join('');

    modal.style.display = 'flex';
}

async function _executeImport() {
    const rows    = _importPendingRows;
    const modal   = document.getElementById('invImportModal');
    const confirm = document.getElementById('invImportModalConfirm');
    if (!rows.length) return;

    // Read current ticker values and checkbox state from table
    const checked = new Set();
    document.querySelectorAll('.imp-chk:checked').forEach(cb => checked.add(Number(cb.dataset.idx)));
    document.querySelectorAll('.imp-ticker').forEach(inp => {
        const idx = Number(inp.dataset.idx);
        rows[idx].ticker = inp.value.trim().toUpperCase() || rows[idx].ticker;
    });

    const toImport = rows.filter((_, i) => checked.has(i));
    if (!toImport.length) { alert(gestorIdiomas?.obtenerTexto('inversiones.sinOperacionesSeleccionadas') || 'No hay operaciones seleccionadas.'); return; }

    if (confirm) { confirm.disabled = true; confirm.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${gestorIdiomas?.obtenerTexto('formularios.importando') || 'Importando…'}`; }

    let ok = 0, errors = 0;
    for (const [i, r] of toImport.entries()) {
        // Find original idx for status cell
        const origIdx = rows.indexOf(r);
        const statusEl = document.querySelector(`.imp-status-${origIdx}`);
        try {
            const res = await fetch('/bolsa/operaciones', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tipo: r.tipo, ticker: r.ticker, empresa: r.empresa,
                    fecha: r.fecha, cantidad: r.cantidad,
                    precio_unitario: r.precio_unitario, comision: r.comision,
                    notas: `Importado: ${r.isin}`
                })
            });
            if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Error'); }
            if (statusEl) statusEl.innerHTML = '<span style="color:#16a34a;">✓</span>';
            ok++;
        } catch (err) {
            if (statusEl) statusEl.innerHTML = `<span style="color:#dc2626;" title="${err.message}">✗</span>`;
            errors++;
        }
    }

    if (confirm) { confirm.disabled = false; confirm.innerHTML = `<i class="fas fa-check"></i> <span id="invImportBtnLabel">Importar</span>`; }

    if (ok > 0) {
        _inv.priceCache = {};
        await _refreshAll(true);
        window.showToast(`${ok} operación${ok !== 1 ? 'es' : ''} importada${ok !== 1 ? 's' : ''} correctamente`, 'success');
    }
    if (errors > 0) window.showToast(`${errors} operación${errors !== 1 ? 'es' : ''} fallaron al importar`, 'error', 4000);

    if (!errors) { if (modal) modal.style.display = 'none'; }
}

function _initImportEvents() {
    const fileInput   = document.getElementById('importOpFile');
    const importBtn   = document.getElementById('btnImportarOperaciones');
    const modal       = document.getElementById('invImportModal');
    const closeBtn    = document.getElementById('invImportModalClose');
    const cancelBtn   = document.getElementById('invImportModalCancel');
    const confirmBtn  = document.getElementById('invImportModalConfirm');

    importBtn?.addEventListener('click', () => fileInput?.click());

    fileInput?.addEventListener('change', e => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            const rows = _parseCSV(ev.target.result)
                .map(_mapTradeRepublicRow)
                .filter(Boolean);
            fileInput.value = ''; // reset so same file can be re-selected
            if (!rows.length) {
                window.showToast('No se encontraron operaciones de compra/venta en el archivo.', 'warning');
                return;
            }
            _openImportModal(rows);
        };
        reader.readAsText(file, 'utf-8');
    });

    closeBtn?.addEventListener('click',  () => { if (modal) modal.style.display = 'none'; });
    cancelBtn?.addEventListener('click', () => { if (modal) modal.style.display = 'none'; });
    confirmBtn?.addEventListener('click', _executeImport);

    // Close on backdrop click
    modal?.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
}

// ── Sub-tab RESUMEN OPERACIONES ─────────────────────────────────────
async function _renderResumen() {
    // Show loading state
    ['resTopPct','resBottomPct','resTopEur','resBottomEur','resMasMovidasBody'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Cargando\u2026</td></tr>';
    });

    let stats;
    try {
        const res = await fetch('/bolsa/estadisticas');
        if (!res.ok) throw new Error('fetch failed');
        stats = await res.json();
    } catch (_) {
        ['resTopPct','resBottomPct','resTopEur','resBottomEur','resMasMovidasBody'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Error al cargar</td></tr>';
        });
        return;
    }

    // KPIs
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('resOpsTotal',    stats.num_operaciones ?? '\u2014');
    set('resOpsCompras',  stats.num_compras     ?? '\u2014');
    set('resOpsVentas',   stats.num_ventas      ?? '\u2014');
    set('resOpsTickers',  stats.num_tickers     ?? '\u2014');
    const ganTotalEl = document.getElementById('resOpsGanTotal');
    if (ganTotalEl) {
        const g = stats.ganancia_total_ventas ?? 0;
        ganTotalEl.textContent = _fmt(g);
        ganTotalEl.style.color = g >= 0 ? 'var(--color-ingreso,#22c55e)' : 'var(--color-gasto,#ef4444)';
    }

    // Render a ranking table body
    function _rankRows(list, eurFirst) {
        if (!list || !list.length) return '<tr><td colspan="7" class="text-center text-muted">Sin ventas registradas</td></tr>';
        return list.map(v => {
            const pct = v.ganancia_pct;
            const eur = v.ganancia_eur;
            const pctCls = pct >= 0 ? 'style="color:var(--color-ingreso,#22c55e);font-weight:600"' : 'style="color:var(--color-gasto,#ef4444);font-weight:600"';
            const eurCls = eur >= 0 ? 'style="color:var(--color-ingreso,#22c55e);font-weight:600"' : 'style="color:var(--color-gasto,#ef4444);font-weight:600"';
            const col1 = eurFirst
                ? `<td ${eurCls}>${_fmt(eur)}</td><td ${pctCls}>${_fmtPct(pct)}</td>`
                : `<td ${pctCls}>${_fmtPct(pct)}</td><td ${eurCls}>${_fmt(eur)}</td>`;
            return `<tr>
                <td><strong>${v.ticker}</strong><br><span style="font-size:11px;color:#888">${v.empresa || ''}</span></td>
                <td style="white-space:nowrap">${v.fecha}</td>
                <td>${_fmtNum(v.cantidad, 4)}</td>
                <td>${_fmt(v.precio_venta, 4)}</td>
                <td>${_fmt(v.precio_coste, 4)}</td>
                ${col1}
            </tr>`;
        }).join('');
    }

    document.getElementById('resTopPct').innerHTML    = _rankRows(stats.top_pct,    false);
    document.getElementById('resBottomPct').innerHTML = _rankRows(stats.bottom_pct, false);
    document.getElementById('resTopEur').innerHTML    = _rankRows(stats.top_eur,    true);
    document.getElementById('resBottomEur').innerHTML = _rankRows(stats.bottom_eur, true);

    // Most moved tickers
    const movBody = document.getElementById('resMasMovidasBody');
    if (movBody) {
        if (!stats.mas_movidos || !stats.mas_movidos.length) {
            movBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Sin operaciones</td></tr>';
        } else {
            movBody.innerHTML = stats.mas_movidos.map((t, i) => `<tr>
                <td style="color:#888;font-size:12px">${i + 1}</td>
                <td><strong>${t.ticker}</strong></td>
                <td>${t.empresa || '\u2014'}</td>
                <td style="text-align:center;font-weight:600">${t.num_ops}</td>
                <td style="text-align:right">${_fmt(t.vol_eur)}</td>
            </tr>`).join('');
        }
    }
}

// ── Cuenta Remunerada vinculada a bolsa ──────────────────────────────

async function loadCuentaRemuneradaTab() {
    let data;
    try {
        const retencionDivPct = parseFloat(localStorage.getItem('retencionDividendos') || '0');
        const r1 = await fetch('/bolsa/cuenta-remunerada/saldo-diario?retencionDivPct=' + retencionDivPct);
        if (!r1.ok) {
            const errData = await r1.json().catch(() => ({}));
            console.error('[CuentaRemunerada] saldo-diario error:', errData);
            window.showToast?.('Error al cargar datos de cuenta remunerada: ' + (errData.error || r1.status), 'error');
        }
        data = r1.ok ? await r1.json() : null;
    } catch (err) {
        window.showToast?.('Error al cargar cuenta remunerada: ' + err.message, 'error');
        return;
    }
    _inv.crData = data;

    // KPIs
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    if (data && data.cuenta) {
        // saldoHoy = saldo en min(hoy, fechaFin) — calculado en CuentaRemuneradaService
        set('invCRSaldo',       _fmt(data.saldoHoy || 0));
        set('invCRInvertido',   _fmt(data.saldoInvertido));
        set('invCRInteresBruto',_fmt(data.interesAcumuladoBruto));
        set('invCRInteresNeto', _fmt(data.interesAcumuladoNeto));
        set('invCRPct',         (data.tasaAnualEfectiva || 0).toFixed(2) + ' %');
    } else {
        ['invCRSaldo','invCRInvertido','invCRInteresBruto','invCRInteresNeto','invCRPct']
            .forEach(id => set(id, '—'));
    }

    try { _renderCRChart(data); } catch(e) { console.error('Error rendering CR chart:', e); }

    // Debug: log what was received
    console.log('[CuentaRemunerada] data:', data ? `cuenta=${data.cuenta?.descripcion}, series=${data.saldoSeries?.length}` : 'null');
}

function _renderCRChart(data) {
    const canvas  = document.getElementById('invChartCRBalance');
    const emptyEl = document.getElementById('invChartCREmpty');
    if (!canvas) return;

    if (!data || !data.saldoSeries || !data.saldoSeries.length) {
        canvas.style.display = 'none';
        if (emptyEl) {
            emptyEl.style.display = 'flex';
            const span = emptyEl.querySelector('span');
            if (span) {
                if (!data) {
                    span.textContent = 'Error al cargar datos — revisa la consola (Ctrl+Shift+I)';
                } else if (!data.cuenta) {
                    span.textContent = 'Sin cuenta vinculada — ve a Ingresos → Cuenta Remunerada y pulsa "Vincular"';
                } else {
                    span.textContent = 'Sin datos para el rango de fechas de la cuenta (' + (data.cuenta.desde || '?') + ' → ' + (data.cuenta.hasta || 'hoy') + ')';
                }
            }
        }
        if (_inv.chartCR) { try { _inv.chartCR.destroy(); } catch (_) {} _inv.chartCR = null; }
        return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    canvas.style.display = 'block';

    if (_inv.chartCR) { try { _inv.chartCR.destroy(); } catch (_) {} _inv.chartCR = null; }

    const today = new Date().toISOString().slice(0, 10);
    const series = data.saldoSeries.filter(p => p.fecha <= today);
    // Reducir puntos: mostrar máx 400 puntos (toma cada N días)
    const step = Math.max(1, Math.floor(series.length / 400));
    const reduced = series.filter((_, i) => i % step === 0 || i === series.length - 1);

    const labels   = reduced.map(p => p.fecha);
    const saldos   = reduced.map(p => p.saldo);

    // Marcar las fechas con operaciones de bolsa
    const opDates = {};
    for (const op of (_inv.operaciones || [])) {
        if (!opDates[op.fecha]) opDates[op.fecha] = [];
        opDates[op.fecha].push(op.tipo);
    }

    // Marcar las fechas con dividendos
    const retencionDivPct = parseFloat(localStorage.getItem('retencionDividendos') || '0');
    const divDates = {};
    for (const div of (_inv.dividendos || [])) {
        const f = (div.fecha || '').slice(0, 10);
        const bruto = parseFloat(div.importe_bruto) || 0;
        const ret   = (parseFloat(div.retencion) || 0) !== 0
            ? parseFloat(div.retencion)
            : bruto * retencionDivPct / 100;
        const neto = bruto - ret;
        if (neto > 0) divDates[f] = (divDates[f] || 0) + neto;
    }

    _inv.chartCR = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Saldo CR',
                data: saldos,
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99,102,241,0.08)',
                borderWidth: 2,
                fill: true,
                tension: 0.2,
                pointRadius: labels.map(f => (opDates[f] || divDates[f]) ? 5 : 0),
                pointBackgroundColor: labels.map(f => {
                    if (opDates[f]) return opDates[f].includes('compra') ? '#ef4444' : '#22c55e';
                    if (divDates[f]) return '#f59e0b';
                    return 'transparent';
                }),
                pointBorderColor: labels.map(f => {
                    if (opDates[f]) return opDates[f].includes('compra') ? '#ef4444' : '#22c55e';
                    if (divDates[f]) return '#f59e0b';
                    return 'transparent';
                }),
                pointHoverRadius: 7,
                spanGaps: true
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                datalabels: { display: false },
                tooltip: {
                    mode: 'index', intersect: false,
                    callbacks: {
                        label: ctx => {
                            const f = labels[ctx.dataIndex];
                            const ops = opDates[f];
                            const div = divDates[f];
                            let extra = '';
                            if (ops) extra += ' — ' + ops.map(t => t === 'compra' ? '▼ compra' : '▲ venta').join(', ');
                            if (div) extra += ` — ★ dividendo: +${_fmt(div)}`;
                            return ` Saldo: ${_fmt(ctx.parsed.y)}${extra}`;
                        }
                    }
                }
            },
            scales: {
                x: { ticks: { color: '#555', maxTicksLimit: 12, maxRotation: 30 }, grid: { color: 'rgba(0,0,0,0.05)' } },
                y: { ticks: { color: '#555', callback: v => _fmt(v, 0) }, grid: { color: 'rgba(0,0,0,0.06)' } }
            },
            interaction: { mode: 'nearest', axis: 'x', intersect: false }
        }
    });
    // Force resize after a short delay to handle cases where canvas dimensions
    // weren't fully computed at chart-creation time
    setTimeout(() => { if (_inv.chartCR) try { _inv.chartCR.resize(); } catch (_) {} }, 50);
}

// ── Entry point — se llama en cada apertura de la pestaña ────────────
async function initInversiones() {
    // Destroy charts from previous DOM (DOM is fully rebuilt on every tab visit)
    ['chartCR', 'chartAlloc', 'chartPnl', 'chartEvol'].forEach(key => {
        if (_inv[key]) { try { _inv[key].destroy(); } catch (_) {} _inv[key] = null; }
    });

    // Asegurar que las tablas de bolsa existen (ejecuta migraciones pendientes)
    try { await fetch('/bolsa/ensure-setup', { method: 'POST' }); } catch (_) {}
    // Siempre recarga datos (con caché 60 s) y recablea eventos,
    // porque loadTab() reconstruye el DOM cada visita.
    await _loadBolsaData();

    await _renderActivos();
    _renderOperaciones();
    _renderDividendos();

    const fechaEl = document.getElementById('fechaOperacion');
    if (fechaEl && !fechaEl.value) fechaEl.value = new Date().toISOString().slice(0, 10);

    // ── Sub-tab switching (siempre se recablea — el DOM es nuevo cada visita)
    document.querySelectorAll('#inversiones .subtab-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            _showSubtab(btn.dataset.target);
            if (btn.dataset.target === 'tabInvActivos') await _renderActivos();
            if (btn.dataset.target === 'tabInvCartera') await _renderCartera();
            if (btn.dataset.target === 'tabInvResumen') await _renderResumen();
            if (btn.dataset.target === 'tabInvCuentaRemunerada') await loadCuentaRemuneradaTab();
        });
    });

    // ── Period buttons for evolution chart
    document.querySelectorAll('.inv-period-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            document.querySelectorAll('.inv-period-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _inv.evolPeriod = btn.dataset.period;
            await _renderEvolutionChart(_inv.evolPeriod);
        });
    });

    // ── Refresh activos prices
    document.getElementById('btnRefreshActivos')?.addEventListener('click', async () => {
        _inv.priceCache = {};
        await _renderActivos();
    });

    // ── Cerrar posición (delegated on activos table)
    document.getElementById('tbodyActivos')?.addEventListener('click', e => {
        const btn = e.target.closest('.btn-cerrar-posicion');
        if (!btn) return;
        _openClosePositionModal(btn.dataset.ticker, btn.dataset.empresa, btn.dataset.cantidad, btn.dataset.precio);
    });
    document.getElementById('invClosePositionClose')?.addEventListener('click',  () => { document.getElementById('invClosePositionModal').style.display = 'none'; });
    document.getElementById('invClosePositionCancel')?.addEventListener('click', () => { document.getElementById('invClosePositionModal').style.display = 'none'; });
    document.getElementById('invClosePositionConfirm')?.addEventListener('click', _confirmClosePosition);

    // ── Add operation
    document.getElementById('btnAgregarOperacion')?.addEventListener('click', _addOperacion);

    // ── Delete operations (delegated)
    document.getElementById('tbodyOperaciones')?.addEventListener('click', e => {
        const delBtn = e.target.closest('.btn-delete-op');
        if (delBtn) _deleteOperacion(delBtn.dataset.id);
        const editBtn = e.target.closest('.btn-edit-op');
        if (editBtn) _editOperacion(editBtn.dataset.id);
    });

    // ── Sync dividends
    document.getElementById('btnSyncDividendos')?.addEventListener('click', _syncDividendos);

    // ── Import CSV
    _initImportEvents();

    // ── Refresh resumen
    document.getElementById('btnRefreshResumen')?.addEventListener('click', _renderResumen);

}

if (typeof module !== 'undefined') module.exports = { initInversiones };
