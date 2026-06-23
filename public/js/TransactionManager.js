/**
 * Clase base para gestionar transacciones (gastos, ingresos, impuestos)
 * Centraliza lógica común de CRUD, edición inline, formateo de montos
 */
class TransactionManager {
    constructor(config) {
        this.entityName = config.entityName; // 'gastos', 'ingresos', 'impuestos'
        this.entityNameSingular = config.entityNameSingular || config.entityName; // 'gasto', 'ingreso', 'impuesto' para endpoints
        this.endpoints = config.endpoints; // { puntuales, mensuales, delete, categorias }
        this.updateEndpoints = config.updateEndpoints || null; // { puntual, mensual, cuentaRemunerada }
        this.tables = config.tables; // { puntuales, mensuales } - selectores de tbody
        this.selects = config.selects; // { puntuales, mensuales } - selectores de categoria
        this.showOldFlag = config.showOldFlag || 'showOldItems'; // flag para filtrar antiguos
        this.i18nPrefix = config.i18nPrefix || 'formularios'; // prefijo para traducciones
        this.customColumns = config.customColumns || {}; // columnas personalizadas por tipo
        this.extraActions  = config.extraActions  || {}; // botones extra por tipo: { cuentaRemunerada: [{cls, icon, title}] }
        this.categoryType = config.categoryType; // 'gastos' o 'ingresos'
    }

    // ===== FORMATEO Y PARSING =====

    /** Escapa HTML para evitar XSS al insertar texto de usuario en innerHTML */
    escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const str = String(text);
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    formatCurrency(monto, options = {}) {
        if (typeof window.formatCurrency === 'function') {
            return window.formatCurrency(monto, options);
        }
        if (monto === null || monto === undefined) return '€0,00';
        return '€' + parseFloat(monto).toLocaleString('es-ES', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    parseAmount(str) {
        if (!str) return 0;
        let cleaned = str.replace(/[^\d.,-]/g, '');
        const lastComma = cleaned.lastIndexOf(',');
        const lastDot = cleaned.lastIndexOf('.');
        if (lastComma > lastDot) {
            cleaned = cleaned.replace(/\./g, '').replace(',', '.');
        } else {
            cleaned = cleaned.replace(/,/g, '');
        }
        return parseFloat(cleaned) || 0;
    }

    // ===== CARGAR CATEGORÍAS =====
    async loadCategories() {
        const res = await fetch('/categorias');
        const data = await res.json();
        const categories = data[this.categoryType] || [];

        Object.values(this.selects).forEach(selector => {
            const select = document.querySelector(selector);
            if (!select) return;
            
            select.innerHTML = '';
            categories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat.id;
                opt.textContent = cat.nombre;
                select.appendChild(opt);
            });
        });

        return categories;
    }

    // ===== CARGAR DATOS =====
    async loadData() {
        const res = await fetch('/dashboard');
        const data = await res.json();
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Cargar puntuales
        if (this.tables.puntuales && this.endpoints.puntuales) {
            const tbody = document.querySelector(this.tables.puntuales);
            if (tbody) {
                tbody.innerHTML = '';
                const items = data[this.endpoints.puntuales] || [];
                items.forEach(item => {
                    if (!this.shouldShowItem(item, today, 'puntual')) return;
                    const tr = this.createTableRow(item, 'puntual');
                    tbody.appendChild(tr);
                });
                this.attachRowEvents(tbody, 'puntual');
            }
        }

        // Cargar mensuales
        if (this.tables.mensuales && this.endpoints.mensuales) {
            const tbody = document.querySelector(this.tables.mensuales);
            if (tbody) {
                tbody.innerHTML = '';
                const items = data[this.endpoints.mensuales] || [];
                items.forEach(item => {
                    if (!this.shouldShowItem(item, today, 'mensual')) return;
                    const tr = this.createTableRow(item, 'mensual');
                    tbody.appendChild(tr);
                });
                this.attachRowEvents(tbody, 'mensual');
            }
        }

        // Cargar cuentaRemunerada
        if (this.tables.cuentaRemunerada && this.endpoints.cuentaRemunerada) {
            const tbody = document.querySelector(this.tables.cuentaRemunerada);
            if (tbody) {
                tbody.innerHTML = '';
                const items = data[this.endpoints.cuentaRemunerada] || [];
                items.forEach(item => {
                    if (!this.shouldShowItem(item, today, 'cuentaRemunerada')) return;
                    const tr = this.createTableRow(item, 'cuentaRemunerada');
                    tbody.appendChild(tr);
                });
                this.attachRowEvents(tbody, 'cuentaRemunerada');
            }
        }
    }

    // ===== FILTRO DE ITEMS ANTIGUOS =====
    shouldShowItem(item, today, type) {
        const showFlag = window[this.showOldFlag];
        if (showFlag) return true;

        if (type === 'puntual') {
            const itemDate = new Date(item.fecha);
            return itemDate > today;
        } else if (type === 'mensual' || type === 'cuentaRemunerada') {
            const endDate = this.parseEndDate(item.hasta);
            return endDate > today;
        }
        return true;
    }

    parseEndDate(value) {
        if (!value) return new Date(0);
        if (/^\d{4}-\d{2}$/.test(value)) {
            const [y, m] = value.split('-').map(Number);
            return new Date(y, m, 0);
        }
        return new Date(value);
    }

    // ===== CREAR FILA DE TABLA =====
    createTableRow(item, type) {
        const tr = document.createElement('tr');
        tr.dataset.id = item.id;
        tr.dataset.type = type;

        const columns = this.getColumns(type);
        const cells = columns.map(col => this.createCell(item, col)).join('');
        const actions = this.createActionButtons(item, type);

        tr.innerHTML = `${cells}${actions}`;
        return tr;
    }

    getColumns(type) {
        if (this.customColumns[type]) {
            return this.customColumns[type];
        }
        
        // Columnas por defecto
        if (type === 'puntual') {
            return ['fecha', 'descripcion', 'monto', 'categoria', 'notas'];
        } else if (type === 'mensual') {
            return ['desde', 'hasta', 'descripcion', 'monto', 'categoria', 'notas'];
        }
        return [];
    }

    createCell(item, column) {
        let content = item[column] !== undefined ? item[column] : '';
        
        // Formatear columnas especiales
        if (column === 'interes_neto') {
            const bruto = parseFloat(item.interes_generado) || 0;
            const ret = parseFloat(item.retencion) || 0;
            content = `<strong>${this.formatCurrency(bruto * (1 - ret / 100))}</strong>`;
        } else if (column === 'linked_to_bolsa') {
            const isLinked = Number(item.linked_to_bolsa) === 1;
            if (isLinked) {
                content = `<button class="btn-cr-vincular cr-linked" data-id="${item.id}" title="Vinculada a cartera \u2014 clic para desvincular" style="color:#6366f1;font-weight:600;white-space:nowrap;background:rgba(99,102,241,0.1);border:none;border-radius:6px;padding:3px 8px;cursor:pointer;">&#128279; Vinculada</button>`;
            } else {
                content = `<button class="btn-cr-vincular" data-id="${item.id}" title="Vincular esta cuenta a la cartera" style="color:#aaa;white-space:nowrap;background:none;border:1px dashed #ccc;border-radius:6px;padding:3px 8px;cursor:pointer;">Vincular</button>`;
            }
        } else if (column === 'monto' || column === 'bruto' || column === 'aportacion_mensual' || column === 'interes_generado' || column === 'monto_ajustado') {
            content = `<strong>${this.formatCurrency(content)}</strong>`;
        } else if (column === 'interes' || column === 'ipc_porcentaje' || column === 'retencion') {
            const num = parseFloat(content);
            content = Number.isNaN(num) ? '—' : `${num}%`;
        } else if (content === null || content === undefined) {
            content = (column === 'bruto' || column === 'aportacion_mensual' || column === 'interes_generado' || column === 'monto_ajustado' || column === 'ipc_porcentaje' || column === 'retencion') ? '—' : '';
        } else {
            // Texto plano de usuario: escapar para prevenir XSS
            content = this.escapeHtml(content);
        }

        return `<td class="editable" data-field="${column}">${content}</td>`;
    }

    createActionButtons(item, type = '') {
        const editTitle   = this.t('formularios.editar',   'Editar');
        const deleteTitle = this.t('formularios.eliminar', 'Eliminar');

        const extras = (this.extraActions[type] || []).map(a =>
            `<button class="${a.cls}" data-id="${item.id}" title="${a.title}" style="margin-right:4px;">`+
            `<i class="fas ${a.icon}"></i></button>`
        ).join('');

        return `
            <td>
                ${extras}
                <button class="editBtn btn-editar" title="${editTitle}" style="margin-right:8px;">
                    <i class="fas fa-edit"></i>
                </button>
                <button data-id="${item.id}" class="delBtn btn-eliminar" title="${deleteTitle}">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
    }

    // ===== EVENTOS DE FILA =====
    attachRowEvents(tbody, type) {
        // Eliminar
        tbody.querySelectorAll('.delBtn').forEach(btn => {
            btn.onclick = () => this.deleteItem(btn.dataset.id, type);
        });

        // Editar
        tbody.querySelectorAll('.editBtn').forEach(btn => {
            btn.onclick = () => this.editRow(btn.closest('tr'), type);
        });
    }

    // ===== ELIMINAR =====
    async deleteItem(id, type) {
        const confirmed = await showConfirm(this.t('formularios.confirmarEliminar', '¿Eliminar este elemento?'));
        if (!confirmed) return;

        try {
            const endpoint = this.endpoints.delete[type];
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            await this.loadData();
            if (typeof cargarResumenPeriodos === 'function') cargarResumenPeriodos();
            if (typeof notifySuccess === 'function') {
                notifySuccess(this.t('mensajes.elementoEliminado', 'Elemento eliminado'));
            }
        } catch (error) {
            console.error('Error eliminando elemento:', error);
            if (typeof notifyError === 'function') {
                notifyError(this.t('mensajes.errorEliminando', 'Error eliminando datos'));
            }
        }
    }

    // ===== EDITAR INLINE =====
    async editRow(tr, type) {
        const id = tr.dataset.id;
        const cells = tr.querySelectorAll('td.editable');
        const originalData = {};
        const categories = await this.loadCategories();

        // Guardar datos originales y convertir a inputs
        cells.forEach(cell => {
            const field = cell.dataset.field;
            originalData[field] = cell.textContent.trim();
            
            const input = this.createEditInput(field, cell.textContent.trim(), categories);
            cell.innerHTML = '';
            cell.appendChild(input);
        });

        // Cambiar botones a Guardar/Cancelar
        const actionsCell = tr.querySelector('td:last-child');
        const saveTitle = this.t('formularios.guardar', 'Guardar');
        const cancelTitle = this.t('formularios.cancelar', 'Cancelar');
        
        actionsCell.innerHTML = `
            <button class="saveBtn btn-success" title="${saveTitle}" style="margin-right:8px;">
                <i class="fas fa-check"></i>
            </button>
            <button class="cancelBtn btn-secondary" title="${cancelTitle}">
                <i class="fas fa-times"></i>
            </button>
        `;

        // Evento guardar
        actionsCell.querySelector('.saveBtn').onclick = async () => {
            const newData = {};
            cells.forEach(cell => {
                const field = cell.dataset.field;
                const input = cell.querySelector('input, select');
                
                // Saltar campos de solo lectura
                if (field === 'interes_generado' || field === 'monto_ajustado' || field === 'interes_neto' || field === 'linked_to_bolsa') return;
                
                let value = input.value;
                
                if (field === 'monto' || field === 'bruto' || field === 'aportacion_mensual') {
                    value = this.parseAmount(value);
                } else if (field === 'interes') {
                    value = parseFloat(value) || null;
                } else if (field === 'retencion') {
                    value = parseFloat(value);
                    if (Number.isNaN(value)) value = 0;
                } else if (field === 'ipc_porcentaje') {
                    value = parseFloat(value);
                    if (Number.isNaN(value)) value = 0;
                } else if (field === 'categoria') {
                    // Guardar el nombre de categoría para mostrar y el ID para enviar al servidor
                    newData['categoria_id'] = input.value;
                    value = input.options[input.selectedIndex].textContent;
                }
                
                newData[field] = value;
            });

            // Validaciones específicas para cuentaRemunerada
            if (type === 'cuentaRemunerada') {
                const validarMes = (valor) => /^\d{4}-(0[1-9]|1[0-2])$/.test(valor);
                if (!validarMes(newData.desde)) {
                    showAlert(this.t('ingresos.formatoDesde', "El campo 'Desde' debe tener formato YYYY-MM"));
                    return;
                }
                if (!validarMes(newData.hasta)) {
                    showAlert(this.t('ingresos.formatoHasta', "El campo 'Hasta' debe tener formato YYYY-MM"));
                    return;
                }
                if (newData.desde > newData.hasta) {
                    showAlert(this.t('ingresos.desdeNoMayorHasta', "El mes 'desde' no puede ser mayor que 'hasta'"));
                    return;
                }
            }

            try {
                await this.updateItem(id, newData, type);
                await this.loadData();
                if (typeof cargarResumenPeriodos === 'function') cargarResumenPeriodos();
                if (typeof notifySuccess === 'function') {
                    notifySuccess(this.t('mensajes.elementoActualizado', 'Cambios guardados'));
                }
            } catch (error) {
                console.error('Error actualizando elemento:', error);
                if (typeof notifyError === 'function') {
                    notifyError(this.t('mensajes.errorGuardando', 'Error guardando datos'));
                }
            }
        };

        // Evento cancelar
        actionsCell.querySelector('.cancelBtn').onclick = async () => {
            await this.loadData();
        };
    }

    createEditInput(field, value, categories) {
        let input;

        // Campos de solo lectura (no editables)
        if (field === 'interes_generado' || field === 'monto_ajustado' || field === 'interes_neto' || field === 'linked_to_bolsa') {
            input = document.createElement('span');
            input.textContent = value;
            return input;
        }

        if (field === 'fecha') {
            input = document.createElement('input');
            input.type = 'date';
            input.value = value;
            input.style.width = '100%';
        } else if (field === 'desde' || field === 'hasta') {
            input = document.createElement('input');
            input.type = 'text';
            input.value = value;
            input.placeholder = 'YYYY-MM';
            input.maxLength = 7;
            input.style.width = '100%';
        } else if (field === 'categoria') {
            input = document.createElement('select');
            input.style.width = '100%';
            categories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat.id;
                opt.textContent = cat.nombre;
                if (cat.nombre === value) opt.selected = true;
                input.appendChild(opt);
            });
        } else if (field === 'monto' || field === 'bruto' || field === 'aportacion_mensual') {
            input = document.createElement('input');
            input.type = 'number';
            input.step = '0.01';
            input.value = this.parseAmount(value);
            input.style.width = '100%';
        } else if (field === 'interes' || field === 'ipc_porcentaje' || field === 'retencion') {
            input = document.createElement('input');
            input.type = 'number';
            input.step = '0.01';
            input.value = parseFloat(value) || '';
            input.style.width = '100%';
            if (field === 'retencion') {
                input.min = '0';
                input.max = '100';
            }
        } else {
            input = document.createElement('input');
            input.type = 'text';
            input.value = value;
            input.style.width = '100%';
        }

        return input;
    }

    // ===== ACTUALIZAR =====
    async updateItem(id, data, type) {
        const endpoint = this.updateEndpoints?.[type] || (type === 'puntual' 
            ? `/update/${this.entityNameSingular}_puntual`
            : type === 'mensual'
            ? `/update/${this.entityNameSingular}_mensual`
            : `/update/cuenta_remunerada`);

        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, ...data })
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
    }

    // ===== TRADUCCIONES =====
    t(key, fallback = '') {
        if (typeof gestorIdiomas !== 'undefined') {
            const text = gestorIdiomas.obtenerTexto(key);
            if (text !== key) return text;
        }
        return fallback || key;
    }

    // ===== INIT =====
    async init() {
        await this.loadCategories();
        await this.loadData();
    }
}

// Exportar para uso global
window.TransactionManager = TransactionManager;
