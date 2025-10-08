// Funciones para formularios de pago y recolección de crédito

// Show register payment form
async function showRegisterPaymentForm(loanId) {
    // Check if offline
    if (!APP.isOnline || !navigator.onLine) {
        showError('⚠️ No disponible offline. Necesitas conexión para registrar pagos de préstamos existentes.');
        return;
    }

    try {
        const { data: loan } = await APP.supabase.from('prestamos').select('id, cliente_id, cuota_diaria, clients:cliente_id(nombre)').eq('id', loanId).single();
        const { data: cuotas } = await APP.supabase.from('cuotas').select('saldo_pendiente').eq('prestamo_id', loanId).neq('estado', 'pagada');
        const totalPending = cuotas?.reduce((s, c) => s + Number(c.saldo_pendiente || 0), 0) || 0;
        
        document.body.insertAdjacentHTML('beforeend', `
            <div id="paymentModal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;padding:20px;">
                <div style="background:white;border-radius:15px;padding:20px;max-width:400px;width:100%;">
                    <h3 style="margin:0 0 15px;color:#333;">Registrar Pago</h3>
                    <p style="margin:0 0 15px;color:#666;">${loan.clients?.nombre || 'Cliente'}</p>
                    <form id="paymentForm">
                        <label style="display:block;margin-bottom:5px;font-weight:600;">Monto</label>
                        <div style="display:flex;gap:8px;margin-bottom:8px;">
                            <button type="button" onclick="document.getElementById('paymentAmount').value='${loan.cuota_diaria}'" style="flex:1;padding:8px;border:1px solid #ddd;border-radius:6px;background:#f3f4f6;cursor:pointer;">
                                Cuota: $${Number(loan.cuota_diaria).toLocaleString()}
                            </button>
                            <button type="button" onclick="document.getElementById('paymentAmount').value='${totalPending}'" style="flex:1;padding:8px;border:1px solid #ddd;border-radius:6px;background:#f3f4f6;cursor:pointer;">
                                Saldo: $${Number(totalPending).toLocaleString()}
                            </button>
                        </div>
                        <input type="text" inputmode="numeric" id="paymentAmount" placeholder="0" required style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:16px;margin-bottom:15px;">
                        <div style="display:flex;gap:10px;">
                            <button type="submit" class="btn btn-success" style="flex:1;padding:12px;">Registrar</button>
                            <button type="button" onclick="closePaymentModal()" class="btn" style="flex:1;padding:12px;background:#6c757d;color:white;">Cancelar</button>
                        </div>
                    </form>
                </div>
            </div>
        `);
        
        document.getElementById('paymentForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const amount = Number(document.getElementById('paymentAmount').value.replace(/[^\d]/g, ''));
            if (amount > 0) await registerPaymentForLoan(loanId, loan.cliente_id, amount);
        });
    } catch (error) {
        showError('Error al cargar formulario: ' + error.message);
    }
}

function closePaymentModal() {
    document.getElementById('paymentModal')?.remove();
}

// Show collect credit form (renovar crédito)
async function showCollectCreditForm(loanId) {
    // Check if offline
    if (!APP.isOnline || !navigator.onLine) {
        showError('⚠️ No disponible offline. Necesitas conexión para recoger créditos.');
        return;
    }

    try {
        // Get loan details
        const { data: loan } = await APP.supabase.from('prestamos').select('id, cliente_id, monto_prestado, cuota_diaria, clients:cliente_id(nombre)').eq('id', loanId).single();
        const { data: cuotas } = await APP.supabase.from('cuotas').select('saldo_pendiente').eq('prestamo_id', loanId).neq('estado', 'pagada');
        const saldoDescontar = cuotas?.reduce((s, c) => s + Number(c.saldo_pendiente || 0), 0) || 0;
        
        // Get settings for validation
        const { data: settings } = await APP.supabase.from('settings').select('*').eq('panel_id', APP.ctx.panelId).single();
        
        const minMonto = Number(settings?.valor_minimo_prestamo || 50000);
        const maxMonto = Number(settings?.valor_maximo_prestamo || 5000000);
        const minCuota = Number(settings?.cuota_minima || 10000);
        const interesBase = Number(settings?.interes_base || 20) / 100;
        
        // Prefill with same values as current loan
        let montoNuevo = Number(loan.monto_prestado);
        let cuotaNueva = Number(loan.cuota_diaria);
        
        function updateCalculations() {
            const monto = Number(document.getElementById('collectAmount').value.replace(/[^\d]/g, '')) || 0;
            const cuota = Number(document.getElementById('collectQuota').value.replace(/[^\d]/g, '')) || 0;
            
            if (monto <= 0 || cuota <= 0) return;
            
            // Calculate with progressive interest (exact same logic as main app)
            const totalWithBaseInterest = monto * (1 + interesBase);
            const idealQuota = totalWithBaseInterest / 30;
            
            let adjustedInterest = interesBase;
            let totalToPay = totalWithBaseInterest;
            
            if (cuota < idealQuota) {
                // If quota is lower than ideal, increase interest proportionally
                adjustedInterest = interesBase * (idealQuota / cuota);
                totalToPay = monto * (1 + adjustedInterest);
            }
            
            const days = Math.ceil(totalToPay / cuota);
            const total = days * cuota;
            const clienteRecibe = Math.max(0, monto - saldoDescontar);
            
            document.getElementById('collectDays').textContent = days;
            document.getElementById('collectTotal').textContent = '$' + Number(total).toLocaleString();
            document.getElementById('collectReceived').textContent = '$' + Number(clienteRecibe).toLocaleString();
        }
        
        const modalHTML = `
            <div id="collectModal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;padding:20px;overflow-y:auto;">
                <div style="background:white;border-radius:15px;padding:20px;max-width:450px;width:100%;max-height:90vh;overflow-y:auto;margin:20px 0;">
                    <h3 style="margin:0 0 8px;color:#333;font-size:18px;">Recoger Crédito</h3>
                    <p style="margin:0 0 15px;color:#666;font-size:14px;">${loan.clients?.nombre || 'Cliente'}</p>
                    
                    <!-- Resumen Saldo -->
                    <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:12px;margin-bottom:15px;">
                        <div style="font-size:12px;color:#92400e;margin-bottom:4px;">Saldo para descontar:</div>
                        <div style="font-size:20px;font-weight:bold;color:#92400e;margin-bottom:8px;">$${Number(saldoDescontar).toLocaleString()}</div>
                        <div style="font-size:12px;color:#92400e;margin-bottom:4px;">El cliente recibirá:</div>
                        <div id="collectReceived" style="font-size:18px;font-weight:bold;color:#059669;">$0</div>
                        <div style="font-size:11px;color:#92400e;margin-top:6px;">El saldo se reportará automáticamente como pago</div>
                    </div>
                    
                    <!-- Formulario Nuevo Crédito -->
                    <form id="collectForm">
                        <div style="margin-bottom:12px;">
                            <label style="display:block;margin-bottom:4px;font-weight:600;font-size:13px;color:#333;">Monto del nuevo crédito</label>
                            <input type="text" inputmode="numeric" id="collectAmount" value="${montoNuevo}" required
                                style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;-webkit-appearance:none;-moz-appearance:textfield;">
                        </div>
                        
                        <div style="margin-bottom:12px;">
                            <label style="display:block;margin-bottom:4px;font-weight:600;font-size:13px;color:#333;">Cuota diaria</label>
                            <input type="text" inputmode="numeric" id="collectQuota" value="${cuotaNueva}" required
                                style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;-webkit-appearance:none;-moz-appearance:textfield;">
                        </div>
                        
                        <!-- Resumen Calculado -->
                        <div class="collect-summary" style="background:#f3f4f6;border-radius:8px;padding:10px;margin-bottom:15px;font-size:13px;">
                            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                                <span class="collect-label" style="color:#666;">Días:</span>
                                <span id="collectDays" class="collect-value" style="font-weight:600;">-</span>
                            </div>
                            <div style="display:flex;justify-content:space-between;">
                                <span class="collect-label" style="color:#666;">Total a pagar:</span>
                                <span id="collectTotal" class="collect-value" style="font-weight:600;color:#059669;">$0</span>
                            </div>
                        </div>
                        
                        <div style="display:flex;gap:8px;">
                            <button type="submit" class="btn" style="flex:1;padding:12px;background:#f59e0b;color:white;font-weight:600;">
                                Crear Crédito
                            </button>
                            <button type="button" onclick="closeCollectModal()" class="btn" style="flex:1;padding:12px;background:#6c757d;color:white;">
                                Cancelar
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Add input listeners for real-time calculation
        document.getElementById('collectAmount').addEventListener('input', updateCalculations);
        document.getElementById('collectQuota').addEventListener('input', updateCalculations);
        
        // Initial calculation
        updateCalculations();
        
        // Form submit
        document.getElementById('collectForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const monto = Number(document.getElementById('collectAmount').value.replace(/[^\d]/g, ''));
            const cuota = Number(document.getElementById('collectQuota').value.replace(/[^\d]/g, ''));
            
            if (monto < minMonto || monto > maxMonto) {
                showError(`Monto debe estar entre $${minMonto.toLocaleString()} y $${maxMonto.toLocaleString()}`);
                return;
            }
            if (cuota < minCuota) {
                showError(`Cuota mÃ­nima es $${minCuota.toLocaleString()}`);
                return;
            }
            
            await collectCreditWithRenewal(loanId, loan.cliente_id, saldoDescontar, monto, cuota, settings);
        });
    } catch (error) {
                showError('Error al cargar formulario: ' + error.message);
    }
}

function closeCollectModal() {
    document.getElementById('collectModal')?.remove();
}

// Register payment for loan
async function registerPaymentForLoan(loanId, clientId, amount) {
    const btn = document.querySelector('#paymentForm button[type="submit"]');
    
    // Prevent double submission (already processing)
    if (btn.disabled) {
        console.warn('⚠️ Payment already being processed, ignoring duplicate click');
        return;
    }
    
    btn.disabled = true;
    btn.textContent = 'Registrando...';
    
    try {
        // Generate idempotency key to prevent duplicates
        const timestamp = Date.now();
        const idempotencyKey = `${APP.ctx.collectorId}-${loanId}-${timestamp}`;
        
        // Capture GPS location silently
        let location = null;
        try {
            location = await getCurrentLocation();
            console.log('📍 GPS capturado en pago:', location);
        } catch (gpsError) {
            console.warn('⚠️ No se pudo capturar GPS en pago:', gpsError);
        }

        const paymentData = {
            panel_id: APP.ctx.panelId,
            cliente_id: clientId,
            prestamo_id: loanId,
            cobrador_id: APP.ctx.collectorId,
            monto: amount,
            fecha_pago: getLocalToday(),
            hora_pago: new Date().toTimeString().split(' ')[0],
            estado: 'registrado',
            idempotency_key: idempotencyKey
        };

        // Add GPS data if available
        if (location) {
            paymentData.lat = location.latitude;
            paymentData.lng = location.longitude;
        }

        // 🆕 Check if online
        if (!APP.isOnline || !navigator.onLine) {
            // Save offline using IndexedDB
            console.log('📵 Offline - guardando pago en IndexedDB...');
            
            const temp_id = await saveOffline('offline_pagos', paymentData);
            console.log('✅ Pago guardado offline:', temp_id);
            
            await updateConnectionStatus();
            
            showSuccess('💾 Pago guardado offline - se sincronizará cuando haya conexión');
            closePaymentModal();
            // Don't reload data (keep offline mode working)
            return;
        }

        const { error } = await APP.supabase.from('pagos').insert(paymentData);
        
        if (error) throw error;
        
        showSuccess('Pago registrado exitosamente');
        closePaymentModal();
        loadPendingQuotas();
        updateDashboardStats();
        
        // Don't re-enable button on success (modal closes anyway)
    } catch (error) {
        console.error('Error registering payment:', error);
        showError('Error: ' + error.message);
        
        // Only re-enable button on error (to allow retry)
        btn.disabled = false;
        btn.textContent = 'Registrar';
    }
}

// Collect credit with renewal (registrar saldo + crear nuevo crédito)
async function collectCreditWithRenewal(oldLoanId, clientId, saldoDescontar, montoNuevo, cuotaNueva, settings) {
    const btn = document.querySelector('#collectForm button[type="submit"]');
    
    // Prevent double submission (already processing)
    if (btn.disabled) {
        console.warn('⚠️ Collection already being processed, ignoring duplicate click');
        return;
    }
    
    btn.disabled = true;
    btn.textContent = 'Procesando...';
    
    try {
        // Generate idempotency key to prevent duplicates
        const timestamp = Date.now();
        const idempotencyKey = `${APP.ctx.collectorId}-${oldLoanId}-collect-${timestamp}`;
        
        // Capture GPS location silently
        let location = null;
        try {
            location = await getCurrentLocation();
            console.log('📍 GPS capturado en recoger crédito:', location);
        } catch (gpsError) {
            console.warn('⚠️ No se pudo capturar GPS en recoger crédito:', gpsError);
        }

        // Calculate new loan details (exact same logic as main app)
        const interesBase = Number(settings?.interes_base || 20) / 100;
        const totalWithBaseInterest = montoNuevo * (1 + interesBase);
        const idealQuota = totalWithBaseInterest / 30;
        
        let adjustedInterest = interesBase;
        let totalToPay = totalWithBaseInterest;
        
        if (cuotaNueva < idealQuota) {
            // If quota is lower than ideal, increase interest proportionally
            adjustedInterest = interesBase * (idealQuota / cuotaNueva);
            totalToPay = montoNuevo * (1 + adjustedInterest);
        }
        
        const days = Math.ceil(totalToPay / cuotaNueva);
        const total = days * cuotaNueva;
        const clienteRecibe = montoNuevo - saldoDescontar;

        // 🆕 Check if online
        if (!APP.isOnline || !navigator.onLine) {
            // Save offline - using IndexedDB store 'offline_recogidas'
            console.log('📵 Offline - guardando recogida en IndexedDB...');
            
            const recogidaData = {
                panel_id: APP.ctx.panelId,
                cliente_id: clientId,
                prestamo_id: oldLoanId,
                cobrador_id: APP.ctx.collectorId,
                monto_pago: saldoDescontar,
                fecha_pago: getLocalToday(),
                hora_pago: new Date().toTimeString().split(' ')[0],
                lat: location?.latitude,
                lng: location?.longitude,
                nuevo_credito: {
                    monto_prestado: montoNuevo,
                    cuota_diaria: cuotaNueva,
                    total_dias: days,
                    fecha_inicio: getLocalToday()
                }
            };
            
            const temp_id = await saveOffline('offline_recogidas', recogidaData);
            console.log('✅ Recogida guardada offline:', temp_id);
            
            await updateConnectionStatus();
            
            // Show success modal
            closeCollectModal();
            showSuccessModal(saldoDescontar, clienteRecibe, montoNuevo, cuotaNueva, days, total);
            
            showSuccess('💾 Recogida guardada offline - se sincronizará cuando haya conexión');
            return;
        }

        // Step 1: Register balance as payment for old loan
        const paymentData = {
            panel_id: APP.ctx.panelId,
            cliente_id: clientId,
            prestamo_id: oldLoanId,
            cobrador_id: APP.ctx.collectorId,
            monto: saldoDescontar,
            fecha_pago: getLocalToday(),
            hora_pago: new Date().toTimeString().split(' ')[0],
            estado: 'registrado',
            idempotency_key: idempotencyKey
        };

        // Add GPS data if available
        if (location) {
            paymentData.lat = location.latitude;
            paymentData.lng = location.longitude;
        }

        const { error: paymentError } = await APP.supabase.from('pagos').insert(paymentData);
        
        if (paymentError) throw paymentError;
        
        // Step 2: Mark old loan as completed
        await APP.supabase.from('prestamos').update({ estado: 'completado' }).eq('id', oldLoanId);
        
        // Step 3: Create new loan
        const { data: newLoan, error: loanError } = await APP.supabase.from('prestamos').insert({
            panel_id: APP.ctx.panelId,
            cliente_id: clientId,
            cobrador_id: APP.ctx.collectorId,
            monto_prestado: montoNuevo,
            cuota_diaria: cuotaNueva,
            total_dias: days,
            fecha_inicio: getLocalToday(),
            estado: 'activo'
        }).select().single();
        
        if (loanError) throw loanError;
        
        // Step 4: Show success modal (7 seconds auto-close)
        closeCollectModal();
        showSuccessModal(saldoDescontar, clienteRecibe, montoNuevo, cuotaNueva, days, total);
        
        // Refresh data
        loadPendingQuotas();
        loadCredits();
        updateDashboardStats();
        
        // Don't re-enable button on success (modal closes anyway)
    } catch (error) {
        console.error('Error collecting credit:', error);
        showError('Error: ' + error.message);
        
        // Only re-enable button on error (to allow retry)
        btn.disabled = false;
        btn.textContent = 'Crear Crédito';
    }
}

// Show success modal with auto-close (7 seconds)
function showSuccessModal(saldoDescontar, clienteRecibe, montoNuevo, cuotaNueva, days, total) {
    const modalHTML = `
        <div id="successModal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:10001;padding:20px;">
            <div style="background:white;border-radius:15px;padding:25px;max-width:400px;width:100%;box-shadow:0 10px 30px rgba(0,0,0,0.3);">
                <div style="text-align:center;margin-bottom:20px;">
                    <div style="width:60px;height:60px;background:#10b981;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 15px;">
                        <span style="color:white;font-size:32px;font-weight:bold;">âœ“</span>
                    </div>
                    <h3 style="margin:0 0 8px;color:#333;font-size:20px;">Â¡CrÃ©dito Recogido!</h3>
                    <p style="margin:0;color:#666;font-size:13px;">Se cerrarÃ¡ en <span id="countdown">7</span> segundos</p>
                </div>
                
                <!-- Saldo Registrado -->
                <div style="background:#d1fae5;border:1px solid #10b981;border-radius:8px;padding:12px;margin-bottom:12px;">
                    <div style="font-size:12px;color:#047857;margin-bottom:2px;">Saldo registrado como pago:</div>
                    <div style="font-size:20px;font-weight:bold;color:#047857;">$${Number(saldoDescontar).toLocaleString()}</div>
                </div>
                
                <!-- Cliente RecibiÃ³ -->
                <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:12px;margin-bottom:12px;">
                    <div style="font-size:12px;color:#92400e;margin-bottom:2px;">El cliente recibiÃ³:</div>
                    <div style="font-size:20px;font-weight:bold;color:#92400e;">$${Number(clienteRecibe).toLocaleString()}</div>
                </div>
                
                <!-- Nuevo CrÃ©dito -->
                <div style="background:#f3f4f6;border-radius:8px;padding:12px;margin-bottom:15px;">
                    <div style="font-size:13px;font-weight:600;color:#333;margin-bottom:8px;">Nuevo CrÃ©dito Creado:</div>
                    <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
                        <span style="color:#666;">Monto:</span>
                        <span style="font-weight:600;">$${Number(montoNuevo).toLocaleString()}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
                        <span style="color:#666;">Cuota diaria:</span>
                        <span style="font-weight:600;">$${Number(cuotaNueva).toLocaleString()}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
                        <span style="color:#666;">DÃ­as:</span>
                        <span style="font-weight:600;">${days}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:12px;padding-top:8px;border-top:1px solid #ddd;">
                        <span style="color:#666;">Total a pagar:</span>
                        <span style="font-weight:bold;color:#059669;">$${Number(total).toLocaleString()}</span>
                    </div>
                </div>
                
                <button onclick="closeSuccessModal()" class="btn btn-success" style="width:100%;padding:12px;font-weight:600;">
                    Cerrar
                </button>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Countdown timer
    let seconds = 7;
    const countdownEl = document.getElementById('countdown');
    const timer = setInterval(() => {
        seconds--;
        if (countdownEl) countdownEl.textContent = seconds;
        if (seconds <= 0) {
            clearInterval(timer);
            closeSuccessModal();
        }
    }, 1000);
    
    // Store timer ID for manual close
    document.getElementById('successModal').dataset.timerId = timer;
}

function closeSuccessModal() {
    const modal = document.getElementById('successModal');
    if (modal) {
        const timerId = modal.dataset.timerId;
        if (timerId) clearInterval(Number(timerId));
        modal.remove();
    }
}

// Show add expense form
function showAddGastoForm() {
    const modalHTML = `
        <div id="gastoModal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;padding:20px;">
            <div style="background:white;border-radius:15px;padding:20px;max-width:400px;width:100%;">
                <h3 style="margin:0 0 15px;color:#333;font-size:18px;">Registrar Gasto</h3>
                <form id="gastoForm">
                    <div style="margin-bottom:12px;">
                        <label style="display:block;margin-bottom:4px;font-weight:600;font-size:13px;color:#333;">Monto *</label>
                        <input type="text" inputmode="numeric" id="gastoMonto" placeholder="Ej: 50000" required
                            style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;-webkit-appearance:none;-moz-appearance:textfield;">
                    </div>
                    
                    <div style="margin-bottom:12px;">
                        <label style="display:block;margin-bottom:4px;font-weight:600;font-size:13px;color:#333;">Concepto *</label>
                        <input type="text" id="gastoConcepto" placeholder="Ej: Gasolina, Almuerzo..." required
                            style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;">
                    </div>
                    
                    <div style="margin-bottom:15px;">
                        <label style="display:block;margin-bottom:4px;font-weight:600;font-size:13px;color:#333;">Observaciones (opcional)</label>
                        <textarea id="gastoObservaciones" placeholder="Detalles adicionales..." rows="3"
                            style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;resize:vertical;"></textarea>
                    </div>
                    
                    <div style="display:flex;gap:8px;">
                        <button type="submit" class="btn" style="flex:1;padding:12px;background:#ef4444;color:white;font-weight:600;">
                            Registrar
                        </button>
                        <button type="button" onclick="closeGastoModal()" class="btn" style="flex:1;padding:12px;background:#6c757d;color:white;">
                            Cancelar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Form submit
    document.getElementById('gastoForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const monto = Number(document.getElementById('gastoMonto').value.replace(/[^\d]/g, ''));
        const concepto = document.getElementById('gastoConcepto').value.trim();
        const observaciones = document.getElementById('gastoObservaciones').value.trim();
        
        if (monto <= 0) {
            showError('Ingresa un monto vÃ¡lido');
            return;
        }
        if (!concepto) {
            showError('Ingresa el concepto del gasto');
            return;
        }
        
        await registrarGasto(monto, concepto, observaciones);
    });
}

function closeGastoModal() {
    document.getElementById('gastoModal')?.remove();
}

// Register expense
async function registrarGasto(monto, concepto, observaciones) {
    const btn = document.querySelector('#gastoForm button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Registrando...';
    
    try {
        const { error } = await APP.supabase.from('collector_expenses').insert({
            panel_id: APP.ctx.panelId,
            collector_id: APP.ctx.collectorId,
            fecha: getLocalToday(),
            monto: monto,
            concepto: concepto,
            observaciones: observaciones || null
        });
        
        if (error) throw error;
        
        showSuccess('Gasto registrado exitosamente');
        closeGastoModal();
        loadTodayStats();
    } catch (error) {
                showError('Error: ' + error.message);
        btn.disabled = false;
        btn.textContent = 'Registrar';
    }
}

