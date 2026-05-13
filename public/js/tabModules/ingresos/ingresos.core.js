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
            cuentaRemunerada: ['desde', 'hasta', 'descripcion', 'monto', 'aportacion_mensual', 'interes', 'retencion', 'interes_generado', 'interes_neto', 'categoria']
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

        await fetch('/add/ingreso_puntual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fecha, descripcion, monto, bruto, categoria_id })
        });

        document.getElementById('fechaIngresoPuntual').value = '';
        document.getElementById('descIngresoPuntual').value = '';
        document.getElementById('montoIngresoPuntual').value = '';
        document.getElementById('brutoIngresoPuntual').value = '';
        
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

        await fetch('/add/ingreso_mensual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ desde, hasta, descripcion, monto, bruto, categoria_id })
        });

        document.getElementById('desdeIngresoMensual').value = '';
        document.getElementById('hastaIngresoMensual').value = '';
        document.getElementById('descIngresoMensual').value = '';
        document.getElementById('montoIngresoMensual').value = '';
        document.getElementById('brutoIngresoMensual').value = '';
        
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
            const categoria_id = selectCatCR.value;

            const validarMes = (valor) => /^\d{4}-(0[1-9]|1[0-2])$/.test(valor);

            if (!desde) return showAlert(ingresosManager.t('ingresos.ingresaDesde'));
            if (!hasta) return showAlert(ingresosManager.t('ingresos.ingresaHasta'));
            if (isNaN(monto) || monto <= 0) return showAlert(ingresosManager.t('ingresos.montoInicialInvalido'));
            if (!categoria_id) return showAlert(ingresosManager.t('ingresos.seleccionaCategoria'));
            if (!validarMes(desde)) return showAlert(ingresosManager.t('ingresos.formatoDesde'));
            if (!validarMes(hasta)) return showAlert(ingresosManager.t('ingresos.formatoHasta'));
            if (desde > hasta) return showAlert(ingresosManager.t('ingresos.desdeNoMayorHasta'));

            const resCR = await fetch('/add/cuenta_remunerada', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ desde, hasta, descripcion, monto, aportacion_mensual, interes, retencion, categoria_id })
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
            
            ingresosManager.loadData();
            if (typeof cargarResumenPeriodos === 'function') cargarResumenPeriodos();
            if (typeof notifySuccess === 'function') {
                notifySuccess(ingresosManager.t('mensajes.elementoCreado', 'Cuenta remunerada guardada'));
            }
        };
    }

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
