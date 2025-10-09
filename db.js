/**
 * ========================================
 * 💾 IndexedDB Wrapper - smart_cobros_db
 * ========================================
 * Base de datos local robusta para operaciones offline
 * Sin dependencias externas - Compatible móviles
 */

const DB_NAME = 'smart_cobros_db';
const DB_VERSION = 2; // 🆕 v2: Agregar prestamos_detalle_cache y panel_settings_cache

// Estado global de la base de datos
const DB = {
    instance: null,
    isReady: false,
    isSupported: true
};

// Función helper para generar UUID (fallback si crypto.randomUUID no está disponible)
function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback UUID v4
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Inicializar IndexedDB
 * Crea todos los stores necesarios
 */
async function initDB() {
    console.log('🔧 Inicializando IndexedDB...');
    
    // Verificar soporte
    if (!window.indexedDB) {
        console.warn('⚠️ IndexedDB no soportado - usando fallback localStorage');
        DB.isSupported = false;
        return initLegacyStorage();
    }

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        // Crear/actualizar schema
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            console.log('📦 Creando stores de IndexedDB...');

            // ===========================
            // CACHE DE DATOS ONLINE
            // ===========================
            
            // Cache de clientes del panel
            if (!db.objectStoreNames.contains('clientes_cache')) {
                const clientesStore = db.createObjectStore('clientes_cache', { keyPath: 'id' });
                clientesStore.createIndex('nombre', 'nombre', { unique: false });
                clientesStore.createIndex('cedula', 'cedula', { unique: false });
                console.log('  ✅ clientes_cache creado');
            }

            // Cache de créditos activos
            if (!db.objectStoreNames.contains('creditos_cache')) {
                const creditosStore = db.createObjectStore('creditos_cache', { keyPath: 'id' });
                creditosStore.createIndex('cliente_id', 'cliente_id', { unique: false });
                creditosStore.createIndex('estado', 'estado', { unique: false });
                console.log('  ✅ creditos_cache creado');
            }

            // Cache de cuotas pendientes (dashboard)
            if (!db.objectStoreNames.contains('cuotas_cache')) {
                const cuotasStore = db.createObjectStore('cuotas_cache', { keyPath: 'id' });
                cuotasStore.createIndex('prestamo_id', 'prestamo_id', { unique: false });
                cuotasStore.createIndex('fecha', 'fecha', { unique: false });
                console.log('  ✅ cuotas_cache creado');
            }

            // Cache de settings del panel
            if (!db.objectStoreNames.contains('settings_cache')) {
                const settingsStore = db.createObjectStore('settings_cache', { keyPath: 'key' });
                console.log('  ✅ settings_cache creado');
            }

            // Cache de pagos (para "Mis Pagos")
            if (!db.objectStoreNames.contains('pagos_cache')) {
                const pagosStore = db.createObjectStore('pagos_cache', { keyPath: 'id' });
                pagosStore.createIndex('prestamo_id', 'prestamo_id', { unique: false });
                pagosStore.createIndex('fecha_pago', 'fecha_pago', { unique: false });
                console.log('  ✅ pagos_cache creado');
            }

            // 🆕 Cache de préstamos con detalle completo (para pagos/recogidas offline)
            if (!db.objectStoreNames.contains('prestamos_detalle_cache')) {
                const prestamosDetalleStore = db.createObjectStore('prestamos_detalle_cache', { keyPath: 'id' });
                prestamosDetalleStore.createIndex('cliente_id', 'cliente_id', { unique: false });
                prestamosDetalleStore.createIndex('cobrador_id', 'cobrador_id', { unique: false });
                prestamosDetalleStore.createIndex('estado', 'estado', { unique: false });
                prestamosDetalleStore.createIndex('ultima_actualizacion', 'ultima_actualizacion', { unique: false });
                console.log('  ✅ prestamos_detalle_cache creado');
            }

            // 🆕 Cache de settings del panel (para cálculos offline)
            if (!db.objectStoreNames.contains('panel_settings_cache')) {
                const panelSettingsStore = db.createObjectStore('panel_settings_cache', { keyPath: 'panel_id' });
                panelSettingsStore.createIndex('ultima_actualizacion', 'ultima_actualizacion', { unique: false });
                console.log('  ✅ panel_settings_cache creado');
            }

            // ===========================
            // DATOS OFFLINE (sin sincronizar)
            // ===========================
            
            // Clientes creados offline
            if (!db.objectStoreNames.contains('offline_clientes')) {
                const offlineClientesStore = db.createObjectStore('offline_clientes', { keyPath: 'temp_id' });
                offlineClientesStore.createIndex('timestamp', 'timestamp', { unique: false });
                offlineClientesStore.createIndex('synced', 'synced', { unique: false });
                console.log('  ✅ offline_clientes creado');
            }

            // Créditos creados offline
            if (!db.objectStoreNames.contains('offline_creditos')) {
                const offlineCreditosStore = db.createObjectStore('offline_creditos', { keyPath: 'temp_id' });
                offlineCreditosStore.createIndex('timestamp', 'timestamp', { unique: false });
                offlineCreditosStore.createIndex('synced', 'synced', { unique: false });
                console.log('  ✅ offline_creditos creado');
            }

            // Pagos registrados offline
            if (!db.objectStoreNames.contains('offline_pagos')) {
                const offlinePagosStore = db.createObjectStore('offline_pagos', { keyPath: 'temp_id' });
                offlinePagosStore.createIndex('timestamp', 'timestamp', { unique: false });
                offlinePagosStore.createIndex('synced', 'synced', { unique: false });
                console.log('  ✅ offline_pagos creado');
            }

            // Créditos recogidos offline
            if (!db.objectStoreNames.contains('offline_recogidas')) {
                const offlineRecogidasStore = db.createObjectStore('offline_recogidas', { keyPath: 'temp_id' });
                offlineRecogidasStore.createIndex('timestamp', 'timestamp', { unique: false });
                offlineRecogidasStore.createIndex('synced', 'synced', { unique: false });
                console.log('  ✅ offline_recogidas creado');
            }

            // ===========================
            // METADATA DE SINCRONIZACIÓN
            // ===========================
            
            // Cola de sincronización (metadata)
            if (!db.objectStoreNames.contains('cola_sync')) {
                const colaSyncStore = db.createObjectStore('cola_sync', { keyPath: 'id', autoIncrement: true });
                colaSyncStore.createIndex('tipo', 'tipo', { unique: false });
                colaSyncStore.createIndex('timestamp', 'timestamp', { unique: false });
                colaSyncStore.createIndex('intentos', 'intentos', { unique: false });
                console.log('  ✅ cola_sync creado');
            }

            console.log('✅ IndexedDB schema creado correctamente');
        };

        request.onsuccess = (event) => {
            DB.instance = event.target.result;
            DB.isReady = true;
            console.log('✅ IndexedDB conectado:', DB_NAME);
            console.log('📋 Stores disponibles:', Array.from(DB.instance.objectStoreNames));
            resolve(DB.instance);
        };

        request.onerror = (event) => {
            console.error('❌ Error al abrir IndexedDB:', event.target.error);
            DB.isSupported = false;
            reject(event.target.error);
        };

        request.onblocked = () => {
            console.warn('⚠️ IndexedDB bloqueado - cierra otras pestañas de la app');
        };
    });
}

/**
 * ===========================
 * OPERACIONES DE CACHE (datos online)
 * ===========================
 */

/**
 * Guardar datos en cache (desde Supabase)
 * @param {string} storeName - Nombre del store (ej: 'clientes_cache')
 * @param {Array|Object} data - Datos a guardar
 */
async function saveToCache(storeName, data) {
    if (!DB.isSupported || !DB.instance) {
        console.warn('⚠️ IndexedDB no disponible - no se puede cachear');
        return;
    }

    try {
        const db = DB.instance;
        const items = Array.isArray(data) ? data : [data];
        
        return new Promise(async (resolve, reject) => {
            const tx = db.transaction([storeName], 'readwrite');
            const store = tx.objectStore(storeName);
            
            tx.onerror = () => reject(tx.error);
            tx.oncomplete = () => {
                console.log(`💾 Cache guardado: ${storeName} (${items.length} items)`);
                resolve();
            };

            // Limpiar cache anterior
            store.clear();

            // Guardar nuevos datos
            for (const item of items) {
                // Cifrar si es necesario
                const encrypted = CRYPTO.isEnabled ? await encryptObject(item) : item;
                store.put(encrypted);
            }
        });
    } catch (error) {
        console.error(`❌ Error guardando cache en ${storeName}:`, error);
        throw error;
    }
}

/**
 * Leer datos de cache
 * @param {string} storeName - Nombre del store
 * @returns {Array} Datos del cache
 */
async function loadFromCache(storeName) {
    if (!DB.isSupported || !DB.instance) {
        console.warn('⚠️ IndexedDB no disponible');
        return [];
    }

    try {
        const db = DB.instance;
        const tx = db.transaction([storeName], 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.getAll();

        return new Promise((resolve, reject) => {
            request.onsuccess = async () => {
                const data = request.result || [];
                
                // Descifrar si es necesario
                if (CRYPTO.isEnabled && data.length > 0) {
                    const decrypted = await Promise.all(
                        data.map(item => decryptObject(item))
                    );
                    console.log(`📂 Cache leído: ${storeName} (${decrypted.length} items)`);
                    resolve(decrypted);
                } else {
                    console.log(`📂 Cache leído: ${storeName} (${data.length} items)`);
                    resolve(data);
                }
            };
            
            request.onerror = () => {
                console.error(`❌ Error leyendo cache de ${storeName}:`, request.error);
                reject(request.error);
            };
        });
    } catch (error) {
        console.error(`❌ Error en loadFromCache(${storeName}):`, error);
        return [];
    }
}

/**
 * ===========================
 * OPERACIONES OFFLINE
 * ===========================
 */

/**
 * Guardar operación offline (crear cliente, pago, etc)
 * @param {string} storeName - Nombre del store offline
 * @param {Object} data - Datos a guardar
 */
async function saveOffline(storeName, data) {
    if (!DB.isSupported || !DB.instance) {
        console.warn('⚠️ Usando fallback localStorage');
        return saveLegacyOffline(storeName, data);
    }

    try {
        console.log(`📝 Guardando en ${storeName}:`, data);
        const db = DB.instance;
        
        // Agregar metadata
        const tipo = storeName.replace('offline_', ''); // Remover prefijo "offline_" si existe
        const offlineData = {
            ...data,
            temp_id: data.temp_id || `offline_${tipo}_${Date.now()}_${generateUUID()}`,
            timestamp: data.timestamp || Date.now(),
            synced: false,
            sync_attempts: 0
        };

        console.log(`🔑 temp_id generado: ${offlineData.temp_id}`);

        // Cifrar datos sensibles (si está habilitado)
        const encrypted = CRYPTO.isEnabled ? await encryptObject(offlineData) : offlineData;

        // Guardar en store offline y cola_sync usando promesas
        return new Promise((resolve, reject) => {
            try {
                const tx = db.transaction([storeName, 'cola_sync'], 'readwrite');
                
                tx.onerror = (event) => {
                    console.error(`❌ Error en transacción ${storeName}:`, event.target.error);
                    console.error('❌ Detalles completos:', event);
                    reject(event.target.error);
                };
                
                tx.oncomplete = () => {
                    console.log(`✅ Transacción completa: ${storeName} - ${offlineData.temp_id}`);
                    resolve(offlineData.temp_id);
                };

                tx.onabort = (event) => {
                    console.error(`❌ Transacción abortada ${storeName}:`, event.target.error);
                    reject(new Error('Transaction aborted'));
                };

                // Guardar en store offline
                const store = tx.objectStore(storeName);
                const putRequest = store.put(encrypted);
                
                putRequest.onsuccess = () => {
                    console.log(`✅ Dato guardado en ${storeName}`);
                };
                
                putRequest.onerror = (event) => {
                    console.error(`❌ Error en put ${storeName}:`, event.target.error);
                    console.error('❌ Datos que intentó guardar:', encrypted);
                };

                // Agregar a cola de sincronización
                const colaStore = tx.objectStore('cola_sync');
                const colaData = {
                    tipo: storeName,
                    temp_id: offlineData.temp_id,
                    timestamp: offlineData.timestamp,
                    intentos: 0,
                    ultimo_intento: null,
                    error: null
                };
                console.log(`📋 Agregando a cola_sync:`, colaData);
                const colaRequest = colaStore.put(colaData);
                
                colaRequest.onsuccess = () => {
                    console.log(`✅ Item agregado a cola_sync`);
                };
                
                colaRequest.onerror = (event) => {
                    console.error(`❌ Error en cola_sync:`, event.target.error);
                    console.error('❌ Datos de cola:', colaData);
                };
            } catch (err) {
                console.error(`❌ Excepción en saveOffline:`, err);
                reject(err);
            }
        });
    } catch (error) {
        console.error(`❌ Error guardando offline en ${storeName}:`, error);
        throw error;
    }
}

/**
 * Obtener todos los items offline pendientes de sincronizar
 * @returns {Object} { clientes: [], creditos: [], pagos: [], recogidas: [] }
 */
async function getOfflineQueue() {
    if (!DB.isSupported || !DB.instance) {
        return getLegacyOfflineQueue();
    }

    try {
        const db = DB.instance;
        const stores = ['offline_clientes', 'offline_creditos', 'offline_pagos', 'offline_recogidas'];
        const queue = {};

        for (const storeName of stores) {
            const tx = db.transaction([storeName], 'readonly');
            const store = tx.objectStore(storeName);
            
            // Obtener TODOS los registros y filtrar manualmente
            const request = store.getAll();

            await new Promise((resolve, reject) => {
                request.onsuccess = async () => {
                    const allData = request.result || [];
                    // Filtrar solo los NO sincronizados
                    const data = allData.filter(item => item.synced === false);
                    
                    // Descifrar si es necesario
                    if (CRYPTO.isEnabled && data.length > 0) {
                        queue[storeName] = await Promise.all(
                            data.map(item => decryptObject(item))
                        );
                    } else {
                        queue[storeName] = data;
                    }
                    
                    resolve();
                };
                request.onerror = () => reject(request.error);
            });
        }

        const totalPendientes = Object.values(queue).reduce((sum, items) => sum + items.length, 0);
        console.log(`📋 Cola offline: ${totalPendientes} items pendientes`);
        
        return queue;
    } catch (error) {
        console.error('❌ Error obteniendo cola offline:', error);
        return { offline_clientes: [], offline_creditos: [], offline_pagos: [], offline_recogidas: [] };
    }
}

/**
 * Marcar item como sincronizado
 * @param {string} storeName - Nombre del store offline
 * @param {string} tempId - ID temporal del item
 */
async function markAsSynced(storeName, tempId) {
    if (!DB.isSupported || !DB.instance) {
        return markLegacyAsSynced(storeName, tempId);
    }

    return new Promise((resolve, reject) => {
        try {
            const db = DB.instance;
            const tx = db.transaction([storeName], 'readwrite');
            const store = tx.objectStore(storeName);
            
            tx.onerror = () => reject(tx.error);
            tx.oncomplete = () => {
                console.log(`✅ Marcado como sincronizado: ${tempId}`);
                resolve();
            };
            
            const getRequest = store.get(tempId);
            getRequest.onsuccess = () => {
                const item = getRequest.result;
                if (item) {
                    item.synced = true;
                    item.synced_at = Date.now();
                    store.put(item);
                }
            };
        } catch (error) {
            console.error(`❌ Error marcando como sincronizado ${tempId}:`, error);
            reject(error);
        }
    });
}

/**
 * Eliminar items sincronizados (limpieza)
 * @param {string} storeName - Nombre del store offline
 */
async function clearSynced(storeName) {
    if (!DB.isSupported || !DB.instance) {
        return clearLegacySynced(storeName);
    }

    return new Promise((resolve, reject) => {
        try {
            const db = DB.instance;
            const tx = db.transaction([storeName, 'cola_sync'], 'readwrite');
            const store = tx.objectStore(storeName);
            const colaStore = tx.objectStore('cola_sync');
            
            tx.onerror = () => reject(tx.error);
            tx.oncomplete = () => {
                console.log(`🗑️ Limpieza completada: ${storeName}`);
                resolve();
            };
            
            const index = store.index('synced');
            const request = index.getAllKeys(true); // synced = true

            request.onsuccess = () => {
                const keys = request.result;
                for (const key of keys) {
                    store.delete(key);
                }
                console.log(`🗑️ ${keys.length} items eliminados de ${storeName}`);
            };

            // Limpiar también de cola_sync
            const colaIndex = colaStore.index('tipo');
            const colaRequest = colaIndex.getAll(storeName);
            
            colaRequest.onsuccess = () => {
                const items = colaRequest.result;
                for (const item of items) {
                    colaStore.delete(item.id);
                }
            };
        } catch (error) {
            console.error(`❌ Error limpiando sincronizados de ${storeName}:`, error);
            reject(error);
        }
    });
}

/**
 * Contar items offline pendientes
 * @returns {number} Total de items pendientes
 */
async function countOfflinePending() {
    if (!DB.isSupported || !DB.instance) {
        return countLegacyOfflinePending();
    }

    try {
        const queue = await getOfflineQueue();
        const total = Object.values(queue).reduce((sum, items) => sum + items.length, 0);
        return total;
    } catch (error) {
        console.error('❌ Error contando pendientes:', error);
        return 0;
    }
}

/**
 * ===========================
 * FALLBACK A LOCALSTORAGE
 * ===========================
 */

function initLegacyStorage() {
    console.log('📦 Usando localStorage como fallback');
    DB.isSupported = false;
    DB.isReady = true;
    return Promise.resolve();
}

function saveLegacyOffline(storeName, data) {
    const key = `legacy_${storeName}`;
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    existing.push(data);
    localStorage.setItem(key, JSON.stringify(existing));
}

function getLegacyOfflineQueue() {
    const stores = ['offline_clientes', 'offline_creditos', 'offline_pagos', 'offline_recogidas'];
    const queue = {};
    
    for (const storeName of stores) {
        const key = `legacy_${storeName}`;
        queue[storeName] = JSON.parse(localStorage.getItem(key) || '[]');
    }
    
    return queue;
}

function markLegacyAsSynced(storeName, tempId) {
    const key = `legacy_${storeName}`;
    const items = JSON.parse(localStorage.getItem(key) || '[]');
    const updated = items.map(item => 
        item.temp_id === tempId ? { ...item, synced: true } : item
    );
    localStorage.setItem(key, JSON.stringify(updated));
}

function clearLegacySynced(storeName) {
    const key = `legacy_${storeName}`;
    const items = JSON.parse(localStorage.getItem(key) || '[]');
    const filtered = items.filter(item => !item.synced);
    localStorage.setItem(key, JSON.stringify(filtered));
}

function countLegacyOfflinePending() {
    const queue = getLegacyOfflineQueue();
    return Object.values(queue).reduce((sum, items) => 
        sum + items.filter(i => !i.synced).length, 0
    );
}

/**
 * ===========================
 * UTILIDADES
 * ===========================
 */

/**
 * Limpiar toda la base de datos (SOLO PARA DEBUG/RESET)
 */
async function clearAllData() {
    if (!DB.isSupported || !DB.instance) {
        localStorage.clear();
        console.log('🗑️ localStorage limpiado');
        return;
    }

    const db = DB.instance;
    const storeNames = Array.from(db.objectStoreNames);
    const tx = db.transaction(storeNames, 'readwrite');
    
    for (const storeName of storeNames) {
        await tx.objectStore(storeName).clear();
    }
    
    await tx.complete;
    console.log('🗑️ IndexedDB limpiado completamente');
}

/**
 * Obtener estadísticas de la base de datos
 */
async function getDBStats() {
    if (!DB.isSupported || !DB.instance) {
        return { supported: false, storage: 'localStorage' };
    }

    const db = DB.instance;
    const stats = {
        supported: true,
        storage: 'IndexedDB',
        stores: {}
    };

    const storeNames = Array.from(db.objectStoreNames);
    
    for (const storeName of storeNames) {
        const tx = db.transaction([storeName], 'readonly');
        const store = tx.objectStore(storeName);
        const count = await store.count();
        
        await new Promise((resolve) => {
            count.onsuccess = () => {
                stats.stores[storeName] = count.result;
                resolve();
            };
        });
    }

    return stats;
}

console.log('✅ db.js cargado');

