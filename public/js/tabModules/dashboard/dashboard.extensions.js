(function () {
    'use strict';

    // ===== Helpers =====
    function fmt(v) {
        if (v == null || isNaN(v)) return '—';
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v);
    }

    function avg(arr) {
        if (!arr || !arr.length) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    function computeRolling(arr, win) {
        return arr.map((_, i) => {
            const slice = arr.slice(Math.max(0, i - win + 1), i + 1);
            return slice.reduce((a, b) => a + b, 0) / slice.length;
        });
    }

    // ===== Rolling average toggle =====
    const ROLLING_LABEL = 'Media móvil 3M';
    let rollingActive = false;

    function injectRollingToggle() {
        const chartHeader = document.querySelector('.chart-card.full-width .chart-header');
        if (!chartHeader || document.getElementById('toggleMediaMovil')) return;

        const lbl = document.createElement('label');
        lbl.className = 'switch';
        lbl.style.cssText = 'margin-left:auto;white-space:nowrap;font-size:0.82rem;color:var(--text-secondary,#475569);';
        lbl.innerHTML =
            '<input type="checkbox" id="toggleMediaMovil" style="width:auto;min-height:unset;">' +
            '<span style="margin-left:4px;">Media móvil 3M</span>';
        chartHeader.appendChild(lbl);

        document.getElementById('toggleMediaMovil').addEventListener('change', function () {
            rollingActive = this.checked;
            applyRollingAvg();
        });
    }

    function applyRollingAvg() {
        const chart = window._dashCharts && window._dashCharts.gastosMes;
        if (!chart) return;
        const idx = chart.data.datasets.findIndex(function (d) { return d.label === ROLLING_LABEL; });
        if (rollingActive) {
            if (idx >= 0) return;
            const gastos = (window._dashData && window._dashData.gastosMes) || [];
            chart.data.datasets.push({
                label: ROLLING_LABEL,
                data: computeRolling(gastos, 3),
                type: 'line',
                borderColor: 'var(--warning,#eab308)',
                backgroundColor: 'transparent',
                borderWidth: 2.2,
                borderDash: [6, 4],
                fill: false,
                tension: 0.4,
                pointRadius: 0,
                order: 0
            });
        } else {
            if (idx >= 0) chart.data.datasets.splice(idx, 1);
        }
        chart.update();
    }

    // ===== Monthly comparison table (año × mes) con filtros =====
    const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

    var _tableFullData      = null;
    var _selectedYears      = new Set();
    var _selectedMonths     = new Set([1,2,3,4,5,6,7,8,9,10,11,12]);
    var _allAvailableYears  = [];

    function injectMonthlyTable() {
        const grid = document.querySelector('.dashboard-grid');
        if (!grid || document.getElementById('dashTablaComparativa')) return;
        const wrapper = document.createElement('div');
        wrapper.className = 'chart-card full-width';
        wrapper.style.marginTop = '4px';
        wrapper.innerHTML =
            '<h3><i class="fas fa-table icon-primary"></i> Comparativa mensual por año</h3>' +
            '<div id="dashTablaFiltros" style="margin:8px 0 10px;"></div>' +
            '<div id="dashTablaComparativa" style="overflow-x:auto;"></div>';
        grid.appendChild(wrapper);
    }

    function renderMonthlyTable(meses, ingresos, gastos, ahorros) {
        if (!meses || !meses.length) return;
        _tableFullData = { meses: meses, ingresos: ingresos, gastos: gastos, ahorros: ahorros };

        // Add newly seen years as selected by default
        meses.forEach(function (m) {
            const y = String(m).split('-')[0];
            if (!_allAvailableYears.includes(y)) {
                _allAvailableYears.push(y);
                _selectedYears.add(y);
            }
        });
        _allAvailableYears.sort();

        renderTableFilters();
        renderMonthlyTableFiltered();
    }

    function renderTableFilters() {
        const container = document.getElementById('dashTablaFiltros');
        if (!container) return;

        function pill(active) {
            return 'cursor:pointer;border:1px solid ' +
                (active ? 'var(--primary,#16a34a)' : 'var(--border-light,#e2e8f0)') + ';' +
                'border-radius:999px;padding:2px 10px;font-size:0.77rem;font-weight:600;' +
                'background:' + (active ? 'var(--primary,#16a34a)' : 'var(--bg-white,#fff)') + ';' +
                'color:' + (active ? '#fff' : 'var(--text-secondary,#475569)') + ';' +
                'transition:all 0.12s;';
        }

        function allBtn(action) {
            return 'cursor:pointer;border:1px solid var(--border-light,#e2e8f0);border-radius:999px;' +
                'padding:2px 9px;font-size:0.72rem;font-weight:600;background:transparent;' +
                'color:var(--text-tertiary,#64748b);transition:all 0.12s;' +
                'data-bulk="' + action + '"';
        }

        var html = '<div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;margin-bottom:5px;">';
        html += '<span style="font-size:0.73rem;font-weight:700;color:var(--text-tertiary,#64748b);min-width:42px;">Años:</span>';
        _allAvailableYears.forEach(function (y) {
            html += '<button style="' + pill(_selectedYears.has(y)) + '" data-filter="year" data-value="' + y + '">' + y + '</button>';
        });
        html += '<button style="cursor:pointer;border:1px solid var(--border-light,#e2e8f0);border-radius:999px;padding:2px 9px;font-size:0.72rem;font-weight:600;background:transparent;color:var(--text-tertiary,#64748b);" data-bulk="year-all">Todos</button>';
        html += '<button style="cursor:pointer;border:1px solid var(--border-light,#e2e8f0);border-radius:999px;padding:2px 9px;font-size:0.72rem;font-weight:600;background:transparent;color:var(--text-tertiary,#64748b);" data-bulk="year-none">Ninguno</button>';
        html += '</div>';

        html += '<div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">';
        html += '<span style="font-size:0.73rem;font-weight:700;color:var(--text-tertiary,#64748b);min-width:42px;">Meses:</span>';
        MONTH_NAMES.forEach(function (name, i) {
            const m = i + 1;
            html += '<button style="' + pill(_selectedMonths.has(m)) + '" data-filter="month" data-value="' + m + '">' + name + '</button>';
        });
        html += '<button style="cursor:pointer;border:1px solid var(--border-light,#e2e8f0);border-radius:999px;padding:2px 9px;font-size:0.72rem;font-weight:600;background:transparent;color:var(--text-tertiary,#64748b);" data-bulk="month-all">Todos</button>';
        html += '<button style="cursor:pointer;border:1px solid var(--border-light,#e2e8f0);border-radius:999px;padding:2px 9px;font-size:0.72rem;font-weight:600;background:transparent;color:var(--text-tertiary,#64748b);" data-bulk="month-none">Ninguno</button>';
        html += '</div>';

        container.innerHTML = html;

        container.querySelectorAll('button[data-filter]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const type = this.dataset.filter;
                const val  = type === 'year' ? this.dataset.value : parseInt(this.dataset.value, 10);
                const set  = type === 'year' ? _selectedYears : _selectedMonths;
                set.has(val) ? set.delete(val) : set.add(val);
                renderTableFilters();
                renderMonthlyTableFiltered();
            });
        });

        container.querySelectorAll('button[data-bulk]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const action = this.dataset.bulk;
                if (action === 'year-all') {
                    _allAvailableYears.forEach(function (y) { _selectedYears.add(y); });
                } else if (action === 'year-none') {
                    _selectedYears.clear();
                } else if (action === 'month-all') {
                    [1,2,3,4,5,6,7,8,9,10,11,12].forEach(function (m) { _selectedMonths.add(m); });
                } else if (action === 'month-none') {
                    _selectedMonths.clear();
                }
                renderTableFilters();
                renderMonthlyTableFiltered();
            });
        });
    }

    function renderMonthlyTableFiltered() {
        const container = document.getElementById('dashTablaComparativa');
        if (!container || !_tableFullData) return;

        const meses    = _tableFullData.meses;
        const ingresos = _tableFullData.ingresos;
        const gastos   = _tableFullData.gastos;
        const ahorros  = _tableFullData.ahorros;

        // Build filtered map
        const dataMap  = {};
        const monthsSet = new Set();

        meses.forEach(function (m, i) {
            const parts    = String(m).split('-');
            const year     = parts[0];
            const monthNum = parseInt(parts[1], 10);
            if (!_selectedYears.has(year) || !_selectedMonths.has(monthNum)) return;
            if (!dataMap[year]) dataMap[year] = {};
            dataMap[year][monthNum] = { ing: ingresos[i] || 0, gas: gastos[i] || 0, aho: ahorros[i] || 0 };
            monthsSet.add(monthNum);
        });

        const years  = Array.from(_selectedYears).filter(function (y) { return dataMap[y]; }).sort();
        const months = [1,2,3,4,5,6,7,8,9,10,11,12].filter(function (n) { return monthsSet.has(n); });

        if (!years.length || !months.length) {
            container.innerHTML = '<p style="text-align:center;padding:20px;color:var(--text-tertiary,#64748b);">Selecciona al menos un año y un mes</p>';
            return;
        }

        const BY = 'border-left:2px solid var(--border-medium,#ddd);';

        var html = '<table style="width:100%;border-collapse:collapse;font-size:0.82rem;"><thead>';

        // Row 1: year labels
        html += '<tr style="border-bottom:1px solid var(--border-light,#e2e8f0);">';
        html += '<th style="text-align:left;padding:6px 10px;min-width:44px;"></th>';
        years.forEach(function (y) {
            html += '<th colspan="3" style="text-align:center;padding:5px 8px;font-weight:700;' + BY + '">' + y + '</th>';
        });
        html += '</tr>';

        // Row 2: Ing / Gas / Aho sub-headers
        html += '<tr style="border-bottom:2px solid var(--border-light,#e2e8f0);font-size:0.75rem;">';
        html += '<th style="padding:3px 10px;text-align:left;color:var(--text-tertiary,#64748b);">Mes</th>';
        years.forEach(function () {
            html += '<th style="text-align:right;padding:3px 6px;' + BY + 'color:var(--success,#22c55e);">Ing.</th>';
            html += '<th style="text-align:right;padding:3px 6px;color:var(--danger,#ef4444);">Gas.</th>';
            html += '<th style="text-align:right;padding:3px 6px;color:var(--info,#06b6d4);">Aho.</th>';
        });
        html += '</tr></thead><tbody>';

        // Data rows
        months.forEach(function (monthNum, idx) {
            const bg = idx % 2 === 1 ? 'background:var(--gray-50,#f9fafb);' : '';
            html += '<tr style="' + bg + '">';
            html += '<td style="font-weight:600;padding:5px 10px;white-space:nowrap;color:var(--text-secondary,#475569);">' + MONTH_NAMES[monthNum - 1] + '</td>';
            years.forEach(function (y) {
                const c = dataMap[y] && dataMap[y][monthNum];
                if (c) {
                    const ac = c.aho >= 0 ? 'var(--info,#06b6d4)' : 'var(--danger,#ef4444)';
                    html += '<td style="text-align:right;padding:5px 6px;white-space:nowrap;' + BY + 'color:var(--success,#22c55e);">' + fmt(c.ing) + '</td>';
                    html += '<td style="text-align:right;padding:5px 6px;white-space:nowrap;color:var(--danger,#ef4444);">' + fmt(c.gas) + '</td>';
                    html += '<td style="text-align:right;padding:5px 6px;white-space:nowrap;color:' + ac + ';">' + fmt(c.aho) + '</td>';
                } else {
                    html += '<td style="' + BY + 'text-align:right;padding:5px 6px;color:var(--gray-300,#d1d5db);">—</td>';
                    html += '<td style="text-align:right;padding:5px 6px;color:var(--gray-300,#d1d5db);">—</td>';
                    html += '<td style="text-align:right;padding:5px 6px;color:var(--gray-300,#d1d5db);">—</td>';
                }
            });
            html += '</tr>';
        });

        // Average row
        html += '<tr style="border-top:2px solid var(--border-light,#e2e8f0);font-weight:700;font-size:0.78rem;">';
        html += '<td style="padding:5px 10px;color:var(--text-tertiary,#64748b);">Media</td>';
        years.forEach(function (y) {
            const cells = months.map(function (m) { return dataMap[y] && dataMap[y][m]; }).filter(Boolean);
            if (!cells.length) {
                html += '<td style="' + BY + 'text-align:right;padding:5px 6px;color:var(--gray-300,#d1d5db);">—</td>';
                html += '<td style="text-align:right;padding:5px 6px;color:var(--gray-300,#d1d5db);">—</td>';
                html += '<td style="text-align:right;padding:5px 6px;color:var(--gray-300,#d1d5db);">—</td>';
                return;
            }
            const aI = avg(cells.map(function (c) { return c.ing; }));
            const aG = avg(cells.map(function (c) { return c.gas; }));
            const aA = avg(cells.map(function (c) { return c.aho; }));
            const ac = aA >= 0 ? 'var(--info,#06b6d4)' : 'var(--danger,#ef4444)';
            html += '<td style="text-align:right;padding:5px 6px;' + BY + 'color:var(--success,#22c55e);">' + fmt(aI) + '</td>';
            html += '<td style="text-align:right;padding:5px 6px;color:var(--danger,#ef4444);">' + fmt(aG) + '</td>';
            html += '<td style="text-align:right;padding:5px 6px;color:' + ac + ';">' + fmt(aA) + '</td>';
        });
        html += '</tr></tbody></table>';

        container.innerHTML = html;
    }

    // ===== Anomaly badge =====
    let lastAnomalias = [];

    function injectAnomalyBadge() {
        const header = document.querySelector('.filtros-dashboard');
        if (!header || document.getElementById('dashAnomaliaBadge')) return;
        const badge = document.createElement('button');
        badge.id = 'dashAnomaliaBadge';
        badge.className = 'btn-secondary';
        badge.style.cssText =
            'display:none;font-size:0.78rem;padding:4px 10px;min-height:unset;' +
            'color:var(--danger,#ef4444);border-color:var(--danger,#ef4444);';
        badge.title = 'Ver anomalías de gasto';
        header.appendChild(badge);
        badge.addEventListener('click', showAnomaliesDetail);
    }

    async function checkAnomalias() {
        try {
            const res = await fetch('/dashboard/anomalias?meses=6');
            if (!res.ok) return;
            lastAnomalias = (await res.json()) || [];
            const badge = document.getElementById('dashAnomaliaBadge');
            if (!badge) return;
            if (lastAnomalias.length > 0) {
                badge.textContent = '⚠️ ' + lastAnomalias.length + ' anomalía' + (lastAnomalias.length > 1 ? 's' : '');
                badge.style.display = 'inline-flex';
            } else {
                badge.style.display = 'none';
            }
        } catch (_) {}
    }

    function showAnomaliesDetail() {
        if (!lastAnomalias.length) return;
        const rows = lastAnomalias.map(function (a) {
            return '<tr>' +
                '<td>' + (a.categoria || '') + '</td>' +
                '<td style="text-align:right;">' + fmt(a.promedio_mensual) + '</td>' +
                '<td style="text-align:right;color:var(--danger,#ef4444);">' + fmt(a.gasto_actual) + '</td>' +
                '<td style="text-align:right;color:var(--danger,#ef4444);font-weight:700;">+' +
                    (a.desviacion_pct != null ? a.desviacion_pct.toFixed(0) : '?') + '%</td>' +
                '</tr>';
        }).join('');
        const html =
            '<table style="width:100%;border-collapse:collapse;font-size:0.88rem;">' +
            '<thead><tr style="border-bottom:2px solid var(--border-light,#e2e8f0);">' +
            '<th style="text-align:left;">Categoría</th>' +
            '<th style="text-align:right;">Media 6M</th>' +
            '<th style="text-align:right;">Mes actual</th>' +
            '<th style="text-align:right;">Desv.</th>' +
            '</tr></thead><tbody>' + rows + '</tbody></table>';
        openInfoPanel('Anomalías de gasto detectadas', html);
    }

    // ===== Presupuestos editor (inline panel) =====
    async function openPresupuestosEditor() {
        try {
            const [resPresp, resCat] = await Promise.all([
                fetch('/presupuestos'),
                fetch('/categorias')
            ]);
            const presupuestos = resPresp.ok ? await resPresp.json() : [];
            const catRaw       = resCat.ok  ? await resCat.json()   : [];
            // get-categorias devuelve { gastos, ingresos, impuestos } — los presupuestos son de gastos
            const categorias   = Array.isArray(catRaw)
                ? catRaw
                : (catRaw.gastos || catRaw.categorias || []);
            renderPresupuestosEditor(presupuestos, categorias);
        } catch (_) {
            if (typeof notifyError === 'function') notifyError('Error al cargar presupuestos');
        }
    }

    function renderPresupuestosEditor(presupuestos, categorias) {
        const byId = {};
        presupuestos.forEach(function (p) { byId[p.categoria_id] = p; });

        function makeRow(cat) {
            const ex     = byId[cat.id];
            const nombre = cat.nombre || cat.name || cat.categoria || '';
            const hasBudget = !!ex;
            const rowBg  = hasBudget ? 'background:var(--success-bg,#f0fdf4);' : '';
            return '<tr style="' + rowBg + '">' +
                '<td style="padding:6px 8px;font-weight:' + (hasBudget ? '700' : '400') + ';">' +
                    (hasBudget ? '<span style="color:var(--success,#22c55e);margin-right:4px;">●</span>' : '') +
                    nombre +
                '</td>' +
                '<td style="padding:6px 8px;">' +
                    '<input type="number" step="0.01" min="0" value="' + (ex ? ex.limite_mensual : '') + '" ' +
                    'data-cat-id="' + cat.id + '" data-presup-id="' + (ex ? ex.id : '') + '" ' +
                    'placeholder="Sin límite" ' +
                    'style="width:120px;padding:5px 8px;border:1px solid var(--border-light,#e0e0e0);border-radius:6px;font-size:0.9rem;">' +
                '</td>' +
                '<td style="padding:6px 8px;white-space:nowrap;">' +
                    (ex ? '<button onclick="window._dashExt.delPresp(' + ex.id + ',this)" class="btn-eliminar" ' +
                          'style="padding:3px 8px;min-height:unset;font-size:0.76rem;">✕ Quitar</button>' : '') +
                '</td></tr>';
        }

        // Categorías con presupuesto primero, luego las demás
        const withBudget    = categorias.filter(function (c) { return !!byId[c.id]; });
        const withoutBudget = categorias.filter(function (c) { return !byId[c.id]; });
        const ordered = withBudget.concat(withoutBudget);

        var rows = '';
        if (withBudget.length) {
            rows += '<tr><td colspan="3" style="padding:8px 8px 4px;font-size:0.75rem;font-weight:700;' +
                    'color:var(--text-tertiary,#64748b);text-transform:uppercase;letter-spacing:.05em;">' +
                    'Con límite (' + withBudget.length + ')</td></tr>';
            rows += withBudget.map(makeRow).join('');
            rows += '<tr><td colspan="3" style="padding:8px 8px 4px;font-size:0.75rem;font-weight:700;' +
                    'color:var(--text-tertiary,#64748b);text-transform:uppercase;letter-spacing:.05em;' +
                    'border-top:1px solid var(--border-light,#e2e8f0);">' +
                    'Sin límite (' + withoutBudget.length + ')</td></tr>';
        }
        rows += withoutBudget.map(makeRow).join('');

        const html =
            '<p style="font-size:0.82rem;color:var(--text-secondary,#475569);margin:0 0 10px;">' +
            'Introduce el gasto máximo mensual por categoría. Deja vacío para sin límite.</p>' +
            '<div style="max-height:400px;overflow-y:auto;">' +
            '<table style="width:100%;border-collapse:collapse;font-size:0.86rem;">' +
            '<thead><tr style="border-bottom:2px solid var(--border-light,#e2e8f0);position:sticky;top:0;background:var(--bg-white,#fff);">' +
            '<th style="text-align:left;padding:6px 8px;">Categoría</th>' +
            '<th style="text-align:left;padding:6px 8px;">Límite/mes (€)</th>' +
            '<th></th></tr></thead>' +
            '<tbody id="_prEditorBody">' + rows + '</tbody></table></div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;">' +
            '<span style="font-size:0.8rem;color:var(--text-tertiary,#64748b);">' + presupuestos.length + ' límite(s) activo(s)</span>' +
            '<button id="_btnSavePresp" class="btn-primary" style="padding:7px 20px;">Guardar cambios</button>' +
            '</div>';

        openInfoPanel('Gestionar límites de presupuesto', html);
        setTimeout(function () {
            const btn = document.getElementById('_btnSavePresp');
            if (btn) btn.addEventListener('click', savePresupuestos);
        }, 50);
    }

    async function savePresupuestos() {
        const inputs = document.querySelectorAll('#_prEditorBody input[data-cat-id]');
        const ops = [];
        inputs.forEach(function (inp) {
            const val       = parseFloat(inp.value);
            const catId     = parseInt(inp.dataset.catId, 10);
            const presupId  = inp.dataset.presupId;
            if (!isNaN(val) && val > 0) {
                ops.push(fetch('/presupuestos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ categoria_id: catId, limite_mensual: val })
                }));
            } else if (presupId && (inp.value === '' || val <= 0)) {
                // Input cleared or set to 0 for an existing budget → delete it
                ops.push(fetch('/presupuestos/' + presupId, { method: 'DELETE' }));
            }
        });
        await Promise.all(ops);
        closeInfoPanel();
        if (typeof renderInicioInsights === 'function') renderInicioInsights();
        if (typeof notifySuccess === 'function') notifySuccess('Presupuestos guardados');
    }

    // ===== Generic info panel (slide-in) =====
    function openInfoPanel(title, html) {
        let panel = document.getElementById('_extInfoPanel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = '_extInfoPanel';
            panel.style.cssText =
                'position:fixed;top:0;right:0;height:100%;width:min(480px,95vw);' +
                'background:var(--bg-white,#ffffff);' +
                'border-left:1px solid var(--border-light,#e0e0e0);' +
                'box-shadow:var(--shadow-xl,-4px 0 24px rgba(0,0,0,0.18));' +
                'z-index:9998;overflow-y:auto;padding:24px;box-sizing:border-box;' +
                'transform:translateX(100%);transition:transform 0.25s ease;';
            document.body.appendChild(panel);
        }
        panel.innerHTML =
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;' +
            'border-bottom:3px solid var(--primary,#16a34a);padding-bottom:12px;">' +
            '<h3 style="margin:0;font-size:1rem;color:var(--text-primary,#333);">' + title + '</h3>' +
            '<button onclick="window._dashExt.closePanel()" class="btn-secondary" ' +
            'style="min-height:unset;padding:4px 10px;font-size:0.9rem;border-radius:50%;">✕</button>' +
            '</div>' + html;
        requestAnimationFrame(function () {
            panel.style.transform = 'translateX(0)';
        });
    }

    function closeInfoPanel() {
        const panel = document.getElementById('_extInfoPanel');
        if (panel) panel.style.transform = 'translateX(100%)';
    }

    window._dashExt = {
        closePanel: closeInfoPanel,
        openPresupuestosEditor: openPresupuestosEditor,
        delPresp: async function (id, btn) {
            const res = await fetch('/presupuestos/' + id, { method: 'DELETE' });
            if (res.ok) {
                const row = btn.closest('tr');
                // Clear presupId so savePresupuestos won't try to delete it again
                const inp = row.querySelector('input[data-presup-id]');
                if (inp) { inp.value = ''; inp.dataset.presupId = ''; }
                btn.remove();
                if (typeof notifySuccess === 'function') notifySuccess('Límite eliminado');
            }
        }
    };

    // ===== Event listeners =====
    // Inject + refresh on every dashboardUpdated (tab may not exist until first click)
    window.addEventListener('dashboardUpdated', function () {
        injectRollingToggle();
        injectMonthlyTable();
        injectAnomalyBadge();

        const d = window._dashData || {};
        renderMonthlyTable(d.meses, d.ingresosMes, d.gastosMes, d.ahorrosMes);
        checkAnomalias();
        if (rollingActive) applyRollingAvg();
    });
})();
