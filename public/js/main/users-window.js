// ===== USUARIOS =====
let activeUser = null;
let switchingUser = false;
const DEFAULT_USER_ICON = 'fa-user';
const USER_ICON_OPTIONS = [
    { value: 'fa-user', label: 'User' },
    { value: 'fa-user-tie', label: 'Executive' },
    { value: 'fa-user-astronaut', label: 'Astronaut' },
    { value: 'fa-user-ninja', label: 'Ninja' },
    { value: 'fa-user-secret', label: 'Secret' },
    { value: 'fa-user-graduate', label: 'Graduate' },
    { value: 'fa-user-gear', label: 'Gear' },
    { value: 'fa-user-shield', label: 'Shield' },
    { value: 'fa-user-clock', label: 'Clock' }
];

function setMaximizeButtonState(isMaximized) {
    const maximizeBtn = document.getElementById('windowMaximizeBtn');
    if (!maximizeBtn) return;

    if (isMaximized) {
        maximizeBtn.innerHTML = '<i class="far fa-clone"></i>';
        maximizeBtn.title = 'Restaurar';
        maximizeBtn.setAttribute('aria-label', 'Restaurar');
    } else {
        maximizeBtn.innerHTML = '<i class="far fa-square"></i>';
        maximizeBtn.title = 'Maximizar';
        maximizeBtn.setAttribute('aria-label', 'Maximizar');
    }
}

async function initWindowControls() {
    const titlebar = document.getElementById('windowTitlebar');
    const minimizeBtn = document.getElementById('windowMinimizeBtn');
    const maximizeBtn = document.getElementById('windowMaximizeBtn');
    const closeBtn = document.getElementById('windowCloseBtn');
    const api = window.electronAPI;

    if (!titlebar || !minimizeBtn || !maximizeBtn || !closeBtn) return;
    if (!api || !api.windowMinimize || !api.windowMaximizeToggle || !api.windowClose) {
        titlebar.style.display = 'none';
        return;
    }

    if (api.platform === 'darwin') {
        titlebar.style.display = 'none';
        return;
    }

    // Show titlebar for Electron on Windows / Linux
    titlebar.style.display = '';

    minimizeBtn.addEventListener('click', async () => {
        try {
            await api.windowMinimize();
        } catch (error) {
            console.error('Error minimizando ventana:', error);
        }
    });

    maximizeBtn.addEventListener('click', async () => {
        try {
            const result = await api.windowMaximizeToggle();
            setMaximizeButtonState(!!result?.isMaximized);
        } catch (error) {
            console.error('Error maximizando/restaurando ventana:', error);
        }
    });

    closeBtn.addEventListener('click', async () => {
        try {
            await api.windowClose();
        } catch (error) {
            console.error('Error cerrando ventana:', error);
        }
    });

    titlebar.addEventListener('dblclick', async () => {
        try {
            const result = await api.windowMaximizeToggle();
            setMaximizeButtonState(!!result?.isMaximized);
        } catch (error) {
            console.error('Error alternando maximize con doble click:', error);
        }
    });

    if (api.windowIsMaximized) {
        try {
            const state = await api.windowIsMaximized();
            setMaximizeButtonState(!!state?.isMaximized);
        } catch (error) {
            setMaximizeButtonState(false);
        }
    }

    if (api.onWindowMaximizedChanged) {
        api.onWindowMaximizedChanged((isMaximized) => {
            setMaximizeButtonState(!!isMaximized);
        });
    }
}

function setUserLabel(name) {
    const label = document.getElementById('currentUserLabel');
    if (label) {
        if (name) {
            label.textContent = name;
        } else if (typeof gestorIdiomas !== 'undefined') {
            label.textContent = gestorIdiomas.obtenerTexto('usuarios.sinUsuario');
        } else {
            label.textContent = 'Sin usuario';
        }
    }
}

function updateUserIconUI(iconClass) {
    const icon = iconClass || DEFAULT_USER_ICON;
    const button = document.getElementById('changeUserBtn');
    const preview = document.getElementById('userIconPreview');

    if (button) button.innerHTML = `<i class="fas ${icon}"></i>`;
    if (preview) preview.innerHTML = `<i class="fas ${icon}"></i>`;
}

function fillUserIconSelect(select) {
    if (!select) return;
    select.innerHTML = '';
    USER_ICON_OPTIONS.forEach(option => {
        const opt = document.createElement('option');
        opt.value = option.value;
        opt.textContent = option.label;
        select.appendChild(opt);
    });
}

async function loadUserIcon(name) {
    if (!name || !window.electronAPI?.getUserProfile) {
        updateUserIconUI(DEFAULT_USER_ICON);
        return DEFAULT_USER_ICON;
    }
    try {
        const result = await window.electronAPI.getUserProfile({ name });
        const icon = result?.profile?.icon || DEFAULT_USER_ICON;
        const select = document.getElementById('userIconSelect');
        if (select) select.value = icon;
        updateUserIconUI(icon);
        return icon;
    } catch (err) {
        updateUserIconUI(DEFAULT_USER_ICON);
        return DEFAULT_USER_ICON;
    }
}

function toggleUserOverlay(show) {
    const overlay = document.getElementById('userOverlay');
    if (overlay) {
        overlay.classList.toggle('hidden', !show);
    }
}

function toggleMetricsOverlay(show) {
    const overlay = document.getElementById('metricsInfoOverlay');
    if (!overlay) return;

    overlay.classList.toggle('hidden', !show);
    overlay.setAttribute('aria-hidden', show ? 'false' : 'true');
    if (show) {
        const closeBtn = document.getElementById('metricsInfoCloseBtn');
        closeBtn?.focus();
    }
}

function initMetricsInfoPanel() {
    if (!document.body || document.body.dataset.metricsPanelReady === 'true') return;
    document.body.dataset.metricsPanelReady = 'true';

    const trigger = document.getElementById('metricsInfoBtn');
    const overlay = document.getElementById('metricsInfoOverlay');
    const closeBtn = document.getElementById('metricsInfoCloseBtn');

    if (!trigger || !overlay || !closeBtn) return;

    trigger.addEventListener('click', () => {
        toggleMetricsOverlay(true);
    });

    closeBtn.addEventListener('click', () => {
        toggleMetricsOverlay(false);
        trigger.focus();
    });

    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
            toggleMetricsOverlay(false);
            trigger.focus();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !overlay.classList.contains('hidden')) {
            toggleMetricsOverlay(false);
            trigger.focus();
        }
    });
}

function showUserError(message) {
    if (typeof showAlert === 'function') {
        showAlert(message);
        return;
    }
    // eslint-disable-next-line no-alert
    alert(message);
}

function resetUserScopedState() {
    Object.keys(scrollPositions).forEach(key => delete scrollPositions[key]);
    if (window.estadoImportacion) {
        window.estadoImportacion = {
            archivoActual: null,
            nombreArchivoOrigen: null,
            datosRaw: [],
            datosMapados: [],
            columnas: [],
            mapeo: { fecha: null, concepto: null, importe: null, tipo: null },
            formatoFecha: 'DD/MM/YYYY',
            charts: {},
            archivoNuevo: true,
            archivoId: null,
            conceptosSeleccionados: []
        };
    }
    resumenData = null;
    cargandoResumen = false;
    portfolioResultCache = null;
    Object.keys(assetPriceCache).forEach((ticker) => delete assetPriceCache[ticker]);
}

async function refreshUserList() {
    const select = document.getElementById('userSelect');
    if (!select || !window.electronAPI?.listUsers) return { users: [], currentUser: null };

    const result = await window.electronAPI.listUsers();
    const users = result?.users || [];
    const currentUser = result?.currentUser || null;

    select.innerHTML = '';
    users.forEach(user => {
        const opt = document.createElement('option');
        opt.value = user;
        opt.textContent = user;
        select.appendChild(opt);
    });

    return { users, currentUser };
}

async function applyUserSelection(name, { auto = false } = {}) {
    if (!name || !window.electronAPI?.setCurrentUser) return;
    if (name === activeUser) {
        if (!auto) toggleUserOverlay(false);
        return;
    }

    try {
        switchingUser = true;
        await window.electronAPI.setCurrentUser({ name });
        activeUser = name;
        localStorage.setItem('currentUser', name);
        setUserLabel(name);
        await loadUserIcon(name);
        toggleUserOverlay(false);
        resetUserScopedState();

        await ensureFxRates(BASE_CURRENCY);
        switchingUser = false;
        await loadTab('inicio');
    } catch (err) {
        showUserError(err.message || 'No se pudo seleccionar el usuario');
        toggleUserOverlay(true);
    } finally {
        switchingUser = false;
    }
}

async function initUserSelection() {
    if (!window.electronAPI?.listUsers) {
        loadTab('inicio');
        return;
    }

    const changeBtn = document.getElementById('changeUserBtn');
    const selectBtn = document.getElementById('userSelectBtn');
    const createBtn = document.getElementById('userCreateBtn');
    const refreshBtn = document.getElementById('userRefreshBtn');
    const newUserInput = document.getElementById('newUserName');
    const select = document.getElementById('userSelect');
    const iconSelect = document.getElementById('userIconSelect');

    fillUserIconSelect(iconSelect);
    if (iconSelect) iconSelect.value = DEFAULT_USER_ICON;
    updateUserIconUI(DEFAULT_USER_ICON);

    if (changeBtn) {
        changeBtn.addEventListener('click', () => toggleUserOverlay(true));
    }

    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            await refreshUserList();
        });
    }

    if (select) {
        select.addEventListener('change', async () => {
            const selected = select.value;
            if (selected) await loadUserIcon(selected);
        });
    }

    if (iconSelect) {
        iconSelect.addEventListener('change', async () => {
            const icon = iconSelect.value || DEFAULT_USER_ICON;
            const targetUser = select?.value || activeUser;
            if (!targetUser || !window.electronAPI?.setUserIcon) {
                updateUserIconUI(icon);
                return;
            }
            try {
                await window.electronAPI.setUserIcon({ name: targetUser, icon });
                updateUserIconUI(icon);
            } catch (err) {
                showUserError(err.message || 'No se pudo guardar el icono');
            }
        });
    }

    if (selectBtn) {
        selectBtn.addEventListener('click', async () => {
            const selected = select?.value;
            if (!selected) return;
            await applyUserSelection(selected);
        });
    }

    if (createBtn) {
        createBtn.addEventListener('click', async () => {
            const name = (newUserInput?.value || '').trim();
            if (!name) return;

            try {
                await window.electronAPI.createUser({ name });
                const icon = iconSelect?.value || DEFAULT_USER_ICON;
                if (window.electronAPI?.setUserIcon) {
                    await window.electronAPI.setUserIcon({ name, icon });
                }
                newUserInput.value = '';
                await refreshUserList();
                await applyUserSelection(name);
            } catch (err) {
                showUserError(err.message || 'No se pudo crear el usuario');
            }
        });
    }

    const { users, currentUser } = await refreshUserList();
    const storedUser = localStorage.getItem('currentUser');
    const preferredUser = currentUser || (users.includes(storedUser) ? storedUser : null);

    if (preferredUser) {
        if (select) select.value = preferredUser;
        setUserLabel(preferredUser);
        await loadUserIcon(preferredUser);
        await applyUserSelection(preferredUser, { auto: true });
    } else {
        toggleUserOverlay(true);
    }
}

