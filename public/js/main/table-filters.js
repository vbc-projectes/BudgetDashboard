function getTableFilterStore() {
    try {
        const raw = localStorage.getItem(TABLE_FILTER_STATE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (_) {
        return {};
    }
}

function saveTableFilterStore(store) {
    try {
        localStorage.setItem(TABLE_FILTER_STATE_KEY, JSON.stringify(store || {}));
    } catch (_) {
        // Ignore storage errors in private mode / full quota.
    }
}

function getScopedTableFilterKey(tableId) {
    const userScope = (activeUser && String(activeUser).trim()) ? String(activeUser).trim() : 'global';
    return `${userScope}::${tableId}`;
}

function loadTableFilterState(tableId) {
    if (!tableId) return {};
    const store = getTableFilterStore();
    const scopedKey = getScopedTableFilterKey(tableId);
    const state = store[scopedKey];
    return (state && typeof state === 'object') ? state : {};
}

function saveTableFilterState(tableId, filterControls) {
    if (!tableId) return;
    const store = getTableFilterStore();
    const scopedKey = getScopedTableFilterKey(tableId);

    const nextState = {};
    (Array.isArray(filterControls) ? filterControls : []).forEach((control) => {
        const index = Number(control.dataset.columnIndex);
        if (!Number.isInteger(index) || index < 0) return;
        const value = String(control.value || '').trim();
        if (!value) return;
        nextState[index] = value;
    });

    if (Object.keys(nextState).length > 0) {
        store[scopedKey] = nextState;
    } else {
        delete store[scopedKey];
    }

    saveTableFilterStore(store);
}

function clearTableFilterState(tableId) {
    if (!tableId) return;
    const store = getTableFilterStore();
    const scopedKey = getScopedTableFilterKey(tableId);
    if (scopedKey in store) {
        delete store[scopedKey];
        saveTableFilterStore(store);
    }
}

function normalizarTextoBusqueda(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function obtenerPlaceholderBuscadorTabla() {
    if (typeof gestorIdiomas !== 'undefined') {
        const texto = gestorIdiomas.obtenerTexto('tablas.buscar');
        if (texto && texto !== 'tablas.buscar') return texto;
    }
    return 'Buscar en tabla...';
}

function obtenerTextoTodosFiltro() {
    if (typeof gestorIdiomas !== 'undefined') {
        const keys = ['dashboard.todasCategorias', 'importacion.seleccionarTodos', 'categorias.todas'];
        for (const key of keys) {
            const text = gestorIdiomas.obtenerTexto(key);
            if (text && text !== key) return text;
        }
    }
    return 'Todos';
}

function obtenerTextoInterfaz(key, fallback) {
    if (typeof gestorIdiomas !== 'undefined') {
        const text = gestorIdiomas.obtenerTexto(key);
        if (text && text !== key) return text;
    }
    return fallback;
}

function obtenerTextoLimpiarFiltros() {
    return obtenerTextoInterfaz('formularios.limpiar', 'Limpiar filtros');
}

function obtenerTextoAjustaFiltros() {
    return obtenerTextoInterfaz('tablas.ajustaFiltros', 'Ajusta o limpia filtros');
}

function obtenerTextoSinDatosTabla() {
    return obtenerTextoInterfaz('mensajes.noHayDatos', 'No hay datos disponibles');
}

function obtenerTextoExportarTabla() {
    return obtenerTextoInterfaz('tablas.exportar', 'Exportar CSV');
}

function obtenerTextoSinFilasExportables() {
    return obtenerTextoInterfaz('tablas.sinFilasExportables', 'No hay filas visibles para exportar');
}

function obtenerTextoExportacionOk() {
    return obtenerTextoInterfaz('tablas.exportacionOk', 'Archivo CSV exportado');
}

function obtenerOCrearToolbarFiltros(table) {
    const wrapper = table.closest('.table-container') || table.parentElement;
    if (!wrapper) return null;

    let toolbar = wrapper.querySelector(`.table-filter-toolbar[data-table-filter-toolbar="${table.id}"]`);
    if (!toolbar) {
        toolbar = document.createElement('div');
        toolbar.className = 'table-filter-toolbar';
        toolbar.dataset.tableFilterToolbar = table.id;
        toolbar.innerHTML = `
            <span class="table-filter-status"></span>
            <div class="table-filter-toolbar-actions">
                <button type="button" class="table-filter-export-btn">
                    <i class="fas fa-file-export" aria-hidden="true"></i>
                    <span></span>
                </button>
                <button type="button" class="table-filter-clear-btn">
                    <i class="fas fa-filter-circle-xmark" aria-hidden="true"></i>
                    <span></span>
                </button>
            </div>
        `;
        wrapper.insertBefore(toolbar, table);
    }

    return toolbar;
}

function actualizarResumenFiltrosTabla(table, filterControls) {
    const toolbar = obtenerOCrearToolbarFiltros(table);
    if (!toolbar) return;

    const statusEl = toolbar.querySelector('.table-filter-status');
    const clearBtn = toolbar.querySelector('.table-filter-clear-btn');
    const exportBtn = toolbar.querySelector('.table-filter-export-btn');
    const clearBtnLabel = clearBtn?.querySelector('span');
    const exportBtnLabel = exportBtn?.querySelector('span');

    const rows = Array.from(table?.tBodies?.[0]?.rows || []);
    const totalRows = rows.length;
    const visibleRows = rows.filter((row) => row.style.display !== 'none').length;
    const activeFilters = (Array.isArray(filterControls) ? filterControls : [])
        .filter((control) => String(control.value || '').trim() !== '').length;

    if (clearBtnLabel) clearBtnLabel.textContent = obtenerTextoLimpiarFiltros();
    if (exportBtnLabel) exportBtnLabel.textContent = obtenerTextoExportarTabla();
    if (clearBtn) clearBtn.disabled = activeFilters === 0;

    if (!statusEl) return;

    if (totalRows === 0) {
        statusEl.textContent = `${obtenerTextoSinDatosTabla()}. ${obtenerTextoInterfaz('tablas.agregaPrimero', 'Agrega el primer registro desde la fila superior.')}`;
        statusEl.classList.add('is-empty');
        statusEl.classList.remove('is-no-results');
        return;
    }

    if (visibleRows === 0) {
        const sinResultados = obtenerTextoInterfaz('tablas.sinResultados', 'Sin resultados');
        statusEl.textContent = `${sinResultados}. ${obtenerTextoAjustaFiltros()}.`;
        statusEl.classList.add('is-no-results');
        statusEl.classList.remove('is-empty');
        return;
    }

    const template = obtenerTextoInterfaz('tablas.mostrandoRegistros', 'Mostrando {0} de {1} registros');
    statusEl.textContent = template.replace('{0}', visibleRows).replace('{1}', totalRows);
    statusEl.classList.remove('is-empty', 'is-no-results');
}


function escaparCsvValor(value) {
    const raw = String(value ?? '').replace(/\r?\n|\r/g, ' ').trim();
    if (raw.includes('"') || raw.includes(',') || raw.includes(';')) {
        return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
}

function exportarFilasVisiblesTabla(table) {
    if (!table || !table.id) return;

    const headerCells = Array.from(table.querySelectorAll('thead tr:first-child th'));
    const exportColumns = headerCells
        .map((th, index) => ({ index, label: obtenerLabelColumna(th, index), isAction: esColumnaAcciones(th) }))
        .filter((column) => !column.isAction);

    const rows = Array.from(table.tBodies?.[0]?.rows || []).filter((row) => row.style.display !== 'none');
    if (rows.length === 0) {
        if (typeof window.notifyInfo === 'function') {
            window.notifyInfo(obtenerTextoSinFilasExportables());
        }
        return;
    }

    const lines = [];
    lines.push(exportColumns.map((column) => escaparCsvValor(column.label)).join(';'));
    rows.forEach((row) => {
        const values = exportColumns.map((column) => {
            const text = row.cells?.[column.index]?.textContent || '';
            return escaparCsvValor(text);
        });
        lines.push(values.join(';'));
    });

    const csvContent = lines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateLabel = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `${table.id}-${dateLabel}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    if (typeof window.notifySuccess === 'function') {
        window.notifySuccess(obtenerTextoExportacionOk());
    }
}

function esColumnaAcciones(th) {
    if (!th) return false;
    const i18nKey = String(th.getAttribute('data-i18n') || '').toLowerCase();
    const label = normalizarTextoBusqueda(th.textContent);

    if (i18nKey.includes('acciones')) return true;
    if (label.includes('accion') || label.includes('actions')) return true;
    if (th.classList.contains('w-120') || th.classList.contains('w-150')) return true;
    return false;
}

function obtenerLabelColumna(th, index) {
    const text = String(th?.textContent || '').replace(/\s+/g, ' ').trim();
    if (text) return text;
    return `Col ${index + 1}`;
}

/**
 * Vuelca el texto de cada <th> en data-label de su <td> y marca la tabla, para
 * que en móvil el CSS la pinte como tarjetas verticales ("Etiqueta: valor")
 * en vez de obligar a desplazarse en horizontal. Se aplica a todas las tablas,
 * no solo a las que genera TransactionManager.
 */
function aplicarEtiquetasDeColumna(table, headerCells) {
    if (!table) return;
    table.classList.add('table-card-mobile');
    const labels = headerCells.map((th, i) => obtenerLabelColumna(th, i));
    const filas = table.tBodies?.[0]?.rows || [];
    Array.from(filas).forEach((row) => {
        Array.from(row.cells).forEach((cell, i) => {
            const label = labels[i];
            // La columna de acciones no necesita etiqueta: son iconos.
            if (!label || esColumnaAcciones(headerCells[i])) return;
            if (cell.dataset.label !== label) cell.dataset.label = label;
        });
    });
}

/**
 * El aviso "desliza para ver más" solo tiene sentido si la tabla desborda de
 * verdad. Antes se mostraba en todas las tablas por debajo de 1024px (aunque
 * cupieran) y en ninguna por encima (aunque no cupieran).
 */
function actualizarAvisoDesbordamiento(table) {
    const wrapper = table?.closest('.table-container');
    if (!wrapper) return;
    const desborda = wrapper.scrollWidth > wrapper.clientWidth + 1;
    wrapper.classList.toggle('has-x-overflow', desborda);
}

function esValorTipoFecha(value) {
    const normalized = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(normalized) || /^\d{4}-\d{2}$/.test(normalized);
}

function esValorTipoNumero(value) {
    const normalized = String(value || '').trim();
    if (!normalized) return false;
    const cleaned = normalized.replace(/[€$£¥%\s]/g, '').replace(/\./g, '').replace(',', '.');
    return /^-?\d+(\.\d+)?$/.test(cleaned);
}

function obtenerValoresUnicosColumna(table, columnIndex, maxValues = 40) {
    const tbody = table?.tBodies?.[0];
    if (!tbody) return [];

    const valueMap = new Map();
    Array.from(tbody.rows || []).forEach((row) => {
        const value = String(row.cells[columnIndex]?.textContent || '').replace(/\s+/g, ' ').trim();
        if (!value || value === '—') return;
        const key = normalizarTextoBusqueda(value);
        if (!key || valueMap.has(key)) return;
        valueMap.set(key, value);
    });

    return Array.from(valueMap.values())
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }))
        .slice(0, maxValues);
}

function debeUsarSelectEnColumna(th, valoresUnicos) {
    if (!th || !Array.isArray(valoresUnicos) || valoresUnicos.length === 0) return false;

    const i18nKey = normalizarTextoBusqueda(th.getAttribute('data-i18n') || '');
    const label = normalizarTextoBusqueda(th.textContent || '');
    const contexto = `${i18nKey} ${label}`;

    // Columnas categóricas con muchos posibles valores únicos
    if (/categoria|tipo|estado|cuenta|origen|metodo|m[eé]todo|banco|moneda|divisa/.test(contexto)) {
        return valoresUnicos.length <= 60;
    }

    // Columnas de período (YYYY-MM) y texto corto identificador — select aunque sean fechas
    if (/\bdesde\b|\bhasta\b|\bticker\b|\bempresa\b|compan|\bconcepto\b/.test(contexto)) {
        return valoresUnicos.length <= 36;
    }

    if (valoresUnicos.length > 14) return false;

    const largos = valoresUnicos.filter((value) => String(value).length > 28).length;
    if (largos > 2) return false;

    const numericosOFecha = valoresUnicos.filter((value) => esValorTipoNumero(value) || esValorTipoFecha(value)).length;
    if ((numericosOFecha / valoresUnicos.length) >= 0.6) return false;

    return true;
}

function actualizarOpcionesSelectDeFiltros(table, filterControls) {
    const selects = (Array.isArray(filterControls) ? filterControls : [])
        .filter((control) => control.tagName === 'SELECT');

    selects.forEach((selectControl) => {
        const columnIndex = Number(selectControl.dataset.columnIndex);
        if (!Number.isInteger(columnIndex) || columnIndex < 0) return;

        const valoresUnicos = obtenerValoresUnicosColumna(table, columnIndex, 80);
        const selected = selectControl.value;
        const allText = selectControl.dataset.allText || 'Todos';

        selectControl.innerHTML = '';

        const optionAll = document.createElement('option');
        optionAll.value = '';
        optionAll.textContent = allText;
        selectControl.appendChild(optionAll);

        valoresUnicos.forEach((value) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            selectControl.appendChild(option);
        });

        selectControl.value = valoresUnicos.includes(selected) ? selected : '';
    });
}

function aplicarFiltroTablaPorColumnas(table, filterControls) {
    const tbody = table?.tBodies?.[0];
    if (!tbody) return;

    const filters = (Array.isArray(filterControls) ? filterControls : [])
        .map((control) => ({
            columnIndex: Number(control.dataset.columnIndex),
            query: normalizarTextoBusqueda(control.value || ''),
            mode: control.dataset.matchMode || 'includes'
        }))
        .filter((entry) => Number.isInteger(entry.columnIndex) && entry.columnIndex >= 0);

    Array.from(tbody.rows || []).forEach((row) => {
        const visible = filters.every(({ columnIndex, query, mode }) => {
            if (!query) return true;
            const cellText = normalizarTextoBusqueda(row.cells[columnIndex]?.textContent || '');
            if (mode === 'exact') {
                return cellText === query;
            }
            return cellText.includes(query);
        });
        row.style.display = visible ? '' : 'none';
    });

    actualizarResumenFiltrosTabla(table, filterControls);
}

function attachTableSearch(table) {
    if (!table || !table.id || table.dataset.disableSearch === 'true') return;

    const thead = table.tHead;
    if (!thead) return;

    const headerCells = Array.from(thead.rows[0]?.cells || []);
    if (headerCells.length === 0) return;

    const toolbar = obtenerOCrearToolbarFiltros(table);

    // Reutilizar o crear la fila de filtros dentro del thead
    let filterRow = thead.querySelector('tr.table-filter-row');
    if (!filterRow) {
        filterRow = document.createElement('tr');
        filterRow.className = 'table-filter-row';
        thead.appendChild(filterRow);
    }

    const textoTodos = obtenerTextoTodosFiltro();
    const persistedValuesByColumn = loadTableFilterState(table.id);

    // Guardar valores previos antes de vaciar
    const previousValuesByColumn = {};
    Array.from(filterRow.querySelectorAll('.table-column-filter-control')).forEach((control) => {
        const columnIndex = Number(control.dataset.columnIndex);
        if (Number.isInteger(columnIndex) && columnIndex >= 0) {
            previousValuesByColumn[columnIndex] = control.value || '';
        }
    });
    filterRow.innerHTML = '';

    headerCells.forEach((th, index) => {
        const td = document.createElement('td');
        td.className = 'table-filter-cell';

        if (esColumnaAcciones(th)) {
            td.classList.add('is-action');
            filterRow.appendChild(td);
            return;
        }

        const label = obtenerLabelColumna(th, index);
        const valoresUnicos = obtenerValoresUnicosColumna(table, index);
        const usarSelect = debeUsarSelectEnColumna(th, valoresUnicos);

        // El title deja leer la columna completa cuando el placeholder se
        // corta en tablas anchas ("Interés Ge...", "Reten...").
        const tituloFiltro = `${obtenerTextoInterfaz('tablas.filtrarPor', 'Filtrar por')}: ${label}`;

        let control;
        if (usarSelect) {
            const select = document.createElement('select');
            select.className = 'table-column-filter-select table-column-filter-control';
            select.dataset.columnIndex = String(index);
            select.dataset.matchMode = 'exact';
            select.dataset.allText = textoTodos;
            select.setAttribute('aria-label', label);
            select.title = tituloFiltro;
            control = select;
        } else {
            const input = document.createElement('input');
            input.type = 'search';
            input.className = 'table-column-filter-input table-column-filter-control';
            input.dataset.columnIndex = String(index);
            input.dataset.matchMode = 'includes';
            input.placeholder = label;
            input.setAttribute('aria-label', label);
            input.title = tituloFiltro;
            control = input;
        }

        const previousValue = previousValuesByColumn[index];
        const persistedValue = persistedValuesByColumn[index];
        control.value = previousValue || persistedValue || '';
        td.appendChild(control);
        filterRow.appendChild(td);
    });

    const filterControls = Array.from(filterRow.querySelectorAll('.table-column-filter-control'));
    actualizarOpcionesSelectDeFiltros(table, filterControls);

    filterControls.forEach((control) => {
        const onFilterChange = () => {
            saveTableFilterState(table.id, filterControls);
            aplicarFiltroTablaPorColumnas(table, filterControls);
        };
        control.addEventListener('input', onFilterChange);
        control.addEventListener('change', onFilterChange);
    });

    if (toolbar) {
        const clearBtn = toolbar.querySelector('.table-filter-clear-btn');
        const exportBtn = toolbar.querySelector('.table-filter-export-btn');

        if (exportBtn) {
            exportBtn.onclick = () => {
                exportarFilasVisiblesTabla(table);
            };
        }

        if (clearBtn) {
            clearBtn.onclick = () => {
                filterControls.forEach((control) => {
                    control.value = '';
                    control.dispatchEvent(new Event('change'));
                });
                clearTableFilterState(table.id);
                const firstControl = filterControls[0];
                if (firstControl) firstControl.focus();
            };
        }
    }

    const existingRegistry = tableSearchRegistry.get(table);
    if (existingRegistry?.observer) {
        existingRegistry.observer.disconnect();
    }

    const tbody = table.tBodies?.[0];
    if (tbody) {
        const observer = new MutationObserver(() => {
            actualizarOpcionesSelectDeFiltros(table, filterControls);
            aplicarEtiquetasDeColumna(table, headerCells);
            aplicarFiltroTablaPorColumnas(table, filterControls);
            actualizarAvisoDesbordamiento(table);
        });
        observer.observe(tbody, { childList: true, subtree: true });
        tableSearchRegistry.set(table, { observer });
    }

    aplicarEtiquetasDeColumna(table, headerCells);
    aplicarFiltroTablaPorColumnas(table, filterControls);
    actualizarAvisoDesbordamiento(table);
}

function initTableSearchers(scope = document) {
    const tables = scope.querySelectorAll('table[id]');
    tables.forEach((table) => attachTableSearch(table));
}

// El desbordamiento depende del ancho de la ventana, no solo de los datos.
window.addEventListener('resize', () => {
    document.querySelectorAll('.table-container table').forEach(actualizarAvisoDesbordamiento);
});

/**
 * Disconnect all MutationObservers registered by table searchers.
 * Call this before swapping tab content to prevent stale observers from
 * accumulating and leaking memory.
 */
window.__tableSearchCleanup = function() {
    tableSearchRegistry.forEach(({ observer }) => {
        try { observer.disconnect(); } catch (_) {}
    });
    tableSearchRegistry.clear();
};

