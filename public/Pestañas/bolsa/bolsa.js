/**
 * Bolsa module — operaciones de bolsa, dividendos y cartera
 * Usa API.fetch (compatible con web y Electron)
 */

// ── State ─────────────────────────────────────────────────────────────
let operaciones = [];
let dividendos = [];
let posiciones = [];
let resumen = {};
const priceCache = {};

// ── Helpers ───────────────────────────────────────────────────────────
function fmt(val, decimals = 2) {
    const n = Number(val);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + ' €';
}

function fmtNum(val, decimals = 4) {
    const n = Number(val);
    return Number.isFinite(n) ? n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: decimals }) : '—';
}

function fmtPct(val) {
    const n = Number(val);
    if (!Number.isFinite(n)) return '—';
    const sign = n >= 0 ? '+' : '';
    return `${sign}${n.toFixed(2)} %`;
}

async function getPrice(ticker) {
    if (!ticker) return null;
    const norm = ticker.toUpperCase();
    if (priceCache[norm] && Date.now() - priceCache[norm].ts < 5 * 60 * 1000) return priceCache[norm].price;
    try {
        const res = await fetch(`/asset-price/${encodeURIComponent(norm)}`);
        if (res.ok) {
            const data = await res.json();
            const price = Number(data?.currentPrice);
            priceCache[norm] = { price: Number.isFinite(price) ? price : null, ts: Date.now() };
            return priceCache[norm].price;
        }
    } catch (_) {}
    return null;
}

// ── Load data ─────────────────────────────────────────────────────────
async function loadBolsaData() {
    try {
        const [opRes, divRes, posRes, resRes] = await Promise.all([
            fetch('/bolsa/operaciones').then(r => r.json()),
            fetch('/bolsa/dividendos').then(r => r.json()),
            fetch('/bolsa/posiciones').then(r => r.json()),
            fetch('/bolsa/resumen').then(r => r.json())
        ]);
        operaciones = opRes || [];
        dividendos = divRes || [];
        posiciones = posRes || [];
        resumen = resRes || {};
    } catch (err) {
        console.error('Error cargando datos de bolsa:', err);
        operaciones = []; dividendos = []; posiciones = []; resumen = {};
    }
}

// ── Render cartera ────────────────────────────────────────────────────
async function renderCartera() {
    const tbody = document.getElementById('tbodyCartera');
    if (!tbody) return;

    // KPI cards
    document.getElementById('bolsaTotalInvertido').textContent = fmt(resumen.total_invertido);
    document.getElementById('bolsaDividendosTotal').textContent = fmt(resumen.total_dividendos);
    document.getElementById('bolsaComisiones').textContent = fmt(resumen.total_comisiones);

    tbody.innerHTML = `<tr><td colspan="10" class="text-center">${gestorIdiomas?.obtenerTexto('bolsa.obteniendoPrecios') || 'Obteniendo precios...'}</td></tr>`;

    let totalValorActual = 0;
    const rows = [];

    for (const pos of posiciones) {
        const precio = await getPrice(pos.ticker);
        const valorActual = precio !== null ? precio * pos.cantidad : null;
        const pnl = valorActual !== null ? valorActual - pos.coste_total : null;
        const pnlPct = pnl !== null && pos.coste_total > 0 ? (pnl / pos.coste_total) * 100 : null;
        if (valorActual !== null) totalValorActual += valorActual;

        const pnlClass = pnl === null ? '' : (pnl >= 0 ? 'text-green' : 'text-red');

        rows.push(`<tr>
            <td><strong>${pos.ticker}</strong></td>
            <td>${pos.empresa || '—'}</td>
            <td>${fmtNum(pos.cantidad)}</td>
            <td>${fmt(pos.precio_medio)}</td>
            <td>${fmt(pos.coste_total)}</td>
            <td>${precio !== null ? fmt(precio) : '—'}</td>
            <td>${valorActual !== null ? fmt(valorActual) : '—'}</td>
            <td class="${pnlClass}">${pnl !== null ? fmt(pnl) : '—'}</td>
            <td class="${pnlClass}">${pnlPct !== null ? fmtPct(pnlPct) : '—'}</td>
            <td>${fmt(pos.dividendos_netos)}</td>
        </tr>`);
    }

    tbody.innerHTML = rows.length ? rows.join('') : `<tr><td colspan="10" class="text-center text-muted">${gestorIdiomas?.obtenerTexto('bolsa.sinPosiciones') || 'Sin posiciones abiertas'}</td></tr>`;

    const pnlTotal = totalValorActual - (resumen.total_invertido || 0);
    document.getElementById('bolsaValorActual').textContent = fmt(totalValorActual);
    const pnlEl = document.getElementById('bolsaPnl');
    pnlEl.textContent = fmt(pnlTotal);
    pnlEl.style.color = pnlTotal >= 0 ? 'var(--color-ingreso, #22c55e)' : 'var(--color-gasto, #ef4444)';
}

// ── Render operaciones ────────────────────────────────────────────────
function renderOperaciones() {
    const tbody = document.getElementById('tbodyOperaciones');
    if (!tbody) return;

    if (!operaciones.length) {
        tbody.innerHTML = `<tr><td colspan="10" class="text-center text-muted">${gestorIdiomas?.obtenerTexto('bolsa.sinOperaciones') || 'Sin operaciones registradas'}</td></tr>`;
        return;
    }

    tbody.innerHTML = operaciones.map(op => {
        const total = op.cantidad * op.precio_unitario + (op.comision || 0);
        const tipoClass = op.tipo === 'compra' ? 'text-green' : 'text-red';
        return `<tr data-id="${op.id}">
            <td><span class="${tipoClass}">${op.tipo === 'compra' ? `▲ ${gestorIdiomas?.obtenerTexto('inversiones.compra') || 'Compra'}` : `▼ ${gestorIdiomas?.obtenerTexto('inversiones.venta') || 'Venta'}`}</span></td>
            <td><strong>${op.ticker}</strong></td>
            <td>${op.empresa || '—'}</td>
            <td>${op.fecha}</td>
            <td>${fmtNum(op.cantidad)}</td>
            <td>${fmt(op.precio_unitario)}</td>
            <td>${fmt(op.comision || 0)}</td>
            <td>${fmt(total)}</td>
            <td>${op.notas || '—'}</td>
            <td>
                <button class="btn-icon btn-delete-op" data-id="${op.id}" title="Eliminar"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('');
}

// ── Render dividendos ─────────────────────────────────────────────────
function renderDividendos() {
    const tbody = document.getElementById('tbodyDividendos');
    if (!tbody) return;

    if (!dividendos.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">${gestorIdiomas?.obtenerTexto('bolsa.sinDividendos') || 'Sin dividendos registrados'}</td></tr>`;
        return;
    }

    tbody.innerHTML = dividendos.map(d => {
        const neto = (d.importe_bruto || 0) - (d.retencion || 0);
        return `<tr data-id="${d.id}">
            <td><strong>${d.ticker}</strong></td>
            <td>${d.empresa || '—'}</td>
            <td>${d.fecha}</td>
            <td>${fmt(d.importe_bruto)}</td>
            <td>${fmt(d.retencion || 0)}</td>
            <td>${fmt(neto)}</td>
            <td>${d.notas || '—'}</td>
            <td>
                <button class="btn-icon btn-delete-div" data-id="${d.id}" title="Eliminar"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('');
}

// ── Actions ────────────────────────────────────────────────────────────
async function addOperacion() {
    const tipo     = document.getElementById('tipoOperacion').value;
    const ticker   = document.getElementById('tickerOperacion').value.trim().toUpperCase();
    const empresa  = document.getElementById('empresaOperacion').value.trim();
    const fecha    = document.getElementById('fechaOperacion').value;
    const cantidad = parseFloat(document.getElementById('cantidadOperacion').value);
    const precio   = parseFloat(document.getElementById('precioOperacion').value);
    const comision = parseFloat(document.getElementById('comisionOperacion').value) || 0;
    const notas    = document.getElementById('notasOperacion').value.trim();

    if (!ticker || !fecha || !cantidad || !precio) {
        alert(gestorIdiomas?.obtenerTexto('bolsa.camposObligatorios') || 'Ticker, fecha, cantidad y precio son obligatorios.');
        return;
    }

    try {
        const res = await fetch('/bolsa/operaciones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tipo, ticker, empresa, fecha, cantidad, precio_unitario: precio, comision, notas })
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
        // Reset fields
        ['tickerOperacion', 'empresaOperacion', 'fechaOperacion', 'cantidadOperacion', 'precioOperacion', 'comisionOperacion', 'notasOperacion'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = '';
        });
        await refreshAll();
    } catch (err) { alert('Error: ' + err.message); }
}

async function deleteOperacion(id) {
    const msg = gestorIdiomas?.obtenerTexto('bolsa.confirmarEliminarOp') || '¿Eliminar esta operación?';
    if (!confirm(msg)) return;
    try {
        await fetch(`/bolsa/operaciones/${id}`, { method: 'DELETE' });
        await refreshAll();
    } catch (err) { alert('Error: ' + err.message); }
}

async function addDividendo() {
    const ticker  = document.getElementById('tickerDividendo').value.trim().toUpperCase();
    const empresa = document.getElementById('empresaDividendo').value.trim();
    const fecha   = document.getElementById('fechaDividendo').value;
    const bruto   = parseFloat(document.getElementById('importeBrutoDividendo').value);
    const ret     = parseFloat(document.getElementById('retencionDividendo').value) || 0;
    const notas   = document.getElementById('notasDividendo').value.trim();

    if (!ticker || !fecha || !bruto) {
        alert(gestorIdiomas?.obtenerTexto('bolsa.camposDividendoObligatorios') || 'Ticker, fecha e importe bruto son obligatorios.');
        return;
    }

    try {
        const res = await fetch('/bolsa/dividendos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticker, empresa, fecha, importe_bruto: bruto, retencion: ret, notas })
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
        ['tickerDividendo', 'empresaDividendo', 'fechaDividendo', 'importeBrutoDividendo', 'retencionDividendo', 'notasDividendo'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = '';
        });
        await refreshAll();
    } catch (err) { alert('Error: ' + err.message); }
}

async function deleteDividendo(id) {
    const msg = gestorIdiomas?.obtenerTexto('bolsa.confirmarEliminarDiv') || '¿Eliminar este dividendo?';
    if (!confirm(msg)) return;
    try {
        await fetch(`/bolsa/dividendos/${id}`, { method: 'DELETE' });
        await refreshAll();
    } catch (err) { alert('Error: ' + err.message); }
}

async function refreshAll() {
    await loadBolsaData();
    renderOperaciones();
    renderDividendos();
    await renderCartera();
}

// ── Init ───────────────────────────────────────────────────────────────
async function initBolsa() {
    await refreshAll();

    const btnOp = document.getElementById('btnAgregarOperacion');
    if (btnOp) btnOp.addEventListener('click', addOperacion);

    const btnDiv = document.getElementById('btnAgregarDividendo');
    if (btnDiv) btnDiv.addEventListener('click', addDividendo);

    // Set today's date as default for date inputs
    const today = new Date().toISOString().slice(0, 10);
    ['fechaOperacion', 'fechaDividendo'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.value) el.value = today;
    });

    // Delegated delete buttons
    document.getElementById('tbodyOperaciones')?.addEventListener('click', e => {
        const btn = e.target.closest('.btn-delete-op');
        if (btn) deleteOperacion(btn.dataset.id);
    });

    document.getElementById('tbodyDividendos')?.addEventListener('click', e => {
        const btn = e.target.closest('.btn-delete-div');
        if (btn) deleteDividendo(btn.dataset.id);
    });

    // Subtab switching
    document.querySelectorAll('#bolsa .subtab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#bolsa .subtab-btn').forEach(b => b.classList.remove('active-subtab'));
            document.querySelectorAll('#bolsa .subtab').forEach(s => s.classList.add('display-none'));
            btn.classList.add('active-subtab');
            const target = document.getElementById(btn.dataset.target);
            if (target) target.classList.remove('display-none');
        });
    });
}

// Export for tab loader
if (typeof module !== 'undefined') module.exports = { initBolsa };
