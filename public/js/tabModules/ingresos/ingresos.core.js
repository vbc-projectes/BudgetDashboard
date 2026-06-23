/**
 * Ingresos - Versión simplificada usando TransactionManager
 * Mantiene lógica específica: Cuenta Remunerada, campo bruto
 */

function cargarIngresosForm() {
    // Inicializar TransactionManager para ingresos puntuales, mensuales y cuenta remunerada
    const ingresosManager = new TransactionManager({
        entityName: 'ingresos',
        entityNameSingular: 'ingreso',
        categoryType: 'ingresos',
        endpoints: {
            puntuales: 'ingresos_puntuales',
            mensuales: 'ingresos_mensuales',
            cuentaRemunerada: 'cuenta_remunerada',
            delete: {
                puntual: '/delete/ingreso_puntual',
                mensual: '/delete/ingreso_mensual',
                cuentaRemunerada: '/delete/cuenta_remunerada'
            }
        },
        tables: {
            puntuales: '#tablaIngresosPuntuales tbody',
            mensuales: '#tablaIngresosMensuales tbody',
            cuentaRemunerada: '#tablaCuentaRemunerada tbody'
        },
        selects: {
            puntuales: '#categoriaIngresoPuntual',
            mensuales: '#categoriaIngresoMensual',
            cuentaRemunerada: '#categoriaCuentaRemunerada'
        },
        customColumns: {
            puntual: ['fecha', 'descripcion', 'monto', 'bruto', 'categoria'],
            mensual: ['desde', 'hasta', 'descripcion', 'monto', 'bruto', 'categoria'],
            cuentaRemunerada: ['desde', 'hasta', 'descripcion', 'monto', 'aportacion_mensual', 'interes', 'retencion', 'interes_generado', 'interes_neto', 'categoria', 'linked_to_bolsa']
        },
        extraActions: {
            cuentaRemunerada: [{ cls: 'btn-cr-config', icon: 'fa-cog', title: 'Configurar aportaciones y ajustes' }]
        },
        showOldFlag: 'showOldIngresos'
    });

    // Inicializar TransactionManager para ingresos reales
    const ingresosRealesManager = new TransactionManager({
        entityName: 'ingresos_reales',
        entityNameSingular: 'ingreso_real',
        categoryType: 'ingresos',
        endpoints: {
            puntuales: 'ingresos_reales',
            delete: {
                puntual: '/delete/ingreso_real'
            }
        },
        updateEndpoints: {
            puntual: '/update/ingreso_real'
        },
        tables: {
            puntuales: '#tablaIngresosReales tbody'
        },
        selects: {
            puntuales: '#categoriaIngresoReal'
        },
        showOldFlag: 'showOldIngresosReales'
    });

    // Inicializar manager
    ingresosManager.init();
    ingresosRealesManager.init();

    // ===== AGREGAR INGRESO PUNTUAL =====
    document.getElementById('btnAgregarIngresoPuntual').onclick = async () => {
        const fecha = document.getElementById('fechaIngresoPuntual').value;
        const descripcion = document.getElementById('descIngresoPuntual').value;
        const monto = parseFloat(document.getElementById('montoIngresoPuntual').value);
        const bruto = parseFloat(document.getElementById('brutoIngresoPuntual').value) || null;
        const categoria_id = document.getElementById('categoriaIngresoPuntual').value;

        if (!fecha) return showAlert(ingresosManager.t('ingresos.seleccionaFecha', 'Selecciona una fecha'));
        if (!descripcion) return showAlert(ingresosManager.t('ingresos.ingresaDescripcion', 'Ingresa una descripción'));
        if (isNaN(monto) || monto <= 0) return showAlert(ingresosManager.t('ingresos.montoInvalido', 'Monto inválido'));
        if (!categoria_id) return showAlert(ingresosManager.t('ingresos.seleccionaCategoria', 'Selecciona una categoría'));

        const notas = document.getElementById('notasIngresoPuntual')?.value?.trim() || null;
        await fetch('/add/ingreso_puntual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fecha, descripcion, monto, bruto, categoria_id, notas })
        });

        document.getElementById('fechaIngresoPuntual').value = '';
        document.getElementById('descIngresoPuntual').value = '';
        document.getElementById('montoIngresoPuntual').value = '';
        document.getElementById('brutoIngresoPuntual').value = '';
        if (document.getElementById('notasIngresoPuntual')) document.getElementById('notasIngresoPuntual').value = '';
        
        ingresosManager.loadData();
        if (typeof cargarResumenPeriodos === 'function') cargarResumenPeriodos();
        if (typeof notifySuccess === 'function') {
            notifySuccess(ingresosManager.t('mensajes.elementoCreado', 'Ingreso guardado'));
        }
    };

    // ===== AGREGAR INGRESO REAL =====
    document.getElementById('btnAgregarIngresoReal').onclick = async () => {
        const fecha = document.getElementById('fechaIngresoReal').value;
        const descripcion = document.getElementById('descIngresoReal').value;
        const monto = parseFloat(document.getElementById('montoIngresoReal').value);
        const categoria_id = document.getElementById('categoriaIngresoReal').value;

        if (!fecha) return showAlert(ingresosManager.t('ingresos.seleccionaFecha', 'Selecciona una fecha'));
        if (!descripcion) return showAlert(ingresosManager.t('ingresos.ingresaDescripcion', 'Ingresa una descripción'));
        if (isNaN(monto) || monto <= 0) return showAlert(ingresosManager.t('ingresos.montoInvalido', 'Monto inválido'));
        if (!categoria_id) return showAlert(ingresosManager.t('ingresos.seleccionaCategoria', 'Selecciona una categoría'));

        await fetch('/add/ingreso_real', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fecha, descripcion, monto, categoria_id, archivo_origen: 'manual' })
        });

        document.getElementById('fechaIngresoReal').value = '';
        document.getElementById('descIngresoReal').value = '';
        document.getElementById('montoIngresoReal').value = '';

        ingresosRealesManager.loadData();
        if (typeof cargarResumenPeriodos === 'function') cargarResumenPeriodos();
        if (typeof notifySuccess === 'function') {
            notifySuccess(ingresosRealesManager.t('mensajes.elementoCreado', 'Ingreso real guardado'));
        }
    };

    // ===== AGREGAR INGRESO MENSUAL =====
    document.getElementById('btnAgregarIngresoMensual').onclick = async () => {
        const desde = document.getElementById('desdeIngresoMensual').value;
        const hasta = document.getElementById('hastaIngresoMensual').value;
        const descripcion = document.getElementById('descIngresoMensual').value;
        const monto = parseFloat(document.getElementById('montoIngresoMensual').value);
        const bruto = parseFloat(document.getElementById('brutoIngresoMensual').value) || null;
        const categoria_id = document.getElementById('categoriaIngresoMensual').value;

        const validarMes = (valor) => /^\d{4}-(0[1-9]|1[0-2])$/.test(valor);

        if (!desde) return showAlert(ingresosManager.t('ingresos.ingresaDesde', "Ingresa el mes 'desde' en formato YYYY-MM"));
        if (!hasta) return showAlert(ingresosManager.t('ingresos.ingresaHasta', "Ingresa el mes 'hasta' en formato YYYY-MM"));
        if (!descripcion) return showAlert(ingresosManager.t('ingresos.ingresaDescripcion', "Ingresa una descripción"));
        if (isNaN(monto) || monto <= 0) return showAlert(ingresosManager.t('ingresos.montoInvalido', "Monto inválido"));
        if (!categoria_id) return showAlert(ingresosManager.t('ingresos.seleccionaCategoria', "Selecciona una categoría"));
        if (!validarMes(desde)) return showAlert(ingresosManager.t('ingresos.formatoDesde', "El campo 'Desde' debe tener formato YYYY-MM"));
        if (!validarMes(hasta)) return showAlert(ingresosManager.t('ingresos.formatoHasta', "El campo 'Hasta' debe tener formato YYYY-MM"));
        if (desde > hasta) return showAlert(ingresosManager.t('ingresos.desdeNoMayorHasta', "El mes 'desde' no puede ser mayor que 'hasta'"));

        const notasMensual = document.getElementById('notasIngresoMensual')?.value?.trim() || null;
        await fetch('/add/ingreso_mensual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ desde, hasta, descripcion, monto, bruto, categoria_id, notas: notasMensual })
        });

        document.getElementById('desdeIngresoMensual').value = '';
        document.getElementById('hastaIngresoMensual').value = '';
        document.getElementById('descIngresoMensual').value = '';
        document.getElementById('montoIngresoMensual').value = '';
        document.getElementById('brutoIngresoMensual').value = '';
        if (document.getElementById('notasIngresoMensual')) document.getElementById('notasIngresoMensual').value = '';
        
        ingresosManager.loadData();
        if (typeof cargarResumenPeriodos === 'function') cargarResumenPeriodos();
        if (typeof notifySuccess === 'function') {
            notifySuccess(ingresosManager.t('mensajes.elementoCreado', 'Ingreso mensual guardado'));
        }
    };

    // ===== CUENTA REMUNERADA (Usando TransactionManager) =====
    const btnAgregarCR = document.getElementById('btnAgregarCuentaRemunerada');
    if (btnAgregarCR) {
        btnAgregarCR.onclick = async () => {
            const desde = document.getElementById('desdeCuentaRemunerada').value;
            const hasta = document.getElementById('hastaCuentaRemunerada').value;
            const descripcion = document.getElementById('descCuentaRemunerada').value;
            const monto = parseFloat(document.getElementById('montoCuentaRemunerada').value);
            const aportacion_mensual = parseFloat(document.getElementById('aportacionMensualCR').value) || null;
            const interes = parseFloat(document.getElementById('interesCuentaRemunerada').value) || null;
            const retencion = parseFloat(document.getElementById('retencionCuentaRemunerada').value) || 0;
            const selectCatCR = document.getElementById('categoriaCuentaRemunerada');
            const categoria_id = selectCatCR ? selectCatCR.value : null;
            const linked_to_bolsa = document.getElementById('linkedBolsaCR')?.checked ? 1 : 0;

            const validarMes = (valor) => /^\d{4}-(0[1-9]|1[0-2])$/.test(valor);

            if (!desde) return showAlert(ingresosManager.t('ingresos.ingresaDesde'));
            if (isNaN(monto) || monto <= 0) return showAlert(ingresosManager.t('ingresos.montoInicialInvalido', 'Monto inválido'));
            if (!categoria_id) return showAlert(ingresosManager.t('ingresos.seleccionaCategoria'));
            if (!validarMes(desde)) return showAlert(ingresosManager.t('ingresos.formatoDesde'));
            if (hasta && !validarMes(hasta)) return showAlert(ingresosManager.t('ingresos.formatoHasta'));
            if (hasta && desde > hasta) return showAlert(ingresosManager.t('ingresos.desdeNoMayorHasta'));

            const resCR = await fetch('/add/cuenta_remunerada', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ desde, hasta: hasta || null, descripcion, monto, aportacion_mensual, interes, retencion, categoria_id, linked_to_bolsa })
            });

            if (!resCR.ok) {
                const err = await resCR.json().catch(() => ({}));
                return showAlert(ingresosManager.t('ingresos.errorGuardar', 'Error al guardar') + ': ' + (err.error || resCR.status));
            }

            document.getElementById('desdeCuentaRemunerada').value = '';
            document.getElementById('hastaCuentaRemunerada').value = '';
            document.getElementById('descCuentaRemunerada').value = '';
            document.getElementById('montoCuentaRemunerada').value = '';
            document.getElementById('aportacionMensualCR').value = '';
            document.getElementById('interesCuentaRemunerada').value = '';
            document.getElementById('retencionCuentaRemunerada').value = '';
            const chkLink = document.getElementById('linkedBolsaCR');
            if (chkLink) chkLink.checked = false;

            ingresosManager.loadData();
            if (typeof cargarResumenPeriodos === 'function') cargarResumenPeriodos();
            if (typeof notifySuccess === 'function') {
                notifySuccess(ingresosManager.t('mensajes.elementoCreado', 'Cuenta remunerada guardada'));
            }
        };
    }

    // ===== VINCULAR/DESVINCULAR CUENTA REMUNERADA DE CARTERA =====
    // Delegación en el tbody para manejar los botones .btn-cr-vincular
    document.querySelector('#tablaCuentaRemunerada tbody')?.addEventListener('click', async e => {
        const btn = e.target.closest('.btn-cr-vincular');
        if (!btn) return;
        const id = btn.dataset.id;
        const isLinked = btn.classList.contains('cr-linked');
        // Si ya está vinculada → desvincular; si no → vincular
        const linked = isLinked ? 0 : 1;
        try {
            const res = await fetch('/cuenta_remunerada/set-link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, linked })
            });
            if (!res.ok) throw new Error('Error al actualizar');
            ingresosManager.loadData();
            window.showToast?.(linked ? 'Cuenta vinculada a la cartera' : 'Cuenta desvinculada de la cartera', 'success');
        } catch (err) {
            window.showToast?.('Error: ' + err.message, 'error');
        }
    });

    // ===== CONFIGURAR CUENTA REMUNERADA (⚙️) =====
    // Delegación en tbody para el botón .btn-cr-config
    document.querySelector('#tablaCuentaRemunerada tbody')?.addEventListener('click', e => {
        const btn = e.target.closest('.btn-cr-config');
        if (!btn) return;
        abrirModalCRConfig(Number(btn.dataset.id));
    });

    // ── Modal CR Config: estado ─────────────────────────────────────────────
    let _crConfigId = null;

    const modalCRConfig = document.getElementById('modalCRConfig');
    document.getElementById('modalCRConfigClose')?.addEventListener('click', () => {
        modalCRConfig.style.display = 'none';
        _crConfigId = null;
    });
    modalCRConfig?.addEventListener('click', e => {
        if (e.target === modalCRConfig) { modalCRConfig.style.display = 'none'; _crConfigId = null; }
    });

    // Formatea moneda sin conversión (usar la utilidad global si está disponible)
    function _fmtCR(v) {
        if (typeof tabUiCommonUtils?.formatCurrencyNoConvert === 'function') return tabUiCommonUtils.formatCurrencyNoConvert(v);
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v);
    }

    // Renderiza la tabla de aportaciones dentro del modal
    function renderCRAportaciones(lista) {
        const tbody = document.getElementById('tbodyCRAportaciones');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (!lista.length) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#aaa;padding:10px;font-size:12px;">Sin cambios registrados</td></tr>';
            return;
        }
        lista.forEach(ap => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding:4px 8px;">${ap.desde}</td>
                <td style="padding:4px 8px;text-align:right;"><strong>${_fmtCR(ap.cantidad)}</strong></td>
                <td style="padding:4px 8px;text-align:center;">
                    <button data-id="${ap.id}" class="btn-del-aportacion btn-eliminar" title="Eliminar" style="padding:2px 7px;">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>`;
            tbody.appendChild(tr);
        });
    }

    // Renderiza la tabla de ajustes dentro del modal
    function renderCRAjustes(lista) {
        const tbody = document.getElementById('tbodyCRAjustes');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (!lista.length) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#aaa;padding:10px;font-size:12px;">Sin ajustes registrados</td></tr>';
            return;
        }
        lista.forEach(aj => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding:4px 8px;">${aj.fecha}</td>
                <td style="padding:4px 8px;text-align:right;"><strong>${_fmtCR(aj.saldo)}</strong></td>
                <td style="padding:4px 8px;color:#666;">${aj.descripcion || ''}</td>
                <td style="padding:4px 8px;text-align:center;">
                    <button data-id="${aj.id}" class="btn-del-ajuste btn-eliminar" title="Eliminar" style="padding:2px 7px;">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>`;
            tbody.appendChild(tr);
        });
    }

    // Renderiza la tabla de tipos de interés dentro del modal
    function renderCRTipos(lista) {
        const tbody = document.getElementById('tbodyCRTipos');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (!lista.length) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#aaa;padding:10px;font-size:12px;">Sin cambios registrados</td></tr>';
            return;
        }
        lista.forEach(t => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding:4px 8px;">${t.desde}</td>
                <td style="padding:4px 8px;text-align:right;"><strong>${parseFloat(t.interes).toFixed(2)}%</strong></td>
                <td style="padding:4px 8px;text-align:center;">
                    <button data-id="${t.id}" class="btn-del-tipo btn-eliminar" title="Eliminar" style="padding:2px 7px;">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>`;
            tbody.appendChild(tr);
        });
    }

    // Carga y muestra el modal para una CR concreta
    async function abrirModalCRConfig(cuentaId) {
        _crConfigId = cuentaId;
        const [resAp, resAj, resTi] = await Promise.all([
            fetch(`/cuenta-remunerada/${cuentaId}/aportaciones`),
            fetch(`/cuenta-remunerada/${cuentaId}/ajustes`),
            fetch(`/cuenta-remunerada/${cuentaId}/tipos-interes`)
        ]);
        const aportaciones = resAp.ok ? await resAp.json() : [];
        const ajustes      = resAj.ok ? await resAj.json() : [];
        const tipos        = resTi.ok ? await resTi.json() : [];
        renderCRAportaciones(aportaciones);
        renderCRAjustes(ajustes);
        renderCRTipos(tipos);
        document.getElementById('crAportDesde').value    = '';
        document.getElementById('crAportCantidad').value = '';
        document.getElementById('crAjusteFecha').value   = '';
        document.getElementById('crAjusteSaldo').value   = '';
        document.getElementById('crAjusteDesc').value    = '';
        document.getElementById('crTipoDesde').value     = '';
        document.getElementById('crTipoInteres').value   = '';
        modalCRConfig.style.display = 'flex';
    }

    // Añadir aportación variable
    document.getElementById('btnAddCRAportacion')?.addEventListener('click', async () => {
        if (!_crConfigId) return;
        const desde    = document.getElementById('crAportDesde').value;
        const cantidad = parseFloat(document.getElementById('crAportCantidad').value);
        if (!desde)           return showAlert('Indica la fecha desde la que aplica la nueva aportación (YYYY-MM-DD)');
        if (isNaN(cantidad))  return showAlert('Indica el importe mensual');
        const res = await fetch(`/cuenta-remunerada/${_crConfigId}/aportaciones`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ desde, cantidad })
        });
        if (!res.ok) return showAlert('Error al guardar la aportación');
        const lista = await (await fetch(`/cuenta-remunerada/${_crConfigId}/aportaciones`)).json();
        renderCRAportaciones(lista);
        document.getElementById('crAportDesde').value    = '';
        document.getElementById('crAportCantidad').value = '';
    });

    // Eliminar aportación variable (delegación)
    document.getElementById('tbodyCRAportaciones')?.addEventListener('click', async e => {
        const btn = e.target.closest('.btn-del-aportacion');
        if (!btn || !_crConfigId) return;
        const confirmed = await showConfirm('¿Eliminar este cambio de aportación?');
        if (!confirmed) return;
        await fetch(`/cuenta-remunerada/aportaciones/${btn.dataset.id}`, { method: 'DELETE' });
        const lista = await (await fetch(`/cuenta-remunerada/${_crConfigId}/aportaciones`)).json();
        renderCRAportaciones(lista);
    });

    // Añadir ajuste de saldo
    document.getElementById('btnAddCRAjuste')?.addEventListener('click', async () => {
        if (!_crConfigId) return;
        const fecha       = document.getElementById('crAjusteFecha').value;
        const saldo       = parseFloat(document.getElementById('crAjusteSaldo').value);
        const descripcion = document.getElementById('crAjusteDesc').value.trim() || null;
        if (!fecha)        return showAlert('Indica la fecha del ajuste');
        if (isNaN(saldo))  return showAlert('Indica el saldo correcto');
        const res = await fetch(`/cuenta-remunerada/${_crConfigId}/ajustes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fecha, saldo, descripcion })
        });
        if (!res.ok) return showAlert('Error al guardar el ajuste');
        const lista = await (await fetch(`/cuenta-remunerada/${_crConfigId}/ajustes`)).json();
        renderCRAjustes(lista);
        document.getElementById('crAjusteFecha').value = '';
        document.getElementById('crAjusteSaldo').value = '';
        document.getElementById('crAjusteDesc').value  = '';
    });

    // Eliminar ajuste de saldo (delegación)
    document.getElementById('tbodyCRAjustes')?.addEventListener('click', async e => {
        const btn = e.target.closest('.btn-del-ajuste');
        if (!btn || !_crConfigId) return;
        const confirmed = await showConfirm('¿Eliminar este ajuste de saldo?');
        if (!confirmed) return;
        await fetch(`/cuenta-remunerada/ajustes/${btn.dataset.id}`, { method: 'DELETE' });
        const lista = await (await fetch(`/cuenta-remunerada/${_crConfigId}/ajustes`)).json();
        renderCRAjustes(lista);
    });

    // Añadir tipo de interés
    document.getElementById('btnAddCRTipo')?.addEventListener('click', async () => {
        if (!_crConfigId) return;
        const desde   = document.getElementById('crTipoDesde').value.trim();
        const interes = parseFloat(document.getElementById('crTipoInteres').value);
        if (!/^\d{4}-\d{2}$/.test(desde)) return showAlert('Indica el mes de inicio en formato YYYY-MM');
        if (isNaN(interes) || interes < 0) return showAlert('Indica el tipo de interés anual (%)');
        const res = await fetch(`/cuenta-remunerada/${_crConfigId}/tipos-interes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ desde, interes })
        });
        if (!res.ok) return showAlert('Error al guardar el tipo de interés');
        const lista = await (await fetch(`/cuenta-remunerada/${_crConfigId}/tipos-interes`)).json();
        renderCRTipos(lista);
        document.getElementById('crTipoDesde').value   = '';
        document.getElementById('crTipoInteres').value = '';
    });

    // Eliminar tipo de interés (delegación)
    document.getElementById('tbodyCRTipos')?.addEventListener('click', async e => {
        const btn = e.target.closest('.btn-del-tipo');
        if (!btn || !_crConfigId) return;
        const confirmed = await showConfirm('¿Eliminar este tipo de interés?');
        if (!confirmed) return;
        await fetch(`/cuenta-remunerada/tipos-interes/${btn.dataset.id}`, { method: 'DELETE' });
        const lista = await (await fetch(`/cuenta-remunerada/${_crConfigId}/tipos-interes`)).json();
        renderCRTipos(lista);
    });

    // Exportar informe fiscal CR
    document.getElementById('btnExportFiscalCR')?.addEventListener('click', async () => {
        if (!_crConfigId) return;
        try {
            const res = await fetch(`/cuenta-remunerada/${_crConfigId}/informe-fiscal`);
            if (!res.ok) return showAlert('Error al obtener el informe fiscal');
            const datos = await res.json();
            if (!datos.length) return showAlert('No hay datos de intereses para exportar');
            const header = 'Año;Interés bruto (€);Retención (%);Interés neto (€)';
            const rows = datos.map(d => `${d.anio};${d.interes_bruto.toFixed(2)};${d.retencion_pct.toFixed(2)};${d.interes_neto.toFixed(2)}`);
            const csv = [header, ...rows].join('\n');
            const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = `informe_fiscal_CR_${new Date().getFullYear()}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            showAlert('Error al exportar el informe fiscal');
        }
    });

    // ===== TOGGLE MOSTRAR ANTIGUOS =====
    window.showOldIngresos = false;
    window.showOldIngresosReales = false;

    const toggleChecks = [
        document.getElementById('toggleIngresosAntiguos'),
        document.getElementById('toggleIngresosMensualesAntiguos'),
        document.getElementById('toggleCuentaRemuneradaAntiguos')
    ].filter(Boolean);

    const toggleLabels = [
        document.getElementById('labelToggleIngresosAntiguos'),
        document.getElementById('labelToggleIngresosMensualesAntiguos'),
        document.getElementById('labelToggleCuentaRemuneradaAntiguos')
    ].filter(Boolean);

    const toggleChecksReales = [
        document.getElementById('toggleIngresosRealesAntiguos')
    ].filter(Boolean);

    const toggleLabelsReales = [
        document.getElementById('labelToggleIngresosRealesAntiguos')
    ].filter(Boolean);

    if (toggleChecks.length) {
        const updateAll = () => {
            const textoMostrar = ingresosManager.t('ingresos.mostrarAntiguos', 'Mostrar antiguos');
            const textoOcultar = ingresosManager.t('ingresos.ocultarAntiguos', 'Ocultar antiguos');
            toggleChecks.forEach(chk => chk.checked = window.showOldIngresos);
            toggleLabels.forEach(lbl => {
                if (!lbl) return;
                lbl.textContent = window.showOldIngresos ? textoOcultar : textoMostrar;
            });
        };

        toggleChecks.forEach(chk => {
            chk.addEventListener('change', () => {
                window.showOldIngresos = chk.checked;
                updateAll();
                ingresosManager.loadData();
            });
        });

        updateAll();
    }

    if (toggleChecksReales.length) {
        const updateAllReales = () => {
            const textoMostrar = ingresosRealesManager.t('ingresos.mostrarAntiguos', 'Mostrar antiguos');
            const textoOcultar = ingresosRealesManager.t('ingresos.ocultarAntiguos', 'Ocultar antiguos');
            toggleChecksReales.forEach(chk => chk.checked = window.showOldIngresosReales);
            toggleLabelsReales.forEach(lbl => {
                if (!lbl) return;
                lbl.textContent = window.showOldIngresosReales ? textoOcultar : textoMostrar;
            });
        };

        toggleChecksReales.forEach(chk => {
            chk.addEventListener('change', () => {
                window.showOldIngresosReales = chk.checked;
                updateAllReales();
                ingresosRealesManager.loadData();
            });
        });

        updateAllReales();
    }

    // ===== SUBPESTAÑAS =====
    const botonesSubtab = document.querySelectorAll('#ingresos .subtab-btn');
    const subtabs = document.querySelectorAll('#ingresos .subtab');

    botonesSubtab.forEach(btn => {
        btn.addEventListener('click', () => {
            botonesSubtab.forEach(b => b.classList.remove('active'));
            subtabs.forEach(st => st.style.display = 'none');
            btn.classList.add('active');
            document.getElementById(btn.dataset.target).style.display = 'block';
        });
    });

    if (botonesSubtab.length > 0) {
        botonesSubtab[0].classList.add('active');
    }

    // Permitir Enter para agregar
    document.getElementById('descIngresoPuntual')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('btnAgregarIngresoPuntual').click();
    });
    document.getElementById('descIngresoMensual')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('btnAgregarIngresoMensual').click();
    });

    // Listener para cambios de idioma
    document.addEventListener('idiomaActualizado', () => {
        const textoMostrar = ingresosManager.t('ingresos.mostrarAntiguos', 'Mostrar antiguos');
        const textoOcultar = ingresosManager.t('ingresos.ocultarAntiguos', 'Ocultar antiguos');
        toggleLabels.forEach(lbl => {
            if (!lbl) return;
            lbl.textContent = window.showOldIngresos ? textoOcultar : textoMostrar;
        });

        const textoMostrarReales = ingresosRealesManager.t('ingresos.mostrarAntiguos', 'Mostrar antiguos');
        const textoOcultarReales = ingresosRealesManager.t('ingresos.ocultarAntiguos', 'Ocultar antiguos');
        toggleLabelsReales.forEach(lbl => {
            if (!lbl) return;
            lbl.textContent = window.showOldIngresosReales ? textoOcultarReales : textoMostrarReales;
        });
    });
}
