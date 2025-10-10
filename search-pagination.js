// Pagination and search state
const PAGINATION_STATE = {
    pendientes: {
        currentPage: 1,
        pageSize: 10,
        allData: [],
        filteredData: []
    },
    clientes: {
        currentPage: 1,
        pageSize: 10,
        allData: [],
        filteredData: []
    },
    creditos: {
        currentPage: 1,
        pageSize: 10,
        allData: [],
        filteredData: []
    },
    pagos: {
        currentPage: 1,
        pageSize: 10,
        allData: [],
        filteredData: []
    }
};

// Get paginated data
function getPaginatedData(stateKey, data) {
    const state = PAGINATION_STATE[stateKey];
    const start = (state.currentPage - 1) * state.pageSize;
    const end = start + state.pageSize;
    return data.slice(start, end);
}

// Setup search listener
function setupSearchListener(stateKey, searchFields, renderFunction) {
    const searchInput = document.getElementById(`search${stateKey.charAt(0).toUpperCase() + stateKey.slice(1)}`);
    
    if (!searchInput) {
        console.warn(`Search input not found for ${stateKey}`);
        return;
    }

    // Remove old listeners
    const newInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newInput, searchInput);

    newInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const state = PAGINATION_STATE[stateKey];
        
        if (!query) {
            state.filteredData = state.allData;
        } else {
            state.filteredData = state.allData.filter(item => {
                return searchFields.some(field => {
                    const fieldValue = field.split('.').reduce((obj, key) => obj?.[key], item);
                    return String(fieldValue || '').toLowerCase().includes(query);
                });
            });
        }
        
        state.currentPage = 1;
        renderFunction(state.filteredData);
    });
}

// Render pagination
function renderPagination(stateKey, totalItems) {
    const state = PAGINATION_STATE[stateKey];
    const totalPages = Math.ceil(totalItems / state.pageSize);
    const containerId = `${stateKey}Pagination`;
    const container = document.getElementById(containerId);
    
    if (!container) return;

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '<div class="pagination">';
    
    // Previous button
    html += `<button class="page-btn" ${state.currentPage === 1 ? 'disabled' : ''} 
            onclick="changePage('${stateKey}', ${state.currentPage - 1})">
            ‹ Anterior
        </button>`;
    
    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= state.currentPage - 1 && i <= state.currentPage + 1)) {
            html += `<button class="page-btn ${i === state.currentPage ? 'active' : ''}" 
                    onclick="changePage('${stateKey}', ${i})">
                    ${i}
                </button>`;
        } else if (i === state.currentPage - 2 || i === state.currentPage + 2) {
            html += '<span class="page-ellipsis">...</span>';
        }
    }
    
    // Next button
    html += `<button class="page-btn" ${state.currentPage === totalPages ? 'disabled' : ''} 
            onclick="changePage('${stateKey}', ${state.currentPage + 1})">
            Siguiente ›
        </button>`;
    
    html += '</div>';
    container.innerHTML = html;
}

// Change page
function changePage(stateKey, newPage) {
    const state = PAGINATION_STATE[stateKey];
    state.currentPage = newPage;
    
    const renderFunctions = {
        pendientes: renderPendientes,
        clientes: renderClientes,
        creditos: renderCreditos,
        pagos: renderPagos
    };
    
    const renderFunction = renderFunctions[stateKey];
    if (renderFunction) {
        renderFunction(state.filteredData);
    }
}

// 🆕 Render individual cuotas (not grouped loans)
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
    
    container.innerHTML = paginatedData.map(cuota => {
        const isOverdue = cuota.daysOverdue > 0;
        const statusColor = isOverdue ? '#ef4444' : '#10b981';
        const statusText = isOverdue ? `${cuota.daysOverdue} días atraso` : 'Al día';
        
        // Datos del cliente desde la relación prestamos.clients
        const clientName = cuota.prestamos?.clients?.nombre || 'N/A';
        const clientCedula = cuota.prestamos?.clients?.cedula || '';
        const clientId = cuota.prestamos?.cliente_id || '';
        const loanId = cuota.prestamo_id;
        
        return `
        <div style="background: white; border-radius: 12px; padding: 15px; margin-bottom: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <!-- Header -->
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                <div>
                    <div style="font-size: 16px; font-weight: bold; color: #333;">${clientName}</div>
                    <div style="font-size: 13px; color: #666;">${clientCedula}</div>
                </div>
                <div style="text-align: right;">
                    <div style="display: inline-block; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: bold; color: white; background: ${statusColor};">
                        ${statusText}
                    </div>
                </div>
            </div>
            
            <!-- Cuota Info -->
            <div style="margin-bottom: 10px; padding: 8px; background: #f9fafb; border-radius: 6px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-size: 11px; color: #666; margin-bottom: 2px;">Cuota #${cuota.numero_cuota}</div>
                        <div style="font-size: 14px; font-weight: bold; color: #333;">$${Number(cuota.monto_cuota).toLocaleString()}</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 11px; color: #666; margin-bottom: 2px;">Vence</div>
                        <div style="font-size: 12px; color: #333;">${new Date(cuota.fecha_vencimiento).toLocaleDateString('es-ES')}</div>
                    </div>
                </div>
            </div>
            
            <!-- Saldo pendiente y acción -->
            <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 10px; border-top: 1px solid #e5e7eb;">
                <div>
                    <div style="color: #666; font-size: 11px;">Saldo pendiente</div>
                    <div style="color: #ef4444; font-weight: bold; font-size: 15px;">$${Number(cuota.saldo_pendiente).toLocaleString()}</div>
                </div>
                <div>
                    <button onclick="showPaymentForm('${loanId}', '${clientId}')" 
                            style="padding: 8px 16px; background: #10b981; color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 500;">
                        💳 Registrar Pago
                    </button>
                </div>
            </div>
        </div>
        `;
    }).join('');
    
    renderPagination('pendientes', state.filteredData.length);
}

// Render Clientes
function renderClientes(allData) {
    const container = document.getElementById('clientsList');
    const state = PAGINATION_STATE.clientes;
    
    state.filteredData = allData;
    const paginatedData = getPaginatedData('clientes', state.filteredData);
    
    if (paginatedData.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No se encontraron resultados</h3></div>';
        renderPagination('clientes', 0);
        return;
    }
    
    container.innerHTML = paginatedData.map(client => `
        <div class="client-card">
            <div class="client-header">
                <div>
                    <h3>${client.nombre}</h3>
                    <p>CC: ${client.cedula || 'N/A'}</p>
                </div>
            </div>
            <div class="client-info">
                <p>📞 ${client.telefono || 'N/A'}</p>
                <p>📧 ${client.email || 'N/A'}</p>
            </div>
            <div style="margin-top: 10px;">
                <button onclick="showCreateCreditForm('${client.id}')" class="btn btn-primary" style="width: 100%;">
                    Crear Crédito
                </button>
            </div>
        </div>
    `).join('');
    
    renderPagination('clientes', state.filteredData.length);
}

// Render Creditos
function renderCreditos(allData) {
    const container = document.getElementById('creditsList');
    const state = PAGINATION_STATE.creditos;
    
    state.filteredData = allData;
    const paginatedData = getPaginatedData('creditos', state.filteredData);
    
    if (paginatedData.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No se encontraron resultados</h3></div>';
        renderPagination('creditos', 0);
        return;
    }
    
    container.innerHTML = paginatedData.map(credit => {
        const progress = credit.totalAmount > 0 
            ? Math.round((credit.paidAmount / credit.totalAmount) * 100) 
            : 0;
        
        return `
        <div class="credit-card">
            <div class="credit-header">
                <div>
                    <h3>${credit.clients?.nombre || 'N/A'}</h3>
                    <p>CC: ${credit.clients?.cedula || 'N/A'}</p>
                </div>
                <span class="badge badge-${credit.estado}">${credit.estado}</span>
            </div>
            <div class="credit-info">
                <p>💰 Monto: $${Number(credit.monto_prestado).toLocaleString()}</p>
                <p>📅 ${credit.total_dias} días</p>
                <p>💵 Cuota: $${Number(credit.cuota_diaria).toLocaleString()}</p>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${progress}%"></div>
            </div>
            <p style="text-align: center; font-size: 12px; color: #666;">${progress}% pagado</p>
        </div>
        `;
    }).join('');
    
    renderPagination('creditos', state.filteredData.length);
}

// Render Pagos
function renderPagos(allData) {
    const container = document.getElementById('paymentsList');
    const state = PAGINATION_STATE.pagos;
    
    state.filteredData = allData;
    const paginatedData = getPaginatedData('pagos', state.filteredData);
    
    if (paginatedData.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No se encontraron resultados</h3></div>';
        renderPagination('pagos', 0);
        return;
    }
    
    container.innerHTML = paginatedData.map(payment => `
        <div class="payment-card">
            <div class="payment-header">
                <div>
                    <h4>${payment.clients?.nombre || 'N/A'}</h4>
                    <p>CC: ${payment.clients?.cedula || 'N/A'}</p>
                </div>
                <span class="badge badge-${payment.estado}">${payment.estado}</span>
            </div>
            <div class="payment-info">
                <p>💰 Monto: $${Number(payment.monto).toLocaleString()}</p>
                <p>📅 ${new Date(payment.fecha_pago).toLocaleDateString('es-ES')}</p>
                <p>🕐 ${payment.hora_pago || 'N/A'}</p>
            </div>
        </div>
    `).join('');
    
    renderPagination('pagos', state.filteredData.length);
}
