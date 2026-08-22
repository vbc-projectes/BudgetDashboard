/**
 * Preload Script - Expone la API de forma segura al renderer process
 * Usa contextBridge para aislar el contexto y proteger el main process
 */

const { contextBridge, ipcRenderer } = require('electron');

// Exponer API al renderer de forma segura
contextBridge.exposeInMainWorld('electronAPI', {
    // ============= VENTANA =============
    platform: process.platform,
    windowMinimize: () => ipcRenderer.invoke('window-minimize'),
    windowMaximizeToggle: () => ipcRenderer.invoke('window-maximize-toggle'),
    windowClose: () => ipcRenderer.invoke('window-close'),
    windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
    onWindowMaximizedChanged: (callback) => {
        const listener = (_event, isMaximized) => callback(isMaximized);
        ipcRenderer.on('window-maximized-changed', listener);
        return () => ipcRenderer.removeListener('window-maximized-changed', listener);
    },

    // ============= USUARIOS =============
    listUsers: () => ipcRenderer.invoke('list-users'),
    createUser: (data) => ipcRenderer.invoke('create-user', data),
    getCurrentUser: () => ipcRenderer.invoke('get-current-user'),
    setCurrentUser: (data) => ipcRenderer.invoke('set-current-user', data),
    getUserProfile: (data) => ipcRenderer.invoke('get-user-profile', data),
    setUserIcon: (data) => ipcRenderer.invoke('set-user-icon', data),
    hasUserPin: (data) => ipcRenderer.invoke('has-user-pin', data),
    verifyUserPin: (data) => ipcRenderer.invoke('verify-user-pin', data),
    setUserPin: (data) => ipcRenderer.invoke('set-user-pin', data),
    removeUserPin: (data) => ipcRenderer.invoke('remove-user-pin', data),

    // ============= CATEGORIAS =============
    addCategoria: (data) => ipcRenderer.invoke('add-categoria', data),
    getCategorias: () => ipcRenderer.invoke('get-categorias'),
    updateCategoria: (data) => ipcRenderer.invoke('update-categoria', data),
    deleteCategoria: (data) => ipcRenderer.invoke('delete-categoria', data),

    // ============= GASTOS =============
    addGastoPuntual: (data) => ipcRenderer.invoke('add-gasto-puntual', data),
    deleteGastoPuntual: (data) => ipcRenderer.invoke('delete-gasto-puntual', data),
    updateGastoPuntual: (data) => ipcRenderer.invoke('update-gasto-puntual', data),
    addGastoMensual: (data) => ipcRenderer.invoke('add-gasto-mensual', data),
    deleteGastoMensual: (data) => ipcRenderer.invoke('delete-gasto-mensual', data),
    updateGastoMensual: (data) => ipcRenderer.invoke('update-gasto-mensual', data),

    // ============= INGRESOS =============
    addIngresoPuntual: (data) => ipcRenderer.invoke('add-ingreso-puntual', data),
    deleteIngresoPuntual: (data) => ipcRenderer.invoke('delete-ingreso-puntual', data),
    updateIngresoPuntual: (data) => ipcRenderer.invoke('update-ingreso-puntual', data),
    addIngresoMensual: (data) => ipcRenderer.invoke('add-ingreso-mensual', data),
    deleteIngresoMensual: (data) => ipcRenderer.invoke('delete-ingreso-mensual', data),
    updateIngresoMensual: (data) => ipcRenderer.invoke('update-ingreso-mensual', data),

    // ============= GASTOS REALES =============
    addGastoReal: (data) => ipcRenderer.invoke('add-gasto-real', data),
    deleteGastoReal: (data) => ipcRenderer.invoke('delete-gasto-real', data),
    updateGastoReal: (data) => ipcRenderer.invoke('update-gasto-real', data),

    // ============= INGRESOS REALES =============
    addIngresoReal: (data) => ipcRenderer.invoke('add-ingreso-real', data),
    deleteIngresoReal: (data) => ipcRenderer.invoke('delete-ingreso-real', data),
    updateIngresoReal: (data) => ipcRenderer.invoke('update-ingreso-real', data),

    // ============= IMPORT BANCO =============
    importGastosPuntuales: (data) => ipcRenderer.invoke('import-gastos-puntuales', data),
    importIngresosPuntuales: (data) => ipcRenderer.invoke('import-ingresos-puntuales', data),
    importGastosReales: (data) => ipcRenderer.invoke('import-gastos-reales', data),
    importIngresosReales: (data) => ipcRenderer.invoke('import-ingresos-reales', data),

    // ============= IMPUESTOS =============
    addImpuestoPuntual: (data) => ipcRenderer.invoke('add-impuesto-puntual', data),
    deleteImpuestoPuntual: (data) => ipcRenderer.invoke('delete-impuesto-puntual', data),
    updateImpuestoPuntual: (data) => ipcRenderer.invoke('update-impuesto-puntual', data),
    addImpuestoMensual: (data) => ipcRenderer.invoke('add-impuesto-mensual', data),
    deleteImpuestoMensual: (data) => ipcRenderer.invoke('delete-impuesto-mensual', data),
    updateImpuestoMensual: (data) => ipcRenderer.invoke('update-impuesto-mensual', data),

    // ============= HUCHA =============
    getHucha: () => ipcRenderer.invoke('get-hucha'),
    addHucha: (data) => ipcRenderer.invoke('add-hucha', data),
    updateHucha: (data) => ipcRenderer.invoke('update-hucha', data),
    deleteHucha: (data) => ipcRenderer.invoke('delete-hucha', data),

    // ============= SUB-HUCHAS =============
    getSubHuchas: () => ipcRenderer.invoke('get-sub-huchas'),
    addSubHucha: (data) => ipcRenderer.invoke('add-sub-hucha', data),
    updateSubHucha: (data) => ipcRenderer.invoke('update-sub-hucha', data),
    deleteSubHucha: (data) => ipcRenderer.invoke('delete-sub-hucha', data),
    getSubHuchaPuntuales: (id) => ipcRenderer.invoke('get-sub-hucha-puntuales', id),
    addSubHuchaPuntual: (data) => ipcRenderer.invoke('add-sub-hucha-puntual', data),
    deleteSubHuchaPuntual: (data) => ipcRenderer.invoke('delete-sub-hucha-puntual', data),
    getSubHuchasTotal: (mes) => ipcRenderer.invoke('get-sub-huchas-total', mes),

    // ============= CUENTA REMUNERADA =============
    getCuentaRemunerada: () => ipcRenderer.invoke('get-cuenta-remunerada'),
    addCuentaRemunerada: (data) => ipcRenderer.invoke('add-cuenta-remunerada', data),
    updateCuentaRemunerada: (data) => ipcRenderer.invoke('update-cuenta-remunerada', data),
    deleteCuentaRemunerada: (data) => ipcRenderer.invoke('delete-cuenta-remunerada', data),
    setCuentaRemuneradaLink: (data) => ipcRenderer.invoke('cuenta-remunerada-set-link', data),
    getCRSaldoHoy: (data) => ipcRenderer.invoke('cr-get-saldo-hoy', data),
    // CR aportaciones variables
    getCRAportaciones: (data) => ipcRenderer.invoke('cr-get-aportaciones', data),
    addCRAportacion:   (data) => ipcRenderer.invoke('cr-add-aportacion',   data),
    deleteCRAportacion:(data) => ipcRenderer.invoke('cr-delete-aportacion', data),
    // CR ajustes manuales de saldo
    getCRAjustes:   (data) => ipcRenderer.invoke('cr-get-ajustes',   data),
    addCRAjuste:    (data) => ipcRenderer.invoke('cr-add-ajuste',    data),
    deleteCRAjuste: (data) => ipcRenderer.invoke('cr-delete-ajuste', data),

    // CR tipos de interés
    crGetTiposInteres:  (data) => ipcRenderer.invoke('cr-get-tipos-interes',  data),
    crAddTipoInteres:   (data) => ipcRenderer.invoke('cr-add-tipo-interes',   data),
    crDeleteTipoInteres:(data) => ipcRenderer.invoke('cr-delete-tipo-interes',data),
    crInformeFiscal:    (data) => ipcRenderer.invoke('cr-informe-fiscal',     data),

    // ============= ASSETS =============
    getAssets: () => ipcRenderer.invoke('get-assets'),
    addAsset: (data) => ipcRenderer.invoke('add-asset', data),
    updateAsset: (data) => ipcRenderer.invoke('update-asset', data),
    deleteAsset: (data) => ipcRenderer.invoke('delete-asset', data),
    sellAsset: (data) => ipcRenderer.invoke('sell-asset', data),
    getAssetPrice: (ticker) => ipcRenderer.invoke('get-asset-price', ticker),
    getAssetHistory: (ticker, period) => ipcRenderer.invoke('get-asset-history', ticker, period),

    // ============= DASHBOARD =============
    getDashboard: () => ipcRenderer.invoke('get-dashboard-data'),
    getDashboardReal: () => ipcRenderer.invoke('get-dashboard-real-data'),
    getDashboardRangoFechas: () => ipcRenderer.invoke('get-dashboard-rango-fechas'),
    getImpuestosMes: (params) => ipcRenderer.invoke('get-impuestos-mes', params),
    getImpuestosMesReal: (params) => ipcRenderer.invoke('get-impuestos-mes-real', params),
    getAhorrosMes: (params) => ipcRenderer.invoke('get-ahorros-mes', params),
    getAhorrosMesReal: (params) => ipcRenderer.invoke('get-ahorros-mes-real', params),
    getCategoriasPeriodo: (params) => ipcRenderer.invoke('get-categorias-periodo', params),
    getCategoriasPeriodoReal: (params) => ipcRenderer.invoke('get-categorias-periodo-real', params),
    getGastosCategoriaMes: (params) => ipcRenderer.invoke('get-gastos-categoria-mes', params),
    getGastosCategoriaMesReal: (params) => ipcRenderer.invoke('get-gastos-categoria-mes-real', params),
    getResumenPeriodos: () => ipcRenderer.invoke('get-resumen-periodos'),

    // ============= IMPORTACION BANCARIA =============
    importList: () => ipcRenderer.invoke('import-list'),
    importContent: (id) => ipcRenderer.invoke('import-content', id),
    importDelete: (id) => ipcRenderer.invoke('import-delete', id),
    importSave: (data) => ipcRenderer.invoke('import-save', data),

    // ============= BOLSA / INVERSIONES =============
    bolsaEnsureSetup: () => ipcRenderer.invoke('bolsa-ensure-setup'),
    bolsaGetOperaciones: () => ipcRenderer.invoke('bolsa-get-operaciones'),
    bolsaAddOperacion: (data) => ipcRenderer.invoke('bolsa-add-operacion', data),
    bolsaUpdateOperacion: (data) => ipcRenderer.invoke('bolsa-update-operacion', data),
    bolsaDeleteOperacion: (id) => ipcRenderer.invoke('bolsa-delete-operacion', id),
    bolsaGetDividendos: () => ipcRenderer.invoke('bolsa-get-dividendos'),
    bolsaGetPosiciones: () => ipcRenderer.invoke('bolsa-get-posiciones'),
    bolsaGetResumen: () => ipcRenderer.invoke('bolsa-get-resumen'),
    bolsaGetEstadisticas: () => ipcRenderer.invoke('bolsa-get-estadisticas'),
    bolsaGetTickerHistory: (ticker) => ipcRenderer.invoke('bolsa-get-ticker-history', ticker),
    bolsaSyncDividendos: () => ipcRenderer.invoke('bolsa-sync-dividendos'),
    bolsaGetCRSaldoDiario: () => ipcRenderer.invoke('bolsa-get-cr-saldo-diario'),
    bolsaGetDesgloseSector: () => ipcRenderer.invoke('bolsa-get-desglose-sector'),
    bolsaGetEstadisticasFiscales: () => ipcRenderer.invoke('bolsa-get-estadisticas-fiscales'),

    // ============= ASSET METADATA =============
    getAssetMetadata: (ticker) => ipcRenderer.invoke('asset-get-metadata', ticker),

    // ============= DASHBOARD EXTENSIONES =============
    getDashboardNetWorth: () => ipcRenderer.invoke('dashboard-get-net-worth'),
    getDashboardPresupuestos: (mes) => ipcRenderer.invoke('dashboard-get-presupuestos', mes),
    getDashboardAnomalias: (meses) => ipcRenderer.invoke('dashboard-get-anomalias', meses),

    // ============= PRESUPUESTOS =============
    presupuestosGetAll: () => ipcRenderer.invoke('presupuestos-get-all'),
    presupuestosSave: (data) => ipcRenderer.invoke('presupuestos-save', data),
    presupuestosDelete: (id) => ipcRenderer.invoke('presupuestos-delete', id),

    // ============= BACKUP =============
    backupDownload: () => ipcRenderer.invoke('backup-download'),

    // ============= AJUSTES =============
    getAppSetting: (key) => ipcRenderer.invoke('get-app-setting', key),
    setAppSetting: (key, value) => ipcRenderer.invoke('set-app-setting', { key, value })
});

console.log('✅ Preload script cargado - API expuesta');
