(function initHuchaSubhuchasModule(global) {
    if (global.HuchaSubhuchasModule) return;

    function createSubhuchasController(deps) {
        const { showAlert, showConfirm, notifySuccess, notifyError, cargarResumenPeriodos } = deps;
        const uiUtils = global.TabUiCommonUtils || {};

        const t = (key, fallback = '') => {
            if (typeof uiUtils.getText === 'function') {
                return uiUtils.getText(key, fallback);
            }
            return fallback || key;
        };

        const fmt = (monto) => {
            if (typeof uiUtils.formatCurrencyNoConvert === 'function') return uiUtils.formatCurrencyNoConvert(monto);
            return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(monto);
        };

        const now = new Date();
        const mesActual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        function calcularSaldo(sh, puntuales) {
            const inicial = Number(sh.aportacion_inicial) || 0;
            const mensual = Number(sh.aportacion_mensual) || 0;
            const [dY, dM] = sh.desde.split('-').map(Number);
            const [hY, hM] = sh.hasta.split('-').map(Number);
            const [rY, rM] = mesActual.split('-').map(Number);
            const desdeD = new Date(dY, dM - 1);
            const hastaD = new Date(hY, hM - 1);
            const refD = new Date(rY, rM - 1);
            if (refD < desdeD) return 0;
            const limD = refD < hastaD ? refD : hastaD;
            const meses = Math.max(0, (limD.getFullYear() - desdeD.getFullYear()) * 12 + (limD.getMonth() - desdeD.getMonth()));
            const totalPuntual = (puntuales || [])
                .filter(p => p.fecha.substring(0, 7) <= mesActual)
                .reduce((acc, p) => acc + (Number(p.monto) || 0), 0);
            return inicial + meses * mensual + totalPuntual;
        }

        function calcularETA(sh, saldo, objetivo) {
            if (!objetivo || objetivo <= saldo) return null;
            const mensual = Number(sh.aportacion_mensual) || 0;
            if (mensual <= 0) return null;
            const mesesRestantes = Math.ceil((objetivo - saldo) / mensual);
            const eta = new Date();
            eta.setMonth(eta.getMonth() + mesesRestantes);
            return `${eta.getFullYear()}-${String(eta.getMonth() + 1).padStart(2, '0')}`;
        }

        function checkMilestone(id, pct) {
            const key = `sh.hito.${id}`;
            const lastPct = parseFloat(localStorage.getItem(key) || '0');
            const milestones = [50, 75, 100];
            for (const m of milestones) {
                if (pct >= m && lastPct < m) {
                    localStorage.setItem(key, String(m));
                    if (typeof notifySuccess === 'function') {
                        notifySuccess(`🎉 ¡Hucha #${id} ha alcanzado el ${m}% del objetivo!`);
                    }
                    break;
                }
            }
        }

        async function loadSubHuchas() {
            const [resSH] = await Promise.all([
                fetch('/sub_huchas'),
                fetch('/sub_huchas/0/puntuales').catch(() => ({ ok: false }))
            ]);
            const huchas = resSH.ok ? await resSH.json() : [];

            const allPuntuales = [];
            await Promise.all(huchas.map(async (sh) => {
                try {
                    const r = await fetch(`/sub_huchas/${sh.id}/puntuales`);
                    if (r.ok) {
                        const items = await r.json();
                        items.forEach(i => allPuntuales.push(i));
                    }
                } catch (_) {}
            }));

            const tbody = document.getElementById('tbodySubHuchas');
            if (tbody) {
                tbody.innerHTML = '';
                huchas.forEach(sh => {
                    const puntH = allPuntuales.filter(p => p.sub_hucha_id === sh.id);
                    const saldo = calcularSaldo(sh, puntH);
                    const objetivo = sh.objetivo ? Number(sh.objetivo) : null;
                    const pct = objetivo && objetivo > 0 ? Math.min(100, (saldo / objetivo) * 100) : null;
                    const color = sh.color || '#4f8ef7';
                    const icono = sh.icono || '';

                    // Progress bar cell
                    let progresoHtml = '—';
                    if (pct !== null) {
                        const barColor = pct >= 100 ? 'var(--success,#22c55e)'
                                       : pct >= 75  ? 'var(--primary,#16a34a)'
                                       : pct >= 50  ? 'var(--warning,#eab308)'
                                       :              'var(--text-tertiary,#64748b)';
                        const eta = calcularETA(sh, saldo, objetivo);
                        progresoHtml = `<div style="min-width:80px;">
                            <div style="background:var(--border-light,#e2e8f0);border-radius:4px;height:7px;overflow:hidden;margin-bottom:2px;">
                                <div style="height:7px;border-radius:4px;background:${barColor};width:${pct.toFixed(1)}%;transition:width 0.3s;"></div>
                            </div>
                            <span style="font-size:0.78rem;color:${barColor};font-weight:600;">${pct.toFixed(1)}%</span>
                            ${eta ? `<span style="font-size:0.72rem;color:var(--text-secondary,#475569);display:block;">Est: ${eta}</span>` : ''}
                        </div>`;
                        checkMilestone(sh.id, pct);
                    }

                    const objetivoHtml = objetivo
                        ? `<span style="font-size:0.85rem;">${fmt(objetivo)}</span>${sh.fecha_objetivo ? `<br><span style="font-size:0.72rem;color:var(--text-secondary,#475569);">${sh.fecha_objetivo}</span>` : ''}`
                        : '—';

                    const tr = document.createElement('tr');
                    if (sh.color) tr.style.borderLeft = `3px solid ${sh.color}`;
                    tr.dataset.id = sh.id;
                    tr.innerHTML = `
                        <td class="editable" data-field="nombre">${icono ? `<span style="margin-right:4px;">${icono}</span>` : ''}${sh.nombre}</td>
                        <td class="editable" data-field="aportacion_inicial"><strong>${fmt(sh.aportacion_inicial)}</strong></td>
                        <td class="editable" data-field="aportacion_mensual"><strong>${fmt(sh.aportacion_mensual)}</strong></td>
                        <td class="editable" data-field="desde">${sh.desde}</td>
                        <td class="editable" data-field="hasta">${sh.hasta}</td>
                        <td><strong>${fmt(saldo)}</strong></td>
                        <td class="editable" data-field="objetivo">${objetivoHtml}</td>
                        <td>${progresoHtml}</td>
                        <td>
                            <button class="editSubHuchaBtn btn-editar" title="${t('formularios.editar', 'Editar')}" style="margin-right:8px;">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button data-id="${sh.id}" class="delSubHuchaBtn btn-eliminar" title="${t('formularios.eliminar', 'Eliminar')}">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            }

            const select = document.getElementById('subHuchaPuntualSelect');
            if (select) {
                select.innerHTML = '';
                huchas.forEach(sh => {
                    const opt = document.createElement('option');
                    opt.value = sh.id;
                    opt.textContent = sh.nombre;
                    select.appendChild(opt);
                });
            }

            const tbodyP = document.getElementById('tbodySubHuchaPuntuales');
            if (tbodyP) {
                tbodyP.innerHTML = '';
                const huchaMap = Object.fromEntries(huchas.map(h => [h.id, h.nombre]));
                allPuntuales.sort((a, b) => b.fecha.localeCompare(a.fecha));
                allPuntuales.forEach(p => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${huchaMap[p.sub_hucha_id] || '#' + p.sub_hucha_id}</td>
                        <td>${p.fecha}</td>
                        <td>${p.descripcion || '—'}</td>
                        <td><strong>${fmt(p.monto)}</strong></td>
                        <td>
                            <button data-id="${p.id}" class="delSubHuchaPuntualBtn btn-eliminar" title="${t('formularios.eliminar', 'Eliminar')}">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    `;
                    tbodyP.appendChild(tr);
                });
            }

            attachSubHuchaEvents(huchas);
        }

        function attachSubHuchaEvents(huchas) {
            document.querySelectorAll('.delSubHuchaBtn').forEach(btn => {
                btn.onclick = async () => {
                    const confirmed = await showConfirm(t('formularios.confirmarEliminar', '¿Eliminar este elemento?'));
                    if (!confirmed) return;
                    try {
                        const res = await fetch('/delete/sub_hucha', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id: btn.dataset.id })
                        });
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        loadSubHuchas();
                        if (typeof cargarResumenPeriodos === 'function') cargarResumenPeriodos();
                        if (typeof notifySuccess === 'function') notifySuccess(t('mensajes.elementoEliminado', 'Elemento eliminado'));
                    } catch (e) {
                        if (typeof notifyError === 'function') notifyError(t('mensajes.errorEliminando', 'Error eliminando'));
                    }
                };
            });

            document.querySelectorAll('.editSubHuchaBtn').forEach(btn => {
                btn.onclick = () => {
                    const tr = btn.closest('tr');
                    const id = tr.dataset.id;
                    const sh = huchas.find(h => String(h.id) === String(id));
                    if (!sh) return;

                    tr.querySelector('[data-field="nombre"]').innerHTML = `<input type="text" value="${sh.nombre}" style="width:120px;">`;
                    tr.querySelector('[data-field="aportacion_inicial"]').innerHTML = `€ <input type="number" step="0.01" value="${sh.aportacion_inicial}" style="width:80px;">`;
                    tr.querySelector('[data-field="aportacion_mensual"]').innerHTML = `€ <input type="number" step="0.01" value="${sh.aportacion_mensual}" style="width:80px;">`;
                    tr.querySelector('[data-field="desde"]').innerHTML = `<input type="text" value="${sh.desde}" maxlength="7" pattern="\\d{4}-\\d{2}" title="Formato: YYYY-MM">`;
                    tr.querySelector('[data-field="hasta"]').innerHTML = `<input type="text" value="${sh.hasta}" maxlength="7" pattern="\\d{4}-\\d{2}" title="Formato: YYYY-MM">`;
                    tr.querySelector('[data-field="objetivo"]').innerHTML = `<input type="number" step="0.01" min="0" value="${sh.objetivo || ''}" placeholder="Objetivo €" style="width:80px;"><br><input type="text" value="${sh.fecha_objetivo || ''}" maxlength="7" placeholder="YYYY-MM" style="width:76px;margin-top:2px;"><br><input type="color" value="${sh.color || '#4f8ef7'}" style="width:30px;height:24px;margin-top:2px;"> <input type="text" value="${sh.icono || ''}" maxlength="4" placeholder="🏠" style="width:36px;text-align:center;">`;

                    const actions = tr.querySelector('td:last-child');
                    actions.innerHTML = `
                        <button class="saveSubHuchaBtn btn-success" style="margin-right:8px;"><i class="fas fa-check"></i></button>
                        <button class="cancelSubHuchaBtn btn-secondary"><i class="fas fa-times"></i></button>
                    `;
                    actions.querySelector('.saveSubHuchaBtn').onclick = async () => {
                        const nombre = tr.querySelector('[data-field="nombre"] input').value;
                        const aportacion_inicial = parseFloat(tr.querySelector('[data-field="aportacion_inicial"] input').value) || 0;
                        const aportacion_mensual = parseFloat(tr.querySelector('[data-field="aportacion_mensual"] input').value) || 0;
                        const desde = tr.querySelector('[data-field="desde"] input').value;
                        const hasta = tr.querySelector('[data-field="hasta"] input').value;
                        const objInputs = tr.querySelectorAll('[data-field="objetivo"] input');
                        const objetivo = objInputs[0] ? (parseFloat(objInputs[0].value) || null) : null;
                        const fecha_objetivo = objInputs[1] ? (objInputs[1].value.trim() || null) : null;
                        const color = objInputs[2] ? (objInputs[2].value || null) : null;
                        const icono = objInputs[3] ? (objInputs[3].value.trim() || null) : null;
                        if (!nombre || !desde || !hasta) { showAlert(t('subHucha.camposRequeridos', 'Nombre, desde y hasta son requeridos')); return; }
                        try {
                            const res = await fetch('/update/sub_hucha', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id, nombre, aportacion_inicial, aportacion_mensual, desde, hasta, objetivo, fecha_objetivo, color, icono })
                            });
                            if (!res.ok) throw new Error(`HTTP ${res.status}`);
                            loadSubHuchas();
                            if (typeof cargarResumenPeriodos === 'function') cargarResumenPeriodos();
                            if (typeof notifySuccess === 'function') notifySuccess(t('mensajes.elementoActualizado', 'Guardado'));
                        } catch (e) {
                            if (typeof notifyError === 'function') notifyError(t('mensajes.errorGuardando', 'Error guardando'));
                        }
                    };
                    actions.querySelector('.cancelSubHuchaBtn').onclick = () => loadSubHuchas();
                };
            });

            document.querySelectorAll('.delSubHuchaPuntualBtn').forEach(btn => {
                btn.onclick = async () => {
                    const confirmed = await showConfirm(t('formularios.confirmarEliminar', '¿Eliminar?'));
                    if (!confirmed) return;
                    try {
                        const res = await fetch('/delete/sub_hucha_puntual', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id: btn.dataset.id })
                        });
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        loadSubHuchas();
                        if (typeof cargarResumenPeriodos === 'function') cargarResumenPeriodos();
                        if (typeof notifySuccess === 'function') notifySuccess(t('mensajes.elementoEliminado', 'Eliminado'));
                    } catch (e) {
                        if (typeof notifyError === 'function') notifyError(t('mensajes.errorEliminando', 'Error'));
                    }
                };
            });
        }

        async function cargarSubHuchas() {
            const btnAddSH = document.getElementById('btnAgregarSubHucha');
            if (btnAddSH) {
                btnAddSH.onclick = async () => {
                    const nombre = document.getElementById('subHuchaNombre').value;
                    const aportacion_inicial = parseFloat(document.getElementById('subHuchaInicial').value) || 0;
                    const aportacion_mensual = parseFloat(document.getElementById('subHuchaMensual').value) || 0;
                    const desde = document.getElementById('subHuchaDesde').value.trim();
                    const hasta = document.getElementById('subHuchaHasta').value.trim();
                    const objetivo = parseFloat(document.getElementById('subHuchaObjetivo')?.value) || null;
                    const fecha_objetivo = document.getElementById('subHuchaFechaObj')?.value.trim() || null;
                    const color = document.getElementById('subHuchaColor')?.value || null;
                    const icono = document.getElementById('subHuchaIcono')?.value.trim() || null;
                    const formatoMes = /^\d{4}-\d{2}$/;
                    if (!nombre || !desde || !hasta) {
                        showAlert(t('subHucha.camposRequeridos', 'Nombre, desde y hasta son requeridos'));
                        return;
                    }
                    if (!formatoMes.test(desde) || !formatoMes.test(hasta)) {
                        showAlert(t('subHucha.formatoFecha', 'Formato de fecha: YYYY-MM (ej: 2026-01)'));
                        return;
                    }
                    try {
                        const res = await fetch('/add/sub_hucha', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ nombre, aportacion_inicial, aportacion_mensual, desde, hasta, objetivo, fecha_objetivo, color, icono })
                        });
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        document.getElementById('subHuchaNombre').value = '';
                        document.getElementById('subHuchaInicial').value = '0';
                        document.getElementById('subHuchaMensual').value = '0';
                        document.getElementById('subHuchaDesde').value = '';
                        document.getElementById('subHuchaHasta').value = '';
                        if (document.getElementById('subHuchaObjetivo')) document.getElementById('subHuchaObjetivo').value = '';
                        if (document.getElementById('subHuchaFechaObj')) document.getElementById('subHuchaFechaObj').value = '';
                        if (document.getElementById('subHuchaIcono')) document.getElementById('subHuchaIcono').value = '';
                        loadSubHuchas();
                        if (typeof cargarResumenPeriodos === 'function') cargarResumenPeriodos();
                        if (typeof notifySuccess === 'function') notifySuccess(t('mensajes.elementoCreado', 'Hucha creada'));
                    } catch (e) {
                        if (typeof notifyError === 'function') notifyError(t('mensajes.errorGuardando', 'Error'));
                    }
                };
            }

            const btnAddP = document.getElementById('btnAgregarSubHuchaPuntual');
            if (btnAddP) {
                btnAddP.onclick = async () => {
                    const sub_hucha_id = document.getElementById('subHuchaPuntualSelect').value;
                    const fecha = document.getElementById('subHuchaPuntualFecha').value;
                    const descripcion = document.getElementById('subHuchaPuntualDesc').value;
                    const monto = parseFloat(document.getElementById('subHuchaPuntualMonto').value);
                    if (!sub_hucha_id || !fecha || !monto || isNaN(monto)) {
                        showAlert(t('subHucha.camposPuntualRequeridos', 'Hucha, fecha y monto son requeridos'));
                        return;
                    }
                    try {
                        const res = await fetch('/add/sub_hucha_puntual', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ sub_hucha_id, fecha, descripcion, monto })
                        });
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        document.getElementById('subHuchaPuntualFecha').value = '';
                        document.getElementById('subHuchaPuntualDesc').value = '';
                        document.getElementById('subHuchaPuntualMonto').value = '';
                        loadSubHuchas();
                        if (typeof cargarResumenPeriodos === 'function') cargarResumenPeriodos();
                        if (typeof notifySuccess === 'function') notifySuccess(t('mensajes.elementoCreado', 'Aportación guardada'));
                    } catch (e) {
                        if (typeof notifyError === 'function') notifyError(t('mensajes.errorGuardando', 'Error'));
                    }
                };
            }

            await loadSubHuchas();
        }

        return {
            cargarSubHuchas,
            calcularSaldo
        };
    }

    global.HuchaSubhuchasModule = {
        createSubhuchasController
    };
}(window));
