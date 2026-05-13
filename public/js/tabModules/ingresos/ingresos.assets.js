(function initIngresosAssetsModule(global) {
    if (global.IngresosAssetsModule) return;

    function createAssetModule(deps) {
        const {
            ingresosManager,
            ingresosRealesManager,
            showAlert,
            showConfirm,
            notifySuccess,
            cargarResumenPeriodos
        } = deps;

        const state = {
            assetHistoryChart: null
        };

        async function loadHistoricalChart(ticker, period) {
            const chartCanvas = document.getElementById('assetHistoryChart');
            const loadingDiv = document.getElementById('historyChartLoading');
            const modal = document.getElementById('assetHistoryModal');

            try {
                const periodBtns = modal.querySelectorAll('.period-btn');
                periodBtns.forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.period === period);
                });

                chartCanvas.style.display = 'none';
                loadingDiv.style.display = 'block';

                if (state.assetHistoryChart) {
                    try { state.assetHistoryChart.destroy(); } catch (_) {}
                    state.assetHistoryChart = null;
                }

                try {
                    const existingChart = Chart.getChart('assetHistoryChart');
                    if (existingChart) existingChart.destroy();
                } catch (_) {}

                try {
                    const existingChart2 = Chart.getChart(chartCanvas);
                    if (existingChart2) existingChart2.destroy();
                } catch (_) {}

                const parent = chartCanvas.parentNode;
                const newCanvas = chartCanvas.cloneNode(true);
                parent.replaceChild(newCanvas, chartCanvas);
                const finalCanvas = document.getElementById('assetHistoryChart');

                const response = await fetch(`/asset-history/${ticker}?period=${period}`);
                if (!response.ok) throw new Error('No se pudieron obtener los datos');

                const result = await response.json();
                const data = result.data;
                if (!data || data.length === 0) throw new Error('No hay datos disponibles para este período');

                const labels = data.map(item => item.date);
                const prices = data.map(item => item.price);

                const firstPrice = prices[0];
                const lastPrice = prices[prices.length - 1];
                const minPrice = Math.min(...prices);
                const maxPrice = Math.max(...prices);
                const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
                const priceRange = maxPrice - minPrice;
                const variation = (priceRange / avgPrice) * 100;
                const isFlat = variation < 0.5;
                const color = lastPrice >= firstPrice ? '#22c55e' : '#ef4444';

                loadingDiv.style.display = 'none';
                finalCanvas.style.display = 'block';

                let yAxisConfig = {
                    display: true,
                    title: { display: true, text: ingresosManager.t('ingresos.precioEur', 'Precio (€)') },
                    ticks: {
                        callback: function (value) { return '€' + value.toFixed(2); }
                    }
                };

                if (isFlat && priceRange > 0) {
                    const padding = priceRange * 2;
                    yAxisConfig.min = minPrice - padding;
                    yAxisConfig.max = maxPrice + padding;
                }

                const ctx = finalCanvas.getContext('2d');
                state.assetHistoryChart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels,
                        datasets: [{
                            label: `Precio (€) ${isFlat ? '⚠️' : ''}`,
                            data: prices,
                            borderColor: color,
                            backgroundColor: color + '20',
                            borderWidth: 2,
                            fill: true,
                            tension: 0.1,
                            pointRadius: data.length > 100 ? 0 : 2,
                            pointHoverRadius: 5
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: true, position: 'top' },
                            tooltip: {
                                mode: 'index',
                                intersect: false,
                                callbacks: {
                                    label: function (context) {
                                        return `Precio: €${context.parsed.y.toFixed(2)}`;
                                    }
                                }
                            }
                        },
                        scales: {
                            x: {
                                display: true,
                                title: { display: true, text: ingresosManager.t('ingresos.fechaEje', 'Fecha') },
                                ticks: { maxRotation: 45, minRotation: 45, maxTicksLimit: 12 }
                            },
                            y: yAxisConfig
                        },
                        interaction: {
                            mode: 'nearest',
                            axis: 'x',
                            intersect: false
                        }
                    }
                });
            } catch (error) {
                loadingDiv.innerHTML = `
                    <i class="fas fa-exclamation-circle" style="font-size: 24px; color: #ef4444;"></i>
                    <p style="margin-top: 10px; color: #ef4444;">${ingresosManager.t('ingresos.errorCargarDatos', 'Error al cargar los datos')}: ${error.message}</p>
                `;
                loadingDiv.style.display = 'block';
                chartCanvas.style.display = 'none';
            }
        }

        async function openHistoryModal(ticker, company) {
            const modal = document.getElementById('assetHistoryModal');
            const tickerNameSpan = document.getElementById('historyTickerName');
            modal.style.display = 'flex';
            tickerNameSpan.textContent = `${ticker} - ${company}`;

            document.getElementById('closeHistoryBtn').onclick = () => {
                modal.style.display = 'none';
                if (state.assetHistoryChart) {
                    state.assetHistoryChart.destroy();
                    state.assetHistoryChart = null;
                }
            };

            modal.onclick = (e) => {
                if (e.target === modal) {
                    modal.style.display = 'none';
                    if (state.assetHistoryChart) {
                        state.assetHistoryChart.destroy();
                        state.assetHistoryChart = null;
                    }
                }
            };

            const periodBtns = modal.querySelectorAll('.period-btn');
            periodBtns.forEach(btn => {
                btn.onclick = async () => {
                    periodBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    await loadHistoricalChart(ticker, btn.dataset.period);
                };
            });

            periodBtns.forEach(b => b.classList.remove('active'));
            if (periodBtns.length > 0) periodBtns[0].classList.add('active');
            await loadHistoricalChart(ticker, '1mo');
        }

        function updateSellCalculations(asset, salePrice) {
            const totalInvested = asset.shares * asset.purchase_price;
            const totalValue = asset.shares * salePrice;
            const profit = totalValue - totalInvested;

            document.getElementById('sellTotalInvested').textContent = ingresosManager.formatCurrency(totalInvested);
            document.getElementById('sellTotalValue').textContent = ingresosManager.formatCurrency(totalValue);

            const profitSpan = document.getElementById('sellProfit');
            profitSpan.textContent = ingresosManager.formatCurrency(profit);
            profitSpan.style.color = profit >= 0 ? '#28a745' : '#dc3545';
        }

        function openSellModal(asset, currentPrice, reloadAssets) {
            const modal = document.getElementById('sellAssetModal');
            const sellPriceInput = document.getElementById('sellPrice');

            document.getElementById('sellCompany').textContent = asset.company;
            document.getElementById('sellTicker').textContent = asset.ticker;
            document.getElementById('sellShares').textContent = asset.shares;
            document.getElementById('sellPurchasePrice').textContent = ingresosManager.formatCurrency(asset.purchase_price);
            document.getElementById('sellCurrentPrice').textContent = ingresosManager.formatCurrency(currentPrice);

            sellPriceInput.value = currentPrice.toFixed(2);
            updateSellCalculations(asset, currentPrice);

            sellPriceInput.oninput = () => {
                const salePrice = parseFloat(sellPriceInput.value) || 0;
                updateSellCalculations(asset, salePrice);
            };

            modal.style.display = 'flex';

            document.getElementById('cancelSellBtn').onclick = () => {
                modal.style.display = 'none';
            };

            document.getElementById('confirmSellBtn').onclick = async () => {
                const salePrice = parseFloat(sellPriceInput.value);
                if (isNaN(salePrice) || salePrice <= 0) {
                    showAlert(ingresosManager.t('ingresos.precioVentaInvalido'));
                    return;
                }

                const confirmarVenta = ingresosManager.t('ingresos.confirmarVenta',
                    `¿Confirmar venta de ${asset.shares} acciones de ${asset.company} a ${ingresosManager.formatCurrency(salePrice)} por acción?`)
                    .replace('{shares}', asset.shares)
                    .replace('{company}', asset.company)
                    .replace('{price}', ingresosManager.formatCurrency(salePrice));

                const confirmed = await showConfirm(confirmarVenta);
                if (!confirmed) return;

                try {
                    const res = await fetch('/sell/asset', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: asset.id, sale_price: salePrice })
                    });

                    if (res.ok) {
                        const data = await res.json();
                        showAlert(ingresosManager.t('ingresos.ventaExitosa',
                            `Venta exitosa. Ganancia registrada: ${ingresosManager.formatCurrency(data.profit)}`)
                            .replace('{profit}', ingresosManager.formatCurrency(data.profit)));
                        if (typeof notifySuccess === 'function') {
                            notifySuccess(ingresosManager.t('ingresos.ventaExitosa', 'Venta realizada'));
                        }
                        modal.style.display = 'none';
                        reloadAssets();
                        ingresosManager.loadData();
                        if (typeof cargarResumenPeriodos === 'function') cargarResumenPeriodos();
                    } else {
                        const error = await res.json();
                        showAlert(ingresosManager.t('ingresos.errorVenta', `Error: ${error.error}`)
                            .replace('{error}', error.error || 'No se pudo procesar la venta'));
                    }
                } catch (e) {
                    showAlert(ingresosManager.t('ingresos.errorProcesarVenta'));
                }
            };
        }

        async function cargarAssets() {
            const tbodyAssets = document.querySelector('#tablaAssets tbody');
            if (!tbodyAssets) return;

            try {
                const res = await fetch('/assets');
                const assets = await res.json();

                tbodyAssets.innerHTML = '';

                for (const asset of assets) {
                    const totalInvestment = asset.shares * asset.purchase_price;

                    const tr = document.createElement('tr');
                    tr.dataset.id = asset.id;
                    tr.dataset.type = 'asset';
                    tr.innerHTML = `
                        <td class="editable" data-field="company">${asset.company}</td>
                        <td class="editable" data-field="ticker">${asset.ticker}</td>
                        <td class="editable" data-field="shares">${asset.shares}</td>
                        <td class="editable" data-field="purchase_price"><strong>${ingresosManager.formatCurrency(asset.purchase_price)}</strong></td>
                        <td><strong>${ingresosManager.formatCurrency(totalInvestment)}</strong></td>
                        <td class="current-price"><span style="color:#999;">${ingresosManager.t('ingresos.cargandoPrecio', 'Cargando...')}</span></td>
                        <td class="current-value">—</td>
                        <td class="diff-percent">—</td>
                        <td class="diff-amount">—</td>
                        <td>
                            <button class="historyAssetBtn btn-info" data-ticker="${asset.ticker}" title="${ingresosManager.t('ingresos.verHistorico', 'Ver histórico')}" style="margin-right:8px;">
                                <i class="fas fa-question-circle"></i>
                            </button>
                            <button class="editAssetBtn btn-editar" title="${ingresosManager.t('formularios.editar')}" style="margin-right:8px;">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button data-id="${asset.id}" class="sellAsset btn-success" title="${ingresosManager.t('ingresos.sellAsset', 'Vender')}" style="margin-right:8px;">
                                <i class="fas fa-hand-holding-usd"></i>
                            </button>
                            <button data-id="${asset.id}" class="delAsset btn-eliminar" title="${ingresosManager.t('formularios.eliminar')}">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    `;
                    tbodyAssets.appendChild(tr);

                    try {
                        const currentPrice = await global.getAssetPrice(asset.ticker);
                        if (currentPrice) {
                            const currentValue = asset.shares * currentPrice;
                            const diffAmount = currentValue - totalInvestment;
                            const diffPercent = totalInvestment > 0 ? (diffAmount / totalInvestment) * 100 : 0;

                            const colorDiff = diffAmount >= 0 ? '#22c55e' : '#ef4444';
                            const signDiff = diffAmount >= 0 ? '+' : '';

                            tr.querySelector('.current-price').innerHTML = `<strong>${global.formatCurrency(currentPrice, { convert: true })}</strong>`;
                            tr.querySelector('.current-value').innerHTML = `<strong style="color:${colorDiff}">${global.formatCurrency(currentValue, { convert: true })}</strong>`;
                            tr.querySelector('.diff-percent').innerHTML = `<strong style="color:${colorDiff}">${signDiff}${diffPercent.toFixed(2)}%</strong>`;
                            tr.querySelector('.diff-amount').innerHTML = `<strong style="color:${colorDiff}">${signDiff}${global.formatCurrency(Math.abs(diffAmount), { convert: true })}</strong>`;
                        } else {
                            tr.querySelector('.current-price').innerHTML = '<span style="color:#ef4444;">Error</span>';
                        }
                    } catch (_) {
                        tr.querySelector('.current-price').innerHTML = '<span style="color:#ef4444;">Error</span>';
                    }
                }

                document.querySelectorAll('.delAsset').forEach(b => {
                    b.onclick = async () => {
                        const confirmed = await showConfirm(ingresosManager.t('ingresos.eliminarAsset', '¿Eliminar este asset?'));
                        if (!confirmed) return;
                        await fetch('/delete/asset', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id: b.dataset.id })
                        });
                        await cargarAssets();
                        if (typeof notifySuccess === 'function') notifySuccess(ingresosManager.t('mensajes.elementoEliminado', 'Asset eliminado'));
                    };
                });

                document.querySelectorAll('.historyAssetBtn').forEach(b => {
                    b.onclick = () => {
                        const ticker = b.dataset.ticker;
                        const tr = b.closest('tr');
                        const company = tr.querySelector('[data-field="company"]').textContent;
                        openHistoryModal(ticker, company);
                    };
                });

                document.querySelectorAll('.sellAsset').forEach(b => {
                    b.onclick = async () => {
                        const assetId = b.dataset.id;
                        const asset = assets.find(a => a.id == assetId);
                        if (!asset) return;

                        let currentPrice = 0;
                        try {
                            currentPrice = await global.getAssetPrice(asset.ticker) || asset.purchase_price;
                        } catch (_) {
                            currentPrice = asset.purchase_price;
                        }

                        openSellModal(asset, currentPrice, cargarAssets);
                    };
                });

                document.querySelectorAll('.editAssetBtn').forEach(btn => {
                    btn.onclick = async () => {
                        const tr = btn.closest('tr');
                        const id = tr.dataset.id;
                        const cells = tr.querySelectorAll('td.editable');
                        const originalData = {};

                        cells.forEach(cell => {
                            const field = cell.dataset.field;
                            originalData[field] = cell.textContent.trim();

                            let input = document.createElement('input');
                            if (field === 'purchase_price') {
                                input.type = 'number';
                                input.step = '0.01';
                                input.value = ingresosManager.parseAmount(originalData[field]);
                                input.style.width = '100px';
                            } else if (field === 'shares') {
                                input.type = 'number';
                                input.step = '0.01';
                                input.value = parseFloat(originalData[field]) || '';
                                input.style.width = '80px';
                            } else {
                                input.type = 'text';
                                input.value = originalData[field];
                                input.style.width = field === 'company' ? '200px' : '100px';
                            }

                            cell.innerHTML = '';
                            if (field === 'purchase_price') cell.appendChild(document.createTextNode('€ '));
                            cell.appendChild(input);
                        });

                        const actionsCell = tr.querySelector('td:last-child');
                        actionsCell.innerHTML = `
                            <button class="saveAssetBtn btn-success" style="margin-right:5px;"><i class="fas fa-save"></i></button>
                            <button class="cancelAssetBtn btn-secondary"><i class="fas fa-times"></i></button>
                        `;

                        actionsCell.querySelector('.saveAssetBtn').onclick = async () => {
                            const newData = {};
                            cells.forEach(cell => {
                                const field = cell.dataset.field;
                                const input = cell.querySelector('input');
                                newData[field] = input.value;
                            });

                            if (!newData.company) return showAlert(ingresosManager.t('ingresos.companyRequerido'));
                            if (!newData.ticker) return showAlert(ingresosManager.t('ingresos.tickerRequerido'));
                            if (isNaN(parseFloat(newData.shares)) || parseFloat(newData.shares) <= 0) return showAlert(ingresosManager.t('ingresos.numeroAccionesInvalido'));
                            if (isNaN(parseFloat(newData.purchase_price)) || parseFloat(newData.purchase_price) <= 0) return showAlert(ingresosManager.t('ingresos.precioCompraInvalidoAlt'));

                            await fetch('/update/asset', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    id,
                                    company: newData.company,
                                    ticker: newData.ticker,
                                    shares: parseFloat(newData.shares),
                                    purchase_price: parseFloat(newData.purchase_price)
                                })
                            });

                            await cargarAssets();
                            if (typeof notifySuccess === 'function') notifySuccess(ingresosManager.t('mensajes.elementoActualizado', 'Asset actualizado'));
                        };

                        actionsCell.querySelector('.cancelAssetBtn').onclick = () => { cargarAssets(); };
                    };
                });
            } catch (_) {
                // silent
            }
        }

        return {
            cargarAssets,
            openSellModal,
            updateSellCalculations,
            openHistoryModal,
            loadHistoricalChart
        };
    }

    global.IngresosAssetsModule = {
        createAssetModule
    };
}(window));
