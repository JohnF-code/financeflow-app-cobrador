# 📡 ConnectionManager - Sistema de Gestión de Conexión Inteligente

## v9.9 - Cobrador App

---

## 🎯 Objetivo

Proporcionar detección real de conectividad, login offline, sincronización automática al reconectar, y validación antes de enviar datos al servidor.

---

## 🏗️ Arquitectura

### **Módulo:** `connectionManager.js` (~10 KB)

**Funciones principales:**

1. **`init(supabaseUrl, onReconnect)`** - Inicializa el gestor con la URL de Supabase y callback de reconexión
2. **`pingServidorBase(url, timeout)`** - Hace ping real con timeout configurable (default: 2s)
3. **`validarConexionInicial()`** - Valida conexión con Vercel al iniciar la app
4. **`validarConexionSupabase(apiKey)`** - Valida conexión con Supabase antes de operaciones críticas
5. **`escucharReconexión(callback)`** - Escucha evento `online` y ejecuta sincronización
6. **`validarAntesDeEnviar(forceRecheck)`** - Valida conexión antes de POST/PATCH (con cache de 5s)
7. **`getStatus()`** - Obtiene estado actual de conexión
8. **`destroy()`** - Limpia listeners (cleanup)

---

## 🔄 Flujo de Conexión

### **1. Inicio de la App**

```
Usuario abre la app
  ↓
initDB() + initCrypto()
  ↓
Supabase.createClient()
  ↓
ConnectionManager.init(SUPABASE_URL, callback)
  ↓
validarConexionInicial() → Ping a Vercel
  ↓
┌─────────────────────────────────────────┐
│ ¿Vercel responde?                       │
├─────────────────────────────────────────┤
│ ✅ SÍ → APP.isOnline = true             │
│   - Intentar getSession()               │
│   - Si hay sesión → continuar online    │
│   - Si no → mostrar login               │
│                                         │
│ ❌ NO → APP.isOnline = false            │
│   - Buscar auth_cache en IndexedDB      │
│   - Si existe → Login offline           │
│   - Si no → mostrar login (bloqueado)   │
└─────────────────────────────────────────┘
```

### **2. Login Online**

```
Usuario ingresa credenciales
  ↓
validarConexionSupabase() → Ping a Supabase REST API
  ↓
┌─────────────────────────────────────────┐
│ ¿Supabase responde?                     │
├─────────────────────────────────────────┤
│ ✅ SÍ → signInWithPassword()            │
│   - Guardar auth_cache en IndexedDB    │
│   - Recargar página                     │
│                                         │
│ ❌ NO → Mostrar error                   │
│   "No hay conexión con el servidor"    │
└─────────────────────────────────────────┘
```

### **3. Login Offline**

```
Sin conexión a Vercel
  ↓
Buscar auth_cache en IndexedDB
  ↓
┌─────────────────────────────────────────┐
│ ¿Existe auth_cache?                     │
├─────────────────────────────────────────┤
│ ✅ SÍ → Cargar sesión offline           │
│   - APP.offlineAuth = authData          │
│   - APP.collectorContext = cache        │
│   - Cargar datos desde cache            │
│   - Mostrar banner "Modo offline"       │
│                                         │
│ ❌ NO → Mostrar login (bloqueado)       │
│   "Requiere conexión inicial"           │
└─────────────────────────────────────────┘
```

### **4. Registro de Pago**

```
Usuario registra un pago
  ↓
validarAntesDeEnviar() → Ping a Supabase (cache 5s)
  ↓
┌─────────────────────────────────────────┐
│ ¿Conexión disponible?                   │
├─────────────────────────────────────────┤
│ ✅ SÍ → INSERT en Supabase              │
│   - Guardar en tabla pagos              │
│   - Actualizar cuota                    │
│   - Mostrar éxito                       │
│                                         │
│ ❌ NO → Guardar offline                 │
│   - Agregar a APP.offlineData.payments  │
│   - Guardar en cola_sync (IndexedDB)    │
│   - Mostrar "Guardado offline"          │
└─────────────────────────────────────────┘
```

### **5. Reconexión Automática**

```
Evento "online" detectado
  ↓
Esperar 1 segundo (estabilización)
  ↓
validarConexionSupabase() → Ping real
  ↓
┌─────────────────────────────────────────┐
│ ¿Supabase responde?                     │
├─────────────────────────────────────────┤
│ ✅ SÍ → Sincronización automática       │
│   - sincronizarDatosPendientes()        │
│   - prepareOfflineData()                │
│   - loadDashboardData()                 │
│   - Mostrar "Datos sincronizados"       │
│                                         │
│ ❌ NO → Reintentar (máx 3 veces)        │
│   - Esperar 5s entre reintentos         │
└─────────────────────────────────────────┘
```

---

## 💾 Cache Structure (IndexedDB)

### **Object Stores:**

```javascript
{
  // Auth cache (para login offline)
  "auth_cache": [
    {
      id: "user-uuid",
      email: "cobrador@example.com",
      nombre: "Juan",
      collector_id: "collector-uuid",
      panel_id: "panel-uuid",
      last_login: "2025-01-15T10:30:00Z"
    }
  ],
  
  // Cola de sincronización
  "cola_sync": [
    {
      cuota_id: "cuota-uuid",
      prestamo_id: "prestamo-uuid",
      cliente_id: "cliente-uuid",
      monto: 50000,
      fecha_pago: "2025-01-15",
      hora_pago: "10:30:00",
      status: "pending_sync"
    }
  ],
  
  // Otros caches...
  "cuotas_cache": [...],
  "prestamos_detalle_cache": [...],
  "clientes_cache": [...],
  "pagos_cache": [...],
  "saldos_mora_cache": [...]
}
```

---

## ⚡ Optimizaciones

### **1. Cache de Ping (5 segundos)**

```javascript
// Evita pings repetitivos
if (timeSinceLastPing < 5000 && state.supabaseReachable) {
  return true; // Usar cache
}
```

### **2. Timeout de 2 segundos**

```javascript
// Ping rápido, no bloquea la UI
const controller = new AbortController();
setTimeout(() => controller.abort(), 2000);
```

### **3. Reintentos Inteligentes**

```javascript
// Máximo 3 reintentos con 5s de espera
if (reconnectAttempts < maxReconnectAttempts) {
  setTimeout(() => retry(), 5000);
}
```

### **4. Modo `no-cors` para Ping**

```javascript
// Evita problemas de CORS en ping
fetch(url, { mode: 'no-cors' })
```

---

## 🔍 Debugging

### **Estado en Consola:**

```javascript
// Ver estado actual
ConnectionManager.getStatus()
// → {
//     online: true,
//     supabaseReachable: true,
//     navigatorOnline: true,
//     lastPing: "10:30:45",
//     lastSync: "10:30:50"
//   }
```

### **Logs en Consola:**

- ✅ `Ping exitoso a ... (120ms)`
- ❌ `Ping fallido a ...`
- ⏱️ `Timeout en ping a ...`
- 🔄 `Reconexión confirmada con Supabase`
- 🔄 `Reintento 1/3 en 5s...`
- 📵 `Evento "offline" detectado`

---

## 📊 Comparación con Navigator.onLine

| Característica | `navigator.onLine` | `ConnectionManager` |
|----------------|-------------------|---------------------|
| **Detección de red local** | ✅ Sí | ✅ Sí |
| **Validación de servidor** | ❌ No | ✅ Sí (ping real) |
| **Timeout configurable** | ❌ No | ✅ Sí (2s default) |
| **Cache de estado** | ❌ No | ✅ Sí (5s) |
| **Reintentos automáticos** | ❌ No | ✅ Sí (3 max) |
| **Callback de reconexión** | ❌ No | ✅ Sí |
| **Validación antes de enviar** | ❌ No | ✅ Sí |

---

## 🚀 Próximas Mejoras

1. **Latency Monitor** - Medir latencia promedio y mostrar indicador de calidad de red
2. **Retry con Backoff Exponencial** - 2s → 4s → 8s en lugar de 5s fijo
3. **Sincronización Parcial** - Sincronizar en lotes pequeños para evitar timeouts
4. **Network Quality Indicator** - Mostrar 📶 señal fuerte/media/débil basado en latencia
5. **Offline Queue Viewer** - Modal para ver y gestionar cola de sincronización

---

## 📝 Notas Técnicas

### **¿Por qué no usar Service Worker para detectar conexión?**

- Los Service Workers se ejecutan en un contexto diferente y no tienen acceso directo al estado de la app
- El ping desde el Service Worker no puede actualizar el estado de React/UI en tiempo real
- ConnectionManager está en el contexto principal, puede actualizar inmediatamente el estado global

### **¿Por qué ping con `mode: 'no-cors'`?**

- Evita errores de CORS al hacer HEAD request
- Solo necesitamos saber si el servidor responde, no necesitamos leer la respuesta
- Funciona con cualquier dominio sin necesidad de configurar CORS headers

### **¿Por qué guardar auth en cache?**

- Permite login offline después del primer login online exitoso
- El usuario puede acceder a datos cacheados sin conexión
- Al reconectar, se puede validar la sesión y sincronizar

---

## 🔒 Seguridad

- **Las contraseñas NO se guardan** - Solo se guarda el ID del usuario y metadata
- **La sesión de Supabase expira** - El login offline es temporal
- **Los datos se cifran** con `crypto.js` antes de guardar en IndexedDB
- **Las operaciones offline se sincronizan** con validación en el servidor

---

## 📦 Tamaño del Módulo

- **connectionManager.js**: ~10 KB (sin comprimir)
- **Impacto total**: < 15 KB con dependencias
- **Sin bibliotecas externas**: Vanilla JavaScript puro

---

## ✅ Checklist de Implementación

- [x] Módulo `connectionManager.js` creado
- [x] Integración en `init()` de la app
- [x] Validación en login
- [x] Validación antes de enviar datos
- [x] Listener de reconexión
- [x] Cache de auth para login offline
- [x] Callback de sincronización automática
- [x] Actualización de Service Worker
- [x] Documentación completa

---

**Versión:** v9.9  
**Fecha:** Enero 2025  
**Autor:** FinanceFlow Team


