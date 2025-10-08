// Funciones de bÃºsqueda y paginaciÃ³n ultraligeras

// Global pagination state
const PAGINATION_STATE = {
    pendientes: { currentPage: 1, itemsPerPage: 10, filteredData: [], allData: [] },
    clientes: { currentPage: 1, itemsPerPage: 10, filteredData: [], allData: [] },
    creditos: { currentPage: 1, itemsPerPage: 10, filteredData: [], allData: [] },
    pagos: { currentPage: 1, itemsPerPage: 10, filteredData: [], allData: [] }
};

// Filter data by search term
function filterData(data, searchTerm, searchFields) {
    if (!searchTerm || searchTerm.trim() === '') return data;
    
    const term = searchTerm.toLowerCase().trim();
    return data.filter(item => {
        return searchFields.some(field => {
            const value = getNestedValue(item, field);
            return value && String(value).toLowerCase().includes(term);
        });
    });
}

// Get nested value from object (supports 'clients.nombre')
function getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
}

// Render pagination controls
function renderPagination(viewName, totalItems) {
    const state = PAGINATION_STATE[viewName];
    const totalPages = Math.ceil(totalItems / state.itemsPerPage);
    const container = document.getElementById(`pagination${viewName.charAt(0).toUpperCase() + viewName.slice(1)}`);
    
    if (!container || totalPages <= 1) {
        if (container) container.style.display = 'none';
        return;
    }
    
    container.style.display = 'flex';
    container.style.justifyContent = 'center';
    container.style.alignItems = 'center';
    container.style.gap = '8px';
    
    let html = `
        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: center;">
            <button 
                onclick="changePage('${viewName}', ${state.currentPage - 1})"
                ${state.currentPage === 1 ? 'disabled' : ''}
                style="padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; background: white; cursor: pointer; font-weight: bold; ${state.currentPage === 1 ? 'opacity: 0.5; cursor: not-allowed;' : ''}">
                ←
            </button>
            <span style="font-size: 14px; color: #666; padding: 0 8px;">
                Página ${state.currentPage} de ${totalPages}
            </span>
            <button 
                onclick="changePage('${viewName}', ${state.currentPage + 1})"
                ${state.currentPage === totalPages ? 'disabled' : ''}
                style="padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; background: white; cursor: pointer; font-weight: bold; ${state.currentPage === totalPages ? 'opacity: 0.5; cursor: not-allowed;' : ''}">
                →
            </button>
        </div>
        <div style="text-align: center; margin-top: 5px; font-size: 13px; color: #888;">
            ${totalItems} resultados
        </div>
    `;
    
    container.innerHTML = html;
}

// Change page
function changePage(viewName, newPage) {
    const state = PAGINATION_STATE[viewName];
    const totalPages = Math.ceil(state.filteredData.length / state.itemsPerPage);
    
    if (newPage < 1 || newPage > totalPages) return;
    
    state.currentPage = newPage;
    
    // Call the appropriate render function
    switch(viewName) {
        case 'pendientes':
            renderPendientes(state.filteredData);
            break;
        case 'clientes':
            renderClientes(state.filteredData);
            break;
        case 'creditos':
            renderCreditos(state.filteredData);
            break;
        case 'pagos':
            renderPagos(state.filteredData);
            break;
    }
}

// Get paginated data
function getPaginatedData(viewName, data) {
    const state = PAGINATION_STATE[viewName];
    const startIndex = (state.currentPage - 1) * state.itemsPerPage;
    const endIndex = startIndex + state.itemsPerPage;
    return data.slice(startIndex, endIndex);
}

// Setup search listener
function setupSearchListener(viewName, searchFields, renderFunction) {
    const searchInput = document.getElementById(`search${viewName.charAt(0).toUpperCase() + viewName.slice(1)}`);
    if (!searchInput) return;
    
    searchInput.addEventListener('input', (e) => {
        const state = PAGINATION_STATE[viewName];
        state.filteredData = filterData(state.allData, e.target.value, searchFields);
        state.currentPage = 1; // Reset to first page
        renderFunction(state.filteredData);
    });
}

// ==================== RENDER FUNCTIONS ====================

// Render Pendientes (Cuotas Pendientes)
function renderPendientes(allData) {
    const container = document.getElementById('pendingQuotasList');
    const state = PAGINATION_STATE.pendientes;
    
    state.filteredData = allData;
    const paginatedData = getPaginatedData('pendientes', state.filteredData);
    
    if (paginatedData.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No se encontraron resultados</h3></div>';
        renderPagination('pendientes', 0);
        return;
    }
    
    container.innerHTML = paginatedData.map(loan => {
        const isOverdue = loan.daysOverdue > 0;
        const statusColor = isOverdue ? '#ef4444' : '#10b981';
        const statusText = isOverdue ? `${loan.daysOverdue} días atraso` : 'Al día';
        
        return `
        <div style="background: white; border-radius: 12px; padding: 15px; margin-bottom: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <!-- Header -->
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                <div>
                    <div style="font-size: 16px; font-weight: bold; color: #333;">${loan.clients?.nombre || 'N/A'}</div>
                    <div style="font-size: 13px; color: #666;">${loan.clients?.cedula || ''}</div>
                </div>
                <div style="text-align: right;">
                    <div style="display: inline-block; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: bold; color: white; background: ${statusColor};">
                        ${statusText}
                    </div>
                </div>
            </div>
            
            <!-- Progress Bar -->
            <div style="margin: 10px 0;">
                <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
                    <span>${loan.paidCuotas}/${loan.totalCuotas} cuotas</span>
                    <span>${loan.progress}%</span>
                </div>
                <div style="width: 100%; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden;">
                    <div style="height: 100%; background: ${isOverdue ? '#ef4444' : '#10b981'}; width: ${loan.progress}%; transition: width 0.3s;"></div>
                </div>
            </div>
            
            <!-- Info Row -->
            <div style="display: flex; justify-content: space-between; margin: 10px 0; font-size: 13px;">
                <div>
                    <div style="color: #666;">Cuota diaria</div>
                    <div style="font-weight: bold;">$${Number(loan.cuota_diaria).toLocaleString()}</div>
                </div>
                <div style="text-align: right;">
                    <div style="color: #666;">Saldo</div>
                    <div style="font-weight: bold; color: ${isOverdue ? '#ef4444' : '#333'};">$${Number(loan.pendingAmount).toLocaleString()}</div>
                </div>
            </div>
            
            <!-- Action Buttons -->
            <div style="display: flex; gap: 8px; margin-top: 12px;">
                <button onclick="showRegisterPaymentForm('${loan.id}')" 
                    class="btn ${isOverdue ? 'btn-danger' : 'btn-success'}" 
                    style="flex: 1; padding: 10px;">
                    Registrar Pago
                </button>
                <button onclick="showCollectCreditForm('${loan.id}')" 
                    class="btn" 
                    style="flex: 1; padding: 10px; background: #f59e0b; color: white;">
                    Recoger Crédito
                </button>
            </div>
        </div>
    `}).join('');
    
    renderPagination('pendientes', state.filteredData.length);
}

// Render Clientes
function renderClientes(allData) {
    const container = document.getElementById('clientsList');
    const state = PAGINATION_STATE.clientes;
    
    state.filteredData = allData;
    const paginatedData = getPaginatedData('clientes', state.filteredData);
    
    if (paginatedData.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No se encontraron clientes</h3></div>';
        renderPagination('clientes', 0);
        return;
    }
    
    container.innerHTML = paginatedData.map(client => `
        <div class="list-item" style="cursor: pointer; border-radius: 10px; padding: 12px; margin-bottom: 10px; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h4 style="margin: 0 0 5px 0; font-size: 16px; color: #333;">${client.nombre}</h4>
                    <p style="margin: 0; font-size: 13px; color: #666;">
                        📱 ${client.telefono || 'N/A'} • 🆔 ${client.cedula || 'N/A'}
                    </p>
                </div>
            </div>
        </div>
    `).join('');
    
    renderPagination('clientes', state.filteredData.length);
}

// Render CrÃ©ditos
function renderCreditos(allData) {
    const container = document.getElementById('creditsList');
    const state = PAGINATION_STATE.creditos;
    
    state.filteredData = allData;
    const paginatedData = getPaginatedData('creditos', state.filteredData);
    
    if (paginatedData.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No se encontraron crÃ©ditos</h3></div>';
        renderPagination('creditos', 0);
        return;
    }
    
    container.innerHTML = paginatedData.map(credit => {
        // Parse date correctly to avoid timezone issues
        const fechaParts = (credit.fecha_inicio || '').split('-');
        const localDate = fechaParts.length === 3 
            ? new Date(parseInt(fechaParts[0]), parseInt(fechaParts[1]) - 1, parseInt(fechaParts[2]))
            : null;
        const fechaInicioStr = localDate ? localDate.toLocaleDateString('es-CO') : 'N/A';
        
        return `
        <div class="list-item" style="border-radius: 10px; padding: 15px; margin-bottom: 12px; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                <div>
                    <h4 style="margin: 0 0 5px 0; font-size: 16px; color: #333;">${credit.clients?.nombre || 'N/A'}</h4>
                    <p style="margin: 0; font-size: 13px; color: #666;">🆔 ${credit.clients?.cedula || 'N/A'}</p>
                </div>
                <span style="display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: bold; ${credit.estado === 'activo' ? 'background: #10b981; color: white;' : 'background: #ef4444; color: white;'}">
                    ${credit.estado === 'activo' ? 'Activo' : credit.estado === 'vencido' ? 'Vencido' : 'Completado'}
                </span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px;">
                <div>
                    <span style="color: #666;">Monto:</span>
                    <strong style="color: #333;"> $${Number(credit.monto_prestado).toLocaleString()}</strong>
                </div>
                <div>
                    <span style="color: #666;">Cuota diaria:</span>
                    <strong style="color: #333;"> $${Number(credit.cuota_diaria).toLocaleString()}</strong>
                </div>
                <div>
                    <span style="color: #666;">Días:</span>
                    <strong> ${credit.total_dias || 'N/A'}</strong>
                </div>
                <div>
                    <span style="color: #666;">Fecha inicio:</span>
                    <strong> ${fechaInicioStr}</strong>
                </div>
            </div>
        </div>
    `}).join('');
    
    renderPagination('creditos', state.filteredData.length);
}

// Render Pagos
function renderPagos(allData) {
    const container = document.getElementById('paymentsList');
    const state = PAGINATION_STATE.pagos;
    
    state.filteredData = allData;
    const paginatedData = getPaginatedData('pagos', state.filteredData);
    
    if (paginatedData.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No se encontraron pagos</h3></div>';
        renderPagination('pagos', 0);
        return;
    }
    
    container.innerHTML = paginatedData.map(payment => {
        // Parse date correctly to avoid timezone issues
        // fecha_pago is in format YYYY-MM-DD (local date, not UTC)
        const fechaParts = (payment.fecha_pago || '').split('-');
        const localDate = fechaParts.length === 3 
            ? new Date(parseInt(fechaParts[0]), parseInt(fechaParts[1]) - 1, parseInt(fechaParts[2]))
            : null;
        const fechaStr = localDate ? localDate.toLocaleDateString('es-CO') : 'N/A';
        
        return `
        <div class="list-item" style="border-radius: 10px; padding: 12px; margin-bottom: 10px; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h4 style="margin: 0 0 5px 0; font-size: 16px; color: #333;">${payment.clients?.nombre || 'N/A'}</h4>
                    <p style="margin: 0; font-size: 13px; color: #666;">
                        🆔 ${payment.clients?.cedula || 'N/A'} • ${fechaStr}
                    </p>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 18px; font-weight: bold; color: #10b981;">$${Number(payment.monto).toLocaleString()}</div>
                    <div style="font-size: 11px; color: #888;">${payment.hora_pago ? payment.hora_pago.substring(0, 5) : ''}</div>
                </div>
            </div>
        </div>
    `}).join('');
    
    renderPagination('pagos', state.filteredData.length);
}

