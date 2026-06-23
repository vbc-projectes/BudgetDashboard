/**
 * Impuestos - Versión simplificada usando TransactionManager
 * Delega TODO el CRUD y edición a clase base
 */

async function inicializarTaxes() {
    // Inicializar TransactionManager para impuestos
    const impuestosManager = new TransactionManager({
        entityName: 'impuestos',
        entityNameSingular: 'impuesto',
        categoryType: 'impuestos',
        endpoints: {
            puntuales: 'impuestos_puntuales',
            mensuales: 'impuestos_mensuales',
            delete: {
                puntual: '/delete/impuesto_puntual',
                mensual: '/delete/impuesto_mensual'
            }
        },
        tables: {
            puntuales: '#tabla-impuestos-puntuales tbody',
            mensuales: '#tabla-impuestos-mensuales tbody'
        },
        selects: {
            puntuales: '#cat-impuesto-p',
            mensuales: '#cat-impuesto-m'
        },
        showOldFlag: 'showOldImpuestos'
    });

    // Inicializar manager (esperar a cargar datos y categorías)
    try {
        await impuestosManager.init();
        console.log('✅ TransactionManager inicializado para impuestos');
    } catch (err) {
        console.error('❌ Error inicializando TransactionManager:', err);
        return;
    }

    // ===== AGREGAR IMPUESTO PUNTUAL =====
    document.getElementById('btnAgregarImpuestoPuntual').onclick = async () => {
        const fecha = document.getElementById('fecha-impuesto-p').value;
        const desc = document.getElementById('desc-impuesto-p').value;
        const monto = parseFloat(document.getElementById('monto-impuesto-p').value);
        const categoria = document.getElementById('cat-impuesto-p').value;

        if (!fecha) return showAlert(impuestosManager.t('impuestos.fechaRequerida', "Fecha requerida"));
        if (!desc) return showAlert(impuestosManager.t('impuestos.descripcionRequerida', "Descripción requerida"));
        if (isNaN(monto) || monto <= 0) return showAlert(impuestosManager.t('impuestos.montoInvalido', "Monto inválido"));
        if (!categoria) return showAlert(impuestosManager.t('impuestos.categoriaRequerida', "Categoría requerida"));

        const notas = document.getElementById('notas-impuesto-p')?.value?.trim() || null;
        await fetch('/add/impuesto_puntual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fecha, descripcion: desc, monto, categoria_id: categoria, notas })
        });

        // Limpiar formulario
        document.getElementById('fecha-impuesto-p').value = '';
        document.getElementById('desc-impuesto-p').value = '';
        document.getElementById('monto-impuesto-p').value = '';
        
        impuestosManager.loadData();
        if (typeof cargarResumenPeriodos === 'function') cargarResumenPeriodos();
        if (typeof notifySuccess === 'function') {
            notifySuccess(impuestosManager.t('mensajes.elementoCreado', 'Impuesto guardado'));
        }
    };

    // ===== AGREGAR IMPUESTO MENSUAL =====
    document.getElementById('btnAgregarImpuestoMensual').onclick = async () => {
        const desde = document.getElementById('desde-impuesto-m').value;
        const hasta = document.getElementById('hasta-impuesto-m').value;
        const desc = document.getElementById('desc-impuesto-m').value;
        const monto = parseFloat(document.getElementById('monto-impuesto-m').value);
        const categoria = document.getElementById('cat-impuesto-m').value;

        const validarYYYYMM = (valor) => /^\d{4}-(0[1-9]|1[0-2])$/.test(valor);

        if (!validarYYYYMM(desde)) return showAlert(impuestosManager.t('impuestos.formatoDesde', "Formato debe ser YYYY-MM"));
        if (!validarYYYYMM(hasta)) return showAlert(impuestosManager.t('impuestos.formatoHasta', "Formato debe ser YYYY-MM"));
        if (!desc) return showAlert(impuestosManager.t('impuestos.descripcionRequerida', "Descripción requerida"));
        if (isNaN(monto) || monto <= 0) return showAlert(impuestosManager.t('impuestos.montoInvalido', "Monto inválido"));
        if (!categoria) return showAlert(impuestosManager.t('impuestos.categoriaRequerida', "Categoría requerida"));

        const notasM = document.getElementById('notas-impuesto-m')?.value?.trim() || null;
        await fetch('/add/impuesto_mensual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ desde, hasta, descripcion: desc, monto, categoria_id: categoria, notas: notasM })
        });

        // Limpiar formulario
        document.getElementById('desde-impuesto-m').value = '';
        document.getElementById('hasta-impuesto-m').value = '';
        document.getElementById('desc-impuesto-m').value = '';
        document.getElementById('monto-impuesto-m').value = '';
        
        impuestosManager.loadData();
        if (typeof cargarResumenPeriodos === 'function') cargarResumenPeriodos();
        if (typeof notifySuccess === 'function') {
            notifySuccess(impuestosManager.t('mensajes.elementoCreado', 'Impuesto mensual guardado'));
        }
    };

    // ===== TOGGLE MOSTRAR/OCULTAR ANTIGUOS =====
    window.showOldImpuestos = false;
    const toggleChecks = [
        document.getElementById('toggleImpuestosPuntualesAntiguos'),
        document.getElementById('toggleImpuestosMensualesAntiguos')
    ].filter(Boolean);

    const toggleLabels = [
        document.getElementById('labelToggleImpuestosPuntualesAntiguos'),
        document.getElementById('labelToggleImpuestosMensualesAntiguos')
    ].filter(Boolean);

    if (toggleChecks.length) {
        const updateAll = () => {
            const textoMostrar = impuestosManager.t('taxes.mostrarAntiguos', 'Mostrar antiguos');
            const textoOcultar = impuestosManager.t('taxes.ocultarAntiguos', 'Ocultar antiguos');
            toggleChecks.forEach(chk => chk.checked = window.showOldImpuestos);
            toggleLabels.forEach(lbl => {
                if (!lbl) return;
                lbl.textContent = window.showOldImpuestos ? textoOcultar : textoMostrar;
            });
        };
        toggleChecks.forEach(chk => chk.addEventListener('change', () => {
            window.showOldImpuestos = chk.checked;
            updateAll();
            impuestosManager.loadData();
        }));
        updateAll();
    }

    // ===== SUBPESTAÑAS =====
    const btnPuntuales = document.querySelector('[data-target="tabImpuestosPuntuales"]');
    const btnMensuales = document.querySelector('[data-target="tabImpuestosMensuales"]');
    const tabPuntuales = document.getElementById('tabImpuestosPuntuales');
    const tabMensuales = document.getElementById('tabImpuestosMensuales');

    if (btnPuntuales && btnMensuales && tabPuntuales && tabMensuales) {
        btnPuntuales.onclick = () => {
            tabPuntuales.style.display = 'block';
            tabMensuales.style.display = 'none';
            btnPuntuales.classList.add('active');
            btnMensuales.classList.remove('active');
        };

        btnMensuales.onclick = () => {
            tabPuntuales.style.display = 'none';
            tabMensuales.style.display = 'block';
            btnPuntuales.classList.remove('active');
            btnMensuales.classList.add('active');
        };

        btnPuntuales.classList.add('active');
    }

    // ===== LISTENER PARA CAMBIOS DE IDIOMA =====
    document.addEventListener('idiomaActualizado', () => {
        const textoMostrar = impuestosManager.t('taxes.mostrarAntiguos', 'Mostrar antiguos');
        const textoOcultar = impuestosManager.t('taxes.ocultarAntiguos', 'Ocultar antiguos');
        toggleLabels.forEach(lbl => {
            if (!lbl) return;
            lbl.textContent = window.showOldImpuestos ? textoOcultar : textoMostrar;
        });
    });
}
