/**
 * ========================================
 * DIAGNÓSTICO IPHONE - Pagos Offline
 * ========================================
 * 
 * Este script te ayudará a encontrar QUÉ campo del pago
 * está causando problemas en Safari/iPhone
 */

// Función para diagnosticar un objeto antes de guardarlo
window.diagnosticarPagoiPhone = function(paymentData) {
    console.log('\n🍎 ========================================');
    console.log('🍎 DIAGNÓSTICO IPHONE - PAGO OFFLINE');
    console.log('🍎 ========================================\n');
    
    console.log('📱 INFORMACIÓN DEL DISPOSITIVO:');
    console.log(`   Platform: ${navigator.platform}`);
    console.log(`   User Agent: ${navigator.userAgent}`);
    console.log(`   Es Safari: ${/Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent)}`);
    console.log(`   Es iPhone: ${/iPhone/.test(navigator.userAgent)}`);
    
    console.log('\n📝 ANALIZANDO CAMPOS DEL PAGO:\n');
    
    const problematicos = [];
    const seguros = [];
    
    for (const [key, value] of Object.entries(paymentData)) {
        const tipo = typeof value;
        const esNull = value === null;
        const esUndefined = value === undefined;
        const esDate = value instanceof Date;
        const esNaN = typeof value === 'number' && isNaN(value);
        
        let status = '✅';
        let problema = '';
        
        // Detectar problemas potenciales
        if (esUndefined) {
            status = '❌';
            problema = 'UNDEFINED (Safari no acepta)';
            problematicos.push({ key, value, problema });
        } else if (esDate) {
            status = '⚠️';
            problema = 'DATE object (debe ser string)';
            problematicos.push({ key, value, problema });
        } else if (esNaN) {
            status = '❌';
            problema = 'NaN (Safari no acepta)';
            problematicos.push({ key, value, problema });
        } else if (tipo === 'object' && value !== null && !Array.isArray(value)) {
            status = '⚠️';
            problema = 'Objeto anidado (puede causar problemas)';
            problematicos.push({ key, value, problema });
        } else {
            seguros.push({ key, value, tipo });
        }
        
        console.log(`   ${status} ${key}: ${JSON.stringify(value)} (${tipo}${esNull ? ' - null' : ''})`);
        if (problema) {
            console.log(`      └─ ${problema}`);
        }
    }
    
    console.log('\n📊 RESUMEN:\n');
    console.log(`   ✅ Campos seguros: ${seguros.length}`);
    console.log(`   ❌ Campos problemáticos: ${problematicos.length}`);
    
    if (problematicos.length > 0) {
        console.log('\n⚠️ CAMPOS QUE PUEDEN CAUSAR PROBLEMAS EN SAFARI:\n');
        problematicos.forEach(({ key, value, problema }) => {
            console.log(`   ❌ ${key}:`);
            console.log(`      Valor actual: ${JSON.stringify(value)}`);
            console.log(`      Problema: ${problema}`);
            
            // Sugerir corrección
            if (problema.includes('UNDEFINED')) {
                console.log(`      Corrección: ${key} = null`);
            } else if (problema.includes('DATE')) {
                console.log(`      Corrección: ${key} = "${value ? value.toISOString() : 'null'}"`);
            } else if (problema.includes('NaN')) {
                console.log(`      Corrección: ${key} = null o 0`);
            }
        });
    }
    
    console.log('\n🔍 TEST DE SERIALIZACIÓN JSON:\n');
    try {
        const jsonString = JSON.stringify(paymentData);
        console.log('   ✅ JSON.stringify: OK');
        console.log(`   Tamaño: ${jsonString.length} caracteres`);
        
        // Intentar parsear de vuelta
        const parsed = JSON.parse(jsonString);
        console.log('   ✅ JSON.parse: OK');
        
        // Verificar que no se perdió información
        const keysOriginal = Object.keys(paymentData).sort();
        const keysParsed = Object.keys(parsed).sort();
        
        if (JSON.stringify(keysOriginal) === JSON.stringify(keysParsed)) {
            console.log('   ✅ Todas las claves se preservaron');
        } else {
            console.log('   ⚠️ Se perdieron algunas claves en la serialización');
            console.log('   Original:', keysOriginal);
            console.log('   Parseado:', keysParsed);
        }
    } catch (e) {
        console.error('   ❌ Error en serialización JSON:', e.message);
    }
    
    console.log('\n🍎 ========================================');
    console.log('🍎 FIN DEL DIAGNÓSTICO');
    console.log('🍎 ========================================\n');
    
    return {
        problematicos,
        seguros,
        totalCampos: Object.keys(paymentData).length,
        esSeguroParaSafari: problematicos.length === 0
    };
};

// Función para probar guardado en IndexedDB
window.probarGuardadoiPhone = async function(paymentData) {
    console.log('\n🧪 ========================================');
    console.log('🧪 PRUEBA DE GUARDADO EN INDEXEDDB');
    console.log('🧪 ========================================\n');
    
    // Diagnosticar primero
    const diagnostico = window.diagnosticarPagoiPhone(paymentData);
    
    if (!diagnostico.esSeguroParaSafari) {
        console.warn('⚠️ ADVERTENCIA: Hay campos problemáticos. El guardado puede fallar.');
    }
    
    console.log('\n📝 Intentando guardar en IndexedDB...\n');
    
    try {
        const temp_id = await saveOffline('offline_pagos', paymentData);
        console.log(`\n✅✅✅ ÉXITO: Pago guardado correctamente`);
        console.log(`   temp_id: ${temp_id}`);
        
        // Intentar recuperarlo
        console.log('\n🔍 Intentando recuperar el pago guardado...');
        const cola = await getOfflineQueue();
        const pagoGuardado = cola.pagos?.find(p => p.temp_id === temp_id);
        
        if (pagoGuardado) {
            console.log('✅ Pago recuperado correctamente:');
            console.log(pagoGuardado);
        } else {
            console.warn('⚠️ No se pudo recuperar el pago de la cola');
        }
        
        return { exito: true, temp_id };
    } catch (error) {
        console.error(`\n❌❌❌ ERROR al guardar:`);
        console.error(`   Mensaje: ${error.message}`);
        console.error(`   Tipo: ${error.name}`);
        console.error(`   Stack:`, error.stack);
        
        return { exito: false, error };
    }
};

console.log('🍎 Herramientas de diagnóstico cargadas:');
console.log('   - diagnosticarPagoiPhone(paymentData)');
console.log('   - probarGuardadoiPhone(paymentData)');

