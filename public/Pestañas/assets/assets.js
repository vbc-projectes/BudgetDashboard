// ===== Assets standalone tab =====
// Initialises the assets section independently of the Ingresos tab.
// Reuses window.IngresosAssetsModule (loaded globally via ingresos.assets.js).

async function initAssetsTab() {
    const assetsModule = window.IngresosAssetsModule;
    if (!assetsModule || typeof assetsModule.createAssetModule !== 'function') {
        console.error('IngresosAssetsModule no está disponible');
        return;
    }

    // Minimal adapter so the existing assets module works standalone
    const mgr = {
        formatCurrency(v, opts) {
            if (typeof window.formatCurrency === 'function') return window.formatCurrency(v, opts || {});
            if (v === null || v === undefined) return '€0,00';
            return '€' + parseFloat(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        },
        t(key, fallback) {
            if (typeof t === 'function') {
                const r = t(key);
                if (r && r !== key) return r;
            }
            return fallback || key;
        },
        parseAmount(str) {
            if (typeof parseAmount === 'function') return parseAmount(str);
            if (!str) return 0;
            let cleaned = String(str).replace(/[^\d.,-]/g, '');
            const lastComma = cleaned.lastIndexOf(',');
            const lastDot   = cleaned.lastIndexOf('.');
            if (lastComma > lastDot) {
                cleaned = cleaned.replace(/\./g, '').replace(',', '.');
            } else {
                cleaned = cleaned.replace(/,/g, '');
            }
            return parseFloat(cleaned) || 0;
        },
        loadData() {}  // no-op: not inside Ingresos
    };

    const controller = assetsModule.createAssetModule({
        ingresosManager: mgr,
        ingresosRealesManager: { loadData() {} },
        showAlert: window.showAlert,
        showConfirm: (typeof showConfirm === 'function') ? showConfirm : window.showConfirm,
        notifySuccess: window.notifySuccess,
        cargarResumenPeriodos: (typeof cargarResumenPeriodos === 'function') ? cargarResumenPeriodos : () => {}
    });

    // ===== Agregar asset =====
    const btnAgregarAsset = document.getElementById('btnAgregarAsset');
    if (btnAgregarAsset) {
        btnAgregarAsset.onclick = async () => {
            const company        = document.getElementById('companyAsset').value;
            const ticker         = document.getElementById('tickerAsset').value;
            const shares         = parseFloat(document.getElementById('sharesAsset').value);
            const purchase_price = parseFloat(document.getElementById('purchasePriceAsset').value);

            if (!company)                                    return window.showAlert(mgr.t('ingresos.ingresaNombreCompania', 'Ingresa el nombre de la compañía'));
            if (!ticker)                                     return window.showAlert(mgr.t('ingresos.ingresaTicker',          'Ingresa el ticker'));
            if (isNaN(shares) || shares <= 0)                return window.showAlert(mgr.t('ingresos.accionesInvalidas',      'Número de acciones inválido'));
            if (isNaN(purchase_price) || purchase_price <= 0) return window.showAlert(mgr.t('ingresos.precioCompraInvalido',  'Precio de compra inválido'));

            await fetch('/add/asset', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ company, ticker, shares, purchase_price })
            });

            document.getElementById('companyAsset').value       = '';
            document.getElementById('tickerAsset').value        = '';
            document.getElementById('sharesAsset').value        = '';
            document.getElementById('purchasePriceAsset').value = '';

            await controller.cargarAssets();
            if (typeof notifySuccess === 'function') notifySuccess(mgr.t('mensajes.elementoCreado', 'Asset guardado'));
        };
    }

    // Initial load
    await controller.cargarAssets();
}
