/**
 * Importación Bancaria - Pestaña para importar movimientos desde Excel
 * Características:
 * - Detección automática de columnas
 * - Mapeo manual de campos (Fecha, Concepto, Importe)
 * - Auto-categorización de movimientos
 * - Análisis con gráficos similar a Dashboard
 */

// Referencia al modal global (si existe) para no sobrescribirlo
const modalAlert = window.showAlert;
const importacionCoreUtils = window.ImportacionCoreUtils || {};
const importacionMapping = window.ImportacionMapping || {};
const importacionCharts = window.ImportacionCharts || {};
const importacionSavedFiles = window.ImportacionSavedFiles || {};

// Función auxiliar para mostrar alertas con el sistema de modales
const showAlert = (mensaje, tipo = 'info') => {
    let titulo = 'Información';
    if (tipo === 'error') {
        titulo = 'Error';
    } else if (tipo === 'warning' || tipo === 'warn') {
        titulo = 'Advertencia';
    }
    if (typeof modalAlert === 'function') {
        return modalAlert(mensaje, titulo);
    }
    // Fallback por si el modal no está disponible
    // eslint-disable-next-line no-alert
    alert(mensaje);
};

const showInfoToast = (mensaje) => {
    if (typeof window.notifyInfo === 'function') {
        window.notifyInfo(mensaje);
        return;
    }
    showAlert(mensaje, 'info');
};

const showSuccessToast = (mensaje) => {
    if (typeof window.notifySuccess === 'function') {
        window.notifySuccess(mensaje);
        return;
    }
    showAlert(mensaje, 'success');
};

const showErrorToast = (mensaje) => {
    if (typeof window.notifyError === 'function') {
        window.notifyError(mensaje);
        return;
    }
    showAlert(mensaje, 'error');
};

function obtenerTraduccion(clave) {
    if (typeof importacionCoreUtils.obtenerTraduccion === 'function') {
        return importacionCoreUtils.obtenerTraduccion(clave);
    }
    return clave;
}

// Función para aplicar traducciones con emojis
function t(clave) {
    return obtenerTraduccion(clave);
}

function tt(clave, fallback) {
    const value = t(clave);
    return value && value !== clave ? value : fallback;
}

const tabTextUtils = window.TabTextUtils || {};
const importacionCategoriaUtils = window.ImportacionCategoriaUtils || {};

const normalizarTexto = typeof tabTextUtils.normalizarTexto === 'function'
    ? tabTextUtils.normalizarTexto
    : (texto) => (texto || '').toString().toLowerCase().trim();

const escapeHtml = typeof tabTextUtils.escapeHtml === 'function'
    ? tabTextUtils.escapeHtml
    : (texto) => String(texto || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');


// Usar variable global window para persistir datos entre cambios de pestaña
if (!window.estadoImportacion) {
    window.estadoImportacion = {
        archivoActual: null,
        nombreArchivoOrigen: null,
        datosRaw: [],
        datosMapados: [],
        datosMapadosValidos: [],
        datosMapadosInvalidos: [],
        datosAnalisisActual: [],
        columnas: [],
        mapeo: { fecha: null, concepto: null, importe: null, tipo: null },
        formatoFecha: 'DD/MM/YYYY',
        charts: {},
        archivoNuevo: true, // Flag para saber si es un archivo nuevo o cargado
        archivoId: null, // ID del archivo si fue cargado desde guardados
        conceptosSeleccionados: [], // Conceptos que el usuario ha seleccionado
        categoriasPorConcepto: {},
        metaConceptosCategorias: {},
        tableFilter: 'gasto',
        seccionActual: 'archivos',
        archivoGuardado: false,
        presetSeleccionado: null,
        guardarEnBdPendiente: false,
        filtroAnalisis: {
            desde: '',
            hasta: ''
        }
    };
}

let estadoImportacion = window.estadoImportacion;

const IMPORT_PRESETS_KEY = 'importacionBancaria.presets.v1';
const IMPORT_CONCEPT_REVIEW_KEY = 'importacionBancaria.conceptCategoryReview.v1';
const WIZARD_STEPS = ['archivos', 'upload', 'mapeo', 'seleccionConceptos', 'seleccionCategorias', 'analisis'];

function tieneMapeoBorrador() {
    const map = estadoImportacion?.mapeo || {};
    return !!(map.fecha || map.concepto || map.importe || map.tipo || map.saldo);
}

function capturarMapeoActualEnEstado() {
    const getValue = (id) => document.getElementById(id)?.value;

    const nextMapeo = {
        fecha: getValue('selectFecha') || estadoImportacion.mapeo.fecha || null,
        concepto: getValue('selectConcepto') || estadoImportacion.mapeo.concepto || null,
        importe: getValue('selectImporte') || estadoImportacion.mapeo.importe || null,
        tipo: getValue('selectTipo') || estadoImportacion.mapeo.tipo || null,
        saldo: getValue('selectSaldo') || estadoImportacion.mapeo.saldo || null
    };

    estadoImportacion.mapeo = nextMapeo;
    const formato = getValue('formatoFecha');
    if (formato) estadoImportacion.formatoFecha = formato;
}

function capturarCategoriasSeleccionadasEnEstado() {
    const selects = document.querySelectorAll('.categoria-select');
    if (!selects.length) return;

    if (!estadoImportacion.categoriasPorConcepto || typeof estadoImportacion.categoriasPorConcepto !== 'object') {
        estadoImportacion.categoriasPorConcepto = {};
    }

    selects.forEach((select) => {
        const concepto = select.dataset.concepto;
        if (!concepto) return;

        if (!select.value) {
            delete estadoImportacion.categoriasPorConcepto[concepto];
            return;
        }

        estadoImportacion.categoriasPorConcepto[concepto] = parseInt(select.value, 10);
    });
}

function capturarFiltroAnalisisEnEstado() {
    const desde = document.getElementById('analisisDesde')?.value || '';
    const hasta = document.getElementById('analisisHasta')?.value || '';
    estadoImportacion.filtroAnalisis = { desde, hasta };
}

function detectarSeccionVisibleImportacion() {
    const secciones = {
        archivos: 'archivosSection',
        upload: 'uploadSection',
        mapeo: 'mapeoSection',
        seleccionConceptos: 'seleccionConceptosSection',
        seleccionCategorias: 'seleccionCategoriasSection',
        analisis: 'analisisSection'
    };

    for (const [key, id] of Object.entries(secciones)) {
        const el = document.getElementById(id);
        if (!el) continue;
        const isVisible = el.style.display !== 'none' && getComputedStyle(el).display !== 'none';
        if (isVisible) return key;
    }

    return estadoImportacion.seccionActual || 'archivos';
}

function persistirBorradorImportacion() {
    if (!document.getElementById('importacion-bancaria')) return;

    estadoImportacion.seccionActual = detectarSeccionVisibleImportacion();
    capturarMapeoActualEnEstado();
    actualizarConceptosSeleccionadosDesdeUI();
    capturarCategoriasSeleccionadasEnEstado();
    capturarFiltroAnalisisEnEstado();

    window.estadoImportacion = estadoImportacion;
    console.log('💾 Borrador importación persistido:', {
        seccion: estadoImportacion.seccionActual,
        datosRaw: estadoImportacion.datosRaw.length,
        datosMapados: estadoImportacion.datosMapados.length
    });
}

function actualizarWizard(seccionActual) {
    const steps = document.querySelectorAll('#importWizard .wizard-step');
    const idxActual = WIZARD_STEPS.indexOf(seccionActual);
    steps.forEach((stepEl) => {
        const stepKey = stepEl.dataset.step;
        const idx = WIZARD_STEPS.indexOf(stepKey);
        stepEl.classList.toggle('active', stepKey === seccionActual);
        stepEl.classList.toggle('done', idx >= 0 && idx < idxActual);
    });
}

function actualizarProgreso(porcentaje, texto) {
    const fileProgress = document.getElementById('fileProgress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    if (!fileProgress || !progressFill || !progressText) return;

    const clamped = Math.max(0, Math.min(100, Number(porcentaje) || 0));
    fileProgress.style.display = 'block';
    progressFill.style.width = `${clamped}%`;
    progressText.textContent = texto ? `${texto} (${clamped.toFixed(0)}%)` : `${clamped.toFixed(0)}%`;
}

function alternarLoadingAnalisis(visible) {
    const loading = document.getElementById('analisisLoading');
    if (!loading) return;
    loading.style.display = visible ? 'block' : 'none';
}

function actualizarKpisAnalisis(datos = []) {
    if (typeof importacionCharts.actualizarKpisAnalisis === 'function') {
        importacionCharts.actualizarKpisAnalisis(datos);
    }
}

const parseImporte = typeof importacionCoreUtils.parseImporte === 'function'
    ? importacionCoreUtils.parseImporte
    : (valor) => Number(valor);

const inferirTipo = (valorTipo, importe) => {
    if (typeof importacionCoreUtils.inferirTipo === 'function') {
        return importacionCoreUtils.inferirTipo(normalizarTexto, valorTipo, importe);
    }
    return Number(importe) >= 0 ? 'ingreso' : 'gasto';
};

function actualizarPanelValidacion() {
    const panel = document.getElementById('validacionMapeo');
    const totalEl = document.getElementById('validacionTotal');
    const validasEl = document.getElementById('validacionValidas');
    const invalidasEl = document.getElementById('validacionInvalidas');
    const bodyErrores = document.getElementById('validacionErroresBody');
    if (!panel || !totalEl || !validasEl || !invalidasEl || !bodyErrores) return;

    const total = estadoImportacion.datosRaw.length;
    const validas = estadoImportacion.datosMapadosValidos.length;
    const invalidas = estadoImportacion.datosMapadosInvalidos.length;

    totalEl.textContent = String(total);
    validasEl.textContent = String(validas);
    invalidasEl.textContent = String(invalidas);

    bodyErrores.innerHTML = '';
    if (invalidas === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="4">${tt('importacion.sinErroresValidacion', 'Sin errores de validacion')}</td>`;
        bodyErrores.appendChild(tr);
    } else {
        estadoImportacion.datosMapadosInvalidos.slice(0, 100).forEach((item) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.fila || '-'}</td>
                <td>${item.concepto || '-'}</td>
                <td>${item.importeOriginal ?? '-'}</td>
                <td>${item.errores.join('; ')}</td>
            `;
            bodyErrores.appendChild(tr);
        });
    }

    panel.style.display = 'block';
}

function obtenerPresetsMapeo() {
    const value = typeof importacionCoreUtils.obtenerStorageJson === 'function'
        ? importacionCoreUtils.obtenerStorageJson(IMPORT_PRESETS_KEY, [])
        : [];
    return Array.isArray(value) ? value : [];
}

function guardarPresetsMapeo(presets) {
    const nextValue = Array.isArray(presets) ? presets : [];
    if (typeof importacionCoreUtils.guardarStorageJson === 'function') {
        importacionCoreUtils.guardarStorageJson(IMPORT_PRESETS_KEY, nextValue);
        return;
    }
    localStorage.setItem(IMPORT_PRESETS_KEY, JSON.stringify(nextValue));
}

function cargarRevisionConceptoCategoria() {
    const data = typeof importacionCoreUtils.obtenerStorageJson === 'function'
        ? importacionCoreUtils.obtenerStorageJson(IMPORT_CONCEPT_REVIEW_KEY, {})
        : {};
    return (data && typeof data === 'object') ? data : {};
}

function guardarRevisionConceptoCategoria(data) {
    const nextValue = data && typeof data === 'object' ? data : {};
    if (typeof importacionCoreUtils.guardarStorageJson === 'function') {
        importacionCoreUtils.guardarStorageJson(IMPORT_CONCEPT_REVIEW_KEY, nextValue);
        return;
    }
    localStorage.setItem(IMPORT_CONCEPT_REVIEW_KEY, JSON.stringify(nextValue));
}

function persistirRevisionConceptoCategoria(categoriasSeleccionadas = {}) {
    const revision = cargarRevisionConceptoCategoria();

    Object.entries(categoriasSeleccionadas).forEach(([conceptoKey, categoriaId]) => {
        const meta = estadoImportacion.metaConceptosCategorias?.[conceptoKey];
        if (!meta || !meta.tipo || !categoriaId) return;

        if (!revision[meta.tipo]) revision[meta.tipo] = {};
        revision[meta.tipo][conceptoKey] = Number(categoriaId);
    });

    guardarRevisionConceptoCategoria(revision);
}

function obtenerRangoFechasDesdeRaw() {
    const colFecha = document.getElementById('selectFecha')?.value;
    if (!colFecha || !Array.isArray(estadoImportacion.datosRaw) || estadoImportacion.datosRaw.length === 0) {
        return null;
    }

    const formato = document.getElementById('formatoFecha')?.value || estadoImportacion.formatoFecha || 'DD/MM/YYYY';
    const fechas = estadoImportacion.datosRaw
        .map((row) => parseDate(row[colFecha], formato))
        .filter((d) => d instanceof Date && !Number.isNaN(d.getTime()))
        .sort((a, b) => a - b);

    if (!fechas.length) return null;
    return { min: fechas[0], max: fechas[fechas.length - 1], total: fechas.length };
}

function obtenerRangoFechasDesdeMapados() {
    if (!Array.isArray(estadoImportacion.datosMapados) || estadoImportacion.datosMapados.length === 0) {
        return null;
    }

    const fechas = estadoImportacion.datosMapados
        .map((d) => d?.fecha)
        .filter((d) => d instanceof Date && !Number.isNaN(d.getTime()))
        .sort((a, b) => a - b);

    if (!fechas.length) return null;
    return { min: fechas[0], max: fechas[fechas.length - 1], total: fechas.length };
}

function aplicarRangoFechasAnalisisPorDatos(force = false) {
    const rangoMapados = obtenerRangoFechasDesdeMapados();
    if (rangoMapados) {
        aplicarRangoFechasAnalisis(rangoMapados.min, rangoMapados.max, force);
        return rangoMapados;
    }

    const rangoRaw = obtenerRangoFechasDesdeRaw();
    if (rangoRaw) {
        aplicarRangoFechasAnalisis(rangoRaw.min, rangoRaw.max, force);
        return rangoRaw;
    }

    return null;
}

function aplicarRangoFechasAnalisis(minDate, maxDate, force = false) {
    if (!(minDate instanceof Date) || Number.isNaN(minDate.getTime())) return;
    if (!(maxDate instanceof Date) || Number.isNaN(maxDate.getTime())) return;

    const desdeInput = document.getElementById('analisisDesde');
    const hastaInput = document.getElementById('analisisHasta');
    if (!desdeInput || !hastaInput) return;

    const minISO = minDate.toISOString().split('T')[0];
    const maxISO = maxDate.toISOString().split('T')[0];
    desdeInput.min = minISO;
    desdeInput.max = maxISO;
    hastaInput.min = minISO;
    hastaInput.max = maxISO;

    const desdeActual = desdeInput.value;
    const hastaActual = hastaInput.value;
    const fueraDesde = !desdeActual || desdeActual < minISO || desdeActual > maxISO;
    const fueraHasta = !hastaActual || hastaActual < minISO || hastaActual > maxISO;

    if (force || fueraDesde) desdeInput.value = minISO;
    if (force || fueraHasta) hastaInput.value = maxISO;
}

function obtenerFingerprintColumnas(columnas = []) {
    if (typeof importacionCoreUtils.obtenerFingerprintColumnas === 'function') {
        return importacionCoreUtils.obtenerFingerprintColumnas(normalizarTexto, columnas);
    }
    return (columnas || []).map((c) => normalizarTexto(c)).sort().join('|');
}

function poblarSelectPresets() {
    const select = document.getElementById('selectPresetMapeo');
    if (!select) return;

    const presets = obtenerPresetsMapeo();
    const fingerprint = obtenerFingerprintColumnas(estadoImportacion.columnas);

    const opcionSinPreset = tt('importacion.opcionSinPreset', '-- Sin preset --');
    select.innerHTML = `<option value="">${opcionSinPreset}</option>`;
    presets
        .filter((p) => p && p.fingerprint === fingerprint)
        .forEach((preset) => {
            const option = document.createElement('option');
            option.value = preset.id;
            option.textContent = preset.nombre;
            select.appendChild(option);
        });
}

function aplicarPresetMapeo(presetId) {
    const presets = obtenerPresetsMapeo();
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;

    const map = preset.mapeo || {};
    const setValueIfExists = (id, val) => {
        const el = document.getElementById(id);
        if (!el || val == null) return;
        if (Array.from(el.options).some((opt) => opt.value === val)) {
            el.value = val;
        }
    };

    setValueIfExists('selectFecha', map.fecha);
    setValueIfExists('selectConcepto', map.concepto);
    setValueIfExists('selectImporte', map.importe);
    setValueIfExists('selectTipo', map.tipo);
    setValueIfExists('selectSaldo', map.saldo);

    const formato = document.getElementById('formatoFecha');
    if (formato && preset.formatoFecha) formato.value = preset.formatoFecha;

    estadoImportacion.presetSeleccionado = preset.id;
    mostrarPreview();
}

async function guardarPresetActual() {
    if (!validarMapeo()) {
        showAlert(tt('importacion.errorPresetMapeoVacio', 'Debes completar un mapeo válido antes de guardar preset'), 'warning');
        return;
    }

    const nombre = window.prompt(tt('importacion.nombrePresetMapeo', 'Nombre del preset de mapeo:'), estadoImportacion.presetSeleccionado || tt('importacion.presetBancoDefault', 'Preset banco'));
    if (!nombre) return;

    const presets = obtenerPresetsMapeo();
    const id = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

    const preset = {
        id,
        nombre: nombre.trim(),
        fingerprint: obtenerFingerprintColumnas(estadoImportacion.columnas),
        mapeo: {
            fecha: document.getElementById('selectFecha')?.value || null,
            concepto: document.getElementById('selectConcepto')?.value || null,
            importe: document.getElementById('selectImporte')?.value || null,
            tipo: document.getElementById('selectTipo')?.value || null,
            saldo: document.getElementById('selectSaldo')?.value || null
        },
        formatoFecha: document.getElementById('formatoFecha')?.value || 'DD/MM/YYYY',
        createdAt: new Date().toISOString()
    };

    presets.push(preset);
    guardarPresetsMapeo(presets);
    poblarSelectPresets();
    const select = document.getElementById('selectPresetMapeo');
    if (select) select.value = id;
    estadoImportacion.presetSeleccionado = id;

    if (typeof window.notifySuccess === 'function') {
        window.notifySuccess('Preset guardado');
    }
}

async function eliminarPresetSeleccionado() {
    const select = document.getElementById('selectPresetMapeo');
    if (!select || !select.value) return;

    const confirmed = typeof window.showConfirm === 'function'
        ? await window.showConfirm(tt('importacion.confirmarEliminarPreset', '¿Eliminar este preset de mapeo?'), 'Confirmar')
        : window.confirm('¿Eliminar este preset de mapeo?');
    if (!confirmed) return;

    const presets = obtenerPresetsMapeo().filter((p) => p.id !== select.value);
    guardarPresetsMapeo(presets);
    estadoImportacion.presetSeleccionado = null;
    poblarSelectPresets();
    if (typeof window.notifyInfo === 'function') {
        window.notifyInfo('Preset eliminado');
    }
}

function cargarImportacionBancaria() {
    console.log('📊 Cargando pestaña de Importación Bancaria');
    console.log('📊 Estado guardado:', {
        datosRaw: estadoImportacion.datosRaw.length,
        datosMapados: estadoImportacion.datosMapados.length,
        seccion: estadoImportacion.seccionActual || 'archivos'
    });

    // ===== EVENT LISTENERS =====
    setupEventListeners();
    
    // ===== CARGAR ARCHIVOS GUARDADOS =====
    cargarListadoArchivos();
    
    // ===== RESTAURAR ESTADO ANTERIOR SI EXISTE =====
    const seccionGuardada = estadoImportacion.seccionActual || 'archivos';

    if (estadoImportacion.datosMapados.length > 0) {
        console.log('🔄 Restaurando pestaña anterior con datos mapeados...');
        aplicarRangoFechasAnalisisPorDatos(false);

        if (seccionGuardada === 'mapeo') {
            restaurarMapeoColumnas();
        } else if (seccionGuardada === 'seleccionConceptos') {
            mostrarSeccion('seleccionConceptos');
            renderListaConceptos(false);
        } else if (seccionGuardada === 'seleccionCategorias') {
            mostrarSeccion('seleccionCategorias');
            mostrarSeleccionCategorias();
        } else if (seccionGuardada === 'analisis') {
            mostrarSeccion('analisis');
            const desdeInput = document.getElementById('analisisDesde');
            const hastaInput = document.getElementById('analisisHasta');
            if (desdeInput && estadoImportacion?.filtroAnalisis?.desde) {
                desdeInput.value = estadoImportacion.filtroAnalisis.desde;
            }
            if (hastaInput && estadoImportacion?.filtroAnalisis?.hasta) {
                hastaInput.value = estadoImportacion.filtroAnalisis.hasta;
            }
            setTimeout(() => {
                actualizarAnalisis();
            }, 250);
        } else {
            mostrarSeccion(seccionGuardada);
        }
    } else if (estadoImportacion.datosRaw.length > 0) {
        console.log('🔄 Restaurando vista de mapeo con datos sin mapear...');
        if (tieneMapeoBorrador()) {
            restaurarMapeoColumnas();
        } else {
            mostrarMapeoColumnas();
        }
    } else {
        console.log('📤 Mostrando sección de archivos');
        mostrarSeccion('archivos');
    }

    actualizarWizard(estadoImportacion.seccionActual || seccionGuardada);
}

function setupEventListeners() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const btnMapear = document.getElementById('btnMapear');
    const btnCancelarMapeo = document.getElementById('btnCancelarMapeo');
    const btnNuevaImportacion = document.getElementById('btnNuevaImportacion');
    const btnActualizarAnalisis = document.getElementById('btnActualizarAnalisis');
    const btnExportarAnalisis = document.getElementById('btnExportarAnalisis');
    const btnRefrescarArchivos = document.getElementById('btnRefrescarArchivos');
    const btnNuevoArchivo = document.getElementById('btnNuevoArchivo');
    const btnVolver = document.getElementById('btnVolver');
    const btnConfirmarConceptos = document.getElementById('btnConfirmarConceptos');
    const btnVolverMapeo = document.getElementById('btnVolverMapeo');
    const btnSeleccionarTodos = document.getElementById('btnSeleccionarTodos');
    const btnDeseleccionarTodos = document.getElementById('btnDeseleccionarTodos');
    const btnGuardarEnBD = document.getElementById('btnGuardarEnBD');
    const tablaConceptosToggle = document.getElementById('tablaConceptosToggle');
    const selectPresetMapeo = document.getElementById('selectPresetMapeo');
    const btnGuardarPresetMapeo = document.getElementById('btnGuardarPresetMapeo');
    const btnEliminarPresetMapeo = document.getElementById('btnEliminarPresetMapeo');
    const btnDescargarErroresValidacion = document.getElementById('btnDescargarErroresValidacion');
    const previewFilterInput = document.getElementById('previewFilterInput');
    const conceptoSearchInput = document.getElementById('conceptoSearchInput');
    const conceptoSortSelect = document.getElementById('conceptoSortSelect');
    const btnAplicarCategoriaMasiva = document.getElementById('btnAplicarCategoriaMasiva');
    const listadoArchivos = document.getElementById('listadoArchivos');

    // Validar que los elementos existan
    if (!uploadArea || !fileInput) {
        console.error('❌ Elementos del formulario no encontrados');
        return;
    }

    // Manejo de carga de archivo
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleFileSelect(e.target.files[0]);
        }
    });

    // Botones de mapeo
    if (btnMapear) {
        btnMapear.addEventListener('click', () => {
            if (validarMapeo()) {
                const hayValidos = procesarDatosConMapeo();
                if (hayValidos) {
                    mostrarSeleccionConceptos();
                } else {
                    showAlert(tt('importacion.errorNoFilasValidas', 'No hay filas validas para continuar. Revisa el panel de validacion.'), 'warning');
                }
            }
        });
    }

    if (selectPresetMapeo) {
        selectPresetMapeo.addEventListener('change', () => {
            if (selectPresetMapeo.value) {
                aplicarPresetMapeo(selectPresetMapeo.value);
            }
        });
    }

    if (btnGuardarPresetMapeo) {
        btnGuardarPresetMapeo.addEventListener('click', guardarPresetActual);
    }

    if (btnEliminarPresetMapeo) {
        btnEliminarPresetMapeo.addEventListener('click', eliminarPresetSeleccionado);
    }

    if (btnDescargarErroresValidacion) {
        btnDescargarErroresValidacion.addEventListener('click', descargarErroresValidacion);
    }

    if (previewFilterInput) {
        previewFilterInput.addEventListener('input', mostrarPreview);
    }

    ['selectFecha', 'selectConcepto', 'selectImporte', 'selectTipo', 'selectSaldo', 'formatoFecha']
        .map((id) => document.getElementById(id))
        .filter(Boolean)
        .forEach((el) => {
            el.addEventListener('change', () => {
                capturarMapeoActualEnEstado();
                estadoImportacion.presetSeleccionado = null;
                const presetSelect = document.getElementById('selectPresetMapeo');
                if (presetSelect) presetSelect.value = '';
                mostrarPreview();
            });
        });

    if (btnCancelarMapeo) {
        btnCancelarMapeo.addEventListener('click', () => {
            resetearImportacion();
            mostrarSeccion('archivos');
        });
    }

    // Botón para nueva importación
    if (btnNuevaImportacion) {
        btnNuevaImportacion.addEventListener('click', () => {
            resetearImportacion();
            mostrarSeccion('archivos');
        });
    }

    // Análisis
    if (btnActualizarAnalisis) {
        btnActualizarAnalisis.addEventListener('click', actualizarAnalisis);
    }
    
    if (btnExportarAnalisis) {
        btnExportarAnalisis.addEventListener('click', exportarDatos);
    }

    // Guardar en BD
    if (btnGuardarEnBD) {
        btnGuardarEnBD.addEventListener('click', async () => {
            if (tieneCategoriasCompletasGuardadas()) {
                await guardarEnBaseDatos();
                return;
            }

            estadoImportacion.guardarEnBdPendiente = true;
            await mostrarSeleccionCategorias();
        });
    }

    // Botones de categorías
    const btnConfirmarCategorias = document.getElementById('btnConfirmarCategorias');
    const btnVolverAnalisis = document.getElementById('btnVolverAnalisis');
    
    if (btnConfirmarCategorias) {
        btnConfirmarCategorias.addEventListener('click', confirmarCategoriasYContinuar);
    }
    
    if (btnVolverAnalisis) {
        btnVolverAnalisis.addEventListener('click', () => mostrarSeccion('seleccionConceptos'));
    }

    if (btnAplicarCategoriaMasiva) {
        btnAplicarCategoriaMasiva.addEventListener('click', aplicarCategoriaMasiva);
    }

    // Botones de archivos guardados
    if (btnRefrescarArchivos) {
        btnRefrescarArchivos.addEventListener('click', cargarListadoArchivos);
    }
    
    if (btnNuevoArchivo) {
        btnNuevoArchivo.addEventListener('click', () => {
            resetearImportacion();
            mostrarSeccion('upload');
        });
    }
    
    if (btnVolver) {
        btnVolver.addEventListener('click', () => {
            resetearImportacion();
            mostrarSeccion('archivos');
        });
    }

    if (listadoArchivos) {
        listadoArchivos.addEventListener('click', async (event) => {
            const button = event.target.closest('button[data-action][data-id]');
            if (!button) return;

            const id = button.dataset.id;
            const nombre = button.dataset.nombre || '';
            if (!id) return;

            if (button.dataset.action === 'cargar') {
                await cargarArchivoGuardado(id);
            } else if (button.dataset.action === 'descargar') {
                await descargarArchivo(id);
            } else if (button.dataset.action === 'eliminar') {
                await eliminarArchivo(id, nombre);
            }
        });
    }

    // Botones de selección de conceptos
    if (btnConfirmarConceptos) {
        btnConfirmarConceptos.addEventListener('click', () => {
            aplicarSeleccionConceptos();
            estadoImportacion.guardarEnBdPendiente = false;
            mostrarSeleccionCategorias();
        });
    }

    if (btnVolverMapeo) {
        btnVolverMapeo.addEventListener('click', () => {
            mostrarSeccion('mapeo');
        });
    }

    if (btnSeleccionarTodos) {
        btnSeleccionarTodos.addEventListener('click', () => {
            document.querySelectorAll('.concepto-item input[type="checkbox"]').forEach(cb => cb.checked = true);
            actualizarConceptosSeleccionadosDesdeUI();
        });
    }

    if (btnDeseleccionarTodos) {
        btnDeseleccionarTodos.addEventListener('click', () => {
            document.querySelectorAll('.concepto-item input[type="checkbox"]').forEach(cb => cb.checked = false);
            actualizarConceptosSeleccionadosDesdeUI();
        });
    }

    if (conceptoSearchInput) {
        conceptoSearchInput.addEventListener('input', renderListaConceptos);
    }

    if (conceptoSortSelect) {
        conceptoSortSelect.addEventListener('change', renderListaConceptos);
    }

    const listaConceptos = document.getElementById('listaConceptos');
    if (listaConceptos) {
        listaConceptos.addEventListener('change', (event) => {
            const checkbox = event.target.closest('input[type="checkbox"][data-concepto]');
            if (!checkbox) return;
            actualizarConceptosSeleccionadosDesdeUI();
        });
    }

    if (tablaConceptosToggle) {
        tablaConceptosToggle.addEventListener('click', (event) => {
            const btn = event.target.closest('[data-filter]');
            if (!btn) return;

            const filter = btn.dataset.filter;
            estadoImportacion.tableFilter = filter;

            tablaConceptosToggle.querySelectorAll('.btn-toggle').forEach(el => {
                el.classList.toggle('active', el === btn);
            });

            actualizarAnalisis();
        });
    }

    // Si ya hay datos cargados, ajustar filtros al rango real disponible.
    aplicarRangoFechasAnalisisPorDatos(false);
}

function handleFileSelect(file) {
    console.log('📄 Archivo seleccionado:', file.name);
    
    estadoImportacion.archivoActual = file;
    estadoImportacion.nombreArchivoOrigen = file.name;
    // Marcar como archivo NUEVO (no es uno cargado desde servidor)
    estadoImportacion.archivoNuevo = true;
    estadoImportacion.archivoId = null;

    // Mostrar progreso
    actualizarProgreso(10, 'Procesando archivo');

    // Validar que el archivo sea Excel o CSV
    const esExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    const esCSV = file.name.endsWith('.csv');

    if (!esExcel && !esCSV) {
        showAlert(t('importacion.errorArchivoFormato'), 'error');
        document.getElementById('fileProgress').style.display = 'none';
        return;
    }

    // Leer archivo con librería
    if (esCSV) {
        leerCSV(file);
    } else {
        leerExcel(file);
    }
}

function leerExcel(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            actualizarProgreso(40, 'Leyendo Excel');
            const data = e.target.result;
            // Usamos XLSX que debe estar cargado globalmente
            if (typeof XLSX === 'undefined') {
                showAlert(t('importacion.errorXlsxNoEstaCargado'));
                return;
            }
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });

            const limpieza = limpiarColumnasImportacion(jsonData);
            estadoImportacion.datosRaw = limpieza.datos;
            estadoImportacion.columnas = limpieza.columnas;
            actualizarProgreso(85, 'Preparando mapeo');

            console.log('✅ Excel procesado. Columnas encontradas:', estadoImportacion.columnas);
            mostrarMapeoColumnas();
        } catch (error) {
            console.error('Error al leer Excel:', error);
            showAlert(t('importacion.errorExcelInvalido'));
            document.getElementById('fileProgress').style.display = 'none';
        }
    };
    reader.readAsArrayBuffer(file);
}

function leerCSV(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            actualizarProgreso(40, 'Leyendo CSV');
            const csv = e.target.result;
            const lineas = csv.trim().split('\n').filter(l => l.trim());
            
            if (lineas.length < 2) {
                showAlert(tt('importacion.errorCSVInvalido', 'El archivo CSV no tiene datos válidos.'));
                document.getElementById('fileProgress').style.display = 'none';
                return;
            }

            // Detectar delimitador (coma, punto y coma, tabulación)
            let delimitador = ',';
            if (lineas[0].includes(';')) {
                delimitador = ';';
            } else if (lineas[0].includes('\t')) {
                delimitador = '\t';
            }

            // Parsear CSV de forma más robusta
            const parseCSVLine = (line) => {
                const result = [];
                let current = '';
                let insideQuotes = false;

                for (let i = 0; i < line.length; i++) {
                    const char = line[i];
                    const nextChar = line[i + 1];

                    if (char === '"') {
                        if (insideQuotes && nextChar === '"') {
                            current += '"';
                            i++;
                        } else {
                            insideQuotes = !insideQuotes;
                        }
                    } else if (char === delimitador && !insideQuotes) {
                        result.push(current.trim().replace(/^"|"$/g, ''));
                        current = '';
                    } else {
                        current += char;
                    }
                }
                result.push(current.trim().replace(/^"|"$/g, ''));
                return result;
            };

            const headers = parseCSVLine(lineas[0]);
            const jsonData = [];

            for (let i = 1; i < lineas.length; i++) {
                const valores = parseCSVLine(lineas[i]);
                const obj = {};
                headers.forEach((h, idx) => {
                    obj[h.trim()] = valores[idx] || '';
                });
                if (Object.values(obj).some(v => v.trim() !== '')) {
                    jsonData.push(obj);
                }
            }

            if (jsonData.length === 0) {
                showAlert(tt('importacion.errorCSVSinDatos', 'El archivo CSV no contiene datos válidos.'));
                document.getElementById('fileProgress').style.display = 'none';
                return;
            }

            const limpieza = limpiarColumnasImportacion(jsonData, headers);
            estadoImportacion.datosRaw = limpieza.datos;
            estadoImportacion.columnas = limpieza.columnas;
            actualizarProgreso(85, 'Preparando mapeo');

            console.log('✅ CSV procesado. Columnas encontradas:', estadoImportacion.columnas);
            mostrarMapeoColumnas();
        } catch (error) {
            console.error('❌ Error al leer CSV:', error);
            showAlert(tt('importacion.errorCSVProcesar', 'Error al procesar el archivo CSV') + ': ' + error.message);
            document.getElementById('fileProgress').style.display = 'none';
        }
    };
    reader.readAsText(file);
}

function limpiarColumnasImportacion(datos, headers = null) {
    if (typeof importacionMapping.limpiarColumnasImportacion === 'function') {
        return importacionMapping.limpiarColumnasImportacion(datos, headers);
    }
    return {
        datos: Array.isArray(datos) ? datos : [],
        columnas: Array.isArray(headers) ? headers : []
    };
}

function mostrarMapeoColumnas() {
    if (typeof importacionMapping.mostrarMapeoColumnas === 'function') {
        importacionMapping.mostrarMapeoColumnas({
            estadoImportacion,
            actualizarProgreso,
            tt,
            poblarSelectPresets,
            aplicarPresetMapeo,
            mostrarPreview,
            mostrarSeccion
        });
    }
}

function restaurarMapeoColumnas() {
    console.log('🔄 Restaurando mapeo anterior...');
    
    // Llenar selects - validar que existan
    const selects = ['selectFecha', 'selectConcepto', 'selectImporte', 'selectTipo', 'selectSaldo'];
    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (!select) {
            console.warn(`⚠️ Select ${selectId} no encontrado en el DOM`);
            return;
        }
        
        // Limpiar opciones anteriores
        const opcionSelecciona = tt('importacion.opcionSelecciona', '-- Selecciona --');
        select.innerHTML = `<option value="">${opcionSelecciona}</option>`;
        
        // Agregar nuevas opciones
        estadoImportacion.columnas.forEach(col => {
            const option = document.createElement('option');
            option.value = col;
            option.textContent = col;
            select.appendChild(option);
        });
    });
    
    // Restaurar valores anteriores del mapeo
    if (estadoImportacion.mapeo.fecha) {
        const selectFecha = document.getElementById('selectFecha');
        if (selectFecha) selectFecha.value = estadoImportacion.mapeo.fecha;
    }
    if (estadoImportacion.mapeo.concepto) {
        const selectConcepto = document.getElementById('selectConcepto');
        if (selectConcepto) selectConcepto.value = estadoImportacion.mapeo.concepto;
    }
    if (estadoImportacion.mapeo.importe) {
        const selectImporte = document.getElementById('selectImporte');
        if (selectImporte) selectImporte.value = estadoImportacion.mapeo.importe;
    }
    if (estadoImportacion.mapeo.tipo) {
        const selectTipo = document.getElementById('selectTipo');
        if (selectTipo) selectTipo.value = estadoImportacion.mapeo.tipo;
    }
    if (estadoImportacion.mapeo.saldo) {
        const selectSaldo = document.getElementById('selectSaldo');
        if (selectSaldo) selectSaldo.value = estadoImportacion.mapeo.saldo;
    }
    
    // Restaurar formato de fecha si existe
    const formatoFecha = document.getElementById('formatoFecha');
    if (formatoFecha && estadoImportacion.formatoFecha) {
        formatoFecha.value = estadoImportacion.formatoFecha;
    }

    poblarSelectPresets();
    const selectPreset = document.getElementById('selectPresetMapeo');
    if (selectPreset && estadoImportacion.presetSeleccionado) {
        selectPreset.value = estadoImportacion.presetSeleccionado;
    }

    // Mostrar preview
    mostrarPreview();

    mostrarSeccion('mapeo');
    
    console.log('✅ Mapeo anterior restaurado', estadoImportacion.mapeo);
}

function autoDetectarColumnas() {
    if (typeof importacionMapping.autoDetectarColumnas === 'function') {
        importacionMapping.autoDetectarColumnas(estadoImportacion);
    }
}

function mostrarPreview() {
    if (typeof importacionMapping.mostrarPreview === 'function') {
        importacionMapping.mostrarPreview({
            estadoImportacion,
            normalizarTexto,
            parseImporte,
            tt,
            obtenerRangoFechasDesdeRaw,
            aplicarRangoFechasAnalisis,
            parseDate
        });
    }
}

function validarMapeo() {
    if (typeof importacionMapping.validarMapeo === 'function') {
        return importacionMapping.validarMapeo({ showAlert, t });
    }
    return false;
}

function procesarDatosConMapeo() {
    if (typeof importacionMapping.procesarDatosConMapeo === 'function') {
        return importacionMapping.procesarDatosConMapeo({
            estadoImportacion,
            parseImporte,
            inferirTipo,
            aplicarRangoFechasAnalisisPorDatos,
            actualizarPanelValidacion,
            parseDate
        });
    }
    return false;
}

function parseDate(dateStr, formato) {
    if (typeof importacionMapping.parseDate === 'function') {
        return importacionMapping.parseDate(dateStr, formato);
    }
    const parsed = new Date(dateStr);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function mostrarSeleccionConceptos() {
    renderListaConceptos(false);
    mostrarSeccion('seleccionConceptos');
    console.log('✅ Selección de conceptos mostrada');
}

function actualizarConceptosSeleccionadosDesdeUI() {
    const checkboxes = document.querySelectorAll('.concepto-item input[type="checkbox"][data-concepto]');
    if (!checkboxes.length) return;

    estadoImportacion.conceptosSeleccionados = Array.from(checkboxes)
        .filter((cb) => cb.checked)
        .map((cb) => cb.dataset.concepto);
}

function renderListaConceptos(forzarTodosSeleccionados = false) {
    const listaConceptos = document.getElementById('listaConceptos');
    if (!listaConceptos) return;

    if (!forzarTodosSeleccionados) {
        actualizarConceptosSeleccionadosDesdeUI();
    }

    const searchInput = document.getElementById('conceptoSearchInput');
    const sortSelect = document.getElementById('conceptoSortSelect');
    const filtro = normalizarTexto(searchInput?.value || '');
    const sortBy = sortSelect?.value || 'impacto';

    const conceptosMap = {};
    estadoImportacion.datosMapados.forEach((d) => {
        const concepto = d.concepto || tt('importacion.sinConcepto', 'Sin concepto');
        if (!conceptosMap[concepto]) {
            conceptosMap[concepto] = {
                nombre: concepto,
                count: 0,
                totalIngreso: 0,
                totalGasto: 0
            };
        }
        conceptosMap[concepto].count += 1;
        if (d.tipo === 'ingreso') {
            conceptosMap[concepto].totalIngreso += d.importe;
        } else {
            conceptosMap[concepto].totalGasto += d.importe;
        }
    });

    let conceptos = Object.values(conceptosMap);
    if (filtro) {
        conceptos = conceptos.filter((c) => normalizarTexto(c.nombre).includes(filtro));
    }

    conceptos.sort((a, b) => {
        if (sortBy === 'alfabetico') return a.nombre.localeCompare(b.nombre, 'es');
        if (sortBy === 'movimientos') return b.count - a.count;
        const impactoA = Math.max(a.totalIngreso, a.totalGasto);
        const impactoB = Math.max(b.totalIngreso, b.totalGasto);
        return impactoB - impactoA;
    });

    const selectedSet = new Set(
        (forzarTodosSeleccionados || estadoImportacion.conceptosSeleccionados.length === 0)
            ? Object.keys(conceptosMap)
            : estadoImportacion.conceptosSeleccionados
    );

    listaConceptos.innerHTML = '';
    if (conceptos.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'color-secondary';
        empty.textContent = tt('importacion.sinConceptosFiltro', 'Sin conceptos que coincidan con el filtro');
        listaConceptos.appendChild(empty);
        return;
    }

    conceptos.forEach((concepto) => {
        const div = document.createElement('div');
        div.className = 'concepto-item';

        const tipo = concepto.totalIngreso > concepto.totalGasto ? 'ingreso' : 'gasto';
        const tipoTexto = tipo === 'ingreso'
            ? tt('dashboard.ingresos', 'Ingresos')
            : tt('dashboard.gastos', 'Gastos');
        const movimientosTexto = tt('importacion.movimientos', 'Movimientos').toLowerCase();
        const total = Math.max(concepto.totalIngreso, concepto.totalGasto);
        const checked = selectedSet.has(concepto.nombre);
        const conceptoEscapado = escapeHtml(concepto.nombre);

        div.innerHTML = `
            <input type="checkbox" ${checked ? 'checked' : ''} data-concepto="${conceptoEscapado}">
            <div class="concepto-texto">
                <span class="concepto-nombre">${conceptoEscapado}</span>
                <div class="concepto-info">
                    <span class="concepto-badge badge-${tipo}">${tipoTexto}</span>
                    <span>${concepto.count} ${movimientosTexto}</span>
                    <span><strong>${window.formatCurrency ? window.formatCurrency(total) : total.toFixed(2) + '€'}</strong></span>
                </div>
            </div>
        `;
        listaConceptos.appendChild(div);
    });

    actualizarConceptosSeleccionadosDesdeUI();
}

function aplicarSeleccionConceptos() {
    actualizarConceptosSeleccionadosDesdeUI();
    console.log('✅ Conceptos seleccionados:', estadoImportacion.conceptosSeleccionados.length);
}

function obtenerConceptosObjetivoImportacion() {
    const conceptosFiltrados = (estadoImportacion.conceptosSeleccionados && estadoImportacion.conceptosSeleccionados.length > 0)
        ? estadoImportacion.datosMapados.filter(d => estadoImportacion.conceptosSeleccionados.includes(d.concepto || tt('importacion.sinConcepto', 'Sin concepto')))
        : estadoImportacion.datosMapados;

    const keys = new Set();
    conceptosFiltrados.forEach((d) => {
        const concepto = d.concepto || tt('importacion.sinConcepto', 'Sin concepto');
        keys.add(normalizarTexto(concepto) || 'sin-concepto');
    });

    return Array.from(keys);
}

function tieneCategoriasCompletasGuardadas() {
    const conceptosObjetivo = obtenerConceptosObjetivoImportacion();
    if (!conceptosObjetivo.length) return false;

    const map = estadoImportacion.categoriasPorConcepto || {};
    return conceptosObjetivo.every((key) => {
        const value = map[key];
        return Number.isInteger(Number(value)) && Number(value) > 0;
    });
}

function aplicarCategoriaMasiva() {
    const masivo = document.getElementById('categoriaMasivaSelect');
    if (!masivo || !masivo.value) {
        showAlert('Selecciona una categoria masiva antes de aplicar', 'warning');
        return;
    }

    const selects = document.querySelectorAll('.categoria-select');
    let aplicados = 0;
    selects.forEach((select) => {
        if (Array.from(select.options).some((opt) => opt.value === masivo.value)) {
            select.value = masivo.value;
            aplicados += 1;
        }
    });

    if (aplicados === 0) {
        showAlert('La categoria seleccionada no aplica a los conceptos visibles', 'warning');
        return;
    }

    if (typeof window.notifyInfo === 'function') {
        window.notifyInfo(`Categoria aplicada en ${aplicados} conceptos`);
    }
}




function actualizarAnalisis() {
    const desdeControl = document.getElementById('analisisDesde');
    const hastaControl = document.getElementById('analisisHasta');
    if (!desdeControl || !hastaControl) {
        return;
    }

    if (!desdeControl.value || !hastaControl.value) {
        aplicarRangoFechasAnalisisPorDatos(true);
    }

    const desdeInput = desdeControl.value;
    const hastaInput = hastaControl.value;

    alternarLoadingAnalisis(true);

    if (!desdeInput || !hastaInput) {
        console.warn('Rango de fechas no establecido');
        showAlert(t('importacion.errorRangoFechas'), 'info');
        alternarLoadingAnalisis(false);
        return;
    }

    const desde = new Date(desdeInput);
    const hasta = new Date(hastaInput);
    hasta.setHours(23, 59, 59, 999); // Incluir todo el último día

    console.log('📊 Filtrando desde', desde, 'hasta', hasta);
    console.log('📊 Datos totales disponibles:', estadoImportacion.datosMapados.length);
    console.log('📊 Muestra de datos:', estadoImportacion.datosMapados.slice(0, 3));

    let datosFilterados = estadoImportacion.datosMapados.filter(d => {
        if (!d.fecha) return false;
        const fecha = new Date(d.fecha);
        return fecha >= desde && fecha <= hasta;
    });

    // Filtrar por conceptos seleccionados si hay alguno
    if (estadoImportacion.conceptosSeleccionados && estadoImportacion.conceptosSeleccionados.length > 0) {
        datosFilterados = datosFilterados.filter(d => 
            estadoImportacion.conceptosSeleccionados.includes(d.concepto || tt('importacion.sinConcepto', 'Sin concepto'))
        );
        console.log('📊 Filtrado por conceptos seleccionados:', datosFilterados.length, 'registros');
    }

    console.log('📊 Generando gráficos con', datosFilterados.length, 'registros filtrados');
    console.log('📊 Muestra filtrada:', datosFilterados.slice(0, 3));

    if (datosFilterados.length === 0) {
        showAlert(t('importacion.errorSinDatosRango'), 'info');
        estadoImportacion.datosAnalisisActual = [];
        actualizarKpisAnalisis([]);
        alternarLoadingAnalisis(false);
        return;
    }

    estadoImportacion.datosAnalisisActual = datosFilterados;
    actualizarKpisAnalisis(datosFilterados);

    generarGraficoCategoria(datosFilterados);
    generarGraficoIngresoVsGasto(datosFilterados);
    generarGraficoEvolucionSaldo(datosFilterados, estadoImportacion.datosRaw, estadoImportacion.mapeo.saldo);
    generarGraficoMovimientosPorMes(datosFilterados);
    
    // Aviso de éxito eliminado por requerimiento
    
    // Guardar archivo automáticamente SOLO si es nuevo y no ha sido guardado aún
    // Si es un archivo cargado (archivoNuevo=false), no guardar para evitar duplicados
    if (estadoImportacion.archivoNuevo && !estadoImportacion.archivoGuardado) {
        console.log('💾 Auto-guardando archivo nuevo...');
        const nombre = estadoImportacion.archivoActual?.name || `importacion_${new Date().toLocaleDateString('es-ES')}`;
        guardarDatosEnServidor(nombre);
    } else {
        if (!estadoImportacion.archivoNuevo) {
            console.log('⏭️ Archivo cargado desde servidor, NO se guarda automáticamente para evitar duplicados');
        }
    }

    alternarLoadingAnalisis(false);
}

function generarGraficoCategoria(datos) {
    if (typeof importacionCharts.generarGraficoCategoria === 'function') {
        importacionCharts.generarGraficoCategoria(datos, { estadoImportacion, showAlert, t });
    }
}

function generarGraficoIngresoVsGasto(datos) {
    if (typeof importacionCharts.generarGraficoIngresoVsGasto === 'function') {
        importacionCharts.generarGraficoIngresoVsGasto(datos, { estadoImportacion, showAlert, t, tt });
    }
}

function generarGraficoEvolucionSaldo(datos, datosRaw, columnasSaldo) {
    if (typeof importacionCharts.generarGraficoEvolucionSaldo === 'function') {
        importacionCharts.generarGraficoEvolucionSaldo(datos, datosRaw, columnasSaldo, {
            estadoImportacion,
            parseDate,
            parseImporte,
            showAlert,
            t
        });
    }
}

function generarGraficoMovimientosPorMes(datos) {
    if (typeof importacionCharts.generarGraficoMovimientosPorMes === 'function') {
        importacionCharts.generarGraficoMovimientosPorMes(datos, { estadoImportacion, showAlert, t });
    }
}

function exportarDatos() {
    console.log('💾 Exportando datos...');
    const dataset = (estadoImportacion.datosAnalisisActual && estadoImportacion.datosAnalisisActual.length > 0)
        ? estadoImportacion.datosAnalisisActual
        : estadoImportacion.datosMapados;

    if (!dataset || dataset.length === 0) {
        showAlert('No hay datos para exportar', 'warning');
        return;
    }

    const csvCell = (value) => {
        const text = String(value ?? '');
        return `"${text.replace(/"/g, '""')}"`;
    };

    const formatearFechaCsv = (fecha) => {
        if (!fecha) return '';
        const date = (fecha instanceof Date) ? fecha : new Date(fecha);
        if (Number.isNaN(date.getTime())) return '';
        return date.toISOString().split('T')[0];
    };
    
    // Crear CSV
    const headers = ['Fecha', 'Concepto', 'Importe', 'Tipo'];
    const rows = dataset.map(d => [
        formatearFechaCsv(d.fecha),
        d.concepto,
        d.importe,
        d.tipo
    ]);

    let csv = headers.map(csvCell).join(',') + '\n';
    rows.forEach(row => {
        csv += row.map(csvCell).join(',') + '\n';
    });

    // Descargar
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `analisis_bancario_${formatearFechaCsv(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);

    // Aviso de éxito eliminado por requerimiento
}

function descargarErroresValidacion() {
    const errores = Array.isArray(estadoImportacion.datosMapadosInvalidos)
        ? estadoImportacion.datosMapadosInvalidos
        : [];

    if (!errores.length) {
        showInfoToast('No hay errores de validación para exportar');
        return;
    }

    const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const headers = ['Fila', 'Concepto', 'Importe', 'Errores'];

    let csv = headers.map(csvCell).join(',') + '\n';
    errores.forEach((item) => {
        csv += [
            item.fila || '',
            item.concepto || '',
            item.importeOriginal ?? '',
            Array.isArray(item.errores) ? item.errores.join('; ') : ''
        ].map(csvCell).join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `importacion_errores_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
}

async function mostrarSeleccionCategorias() {
    if (!estadoImportacion.datosMapados || estadoImportacion.datosMapados.length === 0) {
        showAlert('No hay datos mapeados para guardar', 'warning');
        return;
    }

    try {
        const conceptosFiltrados = (estadoImportacion.conceptosSeleccionados && estadoImportacion.conceptosSeleccionados.length > 0)
            ? estadoImportacion.datosMapados.filter(d => estadoImportacion.conceptosSeleccionados.includes(d.concepto || tt('importacion.sinConcepto', 'Sin concepto')))
            : estadoImportacion.datosMapados;

        // Cargar categorías
        const service = window.TabCategoryService;
        const categorias = (service && typeof service.fetchCategorias === 'function')
            ? await service.fetchCategorias()
            : await fetch('/categorias').then((r) => r.json());
        const dashboardData = await fetch('/dashboard').then(r => r.json()).catch(() => null);
        const mapaGuardados = {
            gastos: crearMapaConceptosGuardados(dashboardData, 'gasto'),
            ingresos: crearMapaConceptosGuardados(dashboardData, 'ingreso')
        };

        const categoriaMasivaSelect = document.getElementById('categoriaMasivaSelect');
        if (categoriaMasivaSelect) {
            const opcionSelecciona = tt('importacion.opcionSelecciona', '-- Selecciona --');
            categoriaMasivaSelect.innerHTML = `<option value="">${opcionSelecciona}</option>`;
            const labelTipoGasto = tt('dashboard.gastos', 'Gastos');
            const labelTipoIngreso = tt('dashboard.ingresos', 'Ingresos');
            const categoriasMasivas = [
                ...(Array.isArray(categorias.gastos) ? categorias.gastos.map((c) => ({ ...c, tipo: labelTipoGasto })) : []),
                ...(Array.isArray(categorias.ingresos) ? categorias.ingresos.map((c) => ({ ...c, tipo: labelTipoIngreso })) : [])
            ];

            categoriasMasivas.forEach((cat) => {
                const option = document.createElement('option');
                option.value = String(cat.id);
                option.textContent = `[${cat.tipo}] ${cat.nombre}`;
                categoriaMasivaSelect.appendChild(option);
            });
        }
        
        const tablaCuerpo = document.getElementById('tablaCategoriasBodies');

        if (!tablaCuerpo) {
            console.error('❌ Tabla de categorías no encontrada');
            return;
        }

        // Limpiar tabla
        tablaCuerpo.innerHTML = '';

        // Crear mapa de conceptos únicos normalizados (categoria por concepto, no por importe)
        const conceptosMap = {};
        estadoImportacion.metaConceptosCategorias = {};
        conceptosFiltrados.forEach((d, idx) => {
            const conceptoRaw = d.concepto || tt('importacion.sinConcepto', 'Sin concepto');
            const conceptoKey = normalizarTexto(conceptoRaw) || 'sin-concepto';
            if (!conceptosMap[conceptoKey]) {
                conceptosMap[conceptoKey] = {
                    concepto: conceptoRaw,
                    tipo: d.tipo,
                    montoTotal: 0,
                    cantidad: 0,
                    index: idx
                };
            }
            conceptosMap[conceptoKey].montoTotal += d.importe || 0;
            conceptosMap[conceptoKey].cantidad += 1;
            estadoImportacion.metaConceptosCategorias[conceptoKey] = {
                tipo: d.tipo,
                concepto: conceptoRaw
            };
        });

        const revisionGuardada = cargarRevisionConceptoCategoria();

        // Crear filas de la tabla
        Object.entries(conceptosMap).forEach(([conceptoKey, datos]) => {
            const tr = document.createElement('tr');
            
            // Tipo
            const tdTipo = document.createElement('td');
            const icon = datos.tipo === 'ingreso' ? '📈' : '📉';
            const label = datos.tipo === 'ingreso'
                ? tt('dashboard.ingresos', 'Ingresos')
                : tt('dashboard.gastos', 'Gastos');
            tdTipo.innerHTML = `<span class="badge badge-${datos.tipo}">${icon} ${label}</span>`;
            tr.appendChild(tdTipo);

            // Concepto
            const tdConcepto = document.createElement('td');
            tdConcepto.textContent = datos.concepto;
            tr.appendChild(tdConcepto);

            // Cantidad
            const tdCantidad = document.createElement('td');
            tdCantidad.textContent = window.formatCurrency
                ? window.formatCurrency(datos.montoTotal)
                : `€${datos.montoTotal.toFixed(2)}`;
            tr.appendChild(tdCantidad);

            // Selector de categoría
            const tdCategoria = document.createElement('td');
            const select = document.createElement('select');
            select.className = 'mapeo-select categoria-select';
            select.dataset.concepto = conceptoKey;
            
            // Opción por defecto
            const optDefault = document.createElement('option');
            optDefault.value = '';
            optDefault.textContent = tt('importacion.opcionSelecciona', '-- Selecciona --');
            select.appendChild(optDefault);

            // Agregar categorías apropiadas
            const catSource = datos.tipo === 'ingreso' ? categorias.ingresos : categorias.gastos;
            let categoriasAutodetectada = null;
            
            if (catSource && Array.isArray(catSource)) {
                catSource.forEach(cat => {
                    const option = document.createElement('option');
                    option.value = cat.id;
                    option.textContent = cat.nombre;
                    select.appendChild(option);
                });

                const mapaTipo = datos.tipo === 'ingreso' ? mapaGuardados.ingresos : mapaGuardados.gastos;
                const sugerencia = resolverCategoriaSugerida(
                    datos.concepto,
                    datos.tipo,
                    catSource,
                    revisionGuardada,
                    mapaTipo
                );
                categoriasAutodetectada = sugerencia.categoriaId;

                const categoriaGuardada = estadoImportacion?.categoriasPorConcepto?.[conceptoKey];
                const existeCategoriaGuardada = categoriaGuardada && Array.from(select.options).some((opt) => opt.value === String(categoriaGuardada));

                if (existeCategoriaGuardada) {
                    select.value = String(categoriaGuardada);
                }
                // Si solo hay una opción, seleccionarla automáticamente
                else if (select.options.length === 2) {
                    select.value = select.options[1].value;
                } else if (categoriasAutodetectada) {
                    // Si se detectó automáticamente, seleccionar esa categoría
                    select.value = categoriasAutodetectada;
                }

                if (select.value) {
                    const origen = (select.options.length === 2)
                        ? 'categoria_unica'
                        : (sugerencia?.origen || 'manual');
                    console.log(`🧠 Categoría sugerida para "${datos.concepto}" por ${origen}`);
                }
            }

            tdCategoria.appendChild(select);
            tr.appendChild(tdCategoria);

            select.addEventListener('change', () => {
                if (!estadoImportacion.categoriasPorConcepto || typeof estadoImportacion.categoriasPorConcepto !== 'object') {
                    estadoImportacion.categoriasPorConcepto = {};
                }
                if (!select.value) {
                    delete estadoImportacion.categoriasPorConcepto[conceptoKey];
                    return;
                }
                estadoImportacion.categoriasPorConcepto[conceptoKey] = parseInt(select.value, 10);
            });

            tablaCuerpo.appendChild(tr);
        });

        mostrarSeccion('seleccionCategorias');
        console.log('✅ Selección de categorías mostrada:', Object.keys(conceptosMap).length, 'conceptos únicos');
    } catch (error) {
        console.error('❌ Error cargando categorías:', error);
        showAlert(`Error al cargar categorías: ${error.message}`, 'error');
    }
}

function obtenerCategoriasSeleccionadasDesdeTabla() {
    const categoriasSeleccionadas = {};
    const sinSeleccionar = [];
    const selects = document.querySelectorAll('.categoria-select');

    selects.forEach((select) => {
        const concepto = select.dataset.concepto;
        const categoria = select.value;

        if (!categoria) {
            sinSeleccionar.push(concepto);
        } else {
            categoriasSeleccionadas[concepto] = parseInt(categoria, 10);
        }
    });

    return { categoriasSeleccionadas, sinSeleccionar };
}

async function confirmarCategoriasYContinuar() {
    const { categoriasSeleccionadas, sinSeleccionar } = obtenerCategoriasSeleccionadasDesdeTabla();
    if (sinSeleccionar.length > 0) {
        showAlert('Por favor selecciona categoría para todos los conceptos', 'warning');
        return;
    }

    estadoImportacion.categoriasPorConcepto = categoriasSeleccionadas;
    persistirRevisionConceptoCategoria(categoriasSeleccionadas);

    if (estadoImportacion.guardarEnBdPendiente) {
        estadoImportacion.guardarEnBdPendiente = false;
        mostrarSeccion('analisis');
        await guardarEnBaseDatos();
        return;
    }

    actualizarAnalisis();
    mostrarSeccion('analisis');
}

function crearMapaConceptosGuardados(dashboardData, tipo) {
    if (typeof importacionCategoriaUtils.crearMapaConceptosGuardados === 'function') {
        return importacionCategoriaUtils.crearMapaConceptosGuardados(dashboardData, tipo);
    }
    return new Map();
}

function detectarCategoriaAutomatica(concepto, categorias) {
    if (typeof importacionCategoriaUtils.detectarCategoriaAutomatica === 'function') {
        return importacionCategoriaUtils.detectarCategoriaAutomatica(concepto, categorias);
    }
    return null;
}

function obtenerCategoriaDesdeMemoriaUsuario(concepto, tipo, categorias, revisionGuardada) {
    if (typeof importacionCategoriaUtils.obtenerCategoriaDesdeMemoriaUsuario === 'function') {
        return importacionCategoriaUtils.obtenerCategoriaDesdeMemoriaUsuario(concepto, tipo, categorias, revisionGuardada);
    }
    return null;
}

function resolverCategoriaSugerida(concepto, tipo, categorias, revisionGuardada, mapaGuardados) {
    if (typeof importacionCategoriaUtils.resolverCategoriaSugerida === 'function') {
        return importacionCategoriaUtils.resolverCategoriaSugerida(concepto, tipo, categorias, revisionGuardada, mapaGuardados);
    }
    return { categoriaId: null, origen: null };
}

async function guardarEnBaseDatos() {
    if (!estadoImportacion.datosMapados || estadoImportacion.datosMapados.length === 0) {
        showAlert('No hay datos mapeados para guardar', 'warning');
        return;
    }

    // Obtener categorías seleccionadas por concepto
    let { categoriasSeleccionadas, sinSeleccionar } = obtenerCategoriasSeleccionadasDesdeTabla();
    if (!Object.keys(categoriasSeleccionadas).length && estadoImportacion.categoriasPorConcepto) {
        categoriasSeleccionadas = { ...estadoImportacion.categoriasPorConcepto };
        const conceptosObjetivo = obtenerConceptosObjetivoImportacion();
        sinSeleccionar = conceptosObjetivo.filter((key) => !categoriasSeleccionadas[key]);
    }

    // Validar que todas las categorías estén seleccionadas
    if (sinSeleccionar.length > 0) {
        showAlert('Por favor selecciona categoría para todos los conceptos', 'warning');
        return;
    }

    persistirRevisionConceptoCategoria(categoriasSeleccionadas);

    // Separar en gastos e ingresos con sus categorías
    const datosGastos = [];
    const datosIngresos = [];

    const archivoOrigen = estadoImportacion.nombreArchivoOrigen
        || estadoImportacion.archivoActual?.name
        || estadoImportacion.archivoId
        || 'importacion_bancaria';

    const conceptosFiltrados = (estadoImportacion.conceptosSeleccionados && estadoImportacion.conceptosSeleccionados.length > 0)
        ? estadoImportacion.datosMapados.filter(d => estadoImportacion.conceptosSeleccionados.includes(d.concepto || tt('importacion.sinConcepto', 'Sin concepto')))
        : estadoImportacion.datosMapados;

    conceptosFiltrados.forEach(d => {
        const concepto = d.concepto || tt('importacion.sinConcepto', 'Sin concepto');
        const conceptoKey = normalizarTexto(concepto) || 'sin-concepto';
        const categoriaId = categoriasSeleccionadas[conceptoKey];

        if (!categoriaId) {
            console.warn(`⚠️ No hay categoría para concepto: ${concepto}`);
            return; // Saltar este registro
        }

        const registro = {
            fecha: d.fecha ? d.fecha.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            descripcion: d.concepto,
            monto: d.importe,
            categoria_id: categoriaId,
            archivo_origen: archivoOrigen
        };

        if (d.tipo === 'gasto') {
            datosGastos.push(registro);
        } else if (d.tipo === 'ingreso') {
            datosIngresos.push(registro);
        }
    });

    console.log(`📊 Guardando ${datosGastos.length} gastos y ${datosIngresos.length} ingresos`);

    try {
        const promesas = [];

        // Guardar gastos
        if (datosGastos.length > 0) {
            promesas.push(
                fetch('/import/gasto_real', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ datos: datosGastos })
                })
            );
        }

        // Guardar ingresos
        if (datosIngresos.length > 0) {
            promesas.push(
                fetch('/import/ingreso_real', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ datos: datosIngresos })
                })
            );
        }

        const respuestas = await Promise.all(promesas);
        
        let exitosos = 0;
        let fallidos = 0;
        let mensajeError = '';

        for (const res of respuestas) {
            const data = await res.json();
            if (data.success) {
                exitosos += data.exitosos || 0;
                fallidos += data.fallidos || 0;
            } else {
                mensajeError = data.error || 'Error desconocido';
                fallidos += datosGastos.length + datosIngresos.length;
            }
        }

        const total = exitosos + fallidos;
        const mensaje = `Guardados: ${exitosos}/${total} registros`;
        
        if (fallidos > 0) {
            showAlert(`${mensaje}\nFallidos: ${fallidos}\n${mensajeError ? mensajeError : ''}`, 'warning');
        } else {
            showAlert(mensaje, 'success');
        }

        console.log(`✅ Importación completada: ${exitosos} exitosos, ${fallidos} fallidos`);

        // Actualizar el resumen después de guardar
        if (typeof cargarResumenPeriodos === 'function') {
            cargarResumenPeriodos();
        }

    } catch (error) {
        console.error('❌ Error guardando en BD:', error);
        showAlert(`${error.message || error}`, 'error');
    }
}

function mostrarSeccion(seccion) {
    // Ocultar todas las secciones
    const uploadSection = document.getElementById('uploadSection');
    const mapeoSection = document.getElementById('mapeoSection');
    const analisisSection = document.getElementById('analisisSection');
    const archivosSection = document.getElementById('archivosSection');
    const seleccionConceptosSection = document.getElementById('seleccionConceptosSection');
    const seleccionCategoriasSection = document.getElementById('seleccionCategoriasSection');
    
    if (uploadSection) uploadSection.style.display = 'none';
    if (mapeoSection) mapeoSection.style.display = 'none';
    if (analisisSection) analisisSection.style.display = 'none';
    if (archivosSection) archivosSection.style.display = 'none';
    if (seleccionConceptosSection) seleccionConceptosSection.style.display = 'none';
    if (seleccionCategoriasSection) seleccionCategoriasSection.style.display = 'none';

    // Mostrar la sección solicitada
    switch(seccion) {
        case 'upload':
            if (uploadSection) uploadSection.style.display = 'block';
            break;
        case 'mapeo':
            if (mapeoSection) mapeoSection.style.display = 'block';
            break;
        case 'seleccionConceptos':
            if (seleccionConceptosSection) seleccionConceptosSection.style.display = 'block';
            break;
        case 'seleccionCategorias':
            if (seleccionCategoriasSection) seleccionCategoriasSection.style.display = 'block';
            break;
        case 'analisis':
            if (analisisSection) analisisSection.style.display = 'block';
            // Asegurar que los canvas están visibles
            setTimeout(() => {
                window.dispatchEvent(new Event('resize'));
            }, 100);
            break;
        case 'archivos':
            if (archivosSection) archivosSection.style.display = 'block';
            break;
    }
    
    // Guardar la sección actual para cuando se vuelva a abrir la pestaña
    estadoImportacion.seccionActual = seccion;
    actualizarWizard(seccion);
    console.log('📍 Sección guardada:', seccion);
}

function resetearImportacion() {
    console.log('🔄 Reseteando importación...');
    
    // Destruir gráficos existentes
    Object.values(estadoImportacion.charts).forEach(chart => {
        if (chart && typeof chart.destroy === 'function') {
            chart.destroy();
        }
    });
    
    // Resetear estado
    estadoImportacion = {
        archivoActual: null,
        nombreArchivoOrigen: null,
        datosRaw: [],
        datosMapados: [],
        datosMapadosValidos: [],
        datosMapadosInvalidos: [],
        datosAnalisisActual: [],
        columnas: [],
        mapeo: { fecha: null, concepto: null, importe: null, tipo: null },
        formatoFecha: 'DD/MM/YYYY',
        charts: {},
        seccionActual: 'upload',
        archivoNuevo: true,
        archivoId: null,
        archivoGuardado: false,
        conceptosSeleccionados: [],
        categoriasPorConcepto: {},
        metaConceptosCategorias: {},
        tableFilter: 'gasto',
        presetSeleccionado: null,
        guardarEnBdPendiente: false,
        filtroAnalisis: {
            desde: '',
            hasta: ''
        }
    };
    
    // Actualizar referencia global
    window.estadoImportacion = estadoImportacion;
    
    document.getElementById('fileInput').value = '';
    const validacion = document.getElementById('validacionMapeo');
    if (validacion) validacion.style.display = 'none';
    actualizarWizard('upload');
    console.log('✅ Importación reseteada');
}

/**
 * FUNCIONES PARA MANEJAR ARCHIVOS GUARDADOS
 */

async function cargarListadoArchivos() {
    if (typeof importacionSavedFiles.cargarListadoArchivos === 'function') {
        await importacionSavedFiles.cargarListadoArchivos({
            showAlert,
            t,
            escapeHtml,
            crearElementoArchivo
        });
    }
}

function crearElementoArchivo(archivo) {
    if (typeof importacionSavedFiles.crearElementoArchivo === 'function') {
        return importacionSavedFiles.crearElementoArchivo(archivo, { t, escapeHtml });
    }
    return document.createElement('div');
}

async function cargarArchivoGuardado(archivoId) {
    if (typeof importacionSavedFiles.cargarArchivoGuardado === 'function') {
        await importacionSavedFiles.cargarArchivoGuardado(archivoId, {
            estadoImportacion,
            showInfoToast,
            showErrorToast,
            t,
            leerCSV,
            leerExcel
        });
    }
}

async function descargarArchivo(archivoId) {
    if (typeof importacionSavedFiles.descargarArchivo === 'function') {
        await importacionSavedFiles.descargarArchivo(archivoId, { showAlert, t });
    }
}

async function eliminarArchivo(archivoId, nombreArchivo) {
    if (typeof importacionSavedFiles.eliminarArchivo === 'function') {
        await importacionSavedFiles.eliminarArchivo(archivoId, nombreArchivo, {
            t,
            tt,
            showInfoToast,
            showSuccessToast,
            showErrorToast,
            cargarListadoArchivos
        });
    }
}

async function guardarDatosEnServidor(nombre) {
    if (typeof importacionSavedFiles.guardarDatosEnServidor === 'function') {
        await importacionSavedFiles.guardarDatosEnServidor(nombre, {
            estadoImportacion,
            showInfoToast,
            t,
            cargarListadoArchivos
        });
    }
}

async function guardarArchivoActual(nombre) {
    if (typeof importacionSavedFiles.guardarArchivoActual === 'function') {
        await importacionSavedFiles.guardarArchivoActual(nombre, {
            estadoImportacion,
            showAlert,
            showInfoToast,
            showErrorToast,
            t,
            cargarListadoArchivos
        });
    }
}

function convertirDatosACSV(datos) {
    if (typeof importacionSavedFiles.convertirDatosACSV === 'function') {
        return importacionSavedFiles.convertirDatosACSV(datos);
    }
    return '';
}

window.persistirBorradorImportacion = persistirBorradorImportacion;

// Asegurarse de que se llama cuando se carga la pestaña
console.log('✅ Script importacionBancaria.js cargado');
