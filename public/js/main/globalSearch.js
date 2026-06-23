(function () {
    'use strict';

    // ===== Global Search Overlay =====
    let overlay = null;
    let searchInput = null;
    let resultCount = null;
    let isOpen = false;

    function createOverlay() {
        if (overlay) return;
        overlay = document.createElement('div');
        overlay.id = 'globalSearchOverlay';
        overlay.style.cssText =
            'position:fixed;top:0;left:0;right:0;z-index:99999;display:none;' +
            'background:var(--bg-white,#ffffff);' +
            'border-bottom:3px solid var(--primary,#16a34a);' +
            'padding:10px 20px;box-shadow:var(--shadow-md,0 4px 8px rgba(0,0,0,0.1));';

        overlay.innerHTML =
            '<div style="display:flex;align-items:center;gap:12px;max-width:700px;margin:0 auto;">' +
            '<i class="fas fa-search" style="color:var(--primary,#16a34a);font-size:0.9rem;"></i>' +
            '<input id="globalSearchInput" type="text" placeholder="Buscar en tablas visibles… (Esc para cerrar)" ' +
            'style="flex:1;background:var(--bg-white,#ffffff);border:2px solid var(--border-light,#e0e0e0);' +
            'border-radius:var(--border-radius,8px);padding:7px 12px;color:var(--text-primary,#333);font-size:0.9rem;outline:none;">' +
            '<span id="globalSearchCount" style="font-size:0.8rem;color:var(--text-secondary,#475569);white-space:nowrap;"></span>' +
            '<button onclick="window._globalSearch.close()" class="btn-secondary" ' +
            'style="min-height:unset;padding:4px 10px;font-size:0.9rem;border-radius:50%;">✕</button>' +
            '</div>';

        document.body.appendChild(overlay);
        searchInput = overlay.querySelector('#globalSearchInput');
        resultCount = overlay.querySelector('#globalSearchCount');

        searchInput.addEventListener('input', performSearch);
        searchInput.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') close();
        });
    }

    function open() {
        if (!overlay) createOverlay();
        overlay.style.display = 'block';
        isOpen = true;
        searchInput.value = '';
        resultCount.textContent = '';
        setTimeout(function () { searchInput.focus(); }, 50);
        clearHighlights();
    }

    function close() {
        if (!overlay) return;
        overlay.style.display = 'none';
        isOpen = false;
        clearHighlights();
        resultCount.textContent = '';
    }

    function performSearch() {
        const query = searchInput.value.trim().toLowerCase();
        clearHighlights();
        if (!query || query.length < 2) {
            resultCount.textContent = '';
            return;
        }

        const tables = document.querySelectorAll('table tbody');
        let matchCount = 0;
        let totalRows = 0;

        tables.forEach(function (tbody) {
            if (!isVisible(tbody)) return;
            const rows = tbody.querySelectorAll('tr');
            rows.forEach(function (row) {
                const text = row.textContent.toLowerCase();
                if (text.includes(query)) {
                    row.style.outline = '2px solid var(--primary,#16a34a)';
                    row.style.outlineOffset = '-2px';
                    row.dataset.gsHighlighted = '1';
                    matchCount++;
                }
                totalRows++;
            });
        });

        resultCount.textContent = matchCount > 0
            ? matchCount + ' resultado' + (matchCount > 1 ? 's' : '')
            : 'Sin resultados';
        resultCount.style.color = matchCount > 0 ? 'var(--success,#22c55e)' : 'var(--danger,#ef4444)';
    }

    function clearHighlights() {
        document.querySelectorAll('[data-gs-highlighted]').forEach(function (el) {
            el.style.outline = '';
            el.style.outlineOffset = '';
            delete el.dataset.gsHighlighted;
        });
    }

    function isVisible(el) {
        let node = el;
        while (node && node !== document.body) {
            const style = getComputedStyle(node);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            node = node.parentElement;
        }
        return true;
    }

    // ===== Keyboard shortcuts =====
    document.addEventListener('keydown', function (e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
            if (e.key === 'Escape' && isOpen) close();
            return;
        }

        // Ctrl+F — open global search
        if (e.ctrlKey && e.key === 'f') {
            e.preventDefault();
            if (isOpen) close();
            else open();
            return;
        }

        // Escape — close search or panel
        if (e.key === 'Escape') {
            if (isOpen) { close(); return; }
            const panel = document.getElementById('_extInfoPanel');
            if (panel && panel.style.transform === 'translateX(0)') {
                panel.style.transform = 'translateX(100%)';
                return;
            }
            return;
        }

        // Alt+1-8 — switch tabs
        if (e.altKey && /^[1-8]$/.test(e.key)) {
            e.preventDefault();
            const tabLinks = document.querySelectorAll('.sidebar .tablink');
            const idx = parseInt(e.key, 10) - 1;
            if (tabLinks[idx]) tabLinks[idx].click();
            return;
        }
    });

    // ===== Backup download =====
    document.addEventListener('click', function (e) {
        if (e.target.id === 'btnBackupDownload' || e.target.closest('#btnBackupDownload')) {
            e.preventDefault();
            handleBackup();
        }
    });

    async function handleBackup() {
        try {
            if (typeof window.electronAPI !== 'undefined' && typeof window.electronAPI.backupDownload === 'function') {
                const result = await window.electronAPI.backupDownload();
                if (result && result.success && typeof notifySuccess === 'function') {
                    notifySuccess('Backup guardado: ' + result.path);
                } else if (!result || !result.success) {
                    if (typeof notifyInfo === 'function') notifyInfo('Backup cancelado');
                }
            } else {
                const res = await fetch('/backup/download');
                if (!res.ok) throw new Error('Error ' + res.status);
                const blob = await res.blob();
                const today = new Date().toISOString().slice(0, 10);
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'finanzas_backup_' + today + '.db';
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                if (typeof notifySuccess === 'function') notifySuccess('Backup descargado');
            }
        } catch (err) {
            if (typeof notifyError === 'function') notifyError('Error al descargar backup: ' + err.message);
        }
    }

    window._globalSearch = { open: open, close: close };
    console.log('✅ GlobalSearch cargado (Ctrl+F)');
})();
