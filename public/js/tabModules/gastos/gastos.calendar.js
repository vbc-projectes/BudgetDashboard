function initGastosCalendar() {
    let calYear = new Date().getFullYear();
    let calMonth = new Date().getMonth() + 1;
    let calData = null;

    async function loadCalData() {
        try {
            const res = await fetch('/dashboard');
            if (!res.ok) return;
            calData = await res.json();
            renderCalendar();
        } catch (_) {}
    }

    // Simplified IPC adjustment for frontend display (full calculation is backend-side)
    function calcMontoIpcFront(monto, ipcPorcentaje, desdeYYYYMM, targetYYYYMM) {
        if (!ipcPorcentaje || ipcPorcentaje <= 0) return monto;
        const dyear = parseInt((desdeYYYYMM || '').split('-')[0]);
        const tyear = parseInt((targetYYYYMM || '').split('-')[0]);
        if (!dyear || !tyear || tyear <= dyear) return monto;
        return monto * Math.pow(1 + ipcPorcentaje / 100, tyear - dyear);
    }

    function fmtEur(n) {
        return new Intl.NumberFormat('es-ES', {
            style: 'currency', currency: 'EUR',
            minimumFractionDigits: 2, maximumFractionDigits: 2
        }).format(n || 0);
    }

    function getMonthData(year, month) {
        if (!calData) return { puntuales: [], mensuales: [], totalP: 0, totalM: 0, total: 0 };
        const mesStr = `${year}-${String(month).padStart(2, '0')}`;

        const puntuales = (calData.gastos_puntuales || []).filter(g =>
            g.fecha && g.fecha.startsWith(mesStr + '-')
        );

        const mensuales = (calData.gastos_mensuales || [])
            .filter(g => {
                const desde = g.desde || '0000-00';
                const hasta = g.hasta || '9999-12';
                return mesStr >= desde && mesStr <= hasta;
            })
            .map(g => ({
                ...g,
                monto_mes: calcMontoIpcFront(g.monto, g.ipc_porcentaje, g.desde, mesStr)
            }));

        const totalP = puntuales.reduce((s, g) => s + (g.monto || 0), 0);
        const totalM = mensuales.reduce((s, g) => s + (g.monto_mes || 0), 0);
        return { puntuales, mensuales, totalP, totalM, total: totalP + totalM };
    }

    function renderCalendar() {
        const calTitle = document.getElementById('gastoCalTitle');
        if (!calTitle) return;

        const { puntuales, mensuales, totalP, totalM, total } = getMonthData(calYear, calMonth);

        // Title
        const dateForTitle = new Date(calYear, calMonth - 1, 1);
        const monthLabel = dateForTitle.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
        const monthLabelCap = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
        calTitle.textContent = monthLabelCap;

        // Summary bar (mensuales activos este mes)
        const summary = document.getElementById('gastoCalSummary');
        if (summary) {
            if (mensuales.length > 0) {
                summary.innerHTML = `
                    <div class="gcal-summary-inner">
                        <span class="gcal-summary-icon"><i class="fas fa-rotate"></i></span>
                        <span class="gcal-summary-label">Recurrentes:</span>
                        <div class="gcal-chips">
                            ${mensuales.map(m => `
                                <span class="gcal-chip" title="${escHtml(m.descripcion)}">
                                    ${escHtml(m.descripcion)} <strong>${fmtEur(m.monto_mes)}</strong>
                                </span>`).join('')}
                        </div>
                    </div>`;
            } else {
                summary.innerHTML = `
                    <div class="gcal-summary-inner gcal-summary-empty">
                        <i class="fas fa-rotate"></i> Sin gastos recurrentes este mes
                    </div>`;
            }
        }

        // Build day → expenses map
        const dayMap = {};
        for (const g of puntuales) {
            const day = parseInt(g.fecha.split('-')[2]);
            if (!dayMap[day]) dayMap[day] = [];
            dayMap[day].push(g);
        }

        // Calendar grid
        const grid = document.getElementById('gastoCalGrid');
        if (grid) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayYear = today.getFullYear();
            const todayMonth = today.getMonth() + 1;
            const todayDay = today.getDate();
            const isCurrentViewMonth = todayYear === calYear && todayMonth === calMonth;

            const firstDayOfWeek = new Date(calYear, calMonth - 1, 1).getDay();
            const offset = (firstDayOfWeek + 6) % 7; // Monday = 0
            const daysInMonth = new Date(calYear, calMonth, 0).getDate();

            let html = `
                <div class="gcal-weekdays">
                    ${['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d =>
                        `<div class="gcal-weekday">${d}</div>`).join('')}
                </div>
                <div class="gcal-days">`;

            for (let i = 0; i < offset; i++) {
                html += '<div class="gcal-day is-empty"></div>';
            }

            for (let d = 1; d <= daysInMonth; d++) {
                const expenses = dayMap[d] || [];
                const dayTotal = expenses.reduce((s, g) => s + (g.monto || 0), 0);

                const cellDate = new Date(calYear, calMonth - 1, d);
                const isPast = cellDate < today;
                const isToday = isCurrentViewMonth && d === todayDay;

                let cls = 'gcal-day';
                if (isToday) cls += ' is-today';
                else if (isPast) cls += ' is-past';
                else cls += ' is-future';
                if (expenses.length > 0) cls += ' has-expense';

                const tooltipLines = expenses.map(g =>
                    `${g.descripcion}: ${fmtEur(g.monto)}`
                );

                html += `<div class="${cls}" data-day="${d}"${tooltipLines.length ? ` title="${escAttr(tooltipLines.join('\n'))}"` : ''}>
                    <span class="gcal-day-num">${d}</span>
                    ${expenses.length > 0 ? `
                        <span class="gcal-day-amount">${fmtEur(dayTotal)}</span>
                        <span class="gcal-day-dot"></span>` : ''}
                </div>`;
            }

            html += '</div>';
            grid.innerHTML = html;

            grid.querySelectorAll('.gcal-day.has-expense').forEach(cell => {
                cell.addEventListener('click', () => {
                    const d = parseInt(cell.dataset.day);
                    showDayDetail(d, dayMap[d] || []);
                });
            });
        }

        // Footer totals
        const footer = document.getElementById('gastoCalFooter');
        if (footer) {
            footer.innerHTML = `
                <div class="gcal-footer-inner">
                    <div class="gcal-footer-total">
                        <span class="gcal-footer-label">Total ${monthLabel.split(' ')[0]}:</span>
                        <span class="gcal-footer-value">${fmtEur(total)}</span>
                    </div>
                    <div class="gcal-footer-breakdown">
                        <span class="gcal-bd-item"><i class="fas fa-calendar-day"></i> Puntuales: ${fmtEur(totalP)}</span>
                        <span class="gcal-bd-sep">+</span>
                        <span class="gcal-bd-item"><i class="fas fa-rotate"></i> Recurrentes: ${fmtEur(totalM)}</span>
                    </div>
                </div>`;
        }

        renderProximos();
    }

    function renderProximos() {
        const container = document.getElementById('gastoCalProximos');
        if (!container || !calData) return;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const limitDate = new Date(today);
        limitDate.setMonth(limitDate.getMonth() + 3);

        const upcoming = (calData.gastos_puntuales || [])
            .filter(g => {
                const d = new Date(g.fecha + 'T00:00:00');
                return d >= today && d <= limitDate;
            })
            .map(g => ({ ...g, _date: new Date(g.fecha + 'T00:00:00') }))
            .sort((a, b) => a._date - b._date);

        const totalProximos = upcoming.reduce((s, g) => s + (g.monto || 0), 0);

        const headerHtml = `
            <div class="gcal-proximos-header">
                <h4><i class="fas fa-clock"></i> Próximos gastos <span class="gcal-proximos-range">(3 meses)</span></h4>
                ${upcoming.length > 0 ? `<span class="gcal-proximos-total">${fmtEur(totalProximos)}</span>` : ''}
            </div>`;

        if (upcoming.length === 0) {
            container.innerHTML = headerHtml + `
                <div class="gcal-proximos-empty">
                    <i class="fas fa-check-circle"></i> Sin gastos puntuales próximos
                </div>`;
            return;
        }

        container.innerHTML = headerHtml + `
            <div class="gcal-proximos-list">
                ${upcoming.map(g => {
                    const diffMs = g._date - today;
                    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                    const dateLabel = g._date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
                    const daysLabel = diffDays === 0 ? 'Hoy' : diffDays === 1 ? 'Mañana' : `${diffDays}d`;
                    const urgency = diffDays <= 3 ? 'urgent' : diffDays <= 7 ? 'soon' : '';
                    return `
                        <div class="gcal-proximo-item ${urgency}">
                            <span class="gcal-proximo-date">${dateLabel}</span>
                            <span class="gcal-proximo-badge ${urgency}">${daysLabel}</span>
                            <span class="gcal-proximo-desc">${escHtml(g.descripcion)}</span>
                            ${g.categoria ? `<span class="gcal-proximo-cat">${escHtml(g.categoria)}</span>` : ''}
                            <span class="gcal-proximo-amount">${fmtEur(g.monto)}</span>
                        </div>`;
                }).join('')}
            </div>`;
    }

    function showDayDetail(day, expenses) {
        const existing = document.getElementById('gastoCalDayModal');
        if (existing) existing.remove();

        const dateObj = new Date(calYear, calMonth - 1, day);
        const dateLabel = dateObj.toLocaleDateString('es-ES', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });
        const dateLabelCap = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);
        const total = expenses.reduce((s, g) => s + (g.monto || 0), 0);

        const modal = document.createElement('div');
        modal.id = 'gastoCalDayModal';
        modal.className = 'gcal-day-modal';
        modal.innerHTML = `
            <div class="gcal-day-modal-inner">
                <div class="gcal-day-modal-header">
                    <h4>${dateLabelCap}</h4>
                    <button class="gcal-day-modal-close" type="button" aria-label="Cerrar">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="gcal-day-modal-body">
                    ${expenses.map(g => `
                        <div class="gcal-day-modal-item">
                            <span class="gcal-modal-desc">${escHtml(g.descripcion)}</span>
                            ${g.categoria ? `<span class="gcal-modal-cat">${escHtml(g.categoria)}</span>` : ''}
                            <span class="gcal-modal-amount">${fmtEur(g.monto)}</span>
                        </div>`).join('')}
                </div>
                <div class="gcal-day-modal-footer">
                    Total del día: <strong>${fmtEur(total)}</strong>
                </div>
            </div>`;

        modal.querySelector('.gcal-day-modal-close').onclick = () => modal.remove();
        modal.onclick = e => { if (e.target === modal) modal.remove(); };
        document.body.appendChild(modal);
    }

    function escHtml(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function escAttr(str) {
        return String(str || '').replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
    }

    // Navigation
    document.getElementById('gastoCalPrev')?.addEventListener('click', () => {
        calMonth--;
        if (calMonth < 1) { calMonth = 12; calYear--; }
        renderCalendar();
    });
    document.getElementById('gastoCalNext')?.addEventListener('click', () => {
        calMonth++;
        if (calMonth > 12) { calMonth = 1; calYear++; }
        renderCalendar();
    });
    document.getElementById('gastoCalToday')?.addEventListener('click', () => {
        const now = new Date();
        calYear = now.getFullYear();
        calMonth = now.getMonth() + 1;
        renderCalendar();
    });

    // Expose refresh so gastos.js can call it after add/edit/delete
    window.gastoCalendarRefresh = loadCalData;

    loadCalData();
}
