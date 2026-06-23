(function initDashboardChartHelpers(global) {
    if (global.DashboardChartHelpers) return;

    const kpiSparklines = {
        ingresos: null,
        gastos: null,
        ahorros: null,
        neto: null
    };

    const porcentajeContainers = {};

    function crearOpcionesGrafico(optComun, titulo, apilado, createLegendClickHandler) {
        const opciones = {
            ...optComun,
            plugins: {
                ...optComun.plugins,
                legend: {
                    ...optComun.plugins.legend,
                    onClick: createLegendClickHandler()
                },
                title: {
                    display: true,
                    text: titulo,
                    font: { size: 13, weight: '600' },
                    padding: { top: 5, bottom: 10 }
                }
            }
        };

        if (apilado) {
            opciones.scales = {
                ...optComun.scales,
                x: { ...optComun.scales.x, stacked: true },
                y: { ...optComun.scales.y, stacked: true }
            };
        }

        return opciones;
    }

    function crearDataset(label, data, color, apilado, aclararColor) {
        return {
            label,
            data,
            backgroundColor: aclararColor(color, 0.7),
            borderColor: color,
            borderWidth: apilado ? 2 : 3,
            borderRadius: 0,
            tension: 0.4,
            fill: !apilado
        };
    }

    function crearUpdateChartStats(datosOriginales, calcularFn) {
        return function () {
            const datos = calcularFn.call(this, datosOriginales);
            this.options.plugins.title.text = datos.titulo;
        };
    }

    function obtenerEstiloSparklinePorTendencia(data) {
        if (!Array.isArray(data) || data.length < 2) {
            return {
                lineColor: 'rgba(148, 163, 184, 0.95)',
                fillColor: 'rgba(148, 163, 184, 0.2)'
            };
        }

        const primerValor = Number(data.find(v => Number.isFinite(v)) ?? 0);
        const ultimoValor = Number([...data].reverse().find(v => Number.isFinite(v)) ?? primerValor);
        const delta = ultimoValor - primerValor;

        if (delta > 0) {
            return {
                lineColor: 'rgba(74, 222, 128, 0.98)',
                fillColor: 'rgba(74, 222, 128, 0.22)'
            };
        }

        if (delta < 0) {
            return {
                lineColor: 'rgba(248, 113, 113, 0.98)',
                fillColor: 'rgba(248, 113, 113, 0.22)'
            };
        }

        return {
            lineColor: 'rgba(125, 211, 252, 0.98)',
            fillColor: 'rgba(125, 211, 252, 0.22)'
        };
    }

    function crearSparklineKpi(canvasId, chartKey, data) {
        const canvas = document.getElementById(canvasId);
        if (!canvas || typeof Chart === 'undefined') return;
        const safeData = Array.isArray(data) && data.length > 0 ? data : [0, 0];
        const trendStyle = obtenerEstiloSparklinePorTendencia(safeData);

        if (kpiSparklines[chartKey]) {
            try {
                kpiSparklines[chartKey].destroy();
            } catch (error) {
                console.warn('⚠️ Error destruyendo sparkline KPI:', error);
            }
        }

        kpiSparklines[chartKey] = new Chart(canvas, {
            type: 'line',
            data: {
                labels: safeData.map((_, idx) => idx + 1),
                datasets: [{
                    data: safeData,
                    borderColor: trendStyle.lineColor,
                    backgroundColor: trendStyle.fillColor,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.38,
                    pointRadius: 0,
                    pointHoverRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }
                },
                scales: {
                    x: { display: false },
                    y: { display: false }
                },
                elements: {
                    line: { capBezierPoints: true }
                }
            }
        });
    }

    function limpiarSparklinesKpi() {
        Object.keys(kpiSparklines).forEach((key) => {
            if (kpiSparklines[key]) {
                try {
                    kpiSparklines[key].destroy();
                } catch (error) {
                    console.warn('⚠️ Error limpiando sparkline KPI:', error);
                }
                kpiSparklines[key] = null;
            }
        });
    }

    function escaparHtml(valor) {
        if (global.TabTextUtils && typeof global.TabTextUtils.escapeHtml === 'function') {
            return global.TabTextUtils.escapeHtml(valor);
        }
        return String(valor ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function renderCilindrosPorcentajes(containerId, config) {
        const container = document.getElementById(containerId);
        if (!container) return null;

        const titulo = String(config?.title || 'Porcentajes');
        const columnas = Array.isArray(config?.columns) ? config.columns : [];
        const legendItems = Array.isArray(config?.legend) ? config.legend : [];

        const grid = document.createElement('div');
        grid.className = 'porcentajes-3d-grid';

        columnas.forEach(col => {
            const nombre = String(col.name || '');
            const segmentos = Array.isArray(col.segments) ? col.segments : [];

            const stack = document.createElement('div');
            stack.className = 'cylinder-stack';

            segmentos
                .filter(seg => Number(seg.value) > 0)
                .forEach(seg => {
                    const valor = Math.max(0, Math.min(100, Number(seg.value) || 0));
                    const seg_el = document.createElement('div');
                    seg_el.className = 'cylinder-seg';
                    seg_el.title = `${String(seg.label || '')}: ${valor.toFixed(1)}%`;
                    seg_el.style.height = `${valor}%`;
                    seg_el.style.background = String(seg.color || '#94a3b8');
                    if (valor >= 10) {
                        const lbl = document.createElement('span');
                        lbl.className = 'cylinder-seg-label';
                        lbl.textContent = `${valor.toFixed(0)}%`;
                        seg_el.appendChild(lbl);
                    }
                    stack.appendChild(seg_el);
                });

            const wrap = document.createElement('div');
            wrap.className = 'cylinder-wrap';
            wrap.appendChild(stack);

            const name_el = document.createElement('div');
            name_el.className = 'cylinder-name';
            name_el.textContent = nombre;

            const col_el = document.createElement('div');
            col_el.className = 'cylinder-col';
            col_el.appendChild(wrap);
            col_el.appendChild(name_el);
            grid.appendChild(col_el);
        });

        const legend = document.createElement('div');
        legend.className = 'porcentajes-3d-legend';
        legendItems.forEach(item => {
            const dot = document.createElement('span');
            dot.className = 'porcentajes-3d-legend-dot';
            dot.style.background = String(item.color || '#94a3b8');
            const span = document.createElement('span');
            span.className = 'porcentajes-3d-legend-item';
            span.appendChild(dot);
            span.appendChild(document.createTextNode(String(item.label || '')));
            legend.appendChild(span);
        });

        const titleEl = document.createElement('div');
        titleEl.className = 'porcentajes-3d-title';
        titleEl.textContent = titulo;

        container.innerHTML = '';
        container.appendChild(titleEl);
        container.appendChild(grid);
        container.appendChild(legend);

        porcentajeContainers[containerId] = container;

        return {
            destroy() {
                const c = porcentajeContainers[containerId];
                if (c) {
                    c.innerHTML = '';
                    delete porcentajeContainers[containerId];
                }
            }
        };
    }

    function renderDashboardCategoriasLista(containerId, categorias, palette) {
        const container = document.getElementById(containerId);
        if (!container) return null;

        const entries = Object.entries(categorias || {})
            .map(([categoria, total]) => ({ categoria, total: Number(total) || 0 }))
            .filter(item => item.total > 0)
            .sort((a, b) => b.total - a.total)
            .slice(0, 8);

        const total = entries.reduce((acc, item) => acc + item.total, 0);
        if (entries.length === 0 || total <= 0) {
            const emptyText = typeof gestorIdiomas !== 'undefined'
                ? gestorIdiomas.obtenerTexto('inicio.sinDatosPeriodo')
                : 'Sin datos para este período';
            container.innerHTML = `<p class="inicio-empty">${escaparHtml(emptyText)}</p>`;
            return {
                destroy() {
                    container.innerHTML = '';
                }
            };
        }

        const colores = Array.isArray(palette) && palette.length > 0
            ? palette
            : ['#4f8ef7', '#3fcf77', '#f472b6', '#fbbf24', '#a78bfa', '#9ca3af'];

        container.innerHTML = entries.map((item, idx) => {
            const percentage = (item.total / total) * 100;
            const color = colores[idx % colores.length];
            return `
                <div class="inicio-categoria-row">
                    <span class="inicio-categoria-name">${escaparHtml(item.categoria)}</span>
                    <div class="inicio-categoria-bar-wrap">
                        <div class="inicio-categoria-bar" style="width:${Math.max(4, percentage)}%; background:${escaparHtml(color)};"></div>
                    </div>
                    <span class="inicio-categoria-pct">${percentage.toFixed(0)}%</span>
                </div>
            `;
        }).join('');

        return {
            destroy() {
                container.innerHTML = '';
            }
        };
    }

    global.DashboardChartHelpers = {
        crearOpcionesGrafico,
        crearDataset,
        crearUpdateChartStats,
        crearSparklineKpi,
        limpiarSparklinesKpi,
        renderCilindrosPorcentajes,
        renderDashboardCategoriasLista
    };
}(window));
