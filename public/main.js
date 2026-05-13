// ===== MANEJO DE PESTAÑAS =====
const buttons = document.querySelectorAll('.tablink');
const tabContent = document.getElementById('tab-content');

// Guardar posición de scroll por pestaña
const scrollPositions = {};

const TAB_TEMPLATE_PATHS = {
    inicio: 'Pestañas/inicio/inicio.html',
    ajustes: 'Pestañas/ajustes/ajustes.html',
    categorias: 'Pestañas/categorias/categorias.html',
    gastos: 'Pestañas/gastos/gastos.html',
    ingresos: 'Pestañas/ingresos/ingresos.html',
    impuestos: 'Pestañas/impuestos/impuestos.html',
    importacionBancaria: 'Pestañas/importacionBancaria/importacionBancaria.html',
    dashboard: 'Pestañas/dashboard/dashboard.html',
    hucha: 'Pestañas/hucha/hucha.html',
    inversiones: 'Pestañas/inversiones/inversiones.html'
};

function setActiveTabButton(tabId) {
    buttons.forEach((btn) => {
        const isActive = btn.dataset.tab === tabId;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-current', isActive ? 'page' : 'false');
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
}

function initTabAccessibility() {
    const tabButtons = Array.from(buttons).filter((btn) => !!btn.dataset.tab);
    tabButtons.forEach((btn, idx) => {
        const shortcut = idx < 9 ? `Alt+${idx + 1}` : '';
        if (shortcut) {
            btn.setAttribute('aria-keyshortcuts', shortcut);
            const title = String(btn.getAttribute('title') || '').trim();
            if (title && !title.includes(`(${shortcut})`)) {
                btn.setAttribute('title', `${title} (${shortcut})`);
            }
        }
    });
}

function isEditableTarget(target) {
    if (!target) return false;
    const tagName = String(target.tagName || '').toLowerCase();
    if (target.isContentEditable) return true;
    return ['input', 'textarea', 'select'].includes(tagName);
}

function focusFirstTableFilterControl() {
    if (!tabContent) return false;
    const control = tabContent.querySelector('.table-column-filter-control');
    if (!control) return false;
    control.focus();
    if (typeof control.select === 'function' && control.tagName === 'INPUT') {
        control.select();
    }
    return true;
}

function initKeyboardNavigation() {
    if (!document.body || document.body.dataset.keyboardNavigationReady === 'true') return;
    document.body.dataset.keyboardNavigationReady = 'true';

    document.addEventListener('keydown', (event) => {
        const key = String(event.key || '').toLowerCase();

        // Alt+1..9 cambia de pestaña principal.
        if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
            const match = String(event.code || '').match(/^Digit([1-9])$/);
            if (match) {
                const tabIndex = Number(match[1]) - 1;
                const tabButtons = Array.from(buttons).filter((btn) => !!btn.dataset.tab);
                const targetButton = tabButtons[tabIndex];
                if (targetButton?.dataset?.tab) {
                    event.preventDefault();
                    loadTab(targetButton.dataset.tab);
                }
                return;
            }
        }

        // Ctrl+Alt+F enfoca el primer filtro de tabla de la pestaña activa.
        if (event.ctrlKey && event.altKey && !event.metaKey && key === 'f') {
            if (focusFirstTableFilterControl()) {
                event.preventDefault();
            }
            return;
        }

        // '/' enfoca filtros rápidos cuando no se está escribiendo.
        if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key === '/') {
            if (!isEditableTarget(event.target) && focusFirstTableFilterControl()) {
                event.preventDefault();
            }
        }
    });
}

// ── Tab transition progress bar helper ─────────────────────────────
const _bar = {
    el: null,
    get() { return this.el || (this.el = document.getElementById('tab-progress-bar-inner')); },
    start() {
        const b = this.get(); if (!b) return;
        b.className = '';
        void b.offsetWidth; // force reflow to restart transition
        b.className = 'bar-start';
    },
    done() {
        const b = this.get(); if (!b) return;
        b.className = 'bar-done';
        setTimeout(() => {
            b.className = 'bar-fade';
            setTimeout(() => { b.className = ''; }, 400);
        }, 160);
    }
};

async function loadTab(tabId) {
    try {
        const currentTab = document.querySelector('.tablink.active');
        if (currentTab?.dataset?.tab === 'importacionBancaria' && typeof window.persistirBorradorImportacion === 'function') {
            try {
                window.persistirBorradorImportacion();
            } catch (persistError) {
                console.warn('⚠️ No se pudo persistir borrador de importación:', persistError);
            }
        }

        // Guardar posición de scroll de la pestaña actual
        if (currentTab) {
            scrollPositions[currentTab.dataset.tab] = window.scrollY;
        }

        setActiveTabButton(tabId);
        
        // Fade-out con clase CSS + arrancar barra de progreso
        _bar.start();
        tabContent.classList.add('tab-leaving');
        await new Promise(resolve => setTimeout(resolve, 220));
        
        const nextTabPath = TAB_TEMPLATE_PATHS[tabId] || `Pestañas/${tabId}/${tabId}.html`;
        let res = await fetch(nextTabPath);
        if (!res.ok) {
            // Fallback para estructuras previas.
            res = await fetch(`Pestañas/${tabId}/index.html`);
        }
        if (!res.ok) {
            res = await fetch(`Pestañas/${tabId}.html`);
        }
        if (!res.ok) {
            throw new Error(`No se pudo cargar la pestaña ${tabId}`);
        }
        const html = await res.text();
        
        // Restaurar scroll ANTES de cambiar el contenido
        const savedPosition = scrollPositions[tabId] || 0;
        
        // Run any tab-level cleanup before tearing down the DOM
        if (typeof window.__tabCleanup === 'function') {
            try { window.__tabCleanup(); } catch (_) {}
            window.__tabCleanup = null;
        }

        // Disconnect stale MutationObservers from column-filter searchers
        if (typeof window.__tableSearchCleanup === 'function') {
            try { window.__tableSearchCleanup(); } catch (_) {}
        }

        // Cambiar contenido mientras está oculto
        tabContent.innerHTML = html;

        console.log(`📄 Pestaña cargada: ${tabId}`);

        // ✅ APLICAR TRADUCCIONES DESPUÉS DE CARGAR EL HTML
        if (typeof gestorIdiomas !== 'undefined') {
            gestorIdiomas.actualizarTraduccionesHTML();
            console.log(`✅ Traducciones aplicadas a: ${tabId}`);
        }

        // Inicializar la lógica específica de cada pestaña
        if (tabId === 'inicio') initInicio();
        if (tabId === 'ajustes') initAjustes();
        if (tabId === 'categorias') initCategorias();
        if (tabId === 'gastos') cargarGastosForm();
        if (tabId === 'ingresos') cargarIngresosForm();
        if (tabId === 'impuestos') await inicializarTaxes();
        if (tabId === 'importacionBancaria') cargarImportacionBancaria();
        if (tabId === 'dashboard') {
            window.dashboardConfig = null;
            cargarDashboardForm();
        }
        if (tabId === 'hucha') {
            if (typeof cargarHucha !== 'undefined') await cargarHucha();
        }
        if (tabId === 'inversiones') {
            if (typeof initInversiones !== 'undefined') await initInversiones();
        }

        // Añadir filtros por columna a las tablas de la pestaña.
        initTableSearchers(tabContent);
        
        // Restaurar scroll y mostrar con animación de entrada
        tabContent.classList.remove('tab-leaving');
        requestAnimationFrame(() => requestAnimationFrame(() => {
            window.scrollTo({ top: savedPosition, behavior: 'instant' });
            tabContent.classList.add('tab-entering');
            _bar.done();
            setTimeout(() => tabContent.classList.remove('tab-entering'), 300);
        }));

    } catch (error) {
        console.error(`❌ Error cargando pestaña ${tabId}:`, error);
        tabContent.classList.remove('tab-leaving', 'tab-entering');
        _bar.done();
    }
}


// Evento de clic en las pestañas
buttons.forEach(btn => {
    btn.addEventListener('click', () => {
        loadTab(btn.dataset.tab);
    });
});

// Cargar la pestaña inicial
document.addEventListener('DOMContentLoaded', () => {
    const temaGuardado = localStorage.getItem('tema') || 'azul';
    const idiomaGuardado = localStorage.getItem('idioma') || 'es';
    const monedaGuardada = localStorage.getItem('currency') || 'EUR';

    if (typeof gestorTemas !== 'undefined') {
        gestorTemas.aplicarTema(temaGuardado);
    }
    if (typeof gestorIdiomas !== 'undefined') {
        gestorIdiomas.cambiarIdioma(idiomaGuardado);
    }
    setCurrency(monedaGuardada, { silent: true });

    initTabAccessibility();
    initKeyboardNavigation();
    const activeBtn = document.querySelector('.tablink.active');
    if (activeBtn?.dataset?.tab) {
        setActiveTabButton(activeBtn.dataset.tab);
    }

    initMetricsInfoPanel();
    initWindowControls();
    initUserSelection();
});

