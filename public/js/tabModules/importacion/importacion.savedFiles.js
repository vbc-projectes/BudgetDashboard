(function initImportacionSavedFiles(global) {
    if (global.ImportacionSavedFiles) return;

    async function cargarListadoArchivos(ctx) {
        const { showAlert, t, escapeHtml, crearElementoArchivo } = ctx;
        try {
            const response = await fetch('/api/importacion/listar');
            const data = await response.json();

            if (!data.success) {
                showAlert(t('importacion.errorCargandoArchivos') + ': ' + data.error, 'error');
                return;
            }

            const listadoArchivos = document.getElementById('listadoArchivos');
            if (!listadoArchivos) return;

            if (!data.archivos || data.archivos.length === 0) {
                listadoArchivos.innerHTML = `<p style="text-align: center; color: var(--text-secondary);">${t('importacion.noArchivos')}</p>`;
                return;
            }

            listadoArchivos.innerHTML = '';
            data.archivos.forEach((archivo) => {
                listadoArchivos.appendChild(crearElementoArchivo(archivo, { t, escapeHtml }));
            });
        } catch (error) {
            showAlert(t('importacion.errorCargandoArchivos') + ': ' + error.message, 'error');
        }
    }

    function crearElementoArchivo(archivo, ctx) {
        const { t, escapeHtml } = ctx;
        const div = document.createElement('div');
        div.className = 'archivo-item';

        const fecha = new Date(archivo.fechaGuardado).toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const tamaño = (archivo.tamaño / 1024).toFixed(2) + ' KB';

        div.innerHTML = `
            <div class="archivo-info">
                <div class="archivo-nombre">
                    <i class="fas fa-file-excel"></i> ${escapeHtml(archivo.nombre)}
                </div>
                <div class="archivo-detalles">
                    <span class="archivo-fecha">
                        <i class="fas fa-calendar"></i> ${fecha}
                    </span>
                    <span class="archivo-tamaño">
                        <i class="fas fa-weight"></i> ${tamaño}
                    </span>
                </div>
            </div>
            <div class="archivo-acciones">
                <button class="btn-archivo btn-cargar" data-action="cargar" data-id="${escapeHtml(archivo.id)}" data-nombre="${escapeHtml(archivo.nombre)}">
                    <i class="fas fa-upload"></i> ${t('importacion.btnCargar')}
                </button>
                <button class="btn-archivo btn-descargar" data-action="descargar" data-id="${escapeHtml(archivo.id)}" data-nombre="${escapeHtml(archivo.nombre)}">
                    <i class="fas fa-download"></i> ${t('importacion.btnDescargar')}
                </button>
                <button class="btn-archivo btn-eliminar" data-action="eliminar" data-id="${escapeHtml(archivo.id)}" data-nombre="${escapeHtml(archivo.nombre)}">
                    <i class="fas fa-trash"></i> ${t('importacion.btnEliminar')}
                </button>
            </div>
        `;

        return div;
    }

    async function cargarArchivoGuardado(archivoId, ctx) {
        const { estadoImportacion, showInfoToast, showErrorToast, t, leerCSV, leerExcel } = ctx;
        try {
            showInfoToast('⏳ ' + t('importacion.cargandoArchivo'));
            const response = await fetch(`/api/importacion/contenido/${archivoId}`);
            const data = await response.json();

            if (!data.success) {
                showErrorToast('❌ ' + t('importacion.errorCargandoArchivo') + ': ' + data.error);
                return;
            }

            const binary = atob(data.contenido);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

            const blob = new Blob([bytes], { type: 'application/octet-stream' });
            const file = new File([blob], data.nombre, { type: 'application/octet-stream' });

            estadoImportacion.nombreArchivoOrigen = data.nombre || data.archivo || archivoId;
            estadoImportacion.archivoNuevo = false;
            estadoImportacion.archivoId = archivoId;

            const nombreArchivo = (data.nombre || '').toLowerCase();
            const extension = nombreArchivo.includes('.') ? nombreArchivo.split('.').pop() : '';

            if (extension === 'csv' || data.tipo === '.csv') leerCSV(file);
            else leerExcel(file);
        } catch (error) {
            showErrorToast('❌ ' + t('importacion.errorCargandoArchivo') + ': ' + error.message);
        }
    }

    async function descargarArchivo(archivoId, ctx) {
        const { showAlert, t } = ctx;
        try {
            window.location.href = `/api/importacion/descargar/${archivoId}`;
        } catch (error) {
            showAlert(t('importacion.errorDescargandoArchivo') + ': ' + error.message, 'error');
        }
    }

    async function eliminarArchivo(archivoId, nombreArchivo, ctx) {
        const { t, tt, showInfoToast, showSuccessToast, showErrorToast, cargarListadoArchivos } = ctx;
        const confirmar = (typeof window.showConfirm === 'function')
            ? await window.showConfirm(`${t('importacion.confirmEliminar')} "${nombreArchivo}"?`, 'Confirmar')
            : confirm(`${t('importacion.confirmEliminar')} "${nombreArchivo}"?`);
        if (!confirmar) return;

        try {
            showInfoToast('⏳ ' + t('importacion.eliminandoArchivo'));
            const response = await fetch(`/api/importacion/eliminar/${archivoId}`, { method: 'DELETE' });
            const data = await response.json();

            if (!data.success) {
                showErrorToast('❌ ' + t('importacion.errorEliminandoArchivo') + ': ' + data.error);
                return;
            }

            showSuccessToast('✅ ' + tt('importacion.archivoEliminado', 'Archivo eliminado'));
            await cargarListadoArchivos();
        } catch (error) {
            showErrorToast('❌ ' + t('importacion.errorEliminandoArchivo') + ': ' + error.message);
        }
    }

    function convertirDatosACSV(datos) {
        if (!datos || datos.length === 0) return '';

        const headers = Object.keys(datos[0]);
        const csv = [headers.join(',')];

        datos.forEach((fila) => {
            const valores = headers.map((header) => {
                const valor = fila[header] || '';
                return `"${String(valor).replace(/"/g, '""')}"`;
            });
            csv.push(valores.join(','));
        });

        return csv.join('\n');
    }

    async function guardarDatosEnServidor(nombre, ctx) {
        const { estadoImportacion, showInfoToast, t, cargarListadoArchivos } = ctx;
        if (!estadoImportacion.datosRaw || estadoImportacion.datosRaw.length === 0) return;

        try {
            showInfoToast('⏳ ' + t('importacion.guardandoArchivo'));

            const csv = convertirDatosACSV(estadoImportacion.datosRaw);
            const formData = new FormData();
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
            const nombreArchivo = nombre.replace(/\.[^/.]+$/, '') + '.csv';

            formData.append('archivo', blob, nombreArchivo);
            formData.append('nombre', nombreArchivo);

            const response = await fetch('/api/importacion/guardar', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            if (!data.success) return;

            estadoImportacion.archivoGuardado = true;
            await cargarListadoArchivos();
        } catch (_) {
            // ignored by design
        }
    }

    async function guardarArchivoActual(nombre, ctx) {
        const { estadoImportacion, showAlert, showInfoToast, showErrorToast, t, cargarListadoArchivos } = ctx;
        if (!estadoImportacion.datosRaw || estadoImportacion.datosRaw.length === 0) {
            showAlert(t('importacion.errorSinDatos'), 'info');
            return;
        }

        try {
            showInfoToast('⏳ ' + t('importacion.guardandoArchivo'));
            const csv = convertirDatosACSV(estadoImportacion.datosRaw);
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
            const nombreArchivo = nombre.replace(/\.[^/.]+$/, '') + '.csv';

            const formData = new FormData();
            formData.append('archivo', blob, nombreArchivo);
            formData.append('nombre', nombreArchivo);

            const response = await fetch('/api/importacion/guardar', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            if (!data.success) {
                showErrorToast('❌ ' + t('importacion.errorGuardandoArchivo') + ': ' + data.error);
                return;
            }

            await cargarListadoArchivos();
        } catch (error) {
            showErrorToast('❌ ' + t('importacion.errorGuardandoArchivo') + ': ' + error.message);
        }
    }

    global.ImportacionSavedFiles = {
        cargarListadoArchivos,
        crearElementoArchivo,
        cargarArchivoGuardado,
        descargarArchivo,
        eliminarArchivo,
        guardarDatosEnServidor,
        guardarArchivoActual,
        convertirDatosACSV
    };
}(window));
