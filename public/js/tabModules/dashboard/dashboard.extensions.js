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

    // ===== Net Worth KPI =====
    function injectNetWorthKpi() {
        const kpisSection = document.querySelector('.dashboard-kpis');
        if (!kpisSection || document.getElementById('dashKpiNetWorth')) return;

        const card = document.createElement('article');
        card.className = 'dashboard-kpi kpi-nw';
        card.innerHTML =
            '<p class="dashboard-kpi-label">Patrimonio Neto</p>' +
            '<p class="dashboard-kpi-value" id="dashKpiNetWorth">—</p>' +
            '<div id="dashKpiNetWorthBreakdown" class="dashboard-kpi-meta" style="line-height:1.7;opacity:0.9;margin-top:4px;"></div>';
        kpisSection.appendChild(card);
        loadNetWorth();
    }

    async function loadNetWorth() {
        try {
            const res = await fetch('/dashboard/net-worth');
            if (!res.ok) return;
            const data = await res.json();
            const el = document.getElementById('dashKpiNetWorth');
            const breakdown = document.getElementById('dashKpiNetWorthBreakdown');
            if (!el) return;
            el.textContent = fmt(data.total);
            if (breakdown) {
                const parts = [];
                if (data.hucha != null)            parts.push('Hucha: ' + fmt(data.hucha));
                if (data.subhuchas != null)         parts.push('Sub-huchas: ' + fmt(data.subhuchas));
                if (data.cuenta_remunerada != null) parts.push('CR: ' + fmt(data.cuenta_remunerada));
                if (data.bolsa != null)             parts.push('Bolsa: ' + fmt(data.bolsa));
                breakdown.innerHTML = parts.join('<br>');
            }
        } catch (_) {}
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

    // ===== Monthly comparison table =====
    function injectMonthlyTable() {
        const grid = document.querySelector('.dashboard-grid');
        if (!grid || document.getElementById('dashTablaComparativa')) return;
        const wrapper = document.createElement('div');
        wrapper.className = 'chart-card full-width';
        wrapper.style.marginTop = '4px';
        wrapper.innerHTML =
            '<h3><i class="fas fa-table icon-primary"></i> Comparativa mensual</h3>' +
            '<div id="dashTablaComparativa" style="overflow-x:auto;"></div>';
        grid.appendChild(wrapper);
    }

    function renderMonthlyTable(meses, ingresos, gastos, ahorros) {
        const container = document.getElementById('dashTablaComparativa');
        if (!container || !meses || !meses.length) return;

        const avgI = avg(ingresos), avgG = avg(gastos), avgA = avg(ahorros);

        const mesHeaders = meses.map(function (m) {
            return '<th style="text-align:right;white-space:nowrap;">' + m + '</th>';
        }).join('');
        const avgHeader = '<th style="text-align:right;white-space:nowrap;opacity:0.7;">Media</th>';

        function makeRow(label, arr, colorVar, isRatio) {
            const cells = arr.map(function (v) {
                return '<td style="text-align:right;white-space:nowrap;">' +
                    (isRatio ? v.toFixed(1) + '%' : fmt(v)) + '</td>';
            }).join('');
            const avgVal = isRatio
                ? (avgI > 0 ? (avgA / avgI * 100).toFixed(1) + '%' : '0.0%')
                : fmt(avg(arr));
            return '<tr>' +
                '<td style="font-weight:700;color:' + colorVar + ';white-space:nowrap;padding-right:16px;">' + label + '</td>' +
                cells +
                '<td style="text-align:right;opacity:0.65;white-space:nowrap;">' + avgVal + '</td>' +
                '</tr>';
        }

        const ratios = ingresos.map(function (ing, i) {
            return ing > 0 ? ahorros[i] / ing * 100 : 0;
        });

        container.innerHTML =
            '<table style="width:100%;border-collapse:collapse;font-size:0.84rem;">' +
            '<thead><tr style="border-bottom:2px solid var(--border-light,#e2e8f0);">' +
            '<th style="text-align:left;">Métrica</th>' +
            mesHeaders + avgHeader +
            '</tr></thead><tbody>' +
            makeRow('Ingresos', ingresos, 'var(--success,#22c55e)') +
            makeRow('Gastos',   gastos,   'var(--danger,#ef4444)') +
            makeRow('Ahorros',  ahorros,  'var(--info,#06b6d4)') +
            makeRow('Ratio ahorro', ratios, 'var(--text-secondary,#475569)', true) +
            '</tbody></table>';
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
                '<td style="text-align:right;">' + fmt(a.media_historica) + '</td>' +
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

    // ===== Presupuestos section =====
    function injectPresupuestosSection() {
        const grid = document.querySelector('.dashboard-grid');
        if (!grid || document.getElementById('dashPresupuestosSection')) return;
        const wrapper = document.createElement('div');
        wrapper.id = 'dashPresupuestosSection';
        wrapper.className = 'chart-card full-width';
        wrapper.style.marginTop = '4px';
        wrapper.innerHTML =
            '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap;">' +
            '<h3 style="margin:0;"><i class="fas fa-wallet icon-success"></i> Presupuesto vs Gasto (mes actual)</h3>' +
            '<button id="btnGestionarPresupuestos" class="btn-secondary" style="margin-left:auto;font-size:0.82rem;min-height:unset;padding:6px 14px;">Gestionar límites</button>' +
            '</div>' +
            '<div id="dashPresupuestosTable"></div>';
        grid.appendChild(wrapper);
        document.getElementById('btnGestionarPresupuestos').addEventListener('click', openPresupuestosEditor);
    }

    async function loadPresupuestosConGasto() {
        const mes = new Date().toISOString().slice(0, 7);
        try {
            const res = await fetch('/dashboard/presupuestos?mes=' + mes);
            if (!res.ok) return;
            const data = await res.json();
            renderPresupuestosTable(Array.isArray(data) ? data : []);
        } catch (_) {}
    }

    function renderPresupuestosTable(items) {
        const container = document.getElementById('dashPresupuestosTable');
        if (!container) return;
        if (!items.length) {
            container.innerHTML =
                '<p style="color:var(--text-secondary,#475569);font-size:0.85rem;margin:0;">' +
                'Sin presupuestos configurados. Haz clic en "Gestionar límites" para añadir.</p>';
            return;
        }
        const rows = items.map(function (item) {
            const pct = Math.min(100, item.porcentaje || 0);
            const colorVar = pct >= 100 ? 'var(--danger,#ef4444)'
                           : pct >= 80  ? 'var(--warning,#eab308)'
                           :              'var(--success,#22c55e)';
            return '<tr>' +
                '<td style="white-space:nowrap;">' + (item.categoria || '') + '</td>' +
                '<td style="text-align:right;">' + fmt(item.limite_mensual) + '</td>' +
                '<td style="text-align:right;">' + fmt(item.gasto_real) + '</td>' +
                '<td style="min-width:90px;">' +
                    '<div style="background:var(--border-light,#e2e8f0);border-radius:4px;height:7px;overflow:hidden;">' +
                    '<div style="height:7px;border-radius:4px;background:' + colorVar + ';width:' + pct + '%;transition:width 0.3s;"></div>' +
                    '</div></td>' +
                '<td style="text-align:right;color:' + colorVar + ';font-weight:700;">' + pct.toFixed(0) + '%</td>' +
                '<td style="color:' + colorVar + ';">' + (item.superado ? '⚠️ Superado' : '✓ OK') + '</td>' +
                '</tr>';
        }).join('');

        container.innerHTML =
            '<table style="width:100%;border-collapse:collapse;font-size:0.85rem;">' +
            '<thead><tr style="border-bottom:2px solid var(--border-light,#e2e8f0);">' +
            '<th style="text-align:left;">Categoría</th>' +
            '<th style="text-align:right;">Límite</th>' +
            '<th style="text-align:right;">Gastado</th>' +
            '<th>Progreso</th>' +
            '<th style="text-align:right;">%</th>' +
            '<th>Estado</th>' +
            '</tr></thead><tbody>' + rows + '</tbody></table>';
    }

    // ===== Presupuestos editor (inline panel) =====
    async function openPresupuestosEditor() {
        try {
            const [resPresp, resCat] = await Promise.all([
                fetch('/presupuestos'),
                fetch('/categorias')
            ]);
            const presupuestos = resPresp.ok ? await resPresp.json() : [];
            const categorias   = resCat.ok  ? await resCat.json()   : [];
            renderPresupuestosEditor(
                presupuestos,
                Array.isArray(categorias) ? categorias : (categorias.categorias || [])
            );
        } catch (_) {
            if (typeof notifyError === 'function') notifyError('Error al cargar presupuestos');
        }
    }

    function renderPresupuestosEditor(presupuestos, categorias) {
        const byId = {};
        presupuestos.forEach(function (p) { byId[p.categoria_id] = p; });

        const rows = categorias.map(function (cat) {
            const ex = byId[cat.id];
            const nombre = cat.nombre || cat.name || cat.categoria || '';
            return '<tr>' +
                '<td style="padding:5px 8px;">' + nombre + '</td>' +
                '<td style="padding:5px 8px;">' +
                '<input type="number" step="0.01" min="0" value="' + (ex ? ex.limite_mensual : '') + '" ' +
                'data-cat-id="' + cat.id + '" data-presup-id="' + (ex ? ex.id : '') + '" ' +
                'placeholder="Sin límite" style="width:110px;padding:4px 6px;border:2px solid var(--border-light,#e0e0e0);border-radius:var(--border-radius,8px);">' +
                '</td>' +
                '<td style="padding:5px 8px;">' +
                (ex ? '<button onclick="window._dashExt.delPresp(' + ex.id + ',this)" class="btn-eliminar" style="padding:4px 8px;min-height:unset;font-size:0.78rem;">Eliminar</button>' : '') +
                '</td></tr>';
        }).join('');

        const html =
            '<div style="max-height:360px;overflow-y:auto;">' +
            '<table style="width:100%;border-collapse:collapse;font-size:0.86rem;">' +
            '<thead><tr style="border-bottom:2px solid var(--border-light,#e2e8f0);">' +
            '<th style="text-align:left;padding:5px 8px;">Categoría</th>' +
            '<th style="text-align:left;padding:5px 8px;">Límite mensual (€)</th>' +
            '<th></th></tr></thead>' +
            '<tbody id="_prEditorBody">' + rows + '</tbody></table></div>' +
            '<div style="text-align:right;margin-top:12px;">' +
            '<button id="_btnSavePresp" class="btn-primary" style="padding:7px 18px;">Guardar</button>' +
            '</div>';

        openInfoPanel('Gestionar límites de presupuesto', html);
        setTimeout(function () {
            const btn = document.getElementById('_btnSavePresp');
            if (btn) btn.addEventListener('click', savePresupuestos);
        }, 50);
    }

    async function savePresupuestos() {
        const inputs = document.querySelectorAll('#_prEditorBody input[data-cat-id]');
        const saves = [];
        inputs.forEach(function (inp) {
            const val = parseFloat(inp.value);
            if (!isNaN(val) && val > 0) {
                saves.push(fetch('/presupuestos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ categoria_id: parseInt(inp.dataset.catId, 10), limite_mensual: val })
                }));
            }
        });
        await Promise.all(saves);
        closeInfoPanel();
        loadPresupuestosConGasto();
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
        delPresp: async function (id, btn) {
            const res = await fetch('/presupuestos/' + id, { method: 'DELETE' });
            if (res.ok) {
                const row = btn.closest('tr');
                row.querySelector('input').value = '';
                btn.remove();
                if (typeof notifySuccess === 'function') notifySuccess('Límite eliminado');
            }
        }
    };

    // ===== Event listeners =====
    // Inject + refresh on every dashboardUpdated (tab may not exist until first click)
    window.addEventListener('dashboardUpdated', function () {
        injectNetWorthKpi();
        injectRollingToggle();
        injectMonthlyTable();
        injectAnomalyBadge();
        injectPresupuestosSection();

        const d = window._dashData || {};
        renderMonthlyTable(d.meses, d.ingresosMes, d.gastosMes, d.ahorrosMes);
        checkAnomalias();
        loadPresupuestosConGasto();
        loadNetWorth();
        if (rollingActive) applyRollingAvg();
    });
})();
