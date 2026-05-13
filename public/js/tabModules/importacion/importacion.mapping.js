(function initImportacionMapping(global) {
    if (global.ImportacionMapping) return;

    function limpiarColumnasImportacion(datos, headers) {
        const columnas = (headers && headers.length ? headers : (datos[0] ? Object.keys(datos[0]) : []))
            .map(c => c.trim());
        const columnasLimpias = columnas.filter(c => c.toLowerCase() !== 'bruto');

        const datosLimpios = datos.map(row => {
            if (!row || typeof row !== 'object') return row;
            const limpio = { ...row };
            Object.keys(limpio).forEach(key => {
                if (key.toLowerCase() === 'bruto') delete limpio[key];
            });
            return limpio;
        });

        return { datos: datosLimpios, columnas: columnasLimpias };
    }

    function autoDetectarColumnas(estadoImportacion) {
        const palabrasClave = {
            fecha: ['fecha', 'date', 'día', 'dia', 'day', 'fecha_operacion', 'fecha_valor'],
            concepto: ['concepto', 'descripción', 'descripcion', 'description', 'asunto', 'detalle', 'detail', 'concepto_operacion'],
            importe: ['importe', 'amount', 'cantidad', 'monto', 'valor', 'importe_operacion', 'importe_neto'],
            saldo: ['saldo', 'balance', 'balance_disponible', 'saldo_disponible', 'saldo_final', 'available_balance', 'saldo_actual']
        };

        for (const [tipo, palabras] of Object.entries(palabrasClave)) {
            const columnaEncontrada = estadoImportacion.columnas.find(col =>
                palabras.some(palabra => col.toLowerCase().includes(palabra))
            );
            if (!columnaEncontrada) continue;

            const selectId = `select${tipo.charAt(0).toUpperCase() + tipo.slice(1)}`;
            const select = document.getElementById(selectId);
            if (select) select.value = columnaEncontrada;
        }
    }

    function mostrarMapeoColumnas(ctx) {
        const { estadoImportacion, actualizarProgreso, tt, poblarSelectPresets, aplicarPresetMapeo, mostrarPreview, mostrarSeccion } = ctx;

        actualizarProgreso(100, 'Archivo procesado');
        setTimeout(() => {
            const fileProgress = document.getElementById('fileProgress');
            if (fileProgress) fileProgress.style.display = 'none';
        }, 300);

        const selects = ['selectFecha', 'selectConcepto', 'selectImporte', 'selectTipo', 'selectSaldo'];
        selects.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (!select) return;
            const opcionSelecciona = tt('importacion.opcionSelecciona', '-- Selecciona --');
            select.innerHTML = `<option value="">${opcionSelecciona}</option>`;
            estadoImportacion.columnas.forEach(col => {
                const option = document.createElement('option');
                option.value = col;
                option.textContent = col;
                select.appendChild(option);
            });
        });

        autoDetectarColumnas(estadoImportacion);
        poblarSelectPresets();

        const selectPreset = document.getElementById('selectPresetMapeo');
        if (selectPreset) {
            if (estadoImportacion.presetSeleccionado && Array.from(selectPreset.options).some((opt) => opt.value === estadoImportacion.presetSeleccionado)) {
                selectPreset.value = estadoImportacion.presetSeleccionado;
                aplicarPresetMapeo(estadoImportacion.presetSeleccionado);
            } else if (selectPreset.options.length === 2) {
                selectPreset.value = selectPreset.options[1].value;
                aplicarPresetMapeo(selectPreset.value);
            }
        }

        mostrarPreview();
        mostrarSeccion('mapeo');
    }

    function parseDate(dateStr, formato) {
        if (dateStr == null || dateStr === '') return null;

        if (dateStr instanceof Date) {
            return Number.isNaN(dateStr.getTime()) ? null : dateStr;
        }

        if (typeof dateStr === 'number' && Number.isFinite(dateStr)) {
            if (dateStr > 10000 && dateStr < 100000) {
                const excelEpoch = new Date(Date.UTC(1899, 11, 30));
                const date = new Date(excelEpoch.getTime() + Math.round(dateStr) * 86400000);
                return Number.isNaN(date.getTime()) ? null : date;
            }
            const date = new Date(dateStr);
            return Number.isNaN(date.getTime()) ? null : date;
        }

        const raw = String(dateStr).trim();
        if (!raw) return null;

        if (/^\d{5}(\.\d+)?$/.test(raw)) {
            const serial = Number(raw);
            const excelEpoch = new Date(Date.UTC(1899, 11, 30));
            const date = new Date(excelEpoch.getTime() + Math.round(serial) * 86400000);
            return Number.isNaN(date.getTime()) ? null : date;
        }

        const match = raw.match(/^(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})$/);
        if (match) {
            const a = Number(match[1]);
            const b = Number(match[2]);
            const c = Number(match[3]);

            let day;
            let month;
            let year;

            if (String(a).length === 4) {
                year = a; month = b; day = c;
            } else if ((formato || '').includes('MM/DD')) {
                month = a; day = b; year = c;
            } else {
                day = a; month = b; year = c;
            }

            const date = new Date(year, month - 1, day);
            if (!Number.isNaN(date.getTime()) && date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
                return date;
            }
        }

        const fallback = new Date(raw);
        return Number.isNaN(fallback.getTime()) ? null : fallback;
    }

    function mostrarPreview(ctx) {
        const {
            estadoImportacion,
            normalizarTexto,
            parseImporte,
            tt,
            obtenerRangoFechasDesdeRaw,
            aplicarRangoFechasAnalisis
        } = ctx;

        const previewHeader = document.getElementById('previewHeader');
        const previewBody = document.getElementById('previewBody');
        const previewInfo = document.getElementById('previewInfo');
        if (!previewHeader || !previewBody || !previewInfo) return;

        previewHeader.innerHTML = '';
        previewBody.innerHTML = '';

        const columnasMapeadas = new Set([
            document.getElementById('selectFecha')?.value,
            document.getElementById('selectConcepto')?.value,
            document.getElementById('selectImporte')?.value,
            document.getElementById('selectTipo')?.value,
            document.getElementById('selectSaldo')?.value
        ].filter(Boolean));

        estadoImportacion.columnas.forEach(col => {
            const th = document.createElement('th');
            th.textContent = col;
            if (columnasMapeadas.has(col)) th.classList.add('mapped-col');
            previewHeader.appendChild(th);
        });

        const filtro = normalizarTexto(document.getElementById('previewFilterInput')?.value || '');
        const filasFuente = filtro
            ? estadoImportacion.datosRaw.filter((row) => estadoImportacion.columnas.some((col) => normalizarTexto(row[col]).includes(filtro)))
            : estadoImportacion.datosRaw;

        const filasPreview = filasFuente.slice(0, 8);
        filasPreview.forEach(row => {
            const tr = document.createElement('tr');
            const fechaCol = document.getElementById('selectFecha')?.value;
            const conceptoCol = document.getElementById('selectConcepto')?.value;
            const importeCol = document.getElementById('selectImporte')?.value;
            const formatoFecha = document.getElementById('formatoFecha')?.value || estadoImportacion.formatoFecha || 'DD/MM/YYYY';

            if (fechaCol || conceptoCol || importeCol) {
                const fecha = fechaCol ? parseDate(row[fechaCol], formatoFecha) : new Date();
                const concepto = conceptoCol ? String(row[conceptoCol] || '').trim() : 'ok';
                const importe = importeCol ? parseImporte(row[importeCol]) : 1;
                if (!fecha || !concepto || !Number.isFinite(importe) || importe === 0) tr.classList.add('preview-invalid');
            }

            estadoImportacion.columnas.forEach(col => {
                const td = document.createElement('td');
                td.textContent = row[col] || '';
                if (columnasMapeadas.has(col)) td.classList.add('mapped-col');
                tr.appendChild(td);
            });
            previewBody.appendChild(tr);
        });

        const rangoFechas = obtenerRangoFechasDesdeRaw();
        if (rangoFechas) aplicarRangoFechasAnalisis(rangoFechas.min, rangoFechas.max, false);

        const baseInfo = tt('importacion.previewMostrando', 'Mostrando');
        const baseFilas = tt('importacion.filas', 'filas');
        const baseFiltradas = tt('importacion.filtradas', 'filtradas');
        const rangoTexto = rangoFechas
            ? ` · ${tt('importacion.fechasDisponibles', 'Fechas disponibles')}: ${rangoFechas.min.toLocaleDateString()} - ${rangoFechas.max.toLocaleDateString()}`
            : '';
        previewInfo.textContent = `${baseInfo} ${filasPreview.length}/${filasFuente.length} ${baseFilas}${filtro ? ` ${baseFiltradas}` : ''}${rangoTexto}`;
    }

    function validarMapeo(ctx) {
        const { showAlert, t } = ctx;
        const selectFecha = document.getElementById('selectFecha');
        const selectConcepto = document.getElementById('selectConcepto');
        const selectImporte = document.getElementById('selectImporte');

        if (!selectFecha || !selectConcepto || !selectImporte) {
            showAlert(t('importacion.errorMapeoNoEncontrado'), 'error');
            return false;
        }

        const fecha = selectFecha.value;
        const concepto = selectConcepto.value;
        const importe = selectImporte.value;

        if (!fecha || !concepto || !importe) {
            showAlert(t('importacion.errorColumnasRequeridas'), 'error');
            return false;
        }

        return true;
    }

    function procesarDatosConMapeo(ctx) {
        const {
            estadoImportacion,
            parseImporte,
            inferirTipo,
            aplicarRangoFechasAnalisisPorDatos,
            actualizarPanelValidacion
        } = ctx;

        estadoImportacion.mapeo = {
            fecha: document.getElementById('selectFecha').value,
            concepto: document.getElementById('selectConcepto').value,
            importe: document.getElementById('selectImporte').value,
            tipo: document.getElementById('selectTipo').value,
            saldo: document.getElementById('selectSaldo').value
        };
        estadoImportacion.formatoFecha = document.getElementById('formatoFecha').value || 'DD/MM/YYYY';

        const validos = [];
        const invalidos = [];

        estadoImportacion.datosRaw.forEach((row, index) => {
            const fecha = parseDate(row[estadoImportacion.mapeo.fecha], estadoImportacion.formatoFecha);
            const concepto = String(row[estadoImportacion.mapeo.concepto] || '').trim();
            const importeOriginal = row[estadoImportacion.mapeo.importe];
            const importeNumerico = parseImporte(importeOriginal);
            const tipoRaw = estadoImportacion.mapeo.tipo ? row[estadoImportacion.mapeo.tipo] : null;
            const tipo = inferirTipo(tipoRaw, importeNumerico);

            const errores = [];
            if (!fecha) errores.push('Fecha invalida');
            if (!concepto) errores.push('Concepto vacio');
            if (!Number.isFinite(importeNumerico)) errores.push('Importe invalido');
            if (Number.isFinite(importeNumerico) && importeNumerico === 0) errores.push('Importe cero');

            if (errores.length > 0) {
                invalidos.push({
                    fila: index + 2,
                    concepto: concepto || '-',
                    importeOriginal,
                    errores
                });
                return;
            }

            validos.push({ fecha, concepto, importe: Math.abs(importeNumerico), tipo });
        });

        estadoImportacion.datosMapadosValidos = validos;
        estadoImportacion.datosMapadosInvalidos = invalidos;
        estadoImportacion.datosMapados = validos;
        estadoImportacion.datosAnalisisActual = [];

        aplicarRangoFechasAnalisisPorDatos(true);
        actualizarPanelValidacion();

        return validos.length > 0;
    }

    global.ImportacionMapping = {
        limpiarColumnasImportacion,
        autoDetectarColumnas,
        mostrarMapeoColumnas,
        mostrarPreview,
        validarMapeo,
        procesarDatosConMapeo,
        parseDate
    };
}(window));
