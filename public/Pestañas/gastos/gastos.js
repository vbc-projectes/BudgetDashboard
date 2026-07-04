/**
 * Gastos - Versión simplificada usando TransactionManager
 * Mantiene lógica específica: agregar gastos, fraccionamiento
 * Delega CRUD y edición a clase base
 */
function cargarGastosForm() {
    // Inicializar TransactionManager para gastos
    const gastosManager = new TransactionManager({
        entityName: 'gastos',
        entityNameSingular: 'gasto',
        categoryType: 'gastos',
        endpoints: {
            puntuales: 'gastos_puntuales',
            mensuales: 'gastos_mensuales',
            delete: {
                puntual: '/delete/gasto_puntual',
                mensual: '/delete/gasto_mensual'
            }
        },
        tables: {
            puntuales: '#tablaGastosPuntuales tbody',
            mensuales: '#tablaGastosMensuales tbody'
        },
        selects: {
            puntuales: '#categoriaGasto',
            mensuales: '#categoriaMensual'
        },
        customColumns: {
            mensual: ['desde', 'hasta', 'frecuencia_meses', 'descripcion', 'monto', 'ipc_porcentaje', 'monto_ajustado', 'categoria', 'notas']
        },
        showOldFlag: 'showOldGastos'
    });

    // Inicializar TransactionManager para gastos reales
    const gastosRealesManager = new TransactionManager({
        entityName: 'gastos_reales',
        entityNameSingular: 'gasto_real',
        categoryType: 'gastos',
        endpoints: {
            puntuales: 'gastos_reales',
            delete: {
                puntual: '/delete/gasto_real'
            }
        },
        updateEndpoints: {
            puntual: '/update/gasto_real'
        },
        tables: {
            puntuales: '#tablaGastosReales tbody'
        },
        selects: {
            puntuales: '#categoriaGastoReal'
        },
        showOldFlag: 'showOldGastosReales'
    });

    // Inicializar manager
    gastosManager.init();
    gastosRealesManager.init();

    // ===== LÓGICA ESPECÍFICA: AGREGAR GASTO PUNTUAL =====
    document.getElementById('btnAgregarGastoPuntual').onclick = async () => {
        const fecha = document.getElementById('fechaGasto').value;
        const desc = document.getElementById('descGasto').value;
        const monto = parseFloat(document.getElementById('montoGasto').value);
        const fraccionar = document.getElementById('fraccionarGasto')?.checked;
        const partesRaw = parseInt(document.getElementById('partesGasto')?.value || '2', 10) || 2;
        const partes = fraccionar ? Math.max(2, partesRaw) : 1;
        const selectCatP = document.getElementById('categoriaGasto');

        // Validaciones
        if (!fecha) return showAlert(gastosManager.t('gastos.seleccionaFecha', "Selecciona una fecha"));
        if (!desc) return showAlert(gastosManager.t('gastos.ingresaDescripcion', "Ingresa una descripción"));
        if (isNaN(monto) || monto <= 0) return showAlert(gastosManager.t('gastos.montoInvalido', "Monto inválido"));

        const notas = document.getElementById('notasGasto')?.value?.trim() || null;

        // Si no se fracciona, enviar una sola entrada
        if (!fraccionar || partes <= 1) {
            await fetch('/add/gasto_puntual', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fecha: fecha,
                    descripcion: desc,
                    monto: monto,
                    categoria_id: selectCatP.value,
                    notas
                })
            });
        } else {
            // Distribuir el monto en 'partes' respetando dos decimales
            const totalCents = Math.round(monto * 100);
            const base = Math.floor(totalCents / partes);
            const remainder = totalCents - base * partes;

            function addMonthsToDate(dateStr, months) {
                const d = new Date(dateStr);
                const day = d.getDate();
                d.setMonth(d.getMonth() + months);
                if (d.getDate() !== day) d.setDate(0);
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                return `${y}-${m}-${dd}`;
            }

            const promises = [];
            for (let i = 0; i < partes; i++) {
                let cents = base + (i < remainder ? 1 : 0);
                const partMonto = (cents / 100);
                const partFecha = addMonthsToDate(fecha, i);
                promises.push(fetch('/add/gasto_puntual', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        fecha: partFecha,
                        descripcion: desc + gastosManager.t('gastos.parteFraccion', ` (parte ${i + 1}/${partes})`)
                            .replace('{parte}', i + 1).replace('{total}', partes),
                        monto: partMonto,
                        categoria_id: selectCatP.value
                    })
                }));
            }
            await Promise.all(promises);
        }

        // Limpiar formulario
        document.getElementById('fechaGasto').value = '';
        document.getElementById('descGasto').value = '';
        document.getElementById('montoGasto').value = '';
        if (document.getElementById('notasGasto')) document.getElementById('notasGasto').value = '';
        const chk = document.getElementById('fraccionarGasto');
        if (chk) {
            chk.checked = false;
            chk.dispatchEvent(new Event('change'));
        }
        const partsInput = document.getElementById('partesGasto');
        if (partsInput) partsInput.value = '2';
        
        gastosManager.loadData();
        if (typeof window.gastoCalendarRefresh === 'function') window.gastoCalendarRefresh();
        if (typeof cargarResumenPeriodos === 'function') cargarResumenPeriodos();
        if (typeof notifySuccess === 'function') {
            notifySuccess(gastosManager.t('mensajes.elementoCreado', 'Gasto guardado'));
        }
        checkSpendingLimit(selectCatP);
    };

    async function checkSpendingLimit(selectEl) {
        try {
            const mes = new Date().toISOString().slice(0, 7);
            const res = await fetch('/dashboard/presupuestos?mes=' + mes);
            if (!res.ok) return;
            const data = await res.json();
            const catName = selectEl?.options[selectEl.selectedIndex]?.textContent;
            const presup = Array.isArray(data) ? data.find(p => p.categoria === catName) : null;
            if (presup && presup.superado && typeof notifyInfo === 'function') {
                notifyInfo('⚠️ Límite de presupuesto superado en: ' + catName);
            }
        } catch (_) {}
    }

    // ===== LÓGICA ESPECÍFICA: AGREGAR GASTO REAL =====
    document.getElementById('btnAgregarGastoReal').onclick = async () => {
        const fecha = document.getElementById('fechaGastoReal').value;
        const desc = document.getElementById('descGastoReal').value;
        const monto = parseFloat(document.getElementById('montoGastoReal').value);
        const selectCat = document.getElementById('categoriaGastoReal');

        if (!fecha) return showAlert(gastosManager.t('gastos.seleccionaFecha', "Selecciona una fecha"));
        if (!desc) return showAlert(gastosManager.t('gastos.ingresaDescripcion', "Ingresa una descripción"));
        if (isNaN(monto) || monto <= 0) return showAlert(gastosManager.t('gastos.montoInvalido', "Monto inválido"));

        await fetch('/add/gasto_real', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fecha: fecha,
                descripcion: desc,
                monto: monto,
                categoria_id: selectCat.value,
                archivo_origen: 'manual'
            })
        });

        document.getElementById('fechaGastoReal').value = '';
        document.getElementById('descGastoReal').value = '';
        document.getElementById('montoGastoReal').value = '';

        gastosRealesManager.loadData();
        if (typeof window.gastoCalendarRefresh === 'function') window.gastoCalendarRefresh();
        if (typeof cargarResumenPeriodos === 'function') cargarResumenPeriodos();
        if (typeof notifySuccess === 'function') {
            notifySuccess(gastosRealesManager.t('mensajes.elementoCreado', 'Gasto real guardado'));
        }
    };

    // ===== LÓGICA ESPECÍFICA: AGREGAR GASTO MENSUAL =====
    document.getElementById('btnAgregarMensual').onclick = async () => {
        const desde = document.getElementById('desdeGasto').value;
        const hasta = document.getElementById('hastaGasto').value;
        const desc = document.getElementById('descMensual').value;
        const monto = parseFloat(document.getElementById('montoMensual').value);
        const ipcPorcentaje = parseFloat(document.getElementById('ipcMensual')?.value);
        const categoria = document.getElementById('categoriaMensual').value;
        const frecuenciaMeses = parseInt(document.getElementById('frecuenciaMensual')?.value) || 1;
        const ipcValue = Number.isNaN(ipcPorcentaje) ? 0 : ipcPorcentaje;

        // Validación de formato YYYY-MM
        const validarYYYYMM = (valor) => /^\d{4}-(0[1-9]|1[0-2])$/.test(valor);

        if (!validarYYYYMM(desde)) return showAlert(gastosManager.t('gastos.formatoDesde', "El campo 'Desde' debe tener formato YYYY-MM"));
        if (!validarYYYYMM(hasta)) return showAlert(gastosManager.t('gastos.formatoHasta', "El campo 'Hasta' debe tener formato YYYY-MM"));
        if (!desc) return showAlert(gastosManager.t('gastos.descripcionRequerida', "Descripción requerida"));
        if (isNaN(monto) || monto <= 0) return showAlert(gastosManager.t('gastos.montoInvalido', "Monto inválido"));
        if (!categoria) return showAlert(gastosManager.t('gastos.seleccionaCategoria', "Selecciona una categoría"));

        const notasMensual = document.getElementById('notasMensual')?.value?.trim() || null;
        await fetch('/add/gasto_mensual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                descripcion: desc,
                monto: monto,
                categoria_id: categoria,
                desde: desde,
                hasta: hasta,
                ipc_porcentaje: ipcValue,
                frecuencia_meses: frecuenciaMeses,
                notas: notasMensual
            })
        });

        // Limpiar formulario
        document.getElementById('desdeGasto').value = '';
        document.getElementById('hastaGasto').value = '';
        document.getElementById('descMensual').value = '';
        document.getElementById('montoMensual').value = '';
        const ipcMensualInput = document.getElementById('ipcMensual');
        if (ipcMensualInput) ipcMensualInput.value = '';
        const frecuenciaMensualSelect = document.getElementById('frecuenciaMensual');
        if (frecuenciaMensualSelect) frecuenciaMensualSelect.value = '1';
        if (document.getElementById('notasMensual')) document.getElementById('notasMensual').value = '';
        
        gastosManager.loadData();
        if (typeof window.gastoCalendarRefresh === 'function') window.gastoCalendarRefresh();
        if (typeof cargarResumenPeriodos === 'function') cargarResumenPeriodos();
        if (typeof notifySuccess === 'function') {
            notifySuccess(gastosManager.t('mensajes.elementoCreado', 'Gasto mensual guardado'));
        }
    };

    // ===== TOGGLE MOSTRAR/OCULTAR ANTIGUOS =====
    window.showOldGastos = false;
    window.showOldGastosReales = false;

    const toggleChecks = [
        document.getElementById('toggleGastosAntiguos'),
        document.getElementById('toggleGastosMensualesAntiguos')
    ].filter(Boolean);
    const toggleLabels = [
        document.getElementById('labelToggleGastosAntiguos'),
        document.getElementById('labelToggleGastosMensualesAntiguos')
    ].filter(Boolean);

    const toggleChecksReales = [
        document.getElementById('toggleGastosRealesAntiguos')
    ].filter(Boolean);
    const toggleLabelsReales = [
        document.getElementById('labelToggleGastosRealesAntiguos')
    ].filter(Boolean);

    if (toggleChecks.length) {
        const updateAll = () => {
            const textoMostrar = gastosManager.t('gastos.mostrarAntiguos', 'Mostrar antiguos');
            const textoOcultar = gastosManager.t('gastos.ocultarAntiguos', 'Ocultar antiguos');
            toggleChecks.forEach(chk => chk.checked = window.showOldGastos);
            toggleLabels.forEach(lbl => {
                if (!lbl) return;
                lbl.textContent = window.showOldGastos ? textoOcultar : textoMostrar;
            });
        };

        toggleChecks.forEach(chk => {
            chk.addEventListener('change', () => {
                window.showOldGastos = chk.checked;
                updateAll();
                gastosManager.loadData();
            });
        });

        updateAll();
    }

    if (toggleChecksReales.length) {
        const updateAllReales = () => {
            const textoMostrar = gastosRealesManager.t('gastos.mostrarAntiguos', 'Mostrar antiguos');
            const textoOcultar = gastosRealesManager.t('gastos.ocultarAntiguos', 'Ocultar antiguos');
            toggleChecksReales.forEach(chk => chk.checked = window.showOldGastosReales);
            toggleLabelsReales.forEach(lbl => {
                if (!lbl) return;
                lbl.textContent = window.showOldGastosReales ? textoOcultar : textoMostrar;
            });
        };

        toggleChecksReales.forEach(chk => {
            chk.addEventListener('change', () => {
                window.showOldGastosReales = chk.checked;
                updateAllReales();
                gastosRealesManager.loadData();
            });
        });

        updateAllReales();
    }

    // ===== SUBPESTAÑAS =====
    const botonesSubtab = document.querySelectorAll('#gastos .subtab-btn');
    const subtabs = document.querySelectorAll('#gastos .subtab');

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

    // ===== TOGGLE FRACCIONAMIENTO =====
    const chkFraccionar = document.getElementById('fraccionarGasto');
    const inputPartes = document.getElementById('partesGasto');
    const fraccionarControl = document.getElementById('fraccionarGastoControl');
    const partesWrap = document.getElementById('partesGastoWrap');
    
    if (chkFraccionar && inputPartes && partesWrap) {
        const setVisible = (visible) => {
            partesWrap.classList.toggle('is-hidden', !visible);
            inputPartes.disabled = !visible;
            inputPartes.setAttribute('aria-hidden', visible ? 'false' : 'true');
            if (fraccionarControl) {
                fraccionarControl.classList.toggle('is-active', visible);
            }
            if (visible && (!inputPartes.value || Number(inputPartes.value) < 2)) {
                inputPartes.value = '2';
            }
        };

        setVisible(!!chkFraccionar.checked);

        chkFraccionar.addEventListener('change', () => {
            setVisible(!!chkFraccionar.checked);
            if (!chkFraccionar.checked) inputPartes.value = '2';
        });
    }

    // ===== CALENDARIO =====
    if (typeof initGastosCalendar === 'function') {
        initGastosCalendar();
    }

    // ===== LISTENER PARA CAMBIOS DE IDIOMA =====
    document.addEventListener('idiomaActualizado', () => {
        const textoMostrar = gastosManager.t('gastos.mostrarAntiguos', 'Mostrar antiguos');
        const textoOcultar = gastosManager.t('gastos.ocultarAntiguos', 'Ocultar antiguos');

        toggleLabels.forEach(lbl => {
            if (!lbl) return;
            lbl.textContent = window.showOldGastos ? textoOcultar : textoMostrar;
        });

        const textoMostrarReales = gastosRealesManager.t('gastos.mostrarAntiguos', 'Mostrar antiguos');
        const textoOcultarReales = gastosRealesManager.t('gastos.ocultarAntiguos', 'Ocultar antiguos');
        toggleLabelsReales.forEach(lbl => {
            if (!lbl) return;
            lbl.textContent = window.showOldGastosReales ? textoOcultarReales : textoMostrarReales;
        });
    });
}

