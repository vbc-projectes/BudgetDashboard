(function initImportacionCharts(global) {
    if (global.ImportacionCharts) return;

    function actualizarKpisAnalisis(datos) {
        const kpiIngresos = document.getElementById('kpiImportacionIngresos');
        const kpiGastos = document.getElementById('kpiImportacionGastos');
        const kpiNeto = document.getElementById('kpiImportacionNeto');
        const kpiMovimientos = document.getElementById('kpiImportacionMovimientos');
        if (!kpiIngresos || !kpiGastos || !kpiNeto || !kpiMovimientos) return;

        const totalIngresos = (Array.isArray(datos) ? datos : [])
            .filter((d) => d.tipo === 'ingreso')
            .reduce((acc, d) => acc + (Number(d.importe) || 0), 0);

        const totalGastos = (Array.isArray(datos) ? datos : [])
            .filter((d) => d.tipo === 'gasto')
            .reduce((acc, d) => acc + (Number(d.importe) || 0), 0);

        const neto = totalIngresos - totalGastos;
        const format = (value) => global.formatCurrency
            ? global.formatCurrency(value)
            : `€${Number(value || 0).toFixed(2)}`;

        kpiIngresos.textContent = format(totalIngresos);
        kpiGastos.textContent = format(totalGastos);
        kpiNeto.textContent = format(neto);
        kpiMovimientos.textContent = String((Array.isArray(datos) ? datos : []).length);
    }

    function generarGraficoCategoria(datos, ctx) {
        const { estadoImportacion, showAlert, t } = ctx;
        try {
            const chartCtx = document.getElementById('chartCategoria')?.getContext('2d');
            if (!chartCtx) return;

            const conceptos = {};
            datos.forEach(d => {
                const concepto = String(d.concepto || '').substring(0, 30);
                if (!conceptos[concepto]) conceptos[concepto] = { total: 0, ingresos: 0, gastos: 0 };
                const importe = d.importe || 0;
                if (d.tipo === 'ingreso') conceptos[concepto].ingresos += importe;
                else conceptos[concepto].gastos += importe;
                conceptos[concepto].total += importe;
            });

            const labels = Object.keys(conceptos).sort((a, b) => conceptos[b].total - conceptos[a].total).slice(0, 10);
            const datosGasto = labels.map(concepto => conceptos[concepto].gastos);
            const datosIngreso = labels.map(concepto => conceptos[concepto].ingresos);

            if (estadoImportacion.charts.categoria) estadoImportacion.charts.categoria.destroy();

            estadoImportacion.charts.categoria = new Chart(chartCtx, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        { label: 'Gastos', data: datosGasto, backgroundColor: 'rgba(255, 99, 132, 0.7)', borderColor: 'rgb(255, 99, 132)', borderWidth: 1 },
                        { label: 'Ingresos', data: datosIngreso, backgroundColor: 'rgba(75, 192, 75, 0.7)', borderColor: 'rgb(75, 192, 75)', borderWidth: 1 }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'top' } },
                    scales: { y: { beginAtZero: true } }
                }
            });
        } catch (error) {
            showAlert(t('importacion.errorGraficoCategoria') + ': ' + error.message);
        }
    }

    function generarGraficoIngresoVsGasto(datos, ctx) {
        const { estadoImportacion, showAlert, t, tt } = ctx;
        try {
            if (estadoImportacion.charts.ingresoVsGasto) {
                estadoImportacion.charts.ingresoVsGasto.destroy();
                delete estadoImportacion.charts.ingresoVsGasto;
            }

            const tbody = document.getElementById('tablaConceptosBody');
            if (!tbody) return;

            const filter = estadoImportacion.tableFilter || 'gasto';
            const datosFiltrados = datos.filter(item => item.tipo === filter);

            const conceptosMap = new Map();
            datosFiltrados.forEach(item => {
                const concepto = item.concepto || tt('importacion.sinConcepto', 'Sin concepto');
                const entry = conceptosMap.get(concepto) || { total: 0, count: 0 };
                entry.total += item.importe || 0;
                entry.count += 1;
                conceptosMap.set(concepto, entry);
            });

            const rows = Array.from(conceptosMap.entries())
                .map(([concepto, info]) => ({ concepto, total: info.total, count: info.count }))
                .sort((a, b) => b.total - a.total);

            tbody.innerHTML = '';
            if (rows.length === 0) {
                const tr = document.createElement('tr');
                tr.innerHTML = '<td colspan="3">Sin datos</td>';
                tbody.appendChild(tr);
                return;
            }

            rows.forEach(row => {
                const tr = document.createElement('tr');
                if (filter === 'gasto') tr.classList.add('row-gasto');
                tr.innerHTML = `
                    <td>${row.concepto}</td>
                    <td><strong>${global.formatCurrency ? global.formatCurrency(row.total) : row.total.toFixed(2) + '€'}</strong></td>
                    <td>${row.count}</td>
                `;
                tbody.appendChild(tr);
            });
        } catch (error) {
            showAlert(t('importacion.errorGraficoIngresoVsGasto') + ': ' + error.message);
        }
    }

    function generarGraficoEvolucionSaldo(datos, datosRaw, columnasSaldo, ctx) {
        const { estadoImportacion, parseDate, parseImporte, showAlert, t } = ctx;
        try {
            const chartBox = document.querySelector('[data-i18n="importacion.evolucionSaldo"]')?.closest('.chart-box');
            if (!columnasSaldo) {
                if (chartBox) chartBox.style.display = 'none';
                return;
            }
            if (chartBox) chartBox.style.display = 'block';

            const chartCtx = document.getElementById('chartEvolucionSaldo')?.getContext('2d');
            if (!chartCtx) return;

            const datosPorFecha = {};
            datosRaw.forEach(d => {
                const fechaStr = d[estadoImportacion.mapeo.fecha];
                const fecha = parseDate(fechaStr, estadoImportacion.formatoFecha);
                const fechaKey = fecha ? fecha.toISOString().split('T')[0] : 'sin-fecha';

                if (!datosPorFecha[fechaKey]) datosPorFecha[fechaKey] = { saldo: null };
                const saldoValor = parseImporte(d[columnasSaldo]);
                if (Number.isFinite(saldoValor) && saldoValor !== 0) datosPorFecha[fechaKey].saldo = saldoValor;
            });

            const fechas = Object.keys(datosPorFecha).sort();
            const saldos = fechas.map(fecha => datosPorFecha[fecha].saldo || 0);

            if (estadoImportacion.charts.evolucionSaldo) estadoImportacion.charts.evolucionSaldo.destroy();

            estadoImportacion.charts.evolucionSaldo = new Chart(chartCtx, {
                type: 'line',
                data: {
                    labels: fechas.map(f => new Date(f).toLocaleDateString('es-ES')),
                    datasets: [{
                        label: 'Saldo',
                        data: saldos,
                        borderColor: 'rgb(75, 150, 192)',
                        backgroundColor: 'rgba(75, 150, 192, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'top' } },
                    scales: { y: { beginAtZero: true } }
                }
            });
        } catch (error) {
            showAlert(t('importacion.errorGraficoEvolucionSaldo') + ': ' + error.message);
        }
    }

    function generarGraficoMovimientosPorMes(datos, ctx) {
        const { estadoImportacion, showAlert, t } = ctx;
        try {
            const chartCtx = document.getElementById('chartMovimientosPorMes')?.getContext('2d');
            if (!chartCtx) return;

            const datosPorMes = {};
            datos.forEach(d => {
                if (!d.fecha) return;
                const fecha = new Date(d.fecha);
                const mes = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
                if (!datosPorMes[mes]) datosPorMes[mes] = { ingresos: 0, gastos: 0, cantidad: 0 };
                const importe = d.importe || 0;
                if (d.tipo === 'ingreso') datosPorMes[mes].ingresos += importe;
                else datosPorMes[mes].gastos += importe;
                datosPorMes[mes].cantidad++;
            });

            const meses = Object.keys(datosPorMes).sort();
            const datosGastos = meses.map(mes => datosPorMes[mes].gastos);
            const datosIngresos = meses.map(mes => datosPorMes[mes].ingresos);

            if (estadoImportacion.charts.movimientosPorMes) estadoImportacion.charts.movimientosPorMes.destroy();

            estadoImportacion.charts.movimientosPorMes = new Chart(chartCtx, {
                type: 'bar',
                data: {
                    labels: meses.map(m => new Date(m).toLocaleDateString('es-ES', { year: 'numeric', month: 'long' })),
                    datasets: [
                        { label: 'Gastos', data: datosGastos, backgroundColor: 'rgba(255, 99, 132, 0.7)', borderColor: 'rgb(255, 99, 132)', borderWidth: 1 },
                        { label: 'Ingresos', data: datosIngresos, backgroundColor: 'rgba(75, 192, 75, 0.7)', borderColor: 'rgb(75, 192, 75)', borderWidth: 1 }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'top' } },
                    scales: { y: { beginAtZero: true } }
                }
            });
        } catch (error) {
            showAlert(t('importacion.errorGraficoMovimientosPorMes') + ': ' + error.message);
        }
    }

    global.ImportacionCharts = {
        actualizarKpisAnalisis,
        generarGraficoCategoria,
        generarGraficoIngresoVsGasto,
        generarGraficoEvolucionSaldo,
        generarGraficoMovimientosPorMes
    };
}(window));
