// ===== USUARIOS =====
let activeUser = null;
let switchingUser = false;

// Shim REST para modo web (sin Electron)
const webUserAPI = {
    listUsers: async () => {
        const r = await fetch('/users');
        if (!r.ok) throw new Error('Error listando usuarios');
        return r.json();
    },
    getCurrentUser: async () => {
        const r = await fetch('/users/current');
        if (!r.ok) throw new Error('Error obteniendo usuario actual');
        return r.json();
    },
    createUser: async ({ name }) => {
        const r = await fetch('/users/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
        });
        if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || 'Error creando usuario'); }
        return r.json();
    },
    setCurrentUser: async ({ name }) => {
        const r = await fetch('/users/select', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
        });
        if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || 'Error seleccionando usuario'); }
        return r.json();
    },
    getUserProfile: async ({ name }) => {
        const r = await fetch(`/users/profile?name=${encodeURIComponent(name)}`);
        if (!r.ok) throw new Error('Error obteniendo perfil');
        return r.json();
    },
    setUserIcon: async ({ name, icon }) => {
        const r = await fetch('/users/icon', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, icon }),
        });
        if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || 'Error guardando icono'); }
        return r.json();
    },
    verifyUserPin: async ({ name, pin }) => {
        const r = await fetch('/users/verify-pin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, pin }),
        });
        if (!r.ok) throw new Error('Error verificando PIN');
        return r.json();
    },
    setUserPin: async ({ name, pin }) => {
        const r = await fetch('/users/set-pin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, pin }),
        });
        if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || 'Error guardando PIN'); }
        return r.json();
    },
    removeUserPin: async ({ name }) => {
        const r = await fetch('/users/remove-pin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
        });
        if (!r.ok) throw new Error('Error eliminando PIN');
        return r.json();
    },
};

function getUserAPI() {
    return window.electronAPI || webUserAPI;
}

const DEFAULT_USER_ICON = '🐱';
const USER_ICON_OPTIONS = [
    // Animales
    { value: '🐱', label: 'Gato' },
    { value: '🐻', label: 'Oso' },
    { value: '🦊', label: 'Zorro' },
    { value: '🐼', label: 'Panda' },
    { value: '🦁', label: 'León' },
    { value: '🐸', label: 'Rana' },
    { value: '🐯', label: 'Tigre' },
    { value: '🐺', label: 'Lobo' },
    { value: '🦋', label: 'Mariposa' },
    { value: '🐧', label: 'Pingüino' },
    // Personajes
    { value: '🦸', label: 'Superhéroe' },
    { value: '🧙', label: 'Mago' },
    { value: '🥷', label: 'Ninja' },
    { value: '🧑‍🚀', label: 'Astronauta' },
    { value: '👑', label: 'Rey/Reina' },
    { value: '🤖', label: 'Robot' },
    { value: '👽', label: 'Alien' },
    { value: '🎭', label: 'Actor' },
    { value: '🧛', label: 'Vampiro' },
    { value: '🧟', label: 'Zombi' },
];

const AVATAR_COLORS = [
    '#16532e','#1a4e8b','#6b1b8b','#8b3a0e',
    '#0e6b6b','#8b1a3a','#3a6b0e','#6b5a0e',
    '#1a3a8b','#5a1a8b','#8b1a6b','#0e4e6b',
];

// Helper i18n para users-window (gestorIdiomas puede no estar disponible en unit tests)
function _t(key, fallback) {
    try { return gestorIdiomas.obtenerTexto(key) || fallback; } catch (_) { return fallback; }
}

// Renderiza el interior de un avatar: emoji o icono FA legacy
function _renderAvatarInner(icon, size) {
    if (!icon) icon = DEFAULT_USER_ICON;
    if (icon.startsWith('fa-')) {
        return '<i class="fas ' + icon + '" style="font-size:' + (size || '3.2rem') + ';color:#fff;"></i>';
    }
    return '<span style="font-size:' + (size || '3.2rem') + ';line-height:1;display:block;text-align:center;">' + icon + '</span>';
}

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
        document.body.classList.add('no-titlebar');
        return;
    }

    if (api.platform === 'darwin') {
        titlebar.style.display = 'none';
        document.body.classList.add('no-titlebar');
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
    const html = _renderAvatarInner(icon, '1.1rem');
    if (button)  button.innerHTML  = html;
    if (preview) preview.innerHTML = html;
}

async function loadUserIcon(name) {
    if (!name) { updateUserIconUI(DEFAULT_USER_ICON); return DEFAULT_USER_ICON; }
    try {
        const result = await getUserAPI().getUserProfile({ name });
        const icon = result?.profile?.icon || DEFAULT_USER_ICON;
        updateUserIconUI(icon);
        return icon;
    } catch (_) {
        updateUserIconUI(DEFAULT_USER_ICON);
        return DEFAULT_USER_ICON;
    }
}

// ─── Netflix overlay ───────────────────────────────────────────────────────
let _nfProfiles = {};   // { name: { icon, hasPin, colorIdx } }

function toggleUserOverlay(show) {
    const overlay = document.getElementById('userOverlay');
    if (!overlay) return;
    overlay.classList.toggle('hidden', !show);
    if (show) _nfShowScreen('nfPickerScreen');
}

function _nfShowScreen(id) {
    ['nfPickerScreen', 'nfPinScreen', 'nfManageScreen'].forEach(function (sid) {
        const el = document.getElementById(sid);
        if (el) el.classList.toggle('hidden', sid !== id);
    });
}

async function _nfRenderPicker() {
    const grid = document.getElementById('nfProfilesGrid');
    if (!grid) return;
    grid.innerHTML = '<p style="color:#666;font-size:0.9rem;">' + _t('usuarios.cargandoUsuarios', 'Cargando...') + '</p>';
    try {
        const result = await getUserAPI().listUsers();
        const users  = result?.users || [];

        await Promise.all(users.map(async function (name, idx) {
            try {
                const r = await getUserAPI().getUserProfile({ name });
                _nfProfiles[name] = {
                    icon:     r?.profile?.icon    || DEFAULT_USER_ICON,
                    hasPin:   !!r?.profile?.pinHash,
                    colorIdx: idx % AVATAR_COLORS.length,
                };
            } catch (_) {
                _nfProfiles[name] = { icon: DEFAULT_USER_ICON, hasPin: false, colorIdx: idx % AVATAR_COLORS.length };
            }
        }));

        grid.innerHTML = users.map(function (name) {
            const p   = _nfProfiles[name];
            const col = AVATAR_COLORS[p.colorIdx];
            return '<button class="nf-profile-card" data-user="' + name + '" tabindex="0">' +
                '<div class="nf-profile-avatar" style="background:' + col + ';position:relative;">' +
                _renderAvatarInner(p.icon, '3.2rem') +
                (p.hasPin ? '<span style="position:absolute;bottom:5px;right:5px;font-size:0.75rem;">🔒</span>' : '') +
                '</div>' +
                '<span class="nf-profile-name">' + name + '</span>' +
                '</button>';
        }).join('') || '<p style="color:#666;font-size:0.9rem;">' + _t('usuarios.sinUsuarios', 'No hay usuarios. Crea uno desde "Gestionar perfiles".') + '</p>';

        grid.querySelectorAll('.nf-profile-card').forEach(function (card) {
            card.addEventListener('click', function () { _nfOnCardClick(card.dataset.user); });
            card.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _nfOnCardClick(card.dataset.user); }
            });
        });
    } catch (err) {
        grid.innerHTML = '<p style="color:#e87c03;">Error cargando usuarios</p>';
    }
}

function _nfOnCardClick(name) {
    const p = _nfProfiles[name] || { icon: DEFAULT_USER_ICON, hasPin: false, colorIdx: 0 };
    if (p.hasPin) {
        _nfShowPinScreen(name, p.icon, p.colorIdx);
    } else {
        applyUserSelection(name);
    }
}

// ─── PIN screen ────────────────────────────────────────────────────────────
let _pin = { user: null, value: '' };

function _nfShowPinScreen(name, icon, colorIdx) {
    _pin = { user: name, value: '' };
    const avatar = document.getElementById('nfPinAvatar');
    const nameEl = document.getElementById('nfPinName');
    const errEl  = document.getElementById('nfPinError');
    if (avatar) { avatar.style.background = AVATAR_COLORS[colorIdx % AVATAR_COLORS.length]; avatar.innerHTML = _renderAvatarInner(icon, '2.8rem'); }
    if (nameEl) nameEl.textContent = name;
    if (errEl)  errEl.classList.add('hidden');
    _nfUpdateDots();
    _nfShowScreen('nfPinScreen');
}

function _nfUpdateDots() {
    document.querySelectorAll('.nf-pin-dot').forEach(function (dot, i) {
        dot.classList.toggle('filled', i < _pin.value.length);
    });
}

async function _nfHandlePinKey(key) {
    if (key === 'del') {
        _pin.value = _pin.value.slice(0, -1);
        _nfUpdateDots();
        return;
    }
    if (_pin.value.length >= 4) return;
    _pin.value += key;
    _nfUpdateDots();
    if (_pin.value.length === 4) await _nfVerifyPin();
}

async function _nfVerifyPin() {
    try {
        const res = await getUserAPI().verifyUserPin({ name: _pin.user, pin: _pin.value });
        if (res?.success) {
            await applyUserSelection(_pin.user);
        } else {
            const errEl  = document.getElementById('nfPinError');
            const dotsEl = document.getElementById('nfPinDots');
            if (errEl)  errEl.classList.remove('hidden');
            if (dotsEl) { dotsEl.style.animation = 'pinShake 0.4s ease'; setTimeout(function () { dotsEl.style.animation = ''; }, 420); }
            setTimeout(function () { _pin.value = ''; _nfUpdateDots(); }, 620);
        }
    } catch (_) {
        _pin.value = '';
        _nfUpdateDots();
    }
}

// ─── Manage screen ─────────────────────────────────────────────────────────
async function _nfRenderManage() {
    const listEl = document.getElementById('nfManageList');
    if (!listEl) return;
    try {
        const result = await getUserAPI().listUsers();
        const users  = result?.users || [];

        listEl.innerHTML = users.map(function (name, idx) {
            const p   = _nfProfiles[name] || { icon: DEFAULT_USER_ICON, hasPin: false, colorIdx: idx % AVATAR_COLORS.length };
            const col = AVATAR_COLORS[p.colorIdx % AVATAR_COLORS.length];
            return '<div class="nf-manage-item" data-manage-name="' + name + '">' +
                '<div class="nf-manage-item-avatar nf-av-pick" style="background:' + col + ';cursor:pointer;position:relative;" ' +
                'title="Cambiar avatar" data-pick-user="' + name + '">' +
                _renderAvatarInner(p.icon, '1.4rem') +
                '<div class="nf-av-pick-hint" style="position:absolute;inset:0;border-radius:6px;' +
                'background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;' +
                'opacity:0;transition:opacity 0.12s;font-size:1rem;pointer-events:none;">✏️</div>' +
                '</div>' +
                '<span class="nf-manage-item-name">' + name + '</span>' +
                '<div class="nf-manage-item-actions">' +
                '<button class="nf-pin-btn' + (p.hasPin ? ' has-pin' : '') + '" data-manage-user="' + name + '">' +
                (p.hasPin ? _t('usuarios.quitarPIN','🔒 Quitar PIN') : _t('usuarios.anadirPIN','+ PIN')) + '</button>' +
                '</div></div>';
        }).join('') || '<p style="color:#666;font-size:0.9rem;">' + _t('usuarios.sinUsuarios','Sin usuarios.') + '</p>';

        // Avatar clickable → abre selector de icono
        listEl.querySelectorAll('.nf-av-pick').forEach(function (av) {
            const hint = av.querySelector('.nf-av-pick-hint');
            av.addEventListener('mouseenter', function () { if (hint) hint.style.opacity = '1'; });
            av.addEventListener('mouseleave', function () { if (hint) hint.style.opacity = '0'; });
            av.addEventListener('click', function (e) {
                e.stopPropagation();
                _nfShowIconPicker(av.dataset.pickUser, av);
            });
        });

        listEl.querySelectorAll('.nf-pin-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const uname  = btn.dataset.manageUser;
                const hasPin = btn.classList.contains('has-pin');
                if (hasPin) {
                    _nfRemovePin(uname, btn);
                } else {
                    _nfShowPinSetup(uname, btn);
                }
            });
        });
    } catch (err) {
        listEl.innerHTML = '<p style="color:#e87c03;">Error cargando usuarios</p>';
    }
}

function _nfShowIconPicker(userName, triggerEl) {
    // Cerrar cualquier picker abierto
    var existing = document.getElementById('_nfIconPicker');
    if (existing) {
        var wasUser = existing.dataset.user;
        existing.remove();
        if (wasUser === userName) return; // toggle: misma fila → cerrar
    }

    var item = document.querySelector('[data-manage-name="' + userName + '"]');
    if (!item) return;

    var currentIcon = (_nfProfiles[userName] || {}).icon || DEFAULT_USER_ICON;

    var picker = document.createElement('div');
    picker.id = '_nfIconPicker';
    picker.dataset.user = userName;
    picker.style.cssText =
        'padding:10px 8px 12px;width:100%;box-sizing:border-box;overflow:hidden;' +
        'background:rgba(255,255,255,0.04);' +
        'border-top:1px solid rgba(255,255,255,0.08);' +
        'border-radius:0 0 8px 8px;';

    var label = document.createElement('p');
    label.textContent = _t('usuarios.eligeAvatar', 'Elige un avatar');
    label.style.cssText =
        'margin:0 0 8px;font-size:0.7rem;font-weight:700;text-transform:uppercase;' +
        'letter-spacing:.06em;color:rgba(255,255,255,0.4);';
    picker.appendChild(label);

    var grid = document.createElement('div');
    grid.style.cssText =
        'display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;width:100%;box-sizing:border-box;';

    USER_ICON_OPTIONS.forEach(function (opt) {
        var b = document.createElement('button');
        var isSel = opt.value === currentIcon;
        b.title = opt.label;
        b.style.cssText =
            'height:62px;width:100%;box-sizing:border-box;border-radius:10px;cursor:pointer;' +
            'display:flex;align-items:center;justify-content:center;font-size:1.9rem;' +
            'transition:transform 0.1s,background 0.1s;' +
            'border:2px solid ' + (isSel ? 'var(--primary,#16a34a)' : 'transparent') + ';' +
            'background:' + (isSel ? 'rgba(22,163,74,0.2)' : 'rgba(255,255,255,0.06)') + ';';
        b.innerHTML = _renderAvatarInner(opt.value, '1.9rem');

        b.addEventListener('mouseenter', function () {
            b.style.transform = 'scale(1.1)';
            if (!isSel) b.style.background = 'rgba(255,255,255,0.14)';
        });
        b.addEventListener('mouseleave', function () {
            b.style.transform = '';
            if (!isSel) b.style.background = 'rgba(255,255,255,0.06)';
        });
        b.addEventListener('click', async function (e) {
            e.stopPropagation();
            try {
                await getUserAPI().setUserIcon({ name: userName, icon: opt.value });
                if (_nfProfiles[userName]) _nfProfiles[userName].icon = opt.value;
                // Actualizar avatar en la fila
                var av = item.querySelector('.nf-av-pick');
                if (av) {
                    av.innerHTML = _renderAvatarInner(opt.value, '1.4rem') +
                        '<div class="nf-av-pick-hint" style="position:absolute;inset:0;border-radius:6px;' +
                        'background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;' +
                        'opacity:0;transition:opacity 0.12s;font-size:1rem;pointer-events:none;">✏️</div>';
                }
                picker.remove();
                if (typeof notifySuccess === 'function') notifySuccess(_t('usuarios.avatarActualizado','Avatar actualizado'));
            } catch (err) { showUserError(err.message || _t('usuarios.errorCargandoUsuarios','Error guardando avatar')); }
        });
        grid.appendChild(b);
    });

    picker.appendChild(grid);
    item.after(picker);
}

function _nfRemovePin(name, btn) {
    const existing = document.getElementById('_nfPinSetup');
    if (existing) existing.remove();

    const form = document.createElement('div');
    form.id = '_nfPinSetup';
    form.className = 'nf-pin-setup-form';
    form.innerHTML =
        '<span style="color:#e87c03;font-size:0.8rem;white-space:nowrap;">Confirma tu PIN actual:</span>' +
        '<input type="password" maxlength="4" inputmode="numeric" pattern="[0-9]*" placeholder="4 dígitos" class="nf-input" style="max-width:110px;" id="_nfPinInput"/>' +
        '<button class="nf-pin-btn has-pin" style="font-size:0.8rem;padding:5px 12px;" id="_nfPinSave">Eliminar</button>' +
        '<button style="background:transparent;border:none;color:#777;cursor:pointer;font-size:0.8rem;" id="_nfPinCancel">✕</button>';

    btn.closest('.nf-manage-item').after(form);
    document.getElementById('_nfPinInput').focus();

    document.getElementById('_nfPinCancel').addEventListener('click', function () { form.remove(); });

    document.getElementById('_nfPinSave').addEventListener('click', async function () {
        const pin = document.getElementById('_nfPinInput').value;
        if (!/^\d{4}$/.test(pin)) {
            if (typeof notifyError === 'function') notifyError('Introduce los 4 dígitos del PIN actual');
            return;
        }
        try {
            const res = await getUserAPI().verifyUserPin({ name, pin });
            if (!res?.success) {
                const inp = document.getElementById('_nfPinInput');
                if (inp) { inp.value = ''; inp.style.borderColor = '#e87c03'; inp.placeholder = 'PIN incorrecto'; inp.focus(); }
                return;
            }
            await getUserAPI().removeUserPin({ name });
            if (_nfProfiles[name]) _nfProfiles[name].hasPin = false;
            btn.classList.remove('has-pin');
            btn.textContent = _t('usuarios.anadirPIN', '+ PIN');
            form.remove();
            if (typeof notifySuccess === 'function') notifySuccess(_t('usuarios.pinEliminado','PIN eliminado'));
        } catch (e) { showUserError(e.message || _t('usuarios.pinEliminado','Error eliminando PIN')); }
    });
}

function _nfShowPinSetup(name, btn) {
    const existing = document.getElementById('_nfPinSetup');
    if (existing) existing.remove();

    const form = document.createElement('div');
    form.id = '_nfPinSetup';
    form.className = 'nf-pin-setup-form';
    form.innerHTML =
        '<input type="password" maxlength="4" inputmode="numeric" pattern="[0-9]*" placeholder="4 dígitos" class="nf-input" style="max-width:120px;" id="_nfPinInput"/>' +
        '<button class="btn-primary" style="font-size:0.8rem;padding:5px 12px;" id="_nfPinSave">Guardar</button>' +
        '<button style="background:transparent;border:none;color:#777;cursor:pointer;font-size:0.8rem;" id="_nfPinCancel">✕</button>';

    btn.closest('.nf-manage-item').after(form);
    document.getElementById('_nfPinInput').focus();

    document.getElementById('_nfPinCancel').addEventListener('click', function () { form.remove(); });
    document.getElementById('_nfPinSave').addEventListener('click', async function () {
        const pin = document.getElementById('_nfPinInput').value;
        if (!/^\d{4}$/.test(pin)) {
            if (typeof notifyError === 'function') notifyError('El PIN debe ser de 4 dígitos');
            return;
        }
        try {
            await getUserAPI().setUserPin({ name, pin });
            if (_nfProfiles[name]) _nfProfiles[name].hasPin = true;
            btn.classList.add('has-pin');
            btn.textContent = _t('usuarios.quitarPIN', '🔒 Quitar PIN');
            form.remove();
            if (typeof notifySuccess === 'function') notifySuccess(_t('usuarios.pinEstablecido','PIN establecido'));
        } catch (e) { showUserError(e.message || _t('usuarios.pinEstablecido','Error guardando PIN')); }
    });
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

async function applyUserSelection(name, { auto = false } = {}) {
    if (!name) return;
    if (name === activeUser) {
        if (!auto) toggleUserOverlay(false);
        return;
    }
    try {
        switchingUser = true;
        await getUserAPI().setCurrentUser({ name });
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
    updateUserIconUI(DEFAULT_USER_ICON);

    // ── Botón de cambio de usuario en la barra principal ──
    const changeBtn = document.getElementById('changeUserBtn');
    if (changeBtn) {
        changeBtn.addEventListener('click', function () {
            _nfRenderPicker();
            toggleUserOverlay(true);
        });
    }

    // ── PIN numpad ──
    document.querySelectorAll('.nf-numkey[data-num]').forEach(function (btn) {
        btn.addEventListener('click', function () { _nfHandlePinKey(btn.dataset.num); });
    });
    const pinDel = document.getElementById('nfPinDel');
    if (pinDel) pinDel.addEventListener('click', function () { _nfHandlePinKey('del'); });

    // Teclado físico en pantalla PIN
    document.addEventListener('keydown', function (e) {
        const ps = document.getElementById('nfPinScreen');
        if (!ps || ps.classList.contains('hidden')) return;
        if (/^[0-9]$/.test(e.key)) _nfHandlePinKey(e.key);
        if (e.key === 'Backspace') _nfHandlePinKey('del');
    });

    // ── Volver desde PIN ──
    const pinBack = document.getElementById('nfPinBackBtn');
    if (pinBack) pinBack.addEventListener('click', function () {
        _pin = { user: null, value: '' };
        _nfShowScreen('nfPickerScreen');
    });

    // ── Gestionar perfiles ──
    const manageBtn = document.getElementById('nfManageBtn');
    if (manageBtn) manageBtn.addEventListener('click', async function () {
        await _nfRenderManage();
        _nfShowScreen('nfManageScreen');
    });

    // ── Volver desde gestión ──
    const manageBack = document.getElementById('nfManageBackBtn');
    if (manageBack) manageBack.addEventListener('click', async function () {
        await _nfRenderPicker();
        _nfShowScreen('nfPickerScreen');
    });

    // ── Crear nuevo usuario ──
    const createBtn   = document.getElementById('userCreateBtn');
    const newUserInput = document.getElementById('newUserName');
    if (createBtn) {
        createBtn.addEventListener('click', async function () {
            const name = (newUserInput?.value || '').trim();
            if (!name) return;
            try {
                await getUserAPI().createUser({ name });
                newUserInput.value = '';
                await _nfRenderManage();
                if (typeof notifySuccess === 'function') notifySuccess(_t('usuarios.usuarioCreado','Usuario creado').replace('{name}', name));
            } catch (err) {
                showUserError(err.message || 'No se pudo crear el usuario');
            }
        });
    }

    // ── Mostrar picker al arrancar ──
    await _nfRenderPicker();
    toggleUserOverlay(true);
}

