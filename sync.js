/**
 * ========================================
 * 🔄 Sincronización Inteligente con Supabase
 * ========================================
 * Manejo de operaciones offline y sincronización
 * Reintentos automáticos - Sin bloqueo de UI
 */

// Estado de sincronización
const SYNC = {
    isRunning: false,
    lastSync: null,
    totalSynced: 0,
    totalFailed: 0,
    retryAttempts: 3,
    retryDelay: 2000 // 2 segundos entre reintentos
};

/**
 * ===========================
 * DETECCIÓN DE CONEXIÓN
 * ===========================
 */

/**
 * Configurar listeners de estado de conexión
 */
function setupConnectionListeners() {
    // Listener de online
    window.addEventListener('online', async () => {
        console.log('🌐 Conexión restaurada');
        APP.isOnline = true;
        updateConnectionStatus();
        
        // Esperar 1 segundo antes de sincronizar (para estabilizar conexión)
        setTimeout(async () => {
            await syncOfflineData();
        }, 1000);
    });

    // Listener de offline
    window.addEventListener('offline', () => {
        console.log('📵 Conexión perdida - modo offline');
        APP.isOnline = false;
        updateConnectionStatus();
    });

    // Verificar estado inicial
    APP.isOnline = navigator.onLine;
    console.log(`🔌 Estado inicial: ${APP.isOnline ? 'Online' : 'Offline'}`);
}

/**
 * Verificar conectividad real con Supabase
 * @returns {boolean} True si hay conexión real
 */
async function checkRealConnection() {
    if (!navigator.onLine) {
        return false;
    }

    try {
        // Ping rápido a Supabase
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);

        const response = await fetch(
            `${APP.supabase.supabaseUrl}/rest/v1/`,
            {
                method: 'HEAD',
                headers: {
                    'apikey': APP.supabase.supabaseKey
                },
                signal: controller.signal
            }
        );

        clearTimeout(timeout);
        return response.ok;
    } catch (error) {
        console.warn('⚠️ No hay conexión real con Supabase:', error.message);
        return false;
    }
}

/**
 * ===========================
 * SINCRONIZACIÓN PRINCIPAL
 * ===========================
 */

/**
 * Sincronizar todos los datos offline
 * Orden: Clientes → Créditos → Recogidas → Pagos
 */
async function syncOfflineData() {
    if (SYNC.isRunning) {
        console.log('⚠️ Sincronización ya en progreso...');
        return;
    }

    console.log('🔄 Iniciando sincronización offline...');
    SYNC.isRunning = true;
    SYNC.totalSynced = 0;
    SYNC.totalFailed = 0;

    try {
        // Verificar conexión real
        const hasConnection = await checkRealConnection();
        if (!hasConnection) {
            console.log('📵 Sin conexión real - cancelando sincronización');
            SYNC.isRunning = false;
            return;
        }

        // Obtener cola de sincronización
        const queue = await getOfflineQueue();
        const totalItems = Object.values(queue).reduce((sum, items) => sum + items.length, 0);

        if (totalItems === 0) {
            console.log('✅ No hay datos pendientes de sincronizar');
            SYNC.isRunning = false;
            return;
        }

        console.log(`📋 Sincronizando ${totalItems} items...`);
        
        // Mostrar badge de sincronización
        updateSyncBadge('sync', totalItems);

        // 1. Sincronizar clientes (primero, porque otros dependen)
        if (queue.offline_clientes?.length > 0) {
            await syncClientes(queue.offline_clientes);
        }

        // 2. Sincronizar créditos
        if (queue.offline_creditos?.length > 0) {
            await syncCreditos(queue.offline_creditos);
        }

        // 3. Sincronizar recogidas (pago + nuevo crédito)
        if (queue.offline_recogidas?.length > 0) {
            await syncRecogidas(queue.offline_recogidas);
        }

        // 4. Sincronizar pagos
        if (queue.offline_pagos?.length > 0) {
            await syncPagos(queue.offline_pagos);
        }

        // Limpiar items sincronizados
        await clearSynced('offline_clientes');
        await clearSynced('offline_creditos');
        await clearSynced('offline_recogidas');
        await clearSynced('offline_pagos');

        // Actualizar badge
        const remaining = await countOfflinePending();
        updateSyncBadge('done', remaining);

        // Actualizar cache con datos frescos
        await updateCacheFromSupabase();

        // Mensaje de éxito
        if (SYNC.totalSynced > 0) {
            showSuccess(`✅ ${SYNC.totalSynced} operaciones sincronizadas`);
        }

        if (SYNC.totalFailed > 0) {
            showWarning(`⚠️ ${SYNC.totalFailed} operaciones fallaron - se reintentarán`);
        }

        SYNC.lastSync = new Date();
        console.log(`✅ Sincronización completada: ${SYNC.totalSynced} OK, ${SYNC.totalFailed} errores`);

    } catch (error) {
        console.error('❌ Error en sincronización:', error);
        showError('Error al sincronizar datos');
    } finally {
        SYNC.isRunning = false;
    }
}

/**
 * ===========================
 * SINCRONIZACIÓN POR TIPO
 * ===========================
 */

/**
 * Sincronizar clientes offline
 * @param {Array} clientes - Array de clientes offline
 */
async function syncClientes(clientes) {
    console.log(`👥 Sincronizando ${clientes.length} clientes...`);

    for (const cliente of clientes) {
        try {
            // Preparar datos para Supabase
            const clientData = {
                panel_id: APP.collectorContext.panelId,
                nombre: cliente.nombre,
                telefono: cliente.telefono,
                cedula: cliente.cedula,
                email: cliente.email || null,
                lat: cliente.lat || null,
                lng: cliente.lng || null
            };

            // Insertar en Supabase
            const { data, error } = await APP.supabase
                .from('clients')
                .insert(clientData)
                .select()
                .single();

            if (error) throw error;

            // Marcar como sincronizado
            await markAsSynced('offline_clientes', cliente.temp_id);
            SYNC.totalSynced++;

            console.log(`✅ Cliente sincronizado: ${cliente.nombre} (${data.id})`);

            // Actualizar referencias si hay créditos/pagos pendientes para este temp_id
            await updateReferences('cliente', cliente.temp_id, data.id);

        } catch (error) {
            console.error(`❌ Error sincronizando cliente ${cliente.nombre}:`, error);
            SYNC.totalFailed++;
            
            // Incrementar intentos
            await incrementSyncAttempts('offline_clientes', cliente.temp_id, error.message);
        }
    }
}

/**
 * Sincronizar créditos offline
 * @param {Array} creditos - Array de créditos offline
 */
async function syncCreditos(creditos) {
    console.log(`💰 Sincronizando ${creditos.length} créditos...`);

    for (const credito of creditos) {
        try {
            // Si el cliente es temp_id, buscar el ID real
            let clienteId = credito.cliente_id;
            if (typeof clienteId === 'string' && clienteId.startsWith('offline_')) {
                // Cliente aún no sincronizado - saltar por ahora
                console.warn(`⚠️ Cliente ${clienteId} no sincronizado aún - saltando crédito`);
                continue;
            }

            // Preparar datos para Supabase
            const creditData = {
                panel_id: APP.collectorContext.panelId,
                cliente_id: clienteId,
                cobrador_id: APP.collectorContext.collectorId,
                monto_prestado: credito.monto_prestado,
                cuota_diaria: credito.cuota_diaria,
                total_dias: credito.total_dias,
                fecha_inicio: credito.fecha_inicio,
                estado: 'activo',
                lat: credito.lat || null,
                lng: credito.lng || null
            };

            // Insertar en Supabase
            const { data, error } = await APP.supabase
                .from('prestamos')
                .insert(creditData)
                .select()
                .single();

            if (error) throw error;

            // Marcar como sincronizado
            await markAsSynced('offline_creditos', credito.temp_id);
            SYNC.totalSynced++;

            console.log(`✅ Crédito sincronizado: ${credito.monto_prestado} (${data.id})`);

            // Actualizar referencias en pagos pendientes
            await updateReferences('credito', credito.temp_id, data.id);

        } catch (error) {
            console.error(`❌ Error sincronizando crédito:`, error);
            SYNC.totalFailed++;
            
            await incrementSyncAttempts('offline_creditos', credito.temp_id, error.message);
        }
    }
}

/**
 * Sincronizar pagos offline
 * @param {Array} pagos - Array de pagos offline
 */
async function syncPagos(pagos) {
    console.log('==========================================');
    console.log(`💵 SYNC PAGOS - Total: ${pagos.length}`);
    console.log(`📱 User Agent: ${navigator.userAgent}`);
    console.log(`🌐 Platform: ${navigator.platform}`);
    console.log('==========================================');

    for (let i = 0; i < pagos.length; i++) {
        const pago = pagos[i];
        console.log(`\n📝 Procesando pago ${i + 1}/${pagos.length}:`);
        console.log(`   temp_id: ${pago.temp_id}`);
        console.log(`   monto: ${pago.monto}`);
        console.log(`   prestamo_id: ${pago.prestamo_id}`);
        
        try {
            // Verificar que cliente_id y prestamo_id no sean temp_id
            if (typeof pago.cliente_id === 'string' && pago.cliente_id.startsWith('offline_')) {
                console.warn(`⚠️ Cliente ${pago.cliente_id} no sincronizado - saltando pago`);
                continue;
            }
            if (typeof pago.prestamo_id === 'string' && pago.prestamo_id.startsWith('offline_')) {
                console.warn(`⚠️ Crédito ${pago.prestamo_id} no sincronizado - saltando pago`);
                continue;
            }

            // Preparar datos para Supabase (normalizados iOS)
            const normalizedMonto = Number.isFinite(Number(pago.monto)) ? Number(pago.monto) : 0;
            const normalizedFecha = typeof pago.fecha_pago === 'string' ? pago.fecha_pago : (new Date(pago.fecha_pago)).toISOString().split('T')[0];
            const normalizedHora = typeof pago.hora_pago === 'string' ? pago.hora_pago : (new Date()).toTimeString().split(' ')[0];
            const normalizedLat = (pago.lat === undefined || Number.isNaN(pago.lat)) ? null : pago.lat;
            const normalizedLng = (pago.lng === undefined || Number.isNaN(pago.lng)) ? null : pago.lng;
            const idempotency = pago.idempotency_key || pago.temp_id || `${APP.collectorContext.collectorId}-${pago.prestamo_id}-${pago.timestamp || Date.now()}`;

            const pagoData = {
                panel_id: APP.collectorContext.panelId,
                cliente_id: pago.cliente_id,
                prestamo_id: pago.prestamo_id,
                cobrador_id: APP.collectorContext.collectorId,
                created_by: APP.collectorContext.userId || APP.collectorContext.collectorId,
                monto: normalizedMonto,
                fecha_pago: normalizedFecha,
                hora_pago: normalizedHora,
                estado: pago.estado || 'registrado',
                lat: normalizedLat,
                lng: normalizedLng,
                idempotency_key: idempotency
            };

            // Insertar en Supabase
            console.log(`   🔄 Insertando en Supabase...`);
            let { error } = await APP.supabase
                .from('pagos')
                .insert(pagoData);

            // Reintento con created_by forzado si hay error RLS/autorización
            if (error && (error.code === 'PGRST301' || /rls|policy|permission/i.test(error.message || ''))) {
                console.warn('⚠️ Reintentando pago con created_by reforzado...');
                const retryData = { ...pagoData, created_by: APP.collectorContext.userId || APP.collectorContext.collectorId };
                const retry = await APP.supabase.from('pagos').insert(retryData);
                error = retry.error;
            }

            if (error) {
                console.error(`   ❌ Error Supabase:`, error);
                // Si es error de idempotency key duplicada, considerar como éxito
                if (error.message?.includes('idempotency_key')) {
                    console.log(`   ✅ Pago ya sincronizado (idempotency): ${pago.idempotency_key}`);
                    await markAsSynced('offline_pagos', pago.temp_id);
                    SYNC.totalSynced++;
                    continue;
                }
                throw error;
            }
            
            console.log(`   ✅ Insertado en Supabase correctamente`);

            // Marcar como sincronizado
            console.log(`   🏷️ Marcando como sincronizado...`);
            try {
                await markAsSynced('offline_pagos', pago.temp_id);
                SYNC.totalSynced++;
                console.log(`   ✅✅ PAGO SINCRONIZADO COMPLETAMENTE`);
                console.log(`   Monto: $${pago.monto}, Préstamo: ${pago.prestamo_id}`);
            } catch (markError) {
                console.error(`   ❌ Error marcando (Safari/iPhone):`, markError);
                console.error(`   temp_id: ${pago.temp_id}`);
                console.error(`   Tipo error: ${markError.name}`);
                console.error(`   Stack: ${markError.stack}`);
                // Intentar continuar sin marcar - pago YA está en Supabase
                SYNC.totalSynced++;
                console.log(`   ⚠️ Pago en Supabase pero no marcado localmente`);
            }

        } catch (error) {
            console.error(`\n❌❌ ERROR SINCRONIZANDO PAGO ${i + 1}:`);
            console.error(`   Error: ${error.message}`);
            console.error(`   temp_id: ${pago.temp_id}`);
            console.error(`   Stack:`, error.stack);
            SYNC.totalFailed++;
            
            try {
                await incrementSyncAttempts('offline_pagos', pago.temp_id, error.message);
            } catch (incError) {
                console.error(`   ❌ No se pudo incrementar intentos:`, incError);
            }
        }
    }
    
    console.log('\n==========================================');
    console.log(`💵 SYNC PAGOS COMPLETADO`);
    console.log(`   Exitosos: ${SYNC.totalSynced - (SYNC.totalSynced - pagos.length + SYNC.totalFailed)}`);
    console.log(`   Fallidos: ${SYNC.totalFailed}`);
    console.log('==========================================\n');
}

/**
 * Sincronizar recogidas offline (pago + nuevo crédito)
 * @param {Array} recogidas - Array de recogidas offline
 */
async function syncRecogidas(recogidas) {
    console.log(`🔄 Sincronizando ${recogidas.length} recogidas...`);

    for (const recogida of recogidas) {
        try {
            // Verificar referencias
            if (typeof recogida.cliente_id === 'string' && recogida.cliente_id.startsWith('offline_')) {
                console.warn(`⚠️ Cliente ${recogida.cliente_id} no sincronizado - saltando recogida`);
                continue;
            }
            if (typeof recogida.prestamo_id === 'string' && recogida.prestamo_id.startsWith('offline_')) {
                console.warn(`⚠️ Crédito ${recogida.prestamo_id} no sincronizado - saltando recogida`);
                continue;
            }

            // Usar RPC para recoger crédito (mismo flujo que online)
            const { error: collectError } = await APP.supabase.rpc('collect_credit_web', {
                p_prestamo_id: recogida.prestamo_id,
                p_monto_pago: recogida.monto_pago,
                p_fecha_pago: recogida.fecha_pago,
                p_hora_pago: recogida.hora_pago,
                p_cobrador_id: APP.collectorContext.collectorId,
                p_panel_id: APP.collectorContext.panelId,
                p_lat: recogida.lat || null,
                p_lng: recogida.lng || null
            });

            if (collectError) throw collectError;

            // Si hay nuevo crédito, crearlo
            if (recogida.nuevo_credito) {
                const { error: creditError } = await APP.supabase
                    .from('prestamos')
                    .insert({
                        panel_id: APP.collectorContext.panelId,
                        cliente_id: recogida.cliente_id,
                        cobrador_id: APP.collectorContext.collectorId,
                        monto_prestado: recogida.nuevo_credito.monto_prestado,
                        cuota_diaria: recogida.nuevo_credito.cuota_diaria,
                        total_dias: recogida.nuevo_credito.total_dias,
                        fecha_inicio: recogida.nuevo_credito.fecha_inicio,
                        estado: 'activo',
                        lat: recogida.lat || null,
                        lng: recogida.lng || null
                    });

                if (creditError) throw creditError;
            }

            // Marcar como sincronizado
            await markAsSynced('offline_recogidas', recogida.temp_id);
            SYNC.totalSynced++;

            console.log(`✅ Recogida sincronizada: ${recogida.prestamo_id}`);

        } catch (error) {
            console.error(`❌ Error sincronizando recogida:`, error);
            SYNC.totalFailed++;
            
            await incrementSyncAttempts('offline_recogidas', recogida.temp_id, error.message);
        }
    }
}

/**
 * ===========================
 * ACTUALIZACIÓN DE CACHE
 * ===========================
 */

/**
 * Actualizar cache local con datos frescos de Supabase
 */
async function updateCacheFromSupabase() {
    console.log('🔄 Actualizando cache desde Supabase...');

    try {
        // Actualizar cache de clientes
        const { data: clientes } = await APP.supabase
            .from('clients')
            .select('id, nombre, telefono, email, cedula')
            .eq('panel_id', APP.collectorContext.panelId)
            .order('nombre');

        if (clientes) {
            await saveToCache('clientes_cache', clientes);
        }

        // Actualizar cache de créditos
        const { data: creditos } = await APP.supabase
            .from('prestamos')
            .select(`
                id, monto_prestado, cuota_diaria, total_dias, estado, fecha_inicio,
                monto_pagado, saldo_pendiente,
                clients:cliente_id(nombre, telefono, cedula)
            `)
            .eq('panel_id', APP.collectorContext.panelId)
            .eq('cobrador_id', APP.collectorContext.collectorId)
            .eq('estado', 'activo')
            .order('fecha_inicio', { ascending: false });

        if (creditos) {
            await saveToCache('creditos_cache', creditos);
        }

        // Actualizar cache de cuotas pendientes
        const { data: cuotas } = await APP.supabase
            .from('v_cuotas_cobrador_local')
            .select('*')
            .eq('cobrador_id', APP.collectorContext.collectorId);

        if (cuotas) {
            await saveToCache('cuotas_cache', cuotas);
        }

        // Actualizar cache de settings del panel
        const { data: settingsRows } = await APP.supabase
            .from('settings')
            .select('*')
            .eq('panel_id', APP.collectorContext.panelId);

        if (Array.isArray(settingsRows) && settingsRows.length > 0) {
            const mapped = settingsRows.map(s => ({
                ...s,
                panel_id: APP.collectorContext.panelId,
                ultima_actualizacion: Date.now()
            }));
            await saveToCache('panel_settings_cache', mapped);
        }

        // 🆕 Actualizar cache de préstamos detallados (para pagos/recogidas offline)
        // Solo si hay préstamos activos
        if (creditos && creditos.length > 0) {
            console.log('🔄 Actualizando cache de préstamos detallados...');
            // Usar la función cachePrestamoCompleto si está disponible
            if (typeof cachePrestamoCompleto === 'function') {
                for (const credito of creditos) {
                    await cachePrestamoCompleto(credito.id);
                }
            }
        }

        console.log('✅ Cache actualizado correctamente');

    } catch (error) {
        console.error('❌ Error actualizando cache:', error);
    }
}

/**
 * ===========================
 * UTILIDADES
 * ===========================
 */

/**
 * Actualizar referencias de temp_id a ID real
 * @param {string} tipo - 'cliente' o 'credito'
 * @param {string} tempId - ID temporal
 * @param {string} realId - ID real de Supabase
 */
async function updateReferences(tipo, tempId, realId) {
    if (!DB.isSupported || !DB.instance) return;

    try {
        const db = DB.instance;
        
        if (tipo === 'cliente') {
            // Actualizar referencias en créditos offline
            const creditosTx = db.transaction(['offline_creditos'], 'readwrite');
            const creditosStore = creditosTx.objectStore('offline_creditos');
            const creditosRequest = creditosStore.getAll();

            creditosRequest.onsuccess = async () => {
                const creditos = creditosRequest.result;
                for (const credito of creditos) {
                    if (credito.cliente_id === tempId) {
                        credito.cliente_id = realId;
                        await creditosStore.put(credito);
                    }
                }
            };

            // Actualizar referencias en pagos offline
            const pagosTx = db.transaction(['offline_pagos'], 'readwrite');
            const pagosStore = pagosTx.objectStore('offline_pagos');
            const pagosRequest = pagosStore.getAll();

            pagosRequest.onsuccess = async () => {
                const pagos = pagosRequest.result;
                for (const pago of pagos) {
                    if (pago.cliente_id === tempId) {
                        pago.cliente_id = realId;
                        await pagosStore.put(pago);
                    }
                }
            };

            // Actualizar referencias en recogidas offline
            const recogidasTx = db.transaction(['offline_recogidas'], 'readwrite');
            const recogidasStore = recogidasTx.objectStore('offline_recogidas');
            const recogidasRequest = recogidasStore.getAll();

            recogidasRequest.onsuccess = async () => {
                const recogidas = recogidasRequest.result;
                for (const recogida of recogidas) {
                    if (recogida.cliente_id === tempId) {
                        recogida.cliente_id = realId;
                        await recogidasStore.put(recogida);
                    }
                }
            };
        }

        if (tipo === 'credito') {
            // Actualizar referencias en pagos offline
            const pagosTx = db.transaction(['offline_pagos'], 'readwrite');
            const pagosStore = pagosTx.objectStore('offline_pagos');
            const pagosRequest = pagosStore.getAll();

            pagosRequest.onsuccess = async () => {
                const pagos = pagosRequest.result;
                for (const pago of pagos) {
                    if (pago.prestamo_id === tempId) {
                        pago.prestamo_id = realId;
                        await pagosStore.put(pago);
                    }
                }
            };
        }

        console.log(`✅ Referencias actualizadas: ${tempId} → ${realId}`);

    } catch (error) {
        console.error('❌ Error actualizando referencias:', error);
    }
}

/**
 * Incrementar contador de intentos de sincronización
 * @param {string} storeName - Nombre del store
 * @param {string} tempId - ID temporal
 * @param {string} errorMsg - Mensaje de error
 */
async function incrementSyncAttempts(storeName, tempId, errorMsg) {
    if (!DB.isSupported || !DB.instance) return;

    try {
        const db = DB.instance;
        const tx = db.transaction([storeName, 'cola_sync'], 'readwrite');
        
        // Actualizar item en store offline
        const store = tx.objectStore(storeName);
        const item = await store.get(tempId);
        
        if (item) {
            item.sync_attempts = (item.sync_attempts || 0) + 1;
            item.last_error = errorMsg;
            item.last_attempt = Date.now();
            await store.put(item);
        }

        // Actualizar en cola_sync
        const colaStore = tx.objectStore('cola_sync');
        const colaIndex = colaStore.index('tipo');
        const colaRequest = colaIndex.getAll(storeName);

        colaRequest.onsuccess = async () => {
            const items = colaRequest.result;
            const colaItem = items.find(i => i.temp_id === tempId);
            
            if (colaItem) {
                colaItem.intentos = (colaItem.intentos || 0) + 1;
                colaItem.ultimo_intento = Date.now();
                colaItem.error = errorMsg;
                await colaStore.put(colaItem);
            }
        };

        await tx.complete;

    } catch (error) {
        console.error('❌ Error incrementando intentos:', error);
    }
}

/**
 * Actualizar badge de sincronización
 * @param {string} status - 'sync' | 'done'
 * @param {number} count - Cantidad de items
 */
function updateSyncBadge(status, count) {
    const badge = document.getElementById('offlineBadge');
    if (!badge) return;

    if (count > 0) {
        badge.textContent = status === 'sync' ? `⏳ ${count}` : `${count}`;
        badge.style.display = 'inline-block';
        badge.style.backgroundColor = status === 'sync' ? '#ff9800' : '#f44336';
    } else {
        badge.style.display = 'none';
    }
}

/**
 * Forzar sincronización manual
 */
async function forceSyncNow() {
    console.log('🔄 Sincronización manual iniciada...');
    
    if (!navigator.onLine) {
        showError('Sin conexión a internet');
        return;
    }

    await syncOfflineData();
}

/**
 * Obtener estado de sincronización
 * @returns {Object} Estado de sincronización
 */
function getSyncStatus() {
    return {
        isRunning: SYNC.isRunning,
        lastSync: SYNC.lastSync,
        totalSynced: SYNC.totalSynced,
        totalFailed: SYNC.totalFailed
    };
}

console.log('✅ sync.js cargado');

