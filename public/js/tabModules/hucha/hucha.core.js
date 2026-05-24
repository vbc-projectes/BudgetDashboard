/**
 * Hucha Real - Versión simplificada usando TransactionManager
 * Gestión de fondos de ahorro físico
 */
const huchaSubhuchasModule = window.HuchaSubhuchasModule || {};
const tabUiCommonUtils = window.TabUiCommonUtils || {};
let huchaSubhuchasController = null;

async function cargarHucha() {
    // Crear TransactionManager simplificado para Hucha (sin categorías)
    const huchaManager = {
        tbody: document.querySelector('#tablaHucha tbody'),
        
        formatCurrency(monto) {
            if (typeof tabUiCommonUtils.formatCurrencyNoConvert === 'function') {
                return tabUiCommonUtils.formatCurrencyNoConvert(monto);
            }
            return new Intl.NumberFormat('es-ES', {
                style: 'currency',
                currency: 'EUR'
            }).format(monto);
        },
        
        parseAmount(str) {
            if (typeof tabUiCommonUtils.parseLocaleAmount === 'function') {
                return tabUiCommonUtils.parseLocaleAmount(str);
            }
            return parseFloat(str) || 0;
        },
        
        t(key, fallback = '') {
            if (typeof tabUiCommonUtils.getText === 'function') {
                return tabUiCommonUtils.getText(key, fallback);
            }
            return fallback || key;
        },
        
        async loadData() {
            const [resHucha, resCRSaldo, resBolsaPos] = await Promise.all([
                fetch('/hucha'),
                fetch('/cuenta-remunerada/saldo-hoy?retencionDivPct=' + (parseFloat(localStorage.getItem('retencionDividendos') || '0')),),
                fetch('/bolsa/posiciones')
            ]);

            const data = resHucha.ok ? await resHucha.json() : [];
            const crResumen = resCRSaldo.ok ? await resCRSaldo.json() : null;
            const bolsaPosiciones = resBolsaPos.ok ? await resBolsaPos.json() : [];
            
            this.tbody.innerHTML = '';
            data.forEach(item => {
                const tr = document.createElement('tr');
                tr.dataset.id = item.id;
                tr.innerHTML = `
                    <td class="editable" data-field="concepto">${item.concepto}</td>
                    <td class="editable" data-field="cantidad"><strong>${this.formatCurrency(item.cantidad)}</strong></td>
                    <td>
                        <button class="editBtn btn-editar" title="${this.t('formularios.editar', 'Editar')}" style="margin-right:8px;">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button data-id="${item.id}" class="delBtn btn-eliminar" title="${this.t('formularios.eliminar', 'Eliminar')}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                `;
                this.tbody.appendChild(tr);
            });

            // Agregar cuenta remunerada vinculada como fila solo lectura
            if (crResumen && crResumen.cuenta) {
                const tr = document.createElement('tr');
                tr.dataset.auto = 'true';
                const labelCuenta = this.t('ingresos.cuenta_remunerada', 'Cuenta remunerada');
                const descripcion = crResumen.cuenta.descripcion || labelCuenta;
                tr.innerHTML = `
                    <td>${descripcion}</td>
                    <td><strong>${this.formatCurrency(crResumen.saldo)}</strong></td>
                    <td>—</td>
                `;
                this.tbody.appendChild(tr);
            }

            // Calcular valor actual de posiciones bolsa en paralelo
            const totalAssets = (await Promise.all(
                bolsaPosiciones.map(async (pos) => {
                    try {
                        const currentPrice = await window.getAssetPrice(pos.ticker);
                        const appliedPrice = Number.isFinite(currentPrice) ? currentPrice : (Number(pos.precio_medio) || 0);
                        return (Number(pos.cantidad) || 0) * appliedPrice;
                    } catch (_) {
                        return Number(pos.coste_total) || 0;
                    }
                })
            )).reduce((acc, value) => acc + (Number(value) || 0), 0);

            // Agregar fila con valor actual de la cartera de inversiones
            if (totalAssets > 0) {
                const trAssets = document.createElement('tr');
                trAssets.dataset.auto = 'true';
                const assetsLabel = this.t('ingresos.assets', 'Cartera inversiones');
                trAssets.innerHTML = `
                    <td>${assetsLabel}</td>
                    <td><strong>${this.formatCurrency(totalAssets)}</strong></td>
                    <td>—</td>
                `;
                this.tbody.appendChild(trAssets);
            }
            
            this.attachEvents();
        },
        
        attachEvents() {
            // Eliminar
            document.querySelectorAll('.delBtn').forEach(btn => {
                btn.onclick = async () => {
                    const confirmed = await showConfirm(this.t('formularios.confirmarEliminar', '¿Eliminar este elemento?'));
                    if (!confirmed) return;

                    try {
                        const res = await fetch('/delete/hucha', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id: btn.dataset.id })
                        });
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        this.loadData();
                        if (typeof notifySuccess === 'function') {
                            notifySuccess(this.t('mensajes.elementoEliminado', 'Elemento eliminado'));
                        }
                    } catch (error) {
                        console.error('Error eliminando hucha:', error);
                        if (typeof notifyError === 'function') {
                            notifyError(this.t('mensajes.errorEliminando', 'Error eliminando datos'));
                        }
                    }
                };
            });
            
            // Editar
            document.querySelectorAll('.editBtn').forEach(btn => {
                btn.onclick = () => this.editRow(btn.closest('tr'));
            });
        },
        
        editRow(tr) {
            const id = tr.dataset.id;
            const conceptoTd = tr.querySelector('[data-field="concepto"]');
            const cantidadTd = tr.querySelector('[data-field="cantidad"]');
            
            const oldConcepto = conceptoTd.textContent;
            const oldCantidad = this.parseAmount(cantidadTd.textContent);
            
            // Convertir a inputs
            conceptoTd.innerHTML = `<input type="text" value="${oldConcepto}" style="width:200px;">`;
            cantidadTd.innerHTML = `€ <input type="number" step="0.01" value="${oldCantidad}" style="width:100px;">`;
            
            // Cambiar botones
            const actionsCell = tr.querySelector('td:last-child');
            actionsCell.innerHTML = `
                <button class="saveBtn btn-success" title="${this.t('formularios.guardar', 'Guardar')}" style="margin-right:8px;">
                    <i class="fas fa-check"></i>
                </button>
                <button class="cancelBtn btn-secondary" title="${this.t('formularios.cancelar', 'Cancelar')}">
                    <i class="fas fa-times"></i>
                </button>
            `;
            
            // Guardar
            actionsCell.querySelector('.saveBtn').onclick = async () => {
                const newConcepto = conceptoTd.querySelector('input').value;
                const newCantidad = parseFloat(cantidadTd.querySelector('input').value);
                
                if (!newConcepto) {
                    showAlert(this.t('hucha.conceptoRequerido', 'El concepto es requerido'));
                    return;
                }
                if (isNaN(newCantidad) || newCantidad <= 0) {
                    showAlert(this.t('hucha.cantidadInvalida', 'La cantidad debe ser mayor a 0'));
                    return;
                }
                
                try {
                    const res = await fetch('/update/hucha', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id, concepto: newConcepto, cantidad: newCantidad })
                    });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);

                    this.loadData();
                    if (typeof cargarResumenPeriodos === 'function') cargarResumenPeriodos();
                    if (typeof notifySuccess === 'function') {
                        notifySuccess(this.t('mensajes.elementoActualizado', 'Cambios guardados'));
                    }
                } catch (error) {
                    console.error('Error actualizando hucha:', error);
                    if (typeof notifyError === 'function') {
                        notifyError(this.t('mensajes.errorGuardando', 'Error guardando datos'));
                    }
                }
            };
            
            // Cancelar
            actionsCell.querySelector('.cancelBtn').onclick = () => {
                this.loadData();
            };
        },
        
        async add(concepto, cantidad) {
            if (!concepto) {
                showAlert(this.t('hucha.conceptoRequerido', 'El concepto es requerido'));
                return;
            }
            if (isNaN(cantidad) || cantidad <= 0) {
                showAlert(this.t('hucha.cantidadInvalida', 'La cantidad debe ser mayor a 0'));
                return;
            }
            
            try {
                const res = await fetch('/add/hucha', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ concepto, cantidad })
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);

                this.loadData();
                if (typeof cargarResumenPeriodos === 'function') cargarResumenPeriodos();
                if (typeof notifySuccess === 'function') {
                    notifySuccess(this.t('mensajes.elementoCreado', 'Hucha guardada'));
                }
            } catch (error) {
                console.error('Error agregando hucha:', error);
                if (typeof notifyError === 'function') {
                    notifyError(this.t('mensajes.errorGuardando', 'Error guardando datos'));
                }
            }
        }
    };
    
    // ===== AGREGAR NUEVO ITEM =====
    const btnAgregar = document.getElementById('btnAgregarHucha');
    if (btnAgregar) {
        btnAgregar.onclick = async () => {
            const concepto = document.getElementById('conceptoHucha').value;
            const cantidad = parseFloat(document.getElementById('cantidadHucha').value);
            
            await huchaManager.add(concepto, cantidad);
            
            // Limpiar formulario
            document.getElementById('conceptoHucha').value = '';
            document.getElementById('cantidadHucha').value = '';
        };
    }
    
    // Cargar datos iniciales y esperar a que termine
    await huchaManager.loadData();

    // ===== SUBPESTAÑAS =====
    const botonesSubtab = document.querySelectorAll('#hucha .subtab-btn');
    const subtabs = document.querySelectorAll('#hucha .subtab');

    botonesSubtab.forEach(btn => {
        btn.addEventListener('click', () => {
            botonesSubtab.forEach(b => b.classList.remove('active'));
            subtabs.forEach(st => st.style.display = 'none');
            btn.classList.add('active');
            document.getElementById(btn.dataset.target).style.display = 'block';
        });
    });

    if (botonesSubtab.length > 0) {
        botonesSubtab[0].classList.add('active');
    }

    // ===== SUB-HUCHAS =====
    await cargarSubHuchas();
}

/**
 * Sub-huchas: huchas secundarias con aportación inicial, mensual y puntual
 */
async function cargarSubHuchas() {
    if (!huchaSubhuchasController && typeof huchaSubhuchasModule.createSubhuchasController === 'function') {
        huchaSubhuchasController = huchaSubhuchasModule.createSubhuchasController({
            showAlert,
            showConfirm,
            notifySuccess: window.notifySuccess,
            notifyError: window.notifyError,
            cargarResumenPeriodos
        });
    }

    if (huchaSubhuchasController && typeof huchaSubhuchasController.cargarSubHuchas === 'function') {
        await huchaSubhuchasController.cargarSubHuchas();
    }
}

// Inicialización al cargar DOM
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('tablaHucha')) {
        cargarHucha();
    }
});
