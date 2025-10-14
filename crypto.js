/**
 * ========================================
 * 🔐 Cifrado AES-GCM con Web Crypto API
 * ========================================
 * Cifrado/descifrado de datos sensibles
 * Sin dependencias externas - Nativo del navegador
 */

// Estado global del cifrado
const CRYPTO = {
    isEnabled: false,
    isSupported: true,
    key: null,
    keyGenerated: false
};

// Campos sensibles a cifrar por tipo de dato
const SENSITIVE_FIELDS = {
    cliente: ['nombre', 'telefono', 'cedula', 'email'],
    credito: ['monto_prestado', 'cuota_diaria', 'total_dias', 'saldo_pendiente'],
    pago: ['monto'],
    recogida: ['monto_pago', 'monto_prestado', 'cuota_diaria']
};

/**
 * Inicializar sistema de cifrado
 * Genera o recupera la clave de cifrado
 */
async function initCrypto() {
    console.log('🔐 Inicializando sistema de cifrado...');

    // Verificar soporte de Web Crypto API
    if (!window.crypto?.subtle) {
        console.warn('⚠️ Web Crypto API no soportada - cifrado deshabilitado');
        CRYPTO.isSupported = false;
        CRYPTO.isEnabled = false;
        return false;
    }

    try {
        // Verificar si ya existe una clave
        const existingKey = localStorage.getItem('crypto_key_raw');
        
        if (existingKey) {
            // Importar clave existente
            CRYPTO.key = await importKey(existingKey);
            console.log('✅ Clave de cifrado recuperada');
        } else {
            // Generar nueva clave
            CRYPTO.key = await generateKey();
            console.log('✅ Nueva clave de cifrado generada');
        }

        CRYPTO.isEnabled = true;
        CRYPTO.keyGenerated = true;
        
        return true;
    } catch (error) {
        console.error('❌ Error inicializando cifrado:', error);
        CRYPTO.isSupported = false;
        CRYPTO.isEnabled = false;
        return false;
    }
}

/**
 * Generar nueva clave AES-GCM
 * @returns {CryptoKey} Clave generada
 */
async function generateKey() {
    try {
        // Generar clave AES-GCM de 256 bits
        const key = await window.crypto.subtle.generateKey(
            {
                name: 'AES-GCM',
                length: 256
            },
            true, // Exportable
            ['encrypt', 'decrypt']
        );

        // ⚠️ SECURITY WARNING: Storing encryption keys in localStorage is NOT secure!
        // This key can be:
        // - Stolen via XSS attacks
        // - Extracted by malware or browser extensions
        // - Accessed via physical device access
        // - Visible in DevTools
        // 
        // For production use, consider:
        // 1. Storing keys in secure backend with per-session derivation
        // 2. Using Web Crypto API non-exportable keys for session-only encryption
        // 3. Implementing proper key rotation mechanisms
        // 4. Using IndexedDB with encryption-at-rest where supported
        
        // Exportar y guardar en localStorage (para persistencia offline)
        const exported = await window.crypto.subtle.exportKey('raw', key);
        const keyArray = Array.from(new Uint8Array(exported));
        const keyString = keyArray.map(b => String.fromCharCode(b)).join('');
        const keyBase64 = btoa(keyString);
        
        localStorage.setItem('crypto_key_raw', keyBase64);
        localStorage.setItem('crypto_key_generated', new Date().toISOString());

        console.warn('⚠️ SECURITY: Encryption key stored in localStorage - not secure for production use');
        console.log('🔑 Clave AES-GCM generada y guardada');
        return key;
    } catch (error) {
        console.error('❌ Error generando clave:', error);
        throw error;
    }
}

/**
 * Importar clave desde Base64
 * @param {string} keyBase64 - Clave en formato Base64
 * @returns {CryptoKey} Clave importada
 */
async function importKey(keyBase64) {
    try {
        const keyString = atob(keyBase64);
        const keyArray = new Uint8Array(keyString.split('').map(c => c.charCodeAt(0)));
        
        const key = await window.crypto.subtle.importKey(
            'raw',
            keyArray,
            {
                name: 'AES-GCM',
                length: 256
            },
            true,
            ['encrypt', 'decrypt']
        );

        return key;
    } catch (error) {
        console.error('❌ Error importando clave:', error);
        throw error;
    }
}

/**
 * ===========================
 * CIFRADO DE CAMPOS
 * ===========================
 */

/**
 * Cifrar un campo individual
 * @param {any} value - Valor a cifrar
 * @returns {string} Valor cifrado en Base64
 */
async function encryptField(value) {
    if (!CRYPTO.isEnabled || !CRYPTO.key) {
        return value; // Sin cifrar si no está habilitado
    }

    if (value === null || value === undefined) {
        return value;
    }

    try {
        // Convertir a string si no lo es
        const plaintext = typeof value === 'string' ? value : JSON.stringify(value);
        const encoder = new TextEncoder();
        const data = encoder.encode(plaintext);

        // Generar IV aleatorio (96 bits recomendado para GCM)
        const iv = window.crypto.getRandomValues(new Uint8Array(12));

        // Cifrar
        const encrypted = await window.crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            CRYPTO.key,
            data
        );

        // Combinar IV + datos cifrados
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(encrypted), iv.length);

        // Convertir a Base64
        const combinedString = String.fromCharCode.apply(null, combined);
        return btoa(combinedString);
    } catch (error) {
        console.error('❌ Error cifrando campo:', error);
        return value; // Devolver sin cifrar si falla
    }
}

/**
 * Descifrar un campo individual
 * @param {string} encryptedValue - Valor cifrado en Base64
 * @returns {any} Valor descifrado
 */
async function decryptField(encryptedValue) {
    if (!CRYPTO.isEnabled || !CRYPTO.key) {
        return encryptedValue; // Sin descifrar si no está habilitado
    }

    if (encryptedValue === null || encryptedValue === undefined) {
        return encryptedValue;
    }

    // Si no parece Base64, devolver tal cual (compatibilidad)
    if (typeof encryptedValue !== 'string') {
        return encryptedValue;
    }

    try {
        // Decodificar Base64
        const combinedString = atob(encryptedValue);
        const combined = new Uint8Array(combinedString.split('').map(c => c.charCodeAt(0)));

        // Separar IV (primeros 12 bytes) y datos
        const iv = combined.slice(0, 12);
        const data = combined.slice(12);

        // Descifrar
        const decrypted = await window.crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            CRYPTO.key,
            data
        );

        // Decodificar texto
        const decoder = new TextDecoder();
        const plaintext = decoder.decode(decrypted);

        // Intentar parsear JSON si es posible
        try {
            return JSON.parse(plaintext);
        } catch {
            return plaintext;
        }
    } catch (error) {
        console.error('❌ Error descifrando campo:', error);
        return encryptedValue; // Devolver tal cual si falla
    }
}

/**
 * ===========================
 * CIFRADO DE OBJETOS
 * ===========================
 */

/**
 * Cifrar objeto completo (solo campos sensibles)
 * @param {Object} obj - Objeto a cifrar
 * @param {string} tipo - Tipo de objeto ('cliente', 'credito', 'pago', 'recogida')
 * @returns {Object} Objeto con campos sensibles cifrados
 */
async function encryptObject(obj, tipo = null) {
    if (!CRYPTO.isEnabled || !obj) {
        return obj;
    }

    // Detectar tipo automáticamente si no se proporciona
    if (!tipo) {
        if (obj.cedula || obj.nombre) tipo = 'cliente';
        else if (obj.monto_prestado || obj.cuota_diaria) tipo = 'credito';
        else if (obj.monto && obj.fecha_pago) tipo = 'pago';
        else if (obj.monto_pago && obj.nuevo_credito) tipo = 'recogida';
    }

    const encrypted = { ...obj };

    // Marcar como cifrado
    encrypted.__encrypted = true;
    encrypted.__tipo = tipo;

    // Cifrar campos sensibles según tipo
    const fieldsToEncrypt = SENSITIVE_FIELDS[tipo] || [];
    
    for (const field of fieldsToEncrypt) {
        if (obj[field] !== undefined && obj[field] !== null) {
            encrypted[field] = await encryptField(obj[field]);
        }
    }

    return encrypted;
}

/**
 * Descifrar objeto completo
 * @param {Object} obj - Objeto a descifrar
 * @returns {Object} Objeto con campos descifrados
 */
async function decryptObject(obj) {
    if (!CRYPTO.isEnabled || !obj || !obj.__encrypted) {
        return obj;
    }

    const decrypted = { ...obj };
    const tipo = obj.__tipo;

    // Descifrar campos sensibles según tipo
    const fieldsToDecrypt = SENSITIVE_FIELDS[tipo] || [];
    
    for (const field of fieldsToDecrypt) {
        if (obj[field] !== undefined && obj[field] !== null) {
            decrypted[field] = await decryptField(obj[field]);
        }
    }

    // Limpiar metadata de cifrado
    delete decrypted.__encrypted;
    delete decrypted.__tipo;

    return decrypted;
}

/**
 * Cifrar array de objetos
 * @param {Array} array - Array de objetos
 * @param {string} tipo - Tipo de objetos
 * @returns {Array} Array con objetos cifrados
 */
async function encryptArray(array, tipo) {
    if (!CRYPTO.isEnabled || !Array.isArray(array)) {
        return array;
    }

    return Promise.all(array.map(obj => encryptObject(obj, tipo)));
}

/**
 * Descifrar array de objetos
 * @param {Array} array - Array de objetos cifrados
 * @returns {Array} Array con objetos descifrados
 */
async function decryptArray(array) {
    if (!CRYPTO.isEnabled || !Array.isArray(array)) {
        return array;
    }

    return Promise.all(array.map(obj => decryptObject(obj)));
}

/**
 * ===========================
 * UTILIDADES
 * ===========================
 */

/**
 * Verificar si un objeto está cifrado
 * @param {Object} obj - Objeto a verificar
 * @returns {boolean} True si está cifrado
 */
function isEncrypted(obj) {
    return obj && obj.__encrypted === true;
}

/**
 * Habilitar/deshabilitar cifrado
 * @param {boolean} enabled - Estado del cifrado
 */
function setCryptoEnabled(enabled) {
    if (!CRYPTO.isSupported) {
        console.warn('⚠️ Cifrado no soportado - no se puede habilitar');
        return false;
    }

    CRYPTO.isEnabled = enabled;
    console.log(`🔐 Cifrado ${enabled ? 'habilitado' : 'deshabilitado'}`);
    
    // Guardar preferencia
    localStorage.setItem('crypto_enabled', enabled ? 'true' : 'false');
    
    return true;
}

/**
 * Obtener estado del cifrado
 * @returns {Object} Estado del sistema de cifrado
 */
function getCryptoStatus() {
    return {
        supported: CRYPTO.isSupported,
        enabled: CRYPTO.isEnabled,
        keyGenerated: CRYPTO.keyGenerated,
        keyDate: localStorage.getItem('crypto_key_generated')
    };
}

/**
 * Regenerar clave de cifrado (CUIDADO: perderá datos cifrados existentes)
 */
async function regenerateKey() {
    console.warn('⚠️ Regenerando clave de cifrado - datos existentes no serán accesibles');
    
    try {
        // Limpiar clave anterior
        localStorage.removeItem('crypto_key_raw');
        localStorage.removeItem('crypto_key_generated');
        
        // Generar nueva clave
        CRYPTO.key = await generateKey();
        CRYPTO.keyGenerated = true;
        
        console.log('✅ Clave regenerada exitosamente');
        return true;
    } catch (error) {
        console.error('❌ Error regenerando clave:', error);
        return false;
    }
}

/**
 * Exportar clave para backup (SOLO PARA ADMIN)
 * @returns {string} Clave en Base64
 */
function exportKeyForBackup() {
    const key = localStorage.getItem('crypto_key_raw');
    if (!key) {
        console.warn('⚠️ No hay clave para exportar');
        return null;
    }
    
    console.warn('⚠️ CUIDADO: Esta clave debe mantenerse segura');
    return key;
}

/**
 * Importar clave desde backup (SOLO PARA ADMIN)
 * @param {string} keyBase64 - Clave en Base64
 */
async function importKeyFromBackup(keyBase64) {
    try {
        // Validar formato
        if (!keyBase64 || typeof keyBase64 !== 'string') {
            throw new Error('Formato de clave inválido');
        }
        
        // Importar clave
        CRYPTO.key = await importKey(keyBase64);
        
        // Guardar
        localStorage.setItem('crypto_key_raw', keyBase64);
        localStorage.setItem('crypto_key_generated', new Date().toISOString());
        
        CRYPTO.keyGenerated = true;
        console.log('✅ Clave importada exitosamente');
        
        return true;
    } catch (error) {
        console.error('❌ Error importando clave:', error);
        return false;
    }
}

/**
 * ===========================
 * AUTO-INICIALIZACIÓN
 * ===========================
 */

// Verificar preferencia guardada
const cryptoPreference = localStorage.getItem('crypto_enabled');
if (cryptoPreference === 'false') {
    CRYPTO.isEnabled = false;
    console.log('🔐 Cifrado deshabilitado por preferencia del usuario');
} else {
    // Por defecto habilitado si está soportado
    CRYPTO.isEnabled = true;
}

console.log('✅ crypto.js cargado');

