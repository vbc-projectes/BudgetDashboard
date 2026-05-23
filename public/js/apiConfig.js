/**
 * API Adapter - Proporciona una interfaz compatible con fetch para usar IPC
 * Este adaptador permite mantener el código del frontend casi sin cambios
 * En modo web (sin Electron) delega directamente al fetch del navegador.
 */

// Guardar el fetch original
const originalFetch = window.fetch;

// ── Web mode: no Electron available — use real fetch directly ─────────
if (typeof window.electronAPI === 'undefined') {
    window.API = { fetch: (url, opts) => originalFetch(url, opts) };
    window.fetch = window.API.fetch.bind(window.API);
    console.log('✅ API Adapter cargado — modo web (fetch nativo)');
} else {
// ── Electron mode: route API calls through IPC ────────────────────────

window.API = {
    /**
     * Simula una llamada fetch pero usa IPC de Electron solo para rutas de la API interna
     * @param {string} url - URL de la API (se convertirá a canal IPC)
     * @param {object} options - Opciones de la petición (method, body, etc.)
     * @returns {Promise<Response>} - Objeto Response compatible con fetch
     */
    async fetch(url, options = {}) {
        // Si es una URL externa (http/https) o archivo HTML, usar fetch original
        if (url.startsWith('http://') || url.startsWith('https://') || 
            url.endsWith('.html') || url.endsWith('.js') || url.endsWith('.css')) {
            return originalFetch(url, options);
        }

        const method = options.method || 'GET';
        let body = null;

        // Manejar FormData (para importación de archivos)
        if (options.body instanceof FormData) {
            // Convertir FormData a objeto para IPC
            body = {};
            const file = options.body.get('archivo');
            const nombre = options.body.get('nombre');
            
            if (file instanceof Blob) {
                // Leer el archivo como ArrayBuffer y convertir a base64
                const arrayBuffer = await file.arrayBuffer();
                const bytes = new Uint8Array(arrayBuffer);
                let binary = '';
                for (let i = 0; i < bytes.length; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                body.contenido = btoa(binary);
                body.filename = nombre || file.name || 'archivo.csv';
            }
        } else if (options.body) {
            body = JSON.parse(options.body);
        }

        try {
            // Mapeo de URLs a canales IPC
            const result = await this._callIPC(url, method, body);
            const isBusinessSuccess = typeof result?.success === 'boolean' ? result.success : true;
            const status = isBusinessSuccess ? 200 : 400;
            
            // Crear un objeto Response compatible
            return {
                ok: isBusinessSuccess,
                status,
                json: async () => result,
                text: async () => JSON.stringify(result)
            };
        } catch (error) {
            console.error('IPC Error:', error);
            return {
                ok: false,
                status: error.status || 500,
                json: async () => ({ error: error.message || 'Error desconocido' }),
                text: async () => JSON.stringify({ error: error.message || 'Error desconocido' })
            };
        }
    },

    /**
     * Mapea URLs y métodos HTTP a llamadas IPC.
     * Exact-match routes use a constant-time lookup table.
     * Parameterized routes (path params or query strings) are handled below.
     * @private
     */
    async _callIPC(url, method, body) {
        const api = window.electronAPI;
        const qmark = url.indexOf('?');
        const basePath = qmark >= 0 ? url.slice(0, qmark) : url;
        const params   = qmark >= 0 ? new URLSearchParams(url.slice(qmark + 1)) : new URLSearchParams();

        // ── Exact-match route table (O(1) lookup) ─────────────────────
        const EXACT = {
            // Categorías
            'GET:/categorias':                     () => api.getCategorias(),
            'POST:/add/categoria':                 () => api.addCategoria(body),
            'POST:/update/categoria':              () => api.updateCategoria(body),
            'POST:/delete/categoria':              () => api.deleteCategoria(body),
            // Gastos Puntuales
            'POST:/add/gasto_puntual':             () => api.addGastoPuntual(body),
            'POST:/delete/gasto_puntual':          () => api.deleteGastoPuntual(body),
            'POST:/update/gasto_puntual':          () => api.updateGastoPuntual(body),
            // Gastos Reales
            'POST:/add/gasto_real':                () => api.addGastoReal(body),
            'POST:/delete/gasto_real':             () => api.deleteGastoReal(body),
            'POST:/update/gasto_real':             () => api.updateGastoReal(body),
            // Gastos Mensuales
            'POST:/add/gasto_mensual':             () => api.addGastoMensual(body),
            'POST:/delete/gasto_mensual':          () => api.deleteGastoMensual(body),
            'POST:/update/gasto_mensual':          () => api.updateGastoMensual(body),
            // Ingresos Puntuales
            'POST:/add/ingreso_puntual':           () => api.addIngresoPuntual(body),
            'POST:/delete/ingreso_puntual':        () => api.deleteIngresoPuntual(body),
            'POST:/update/ingreso_puntual':        () => api.updateIngresoPuntual(body),
            // Ingresos Reales
            'POST:/add/ingreso_real':              () => api.addIngresoReal(body),
            'POST:/delete/ingreso_real':           () => api.deleteIngresoReal(body),
            'POST:/update/ingreso_real':           () => api.updateIngresoReal(body),
            // Ingresos Mensuales
            'POST:/add/ingreso_mensual':           () => api.addIngresoMensual(body),
            'POST:/delete/ingreso_mensual':        () => api.deleteIngresoMensual(body),
            'POST:/update/ingreso_mensual':        () => api.updateIngresoMensual(body),
            // Import (banco)
            'POST:/import/gasto_puntual':          () => api.importGastosPuntuales(body),
            'POST:/import/ingreso_puntual':        () => api.importIngresosPuntuales(body),
            'POST:/import/gasto_real':             () => api.importGastosReales(body),
            'POST:/import/ingreso_real':           () => api.importIngresosReales(body),
            // Impuestos Puntuales
            'POST:/add/impuesto_puntual':          () => api.addImpuestoPuntual(body),
            'POST:/delete/impuesto_puntual':       () => api.deleteImpuestoPuntual(body),
            'POST:/update/impuesto_puntual':       () => api.updateImpuestoPuntual(body),
            // Impuestos Mensuales
            'POST:/add/impuesto_mensual':          () => api.addImpuestoMensual(body),
            'POST:/delete/impuesto_mensual':       () => api.deleteImpuestoMensual(body),
            'POST:/update/impuesto_mensual':       () => api.updateImpuestoMensual(body),
            // Hucha
            'GET:/hucha':                          () => api.getHucha(),
            'POST:/add/hucha':                     () => api.addHucha(body),
            'POST:/update/hucha':                  () => api.updateHucha(body),
            'POST:/delete/hucha':                  () => api.deleteHucha(body),
            // Sub-Huchas
            'GET:/sub_huchas':                     () => api.getSubHuchas(),
            'POST:/add/sub_hucha':                 () => api.addSubHucha(body),
            'POST:/update/sub_hucha':              () => api.updateSubHucha(body),
            'POST:/delete/sub_hucha':              () => api.deleteSubHucha(body),
            'POST:/add/sub_hucha_puntual':         () => api.addSubHuchaPuntual(body),
            'POST:/delete/sub_hucha_puntual':      () => api.deleteSubHuchaPuntual(body),
            // Cuenta Remunerada
            'GET:/cuenta_remunerada':              () => api.getCuentaRemunerada(),
            'POST:/add/cuenta_remunerada':         () => api.addCuentaRemunerada(body),
            'POST:/update/cuenta_remunerada':      () => api.updateCuentaRemunerada(body),
            'POST:/delete/cuenta_remunerada':      () => api.deleteCuentaRemunerada(body),
            'POST:/cuenta_remunerada/set-link':    () => api.setCuentaRemuneradaLink(body),
            // Assets (legacy)
            'GET:/assets':                         () => api.getAssets(),
            'POST:/add/asset':                     () => api.addAsset(body),
            'POST:/update/asset':                  () => api.updateAsset(body),
            'POST:/delete/asset':                  () => api.deleteAsset(body),
            'POST:/sell/asset':                    () => api.sellAsset(body),
            // Dashboard
            'GET:/dashboard':                      () => api.getDashboard(),
            'GET:/dashboard-real':                 () => api.getDashboardReal(),
            'GET:/resumen-periodos':               () => api.getResumenPeriodos(),
            // Importación Bancaria
            'GET:/api/importacion/listar':         () => api.importList(),
            'POST:/api/importacion/guardar':       () => api.importSave(body),
            // Usuarios
            'GET:/users':                          () => api.listUsers(),
            'GET:/users/current':                  () => api.getCurrentUser(),
            'POST:/users/create':                  () => api.createUser(body),
            'POST:/users/select':                  () => api.setCurrentUser(body),
            // Bolsa / Inversiones
            'POST:/bolsa/ensure-setup':            () => api.bolsaEnsureSetup(),
            'GET:/bolsa/operaciones':              () => api.bolsaGetOperaciones(),
            'POST:/bolsa/operaciones':             () => api.bolsaAddOperacion(body),
            'GET:/bolsa/dividendos':               () => api.bolsaGetDividendos(),
            'POST:/bolsa/dividendos':              () => api.bolsaAddDividendo(body),
            'GET:/bolsa/posiciones':               () => api.bolsaGetPosiciones(),
            'GET:/bolsa/resumen':                  () => api.bolsaGetResumen(),
            'GET:/bolsa/estadisticas':             () => api.bolsaGetEstadisticas(),
            'POST:/bolsa/sync-dividendos':         () => api.bolsaSyncDividendos(),
            'GET:/bolsa/cuenta-remunerada/saldo-diario': () => api.bolsaGetCRSaldoDiario(),
            'GET:/cuenta-remunerada/saldo-hoy':           () => api.getCRSaldoHoy(),
        };

        const exactKey = `${method}:${basePath}`;
        if (EXACT[exactKey]) return EXACT[exactKey]();

        // ── Query-string parameterized GETs ───────────────────────────
        if (method === 'GET') {
            switch (basePath) {
                case '/impuestos-mes':
                    return api.getImpuestosMes({ desde: params.get('desde'), hasta: params.get('hasta') });
                case '/impuestos-mes-real':
                    return api.getImpuestosMesReal({ desde: params.get('desde'), hasta: params.get('hasta') });
                case '/ahorros-mes':
                    return api.getAhorrosMes({ desde: params.get('desde'), hasta: params.get('hasta'), categoria_id: params.get('categoria_id') });
                case '/ahorros-mes-real':
                    return api.getAhorrosMesReal({ desde: params.get('desde'), hasta: params.get('hasta'), categoria_id: params.get('categoria_id') });
                case '/categorias-periodo':
                    return api.getCategoriasPeriodo({ desde: params.get('desde'), hasta: params.get('hasta') });
                case '/categorias-periodo-real':
                    return api.getCategoriasPeriodoReal({ desde: params.get('desde'), hasta: params.get('hasta') });
                case '/gastos-categoria-mes':
                    return api.getGastosCategoriaMes({ desde: params.get('desde'), hasta: params.get('hasta') });
                case '/gastos-categoria-mes-real':
                    return api.getGastosCategoriaMesReal({ desde: params.get('desde'), hasta: params.get('hasta') });
                case '/sub_huchas/total':
                    return api.getSubHuchasTotal(params.get('mes'));
            }
        }

        // ── Path-parameterized routes ─────────────────────────────────
        let m;

        if ((m = basePath.match(/^\/asset-price\/(.+)$/)))
            return api.getAssetPrice(decodeURIComponent(m[1]));

        if (method === 'GET' && (m = basePath.match(/^\/asset-history\/(.+)$/)))
            return api.getAssetHistory(decodeURIComponent(m[1]), params.get('period') || '1y');

        if (method === 'GET' && (m = basePath.match(/^\/sub_huchas\/(\d+)\/puntuales$/)))
            return api.getSubHuchaPuntuales(Number(m[1]));

        if (method === 'GET' && (m = basePath.match(/^\/api\/importacion\/contenido\/(.+)$/)))
            return api.importContent(decodeURIComponent(m[1]));

        if ((method === 'POST' || method === 'DELETE') && (m = basePath.match(/^\/api\/importacion\/eliminar\/(.+)$/)))
            return api.importDelete(decodeURIComponent(m[1]));

        if (method === 'PUT' && (m = basePath.match(/^\/bolsa\/operaciones\/(\d+)$/)))
            return api.bolsaUpdateOperacion({ ...body, id: Number(m[1]) });

        if (method === 'DELETE' && (m = basePath.match(/^\/bolsa\/operaciones\/(\d+)$/)))
            return api.bolsaDeleteOperacion(Number(m[1]));

        if ((m = basePath.match(/^\/bolsa\/dividendos\/(\d+)$/))) {
            if (method === 'PUT')    return api.bolsaUpdateDividendo({ ...body, id: Number(m[1]) });
            if (method === 'DELETE') return api.bolsaDeleteDividendo(Number(m[1]));
        }

        if (method === 'GET' && (m = basePath.match(/^\/bolsa\/ticker-history\/(.+)$/)))
            return api.bolsaGetTickerHistory(decodeURIComponent(m[1]));

        // CR aportaciones variables
        if (method === 'GET'    && (m = basePath.match(/^\/cuenta-remunerada\/(\d+)\/aportaciones$/)))
            return api.getCRAportaciones({ id: Number(m[1]) });
        if (method === 'POST'   && (m = basePath.match(/^\/cuenta-remunerada\/(\d+)\/aportaciones$/)))
            return api.addCRAportacion({ id: Number(m[1]), ...body });
        if (method === 'DELETE' && (m = basePath.match(/^\/cuenta-remunerada\/aportaciones\/(\d+)$/)))
            return api.deleteCRAportacion({ id: Number(m[1]) });

        // CR ajustes manuales de saldo
        if (method === 'GET'    && (m = basePath.match(/^\/cuenta-remunerada\/(\d+)\/ajustes$/)))
            return api.getCRAjustes({ id: Number(m[1]) });
        if (method === 'POST'   && (m = basePath.match(/^\/cuenta-remunerada\/(\d+)\/ajustes$/)))
            return api.addCRAjuste({ id: Number(m[1]), ...body });
        if (method === 'DELETE' && (m = basePath.match(/^\/cuenta-remunerada\/ajustes\/(\d+)$/)))
            return api.deleteCRAjuste({ id: Number(m[1]) });

        throw new Error(`Ruta no implementada: ${method} ${url}`);
    }
};

// Reemplazar fetch global con nuestro adaptador
window.fetch = window.API.fetch.bind(window.API);

console.log('✅ API Adapter cargado - fetch redirigido a IPC');

} // end Electron mode
