// connectionManager.js - Gestión inteligente de conexión y sincronización
// v1.0 - Sistema modular para detección real de conectividad

const ConnectionManager = {
    // Estado de conexión
    state: {
        online: false,
        supabaseReachable: false,
        lastPingTime: 0,
        lastSyncTime: 0,
        reconnectAttempts: 0,
        maxReconnectAttempts: 3
    },

    // URLs para ping
    urls: {
        vercel: 'https://financeflow-app-cobrador.vercel.app/',
        supabase: null // Se configurará dinámicamente
    },

    // Listeners activos
    listeners: {
        reconnect: null,
        offline: null
    },

    /**
     * Inicializar el gestor de conexión
     * @param {string} supabaseUrl - URL de Supabase
     * @param {Function} onReconnect - Callback al reconectar
     */
    init(supabaseUrl, onReconnect) {
        this.urls.supabase = `${supabaseUrl}/rest/v1/`;
        
        // Configurar listeners de red
        this.escucharReconexion(onReconnect);
        
        console.log('🌐 ConnectionManager inicializado');
    },

    /**
     * Ping real al servidor con timeout
     * @param {string} url - URL a verificar
     * @param {number} timeout - Timeout en ms (default: 2000)
     * @returns {Promise<boolean>} - true si responde
     */
    async pingServidorBase(url, timeout = 2000) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const startTime = Date.now();
            const response = await fetch(url, {
                method: 'HEAD',
                mode: 'no-cors', // Evita CORS en ping
                cache: 'no-store',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            const latency = Date.now() - startTime;
            
            console.log(`✅ Ping exitoso a ${url.split('/')[2]} (${latency}ms)`);
            return true;
        } catch (error) {
            clearTimeout(timeoutId);
            
            if (error.name === 'AbortError') {
                console.warn(`⏱️ Timeout en ping a ${url.split('/')[2]}`);
            } else {
                console.warn(`❌ Ping fallido a ${url.split('/')[2]}:`, error.message);
            }
            
            return false;
        }
    },

    /**
     * Validar conexión inicial con Vercel
     * @returns {Promise<boolean>}
     */
    async validarConexionInicial() {
        console.log('🔍 Validando conexión inicial...');
        
        // Primero verificar el estado del navegador
        if (!navigator.onLine) {
            console.log('📵 Navigator.onLine = false');
            this.state.online = false;
            return false;
        }

        // Ping real a Vercel
        const vercelOk = await this.pingServidorBase(this.urls.vercel, 3000);
        this.state.online = vercelOk;
        
        if (!vercelOk) {
            console.log('🚫 Vercel no responde - Iniciando en modo offline');
        }
        
        return vercelOk;
    },

    /**
     * Validar conexión con Supabase (antes de login o sync)
     * @param {string} apiKey - API key de Supabase (opcional, para ping autenticado)
     * @returns {Promise<boolean>}
     */
    async validarConexionSupabase(apiKey = null) {
        console.log('🔍 Validando conexión con Supabase...');
        
        if (!this.urls.supabase) {
            console.error('❌ URL de Supabase no configurada');
            return false;
        }

        // Si no hay conexión básica, no intentar
        if (!navigator.onLine) {
            console.log('📵 Sin conexión de red');
            this.state.supabaseReachable = false;
            return false;
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);

            const headers = {
                'Accept': 'application/json'
            };
            
            if (apiKey) {
                headers['apikey'] = apiKey;
            }

            const response = await fetch(this.urls.supabase, {
                method: 'GET',
                headers,
                cache: 'no-store',
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            
            // Cualquier respuesta (incluso 404) significa que Supabase responde
            const reachable = response.status !== 0;
            this.state.supabaseReachable = reachable;
            this.state.lastPingTime = Date.now();
            
            if (reachable) {
                console.log(`✅ Supabase alcanzable (status: ${response.status})`);
            }
            
            return reachable;
        } catch (error) {
            console.warn('❌ Supabase no responde:', error.message);
            this.state.supabaseReachable = false;
            return false;
        }
    },

    /**
     * Escuchar evento de reconexión y ejecutar callback
     * @param {Function} onReconnectCallback - Función a ejecutar al reconectar
     */
    escucharReconexión(onReconnectCallback) {
        // Remover listeners previos si existen
        if (this.listeners.reconnect) {
            window.removeEventListener('online', this.listeners.reconnect);
        }
        if (this.listeners.offline) {
            window.removeEventListener('offline', this.listeners.offline);
        }

        // Listener de reconexión
        this.listeners.reconnect = async () => {
            console.log('🔄 Evento "online" detectado - Verificando conexión real...');
            
            // Esperar 1 segundo antes de verificar (estabilización)
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Ping real a Supabase
            const supabaseOk = await this.validarConexionSupabase();
            
            if (supabaseOk) {
                console.log('✅ Reconexión confirmada con Supabase');
                this.state.online = true;
                this.state.reconnectAttempts = 0;
                
                // Actualizar estado global
                if (window.APP) {
                    window.APP.isOnline = true;
                }
                
                // Ejecutar callback de sincronización
                if (typeof onReconnectCallback === 'function') {
                    try {
                        console.log('🔄 Iniciando sincronización automática...');
                        await onReconnectCallback();
                        this.state.lastSyncTime = Date.now();
                    } catch (error) {
                        console.error('❌ Error en sincronización automática:', error);
                    }
                }
            } else {
                console.warn('⚠️ Evento "online" pero Supabase aún no responde');
                
                // Reintentar después de 5 segundos (máximo 3 veces)
                if (this.state.reconnectAttempts < this.maxReconnectAttempts) {
                    this.state.reconnectAttempts++;
                    console.log(`🔄 Reintento ${this.state.reconnectAttempts}/${this.maxReconnectAttempts} en 5s...`);
                    
                    setTimeout(() => {
                        this.listeners.reconnect();
                    }, 5000);
                }
            }
        };

        // Listener de desconexión
        this.listeners.offline = () => {
            console.log('📵 Evento "offline" detectado');
            this.state.online = false;
            this.state.supabaseReachable = false;
            
            if (window.APP) {
                window.APP.isOnline = false;
            }
        };

        // Agregar listeners
        window.addEventListener('online', this.listeners.reconnect);
        window.addEventListener('offline', this.listeners.offline);
        
        console.log('👂 Listeners de reconexión activados');
    },

    /**
     * Validar conexión antes de enviar datos (POST/PATCH)
     * @param {boolean} forceRecheck - Forzar revalidación aunque cache diga que está online
     * @returns {Promise<boolean>}
     */
    async validarAntesDeEnviar(forceRecheck = false) {
        // Si hace menos de 5 segundos que hicimos ping, usar cache
        const timeSinceLastPing = Date.now() - this.state.lastPingTime;
        
        if (!forceRecheck && timeSinceLastPing < 5000 && this.state.supabaseReachable) {
            console.log('✅ Conexión válida (cache)');
            return true;
        }

        // Re-validar conexión
        console.log('🔍 Validando conexión antes de enviar datos...');
        const isReachable = await this.validarConexionSupabase();
        
        if (!isReachable) {
            console.warn('⚠️ No hay conexión con Supabase - Operación se guardará offline');
        }
        
        return isReachable;
    },

    /**
     * Obtener estado actual de conexión
     * @returns {Object} Estado actual
     */
    getStatus() {
        return {
            online: this.state.online,
            supabaseReachable: this.state.supabaseReachable,
            navigatorOnline: navigator.onLine,
            lastPing: this.state.lastPingTime > 0 ? new Date(this.state.lastPingTime).toLocaleTimeString() : 'Nunca',
            lastSync: this.state.lastSyncTime > 0 ? new Date(this.state.lastSyncTime).toLocaleTimeString() : 'Nunca'
        };
    },

    /**
     * Limpiar listeners (cleanup)
     */
    destroy() {
        if (this.listeners.reconnect) {
            window.removeEventListener('online', this.listeners.reconnect);
        }
        if (this.listeners.offline) {
            window.removeEventListener('offline', this.listeners.offline);
        }
        
        console.log('🧹 ConnectionManager limpiado');
    }
};

// Exportar como módulo global
window.ConnectionManager = ConnectionManager;


