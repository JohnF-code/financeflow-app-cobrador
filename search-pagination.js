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

// Render pagination mejorada
function renderPagination(stateKey, totalItems) {
    const state = PAGINATION_STATE[stateKey];
    const totalPages = Math.ceil(totalItems / state.pageSize);
    const containerId = `${stateKey}Pagination`;
    const container = document.getElementById(containerId);
    
    if (!container) return;

    if (totalPages <= 1 && totalItems <= state.pageSize) {
        // Mostrar solo contador si hay items pero no necesita paginación
        container.innerHTML = `
            <div class="pagination-counter" style="padding: 12px 0; text-align: center; font-size: 13px;">
                ${totalItems} ${totalItems === 1 ? 'registro' : 'registros'}
            </div>
        `;
        return;
    }

    // Calcular rango de registros mostrados
    const start = ((state.currentPage - 1) * state.pageSize) + 1;
    const end = Math.min(state.currentPage * state.pageSize, totalItems);

    let html = '<div style="display:flex; flex-direction:column; align-items:center; padding:15px 0; gap:10px;">';
    
    // Controles de paginación (arriba)
    html += '<div style="display:flex; gap:8px; align-items:center;">';
    
    // Previous button con flecha
    html += `<button ${state.currentPage === 1 ? 'disabled' : ''} 
            onclick="changePage('${stateKey}', ${state.currentPage - 1})"
            style="padding:8px 12px; background:${state.currentPage === 1 ? '#e5e7eb' : '#10b981'}; color:${state.currentPage === 1 ? '#9ca3af' : 'white'}; border:none; border-radius:6px; cursor:${state.currentPage === 1 ? 'not-allowed' : 'pointer'}; font-size:16px; font-weight:bold;">
            ←
        </button>`;
    
    // Page numbers (solo 3 visibles)
    const showPages = [];
    if (totalPages <= 5) {
        for (let i = 1; i <= totalPages; i++) showPages.push(i);
    } else {
        if (state.currentPage <= 2) {
            showPages.push(1, 2, 3, '...', totalPages);
        } else if (state.currentPage >= totalPages - 1) {
            showPages.push(1, '...', totalPages - 2, totalPages - 1, totalPages);
        } else {
            showPages.push(1, '...', state.currentPage - 1, state.currentPage, state.currentPage + 1, '...', totalPages);
        }
    }
    
    showPages.forEach(page => {
        if (page === '...') {
            html += '<span class="pagination-ellipsis" style="padding:0 4px;">...</span>';
        } else {
            const isActive = page === state.currentPage;
            html += `<button 
                    onclick="changePage('${stateKey}', ${page})"
                    class="pagination-button ${isActive ? 'active' : ''}"
                    style="min-width:36px; padding:8px 12px; background:${isActive ? '#10b981' : 'transparent'}; color:${isActive ? 'white' : 'inherit'}; border:1px solid ${isActive ? '#10b981' : 'currentColor'}; border-radius:6px; cursor:pointer; font-size:14px; font-weight:${isActive ? 'bold' : 'normal'}; opacity: ${isActive ? '1' : '0.7'};">
                    ${page}
                </button>`;
        }
    });
    
    // Next button con flecha
    html += `<button ${state.currentPage === totalPages ? 'disabled' : ''} 
            onclick="changePage('${stateKey}', ${state.currentPage + 1})"
            style="padding:8px 12px; background:${state.currentPage === totalPages ? '#e5e7eb' : '#10b981'}; color:${state.currentPage === totalPages ? '#9ca3af' : 'white'}; border:none; border-radius:6px; cursor:${state.currentPage === totalPages ? 'not-allowed' : 'pointer'}; font-size:16px; font-weight:bold;">
            →
        </button>`;
    
    html += '</div>'; // Cierre de controles de paginación
    
    // Contador de registros (debajo de la paginación)
    html += `<div class="pagination-counter" style="font-size:13px; text-align:center; opacity: 0.7;">
        ${start}-${end} de ${totalItems} registros
    </div>`;
    
    html += '</div>'; // Cierre del contenedor principal
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
    
    // Scroll suave al inicio de la lista
    const listContainers = {
        pendientes: 'pendingQuotasList',
        clientes: 'clientsList',
        creditos: 'creditsList',
        pagos: 'paymentsList'
    };
    
    const listId = listContainers[stateKey];
    if (listId) {
        const listElement = document.getElementById(listId);
        if (listElement) {
            listElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
}

// 🆕 Render individual cuotas con formato de préstamo (barra de progreso, etc.)
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
        
        // Datos del cliente y préstamo desde la relación
        const clientName = cuota.prestamos?.clients?.nombre || 'N/A';
        const clientCedula = cuota.prestamos?.clients?.cedula || '';
        const clientId = cuota.prestamos?.cliente_id || '';
        const loanId = cuota.prestamo_id;
        
        // Calcular progreso del préstamo completo (si tenemos los datos)
        const totalDias = cuota.prestamos?.total_dias || 0;
        const cuotaDiaria = cuota.prestamos?.cuota_diaria || 0;
        const montoTotal = cuotaDiaria * totalDias;
        
        // Estimar progreso basado en el número de cuota (aproximado)
        const numeroCuota = cuota.numero_cuota || 0;
        const progress = totalDias > 0 ? Math.round((numeroCuota / totalDias) * 100) : 0;
        const cuotasPagadas = numeroCuota - 1; // Aproximado: asumimos que las anteriores están pagadas
        
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
            
            <!-- Progress Bar del préstamo -->
            <div style="margin: 10px 0;">
                <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
                    <span>Cuota #${numeroCuota} de ${totalDias}</span>
                    <span>${progress}%</span>
                </div>
                <div style="width: 100%; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden;">
                    <div style="height: 100%; background: ${isOverdue ? '#ef4444' : '#10b981'}; width: ${progress}%; transition: width 0.3s;"></div>
                </div>
            </div>
            
            <!-- Info Row -->
            <div style="display: flex; justify-content: space-between; margin: 10px 0; font-size: 13px;">
                <div>
                    <div style="color: #666;">Cuota diaria</div>
                    <div style="font-weight: bold;">$${Number(cuotaDiaria).toLocaleString()}</div>
                </div>
                <div style="text-align: right;">
                    <div style="color: #666;">Saldo ${cuota.mora_acumulada > 0 ? '+ Mora' : ''}</div>
                    <div style="font-weight: bold; color: ${isOverdue ? '#ef4444' : '#333'};">$${(Number(cuota.saldo_pendiente) + Number(cuota.mora_acumulada || 0)).toLocaleString()}</div>
                </div>
            </div>
            
            <!-- Fecha de vencimiento -->
            <div class="quota-due-date" style="margin: 8px 0; padding: 6px; background: rgba(0,0,0,0.05); border-radius: 4px; font-size: 12px; text-align: center; opacity: 0.8;">
                <svg style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                Vence: ${new Date(cuota.fecha_vencimiento).toLocaleDateString('es-ES')}
            </div>
            
            <!-- Action Buttons -->
            <div style="display: flex; gap: 8px; margin-top: 12px;">
                <button onclick="showRegisterPaymentForm('${loanId}')" 
                    class="btn ${isOverdue ? 'btn-danger' : 'btn-success'}" 
                    style="flex: 1; padding: 10px;">
                    <svg style="width: 16px; height: 16px; display: inline-block; vertical-align: middle; margin-right: 4px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="2" y="5" width="20" height="14" rx="2"></rect>
                        <line x1="2" y1="10" x2="22" y2="10"></line>
                    </svg>
                    Registrar Pago
                </button>
                <button onclick="showCollectCreditForm('${loanId}')" 
                    class="btn" 
                    style="flex: 1; padding: 10px; background: #f59e0b; color: white;">
                    <svg style="width: 16px; height: 16px; display: inline-block; vertical-align: middle; margin-right: 4px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path>
                        <path d="M21 3v5h-5"></path>
                    </svg>
                    Recoger Crédito
                </button>
            </div>
        </div>
        `;
    }).join('');
    
    renderPagination('pendientes', state.filteredData.length);
}

// Render Clientes con Score
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
    
    // Helper: Obtener color del score
    const getScoreColor = (score) => {
        const s = Number(score) || 650;
        if (s >= 800) return '#10b981'; // Verde excelente
        if (s >= 700) return '#3b82f6'; // Azul bueno
        if (s >= 600) return '#f59e0b'; // Amarillo regular
        return '#ef4444'; // Rojo malo
    };
    
    // Helper: Obtener categoría del score
    const getScoreCategory = (score) => {
        const s = Number(score) || 650;
        if (s >= 800) return 'Excelente';
        if (s >= 700) return 'Bueno';
        if (s >= 600) return 'Regular';
        return 'Bajo';
    };
    
    container.innerHTML = paginatedData.map(client => {
        const score = Number(client.score) || 650;
        const scoreColor = getScoreColor(score);
        const scoreCategory = getScoreCategory(score);
        const isBlocked = client.status === 'blocked';
        
        return `
        <div class="list-item" style="cursor: pointer; border-radius: 10px; padding: 12px; margin-bottom: 10px; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.1); border-left: 4px solid ${scoreColor};">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div style="flex: 1;">
                    <h4 style="margin: 0 0 5px 0; font-size: 16px; color: #333; ${isBlocked ? 'text-decoration: line-through; opacity: 0.7;' : ''}">${client.nombre}</h4>
                    <p style="margin: 0 0 5px 0; font-size: 13px; opacity: 0.7;">
                        <svg style="width: 12px; height: 12px; display: inline-block; vertical-align: middle;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                        </svg>
                        ${client.telefono || 'N/A'} • 
                        <svg style="width: 12px; height: 12px; display: inline-block; vertical-align: middle;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                        ${client.cedula || 'N/A'}
                    </p>
                    ${isBlocked ? '<span style="display: inline-block; padding: 2px 8px; background: #ef4444; color: white; border-radius: 4px; font-size: 11px; font-weight: 600;"><svg style="width: 10px; height: 10px; display: inline-block; vertical-align: middle; margin-right: 2px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>BLOQUEADO</span>' : ''}
                </div>
                <div style="text-align: center; min-width: 70px;">
                    <div style="font-size: 20px; font-weight: bold; color: ${scoreColor}; line-height: 1;">${score}</div>
                    <div style="font-size: 10px; color: #666; margin-top: 2px;">${scoreCategory}</div>
                </div>
            </div>
        </div>
        `;
    }).join('');
    
    renderPagination('clientes', state.filteredData.length);
}

// Render Creditos (ORIGINAL - sin cambios)
function renderCreditos(allData) {
    const container = document.getElementById('creditsList');
    const state = PAGINATION_STATE.creditos;
    
    state.filteredData = allData;
    const paginatedData = getPaginatedData('creditos', state.filteredData);
    
    if (paginatedData.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No se encontraron créditos</h3></div>';
        renderPagination('creditos', 0);
        return;
    }
    
    container.innerHTML = paginatedData.map(credit => `
        <div class="list-item" style="border-radius: 10px; padding: 12px; margin-bottom: 10px; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div>
                <h4 style="margin: 0 0 5px 0; font-size: 16px; color: #333;">${credit.clients?.nombre || 'N/A'}</h4>
                <p style="margin: 0; font-size: 13px; color: #666;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 2px;">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="12"/>
                        <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    $${Number(credit.monto_prestado).toLocaleString()} • 
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin: 0 2px;">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                        <line x1="16" y1="2" x2="16" y2="6"/>
                        <line x1="8" y1="2" x2="8" y2="6"/>
                        <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    ${credit.total_dias} días • 
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin: 0 2px;">
                        <line x1="12" y1="1" x2="12" y2="23"/>
                        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                    </svg>
                    $${Number(credit.cuota_diaria).toLocaleString()}/día
                </p>
                <p style="margin: 5px 0 0 0; font-size: 12px;">
                    <span class="badge" style="padding: 2px 6px; border-radius: 4px; background: ${credit.estado === 'activo' ? '#10b981' : '#6b7280'}; color: white; font-size: 11px;">
                        ${credit.estado}
                    </span>
                </p>
            </div>
        </div>
    `).join('');
    
    renderPagination('creditos', state.filteredData.length);
}

// Render Pagos (ORIGINAL - sin cambios)
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
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 2px;">
                            <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                            <line x1="9" y1="6" x2="15" y2="6"/>
                            <line x1="9" y1="10" x2="15" y2="10"/>
                        </svg>
                        ${payment.clients?.cedula || 'N/A'} • 
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin: 0 2px;">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                            <line x1="16" y1="2" x2="16" y2="6"/>
                            <line x1="8" y1="2" x2="8" y2="6"/>
                            <line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                        ${fechaStr}
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
