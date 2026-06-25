// ===== MANEJO DE PERÍODOS Y RESUMEN =====
let periodoActual = '1mes';
let resumenData = null;
let cargandoResumen = false;
let _actualizarResumenController = null; // AbortController for inner detail fetches

function isCuentaRemuneradaActiva(cr, mesActual) {
    if (!cr || !cr.desde || !cr.hasta) return false;
    return cr.desde <= mesActual && mesActual <= cr.hasta;
}

function calcularSaldoCuentaRemunerada(cr, mesActual) {
    const monto = parseFloat(cr.monto) || 0;
    const aportacion = parseFloat(cr.aportacion_mensual) || 0;
    const interes = parseFloat(cr.interes) || 0;
    const retencion = parseFloat(cr.retencion) || 0;
    if (!cr.desde || !mesActual) return monto;

    const [desdeY, desdeM] = cr.desde.split('-').map(Number);
    const [actualY, actualM] = mesActual.split('-').map(Number);

    const desdeDate = new Date(desdeY, desdeM - 1, 1);
    const actualMonthDate = new Date(actualY, actualM - 1, 1);
    const mesInteresDate = new Date(actualY, actualM - 2, 1); // interés hasta fin del mes anterior

    const monthsDiff =
        (actualMonthDate.getFullYear() - desdeDate.getFullYear()) * 12 +
        (actualMonthDate.getMonth() - desdeDate.getMonth());

    const aportacionesAcumuladas = Math.max(0, monthsDiff) * aportacion;

    let totalInteres = 0;
    if (interes > 0 && mesInteresDate >= desdeDate) {
        let saldoInteres = monto;
        const current = new Date(desdeDate);

        totalInteres += saldoInteres * (interes / 100) / 12;
        current.setMonth(current.getMonth() + 1);

        while (current <= mesInteresDate) {
            saldoInteres += aportacion;
            totalInteres += saldoInteres * (interes / 100) / 12;
            current.setMonth(current.getMonth() + 1);
        }
    }

    // Aplicar retención: solo se recibe el interés neto
    const interesNeto = totalInteres * (1 - retencion / 100);
    return monto + aportacionesAcumuladas + interesNeto;
}

async function cargarResumenPeriodos() {
    if (switchingUser || !activeUser) return;
    if (cargandoResumen) return; // Evitar solicitudes múltiples simultáneas
    cargandoResumen = true;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // timeout de 10 segundos

        const res = await fetch('/resumen-periodos', { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        resumenData = await res.json();
        
            async function actualizarResumen(periodo) {
            // Cancel any in-flight detail fetches from a previous period/user
            if (_actualizarResumenController) {
                _actualizarResumenController.abort();
            }
            _actualizarResumenController = new AbortController();
            const signal = _actualizarResumenController.signal;
            const stats = await getStatsForPeriodo(periodo);
            if (!stats) {
                console.warn(`⚠️ Datos no disponibles para período: ${periodo}`);
                return;
            }

            const ingresos = document.getElementById('total-ingresos');
            const gastos = document.getElementById('total-gastos');
            const saldo = document.getElementById('saldo');
            const taxes = document.getElementById('total-taxes');
                const hucha = document.getElementById('total-hucha');

            if (ingresos) ingresos.textContent = formatearEuro(stats.ingresos);
            if (gastos) gastos.textContent = formatearEuro(stats.gastos);
            if (saldo) saldo.textContent = formatearEuro(stats.ahorro);
            if (taxes) taxes.textContent = formatearEuro(stats.impuestos || 0);

            // Etiqueta de período en las notas (los deltas se añaden luego en renderInicioDeltas)
            const periodLabel = getPeriodLabel(periodo);
            ['inicio-note-saldo', 'inicio-note-ingresos', 'inicio-note-gastos', 'inicio-note-taxes'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.textContent = periodLabel;
            });

                // Obtener total hucha
                if (hucha) {
                    try {
                        const retencionPct = parseFloat(localStorage.getItem('retencionDividendos') || '0');
                        // Solo proyectar CR a fecha futura en períodos futuros.
                        // Para período actual/pasados usar hoy (coherente con pestaña Hucha).
                        const isFuturePeriodo = ['proximo1mes', 'proximos3meses', 'proximos6meses'].includes(periodo);
                        const { hasta: hastaRef } = getInicioDateRange(periodo);
                        const crFechaParam = (isFuturePeriodo && hastaRef) ? `&fecha=${hastaRef}` : '';
                        const [resHucha, resCRSaldo, resBolsaPos, resSubHuchas, resSubHuchasPunt] = await Promise.all([
                            fetch('/hucha', { signal }),
                            fetch(`/cuenta-remunerada/saldo-hoy?retencionDivPct=${retencionPct}${crFechaParam}`, { signal }),
                            fetch('/bolsa/posiciones', { signal }),
                            fetch('/sub_huchas', { signal }),
                            fetch(`/sub_huchas/total?mes=${getReferenceMonthForPeriod(periodo)}`, { signal })
                        ]);

                        const dataHucha = resHucha.ok ? await resHucha.json() : [];
                        const crSaldoData = resCRSaldo.ok ? await resCRSaldo.json() : null;
                        const bolsaPosiciones = resBolsaPos.ok ? await resBolsaPos.json() : [];
                        const subHuchasList = resSubHuchas.ok ? await resSubHuchas.json() : [];
                        const subHuchasTotalData = resSubHuchasPunt.ok ? await resSubHuchasPunt.json() : { total: 0 };

                        const totalHuchaManual = dataHucha.reduce((acc, item) => acc + (parseFloat(item.cantidad) || 0), 0);

                        // Saldo real de CR mediante simulación diaria (igual que la pestaña Hucha)
                        const totalCR = parseFloat(crSaldoData?.saldo) || 0;

                        // Valor actual de las posiciones abiertas (nuevo sistema bolsa)
                        let totalAssets = 0;
                        for (const pos of bolsaPosiciones) {
                            try {
                                const currentPrice = await window.getAssetPrice(pos.ticker);
                                const appliedPrice = Number.isFinite(currentPrice) ? currentPrice : (Number(pos.precio_medio) || 0);
                                totalAssets += (Number(pos.cantidad) || 0) * appliedPrice;
                            } catch (e) {
                                totalAssets += (Number(pos.coste_total) || 0);
                            }
                        }

                        hucha.textContent = formatearEuro(totalHuchaManual + totalCR + totalAssets);

                        // Sub-huchas: mostrar cada una con nombre y saldo
                        const subHuchasListEl = document.getElementById('sub-huchas-list');
                        if (subHuchasListEl) {
                            subHuchasListEl.innerHTML = '';
                            if (subHuchasList.length > 0) {
                                const mesRef = getReferenceMonthForPeriod(periodo);
                                // Fetch puntuales per sub-hucha to calc individual balances
                                const puntualsByHucha = {};
                                await Promise.all(subHuchasList.map(async (sh) => {
                                    try {
                                        const r = await fetch(`/sub_huchas/${sh.id}/puntuales`);
                                        puntualsByHucha[sh.id] = r.ok ? await r.json() : [];
                                    } catch { puntualsByHucha[sh.id] = []; }
                                }));
                                for (const sh of subHuchasList) {
                                    const inicial = Number(sh.aportacion_inicial) || 0;
                                    const mensual = Number(sh.aportacion_mensual) || 0;
                                    const [dY, dM] = sh.desde.split('-').map(Number);
                                    const [hY, hM] = sh.hasta.split('-').map(Number);
                                    const [rY, rM] = mesRef.split('-').map(Number);
                                    const desdeD = new Date(dY, dM - 1);
                                    const hastaD = new Date(hY, hM - 1);
                                    const refD = new Date(rY, rM - 1);
                                    let saldo = 0;
                                    if (refD >= desdeD) {
                                        const limD = refD < hastaD ? refD : hastaD;
                                        const meses = Math.max(0, (limD.getFullYear() - desdeD.getFullYear()) * 12 + (limD.getMonth() - desdeD.getMonth()));
                                        const punts = (puntualsByHucha[sh.id] || []).filter(p => p.fecha.substring(0, 7) <= mesRef);
                                        const totalPunt = punts.reduce((a, p) => a + (Number(p.monto) || 0), 0);
                                        saldo = inicial + meses * mensual + totalPunt;
                                    }
                                    const row = document.createElement('div');
                                    row.className = 'inicio-sub-hucha-row';
                                    const nameSpan = document.createElement('span');
                                    nameSpan.className = 'inicio-sub-hucha-name';
                                    nameSpan.textContent = sh.nombre;
                                    const amountSpan = document.createElement('span');
                                    amountSpan.className = 'inicio-sub-hucha-amount';
                                    amountSpan.textContent = formatearEuro(saldo);
                                    row.appendChild(nameSpan);
                                    row.appendChild(amountSpan);
                                    subHuchasListEl.appendChild(row);
                                }
                            }
                        }
                    } catch {
                        hucha.textContent = formatearEuro(0);
                        const subHuchasListEl = document.getElementById('sub-huchas-list');
                        if (subHuchasListEl) subHuchasListEl.innerHTML = '';
                    }
                }
                
                // Calcular rendimiento del portfolio (con caché de 20 minutos)
                const portfolio = document.getElementById('portfolio-rendimiento');
                const portfolioTotalValue = document.getElementById('portfolio-valor-total');
                if (portfolio) {
                    const portfolioTotalLabel = (typeof gestorIdiomas !== 'undefined')
                        ? gestorIdiomas.obtenerTexto('resumen.portfolioValorTotal')
                        : 'Valor total';

                    const updatePortfolioCard = (textContent, color = '', totalValue = 0) => {
                        portfolio.textContent = textContent;
                        portfolio.style.color = color;
                        if (portfolioTotalValue) {
                            portfolioTotalValue.textContent = `${portfolioTotalLabel}: ${formatearEuro(totalValue)}`;
                        }
                    };

                    const now = Date.now();
                    const portfolioCacheKey = `${activeUser || 'anon'}`;
                    if (portfolioResultCache && portfolioResultCache.key === portfolioCacheKey && (now - portfolioResultCache.timestamp) < PORTFOLIO_CACHE_TTL) {
                        updatePortfolioCard(
                            portfolioResultCache.textContent,
                            portfolioResultCache.color,
                            Number(portfolioResultCache.totalValue) || 0
                        );
                    } else {
                        try {
                            const [resPosiciones, resResumen] = await Promise.all([
                                fetch('/bolsa/posiciones'),
                                fetch('/bolsa/resumen')
                            ]);
                            const posiciones = resPosiciones.ok ? await resPosiciones.json() : [];
                            const resumen = resResumen.ok ? await resResumen.json() : {};

                            if (!posiciones.length && !resumen.ganancia_realizada && !resumen.total_dividendos) {
                                portfolioResultCache = { key: portfolioCacheKey, textContent: '€0 (0%)', color: '', totalValue: 0, timestamp: now };
                                updatePortfolioCard('€0 (0%)', '', 0);
                            } else {
                                // Calcular valor actual de posiciones abiertas
                                let totalValor = 0;
                                await Promise.all(posiciones.map(async pos => {
                                    try {
                                        const currentPrice = await window.getAssetPrice(pos.ticker);
                                        const appliedPrice = Number.isFinite(currentPrice) ? currentPrice : (Number(pos.precio_medio) || 0);
                                        totalValor += (Number(pos.cantidad) || 0) * appliedPrice;
                                    } catch (_) {
                                        totalValor += Number(pos.coste_total) || 0;
                                    }
                                }));

                                const invested = Number(resumen.total_invertido) || 0;

                                // P&L latente: valor de mercado actual vs coste de posiciones abiertas
                                const pnlLatente = totalValor - invested;
                                const rendTotal  = pnlLatente;
                                const rentPct    = invested > 0 ? (pnlLatente / invested) * 100 : 0;

                                const sign = rendTotal >= 0 ? '+' : '';
                                const textContent = `${sign}${formatearEuro(rendTotal)} (${(rentPct >= 0 ? '+' : '')}${rentPct.toFixed(2)}%)`;
                                const color = rendTotal >= 0 ? 'var(--success)' : 'var(--danger)';

                                portfolioResultCache = { key: portfolioCacheKey, textContent, color, totalValue: totalValor, timestamp: now };
                                updatePortfolioCard(textContent, color, totalValor);
                            }
                        } catch (e) {
                            console.error('Error calculando rendimiento del portfolio:', e);
                            updatePortfolioCard('€0 (0%)', '', 0);
                        }
                    }
                }
        }
        
        // Botones de período (solo agregar listeners si no existen)
        const btnsPeriodo = document.querySelectorAll('.btn-periodo');
        if (btnsPeriodo.length > 0 && !btnsPeriodo[0].dataset.listenerAdded) {
            btnsPeriodo.forEach(btn => {
                btn.addEventListener('click', () => {
                    btnsPeriodo.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    periodoActual = btn.dataset.periodo;
                    actualizarResumen(periodoActual);
                    renderInicioInsights();
                    console.log(`📊 Período actualizado a: ${periodoActual}`);
                });
                btn.dataset.listenerAdded = 'true';
            });
        }

        // Sincronizar estado visual del botón activo con el período persistido
        if (btnsPeriodo.length > 0) {
            let btnActivo = document.querySelector(`.btn-periodo[data-periodo="${periodoActual}"]`);
            if (!btnActivo) {
                btnActivo = btnsPeriodo[0];
                periodoActual = btnActivo.dataset.periodo || '1mes';
            }
            btnsPeriodo.forEach(b => b.classList.remove('active'));
            btnActivo.classList.add('active');
        }

        // Botón de refresh
        const btnRefresh = document.getElementById('btn-refresh-resumen');
        if (btnRefresh && !btnRefresh.dataset.listenerAdded) {
            btnRefresh.addEventListener('click', async () => {
                btnRefresh.classList.add('spinning');
                portfolioResultCache = null; // invalidar caché al refrescar manualmente
                const periodoGuardado = periodoActual;
                await cargarResumenPeriodos();
                // Asegurar que el botón activo y el período actual coincidan
                const btnActivo = document.querySelector(`[data-periodo="${periodoGuardado}"]`);
                if (btnActivo) {
                    document.querySelectorAll('.btn-periodo').forEach(b => b.classList.remove('active'));
                    btnActivo.classList.add('active');
                    periodoActual = periodoGuardado;
                    actualizarResumen(periodoGuardado);
                } else {
                    // Si no encuentra el botón, actualiza con el período actual guardado
                    actualizarResumen(periodoGuardado);
                }
                renderInicioInsights();
                setTimeout(() => btnRefresh.classList.remove('spinning'), 600);
            });
            btnRefresh.dataset.listenerAdded = 'true';
        }

        // Cargar con el período sincronizado
        actualizarResumen(periodoActual);
        renderInicioInsights();
        console.log('✅ Resumen de períodos cargado con período:', periodoActual);

    } catch (error) {

        if (error && error.name === 'AbortError') return; // cancelled — do not show error
        console.error('❌ Error cargando resumen de períodos:', error);

        // Notify the user that data could not be loaded
        if (typeof mostrarNotificacion === 'function') {
            mostrarNotificacion('Error cargando los datos del resumen. Reintentando…', 'error');
        } else {
            const banner = document.getElementById('resumen-error-banner');
            if (banner) {
                banner.textContent = 'Error cargando datos. Reintentando en 5 s…';
                banner.style.display = 'block';
                setTimeout(() => { banner.style.display = 'none'; }, 5000);
            }
        }

        // Mostrar valores por defecto si hay error
        const ingresos = document.getElementById('total-ingresos');
        const gastos = document.getElementById('total-gastos');
        const saldo = document.getElementById('saldo');
        const taxes = document.getElementById('total-taxes');
        const hucha = document.getElementById('total-hucha');

        if (typeof formatearEuro !== 'function') {
            window.formatearEuro = function(monto) {
                if (monto === null || monto === undefined) return '€0,00';
                return '€' + parseFloat(monto).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            };
        }
        if (ingresos) ingresos.textContent = formatearEuro(0);
        if (gastos) gastos.textContent = formatearEuro(0);
        if (saldo) saldo.textContent = formatearEuro(0);
        if (taxes) taxes.textContent = formatearEuro(0);
        if (hucha) hucha.textContent = formatearEuro(0);
        const subHuchasListErr = document.getElementById('sub-huchas-list');
        if (subHuchasListErr) subHuchasListErr.innerHTML = '';

        // Reintentar en 5 segundos
        setTimeout(() => {
            cargandoResumen = false;
            cargarResumenPeriodos();
        }, 5000);
    } finally {
        cargandoResumen = false;
    }
}

// Recargar resumen cada 5 minutos automáticamente
setInterval(() => {
    if (!cargandoResumen && document.getElementById('total-ingresos')) {
        cargarResumenPeriodos();
    }
}, 5 * 60 * 1000);

