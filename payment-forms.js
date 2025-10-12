// Funciones para formularios de pago y recolección de crédito

// Show register payment form
async function showRegisterPaymentForm(loanId) {
    try {
        let loan, totalPending;
        
        // 🆕 Si está online, obtener de Supabase con mora
        if (APP.isOnline && navigator.onLine) {
            const { data } = await APP.supabase
                .from('prestamos')
                .select('id, cliente_id, cuota_diaria, clients:cliente_id(nombre)')
                .eq('id', loanId)
                .single();
            loan = data;
            
            // Obtener saldo + mora desde vista materializada
            const { data: saldoData } = await APP.supabase
                .from('v_saldo_total_prestamo')
                .select('saldo_total_con_mora')
                .eq('prestamo_id', loanId)
                .single();
            
            totalPending = saldoData?.saldo_total_con_mora || 0;
        } else {
            // 🆕 Si está offline, obtener del cache
            console.log('📵 Modo offline - cargando préstamo del cache...');
            const cachedLoans = await loadFromCache('prestamos_detalle_cache');
            const cachedSaldos = await loadFromCache('saldos_mora_cache');
            const cachedLoan = cachedLoans?.find(l => l.id === loanId);
            const saldoMora = cachedSaldos?.find(s => s.prestamo_id === loanId);
            
            if (!cachedLoan) {
                console.warn(`⚠️ Préstamo ${loanId} no está en cache - modo emergencia`);
                console.log('📋 Préstamos en cache:', cachedLoans?.map(l => ({ id: l.id, cliente: l.clients?.nombre })));
                
                // 🆕 MODO EMERGENCIA: Permitir registro sin cache
                loan = {
                    id: loanId,
                    cliente_id: null, // Se inferirá del préstamo
                    cuota_diaria: 0,
                    clients: { nombre: 'Cliente (datos limitados)' }
                };
                totalPending = 0; // Usuario ingresará manualmente
                
                console.log('🚨 Usando modo emergencia sin cache');
            } else {
                loan = {
                    id: cachedLoan.id,
                    cliente_id: cachedLoan.cliente_id,
                    cuota_diaria: cachedLoan.cuota_diaria,
                    clients: cachedLoan.clients
                };
                // 🆕 Usar saldo + mora desde cache
                totalPending = saldoMora?.saldo_total_con_mora || 0;
                
                console.log(`📂 Préstamo cargado del cache - Saldo: $${totalPending} (incluye mora)`);
            }
        }
        
        // 🆕 Agregar indicador de modo offline
        const offlineIndicator = (!APP.isOnline || !navigator.onLine) ? 
            `<div style="background:rgba(255,193,7,0.1);border:1px solid rgba(255,193,7,0.3);border-radius:8px;padding:10px;margin-bottom:15px;font-size:14px;">
                <strong>📵 Modo Offline</strong><br>
                <span style="color:#666;">Datos del cache - Se sincronizará cuando vuelvas online</span>
            </div>` : '';
        
        document.body.insertAdjacentHTML('beforeend', `
            <div id="paymentModal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;padding:20px;">
                <div style="background:white;border-radius:15px;padding:20px;max-width:400px;width:100%;">
                    <h3 style="margin:0 0 15px;color:#333;">Registrar Pago</h3>
                    <p style="margin:0 0 15px;color:#666;">${loan.clients?.nombre || 'Cliente'}</p>
                    ${offlineIndicator}
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
    try {
        let loan, saldoDescontar, settings;
        
        // 🆕 Si está online, obtener de Supabase con mora
        if (APP.isOnline && navigator.onLine) {
            const { data: loanData } = await APP.supabase
                .from('prestamos')
                .select('id, cliente_id, monto_prestado, cuota_diaria, clients:cliente_id(nombre)')
                .eq('id', loanId)
                .single();
            loan = loanData;
            
            // Obtener saldo + mora desde vista materializada
            const { data: saldoData } = await APP.supabase
                .from('v_saldo_total_prestamo')
                .select('saldo_total_con_mora')
                .eq('prestamo_id', loanId)
                .single();
            
            saldoDescontar = saldoData?.saldo_total_con_mora || 0;
            
            const { data: settingsData } = await APP.supabase
                .from('settings')
                .select('*')
                .eq('panel_id', APP.collectorContext.panelId)
                .single();
            settings = settingsData;
        } else {
            // 🆕 Si está offline, obtener del cache
            console.log('📵 Modo offline - cargando préstamo del cache...');
            const cachedLoans = await loadFromCache('prestamos_detalle_cache');
            const cachedSaldos = await loadFromCache('saldos_mora_cache');
            const cachedLoan = cachedLoans?.find(l => l.id === loanId);
            const saldoMora = cachedSaldos?.find(s => s.prestamo_id === loanId);
            
            if (!cachedLoan) {
                showError('⚠️ No hay datos de este préstamo en cache. Conecta a internet y recarga los datos primero.');
                return;
            }
            
            loan = {
                id: cachedLoan.id,
                cliente_id: cachedLoan.cliente_id,
                monto_prestado: cachedLoan.monto_prestado,
                cuota_diaria: cachedLoan.cuota_diaria,
                clients: cachedLoan.clients
            };
            // 🆕 Usar saldo + mora desde cache
            saldoDescontar = saldoMora?.saldo_total_con_mora || 0;
            
            // Obtener settings del cache
            const cachedSettings = await loadFromCache('panel_settings_cache');
            settings = cachedSettings && cachedSettings.length > 0 ? cachedSettings[0] : null;
            
            if (!settings) {
                showError('⚠️ No hay configuración en cache. Conecta a internet y recarga los datos primero.');
                return;
            }
            
            console.log(`📂 Préstamo cargado del cache - Saldo: $${saldoDescontar} (incluye mora)`);
        }
        
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
        
        // 🆕 Agregar indicador de modo offline
        const offlineIndicator = (!APP.isOnline || !navigator.onLine) ? 
            `<div style="background:rgba(255,193,7,0.1);border:1px solid rgba(255,193,7,0.3);border-radius:8px;padding:10px;margin-bottom:12px;font-size:13px;">
                <strong>📵 Modo Offline</strong><br>
                <span style="color:#666;">Datos del cache - Se sincronizará cuando vuelvas online</span>
            </div>` : '';
        
        const modalHTML = `
            <div id="collectModal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;padding:20px;overflow-y:auto;">
                <div style="background:white;border-radius:15px;padding:20px;max-width:450px;width:100%;max-height:90vh;overflow-y:auto;margin:20px 0;">
                    <h3 style="margin:0 0 8px;color:#333;font-size:18px;">Recoger Crédito</h3>
                    <p style="margin:0 0 15px;color:#666;font-size:14px;">${loan.clients?.nombre || 'Cliente'}</p>
                    ${offlineIndicator}
                    
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
        // 🆕 FORZAR verificación de conexión
        const isOffline = !navigator.onLine;
        APP.isOnline = navigator.onLine; // SIEMPRE actualizar
        
        console.log('==========================================');
        console.log('💳 registerPaymentForLoan() INICIADO');
        console.log('📊 Estado de conexión:');
        console.log('  navigator.onLine:', navigator.onLine);
        console.log('  APP.isOnline (ACTUALIZADO):', APP.isOnline);
        console.log('  isOffline:', isOffline);
        console.log('==========================================');
        
        if (isOffline) {
            console.log('🔴 MODO OFFLINE CONFIRMADO - Usando flujo offline');
        } else {
            console.log('🟢 MODO ONLINE CONFIRMADO - Usando flujo online');
        }
        
        // Generate idempotency key to prevent duplicates
        const timestamp = Date.now();
        const idempotencyKey = `${APP.collectorContext.collectorId}-${loanId}-${timestamp}`;
        
        // Capture GPS location silently
        let location = null;
        try {
            location = await getCurrentLocation();
            console.log('📍 GPS capturado en pago:', location);
        } catch (gpsError) {
            console.warn('⚠️ No se pudo capturar GPS en pago:', gpsError);
        }

        const paymentData = {
            panel_id: APP.collectorContext.panelId,
            cliente_id: clientId,
            prestamo_id: loanId,
            cobrador_id: APP.collectorContext.collectorId,
            created_by: APP.collectorContext.userId || APP.collectorContext.collectorId,
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

        // 🆕 Check if offline
        if (isOffline) {
            console.log('📵 Validando pago con datos del cache...');
            const cachedLoans = await loadFromCache('prestamos_detalle_cache');
            const cachedLoan = cachedLoans?.find(l => l.id === loanId);
            
            if (!cachedLoan) {
                console.warn('⚠️ No hay datos en cache - usando modo emergencia');
                // 🆕 MODO EMERGENCIA: permitir pago sin validación
                // El monto y el préstamo se guardarán para sincronizar después
                console.log('🚨 Modo emergencia activado - guardando pago sin validación');
            } else {
                // Validar que el monto no exceda el saldo
                if (amount > cachedLoan.saldo_total_pendiente) {
                    showError(`⚠️ El monto ($${amount.toLocaleString()}) excede el saldo pendiente ($${cachedLoan.saldo_total_pendiente.toLocaleString()})`);
                    btn.disabled = false;
                    btn.textContent = 'Registrar';
                    return;
                }
                
                // Agregar metadata del cache
                paymentData.cache_saldo_antes = cachedLoan.saldo_total_pendiente;
                paymentData.cache_timestamp = cachedLoan.ultima_actualizacion;
                
                // 🆕 Actualizar saldo en cache (actualización optimista)
                cachedLoan.saldo_total_pendiente -= amount;
                cachedLoan.ultima_actualizacion = Date.now();
                await saveToCache('prestamos_detalle_cache', cachedLoans);
                console.log(`💾 Saldo actualizado en cache: $${cachedLoan.saldo_total_pendiente}`);
            }
            
            // Save offline using IndexedDB
            console.log('📵 Guardando pago offline en IndexedDB...');
            console.log('📝 Datos del pago:', paymentData);
            
            // 🍎 DIAGNÓSTICO IPHONE
            if (typeof window.diagnosticarPagoiPhone === 'function') {
                console.log('\n🍎 EJECUTANDO DIAGNÓSTICO IPHONE...\n');
                const diagnostico = window.diagnosticarPagoiPhone(paymentData);
                console.log('🍎 Resultado diagnóstico:', diagnostico);
            }
            
            try {
                const temp_id = await saveOffline('offline_pagos', paymentData);
                console.log('✅ Pago guardado offline con temp_id:', temp_id);
                
                if (!temp_id) {
                    throw new Error('No se recibió temp_id de saveOffline');
                }
                
                await updateConnectionStatus();
                
                closePaymentModal();
                
                // Solo 1 mensaje
                showSuccess(`💾 Pago guardado offline\ntemp_id: ${temp_id.substring(0, 30)}...\n\nSe sincronizará cuando haya conexión`);
                
                // Recargar vista (mostrará cache actualizado)
                if (typeof loadPendingQuotas === 'function') {
                    loadPendingQuotas();
                }
                return;
            } catch (saveError) {
                console.error('❌ ERROR guardando pago offline:', saveError);
                console.error('❌ Stack:', saveError.stack);
                showError('❌ Error: ' + saveError.message);
                btn.disabled = false;
                btn.textContent = 'Registrar';
                return;
            }
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
        const idempotencyKey = `${APP.collectorContext.collectorId}-${oldLoanId}-collect-${timestamp}`;
        
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
            // 🆕 Validar con datos del cache
            console.log('📵 Offline - validando recogida con datos del cache...');
            const cachedLoans = await loadFromCache('prestamos_detalle_cache');
            const cachedLoan = cachedLoans?.find(l => l.id === oldLoanId);
            
            if (!cachedLoan) {
                showError('⚠️ No hay datos del préstamo en cache');
                btn.disabled = false;
                btn.textContent = 'Guardar';
                return;
            }
            
            // Validar que el saldo coincida
            if (Math.abs(saldoDescontar - cachedLoan.saldo_total_pendiente) > 1) {
                console.warn(`⚠️ Saldo desajustado: Form=${saldoDescontar}, Cache=${cachedLoan.saldo_total_pendiente}`);
            }
            
            // Save offline - using IndexedDB store 'offline_recogidas'
            console.log('📵 Guardando recogida offline en IndexedDB...');
            
            const recogidaData = {
                panel_id: APP.collectorContext.panelId,
                cliente_id: clientId,
                prestamo_id: oldLoanId,
                cobrador_id: APP.collectorContext.collectorId,
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
                },
                // 🆕 Metadata del cache para referencia
                cache_saldo_antes: cachedLoan.saldo_total_pendiente,
                cache_timestamp: cachedLoan.ultima_actualizacion,
                idempotency_key: idempotencyKey
            };
            
            const temp_id = await saveOffline('offline_recogidas', recogidaData);
            console.log('✅ Recogida guardada offline:', temp_id);
            
            // 🆕 Actualizar cache optimísticamente (marcar préstamo antiguo como recogido)
            // Esto mejora la UX mostrando cambios inmediatos aunque esté offline
            const indexToUpdate = cachedLoans.findIndex(l => l.id === oldLoanId);
            if (indexToUpdate !== -1) {
                cachedLoans[indexToUpdate].estado = 'renovado_offline'; // Estado temporal
                cachedLoans[indexToUpdate].saldo_total_pendiente = 0;
                cachedLoans[indexToUpdate].ultima_actualizacion = Date.now();
                await saveToCache('prestamos_detalle_cache', cachedLoans);
                console.log(`💾 Cache actualizado - Préstamo ${oldLoanId} marcado como renovado`);
            }
            
            await updateConnectionStatus();
            
            // Show success modal
            closeCollectModal();
            showSuccessModal(saldoDescontar, clienteRecibe, montoNuevo, cuotaNueva, days, total);
            
            showSuccess('💾 Recogida guardada offline - se sincronizará cuando haya conexión');
            
            // Recargar vista (mostrará cache actualizado)
            if (typeof loadPendingQuotas === 'function') {
                loadPendingQuotas();
            }
            return;
        }

        // Step 1: Register balance as payment for old loan
        const paymentData = {
            panel_id: APP.collectorContext.panelId,
            cliente_id: clientId,
            prestamo_id: oldLoanId,
            cobrador_id: APP.collectorContext.collectorId,
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
            panel_id: APP.collectorContext.panelId,
            cliente_id: clientId,
            cobrador_id: APP.collectorContext.collectorId,
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
            panel_id: APP.collectorContext.panelId,
            collector_id: APP.collectorContext.collectorId,
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

