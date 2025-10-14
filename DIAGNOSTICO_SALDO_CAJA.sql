-- ============================================
-- DIAGNÓSTICO: Saldo Caja en Cero
-- ============================================
-- Este script te ayudará a identificar por qué 
-- el saldo de caja aparece en $0
--
-- INSTRUCCIONES:
-- 1. Ve a https://supabase.com/dashboard/project/ubvbteoajvrahpibthsf/editor
-- 2. Copia y pega este script
-- 3. Reemplaza 'TU_COLLECTOR_ID' con el ID real del cobrador
-- 4. Ejecuta el script
-- ============================================

-- 🔍 PASO 1: Verificar información del cobrador
SELECT 
    '1. INFO DEL COBRADOR' as paso,
    c.id as collector_id,
    c.nombre,
    c.panel_id,
    c.user_id,
    c.is_active
FROM collectors c
WHERE c.id = 'TU_COLLECTOR_ID';

-- 🔍 PASO 2: Verificar base diaria para HOY
SELECT 
    '2. BASE DIARIA HOY' as paso,
    fecha,
    monto as base_diaria,
    created_at,
    observaciones
FROM collector_daily_base
WHERE collector_id = 'TU_COLLECTOR_ID'
    AND fecha = CURRENT_DATE
ORDER BY created_at DESC
LIMIT 5;

-- 🔍 PASO 3: Verificar pagos registrados HOY
SELECT 
    '3. PAGOS HOY' as paso,
    COUNT(*) as cantidad_pagos,
    SUM(monto) as total_cobrado,
    MIN(fecha_pago) as primera_fecha,
    MAX(fecha_pago) as ultima_fecha
FROM pagos
WHERE cobrador_id = 'TU_COLLECTOR_ID'
    AND fecha_pago = CURRENT_DATE;

-- 🔍 PASO 4: Detalle de pagos HOY
SELECT 
    '4. DETALLE PAGOS' as paso,
    p.id,
    p.monto,
    p.fecha_pago,
    p.hora_pago,
    p.estado,
    c.nombre as cliente_nombre
FROM pagos p
LEFT JOIN clients c ON c.id = p.cliente_id
WHERE p.cobrador_id = 'TU_COLLECTOR_ID'
    AND p.fecha_pago = CURRENT_DATE
ORDER BY p.created_at DESC
LIMIT 10;

-- 🔍 PASO 5: Verificar créditos creados HOY
SELECT 
    '5. CREDITOS HOY' as paso,
    COUNT(*) as cantidad_creditos,
    SUM(monto_prestado) as total_prestado
FROM prestamos
WHERE cobrador_id = 'TU_COLLECTOR_ID'
    AND fecha_inicio = CURRENT_DATE;

-- 🔍 PASO 6: Verificar gastos HOY
SELECT 
    '6. GASTOS HOY' as paso,
    COUNT(*) as cantidad_gastos,
    SUM(monto) as total_gastos
FROM collector_expenses
WHERE collector_id = 'TU_COLLECTOR_ID'
    AND fecha = CURRENT_DATE;

-- 🔍 PASO 7: Ejecutar el RPC directamente
SELECT 
    '7. RESULTADO RPC' as paso,
    *
FROM get_collector_daily_summary(
    'TU_COLLECTOR_ID'::uuid,
    CURRENT_DATE
);

-- ============================================
-- 🎯 INTERPRETACIÓN DE RESULTADOS:
-- ============================================
-- 
-- Si saldo_caja = 0, verifica:
-- 
-- 1. BASE DIARIA (paso 2):
--    ❌ Si no hay registros → Necesitas crear base diaria
--    ✅ Si hay registros → Continúa al paso 2
--
-- 2. PAGOS (paso 3-4):
--    ❌ Si cantidad_pagos = 0 → Los pagos no están 
--       vinculados al cobrador correcto
--    ✅ Si hay pagos → El problema es el cálculo
--
-- 3. FÓRMULA:
--    saldo_caja = base_diaria - creditos + cobrado - gastos
--    
--    Si base=0, creditos=0, gastos=0:
--    → saldo_caja = cobrado (debería mostrar el total cobrado)
--
-- ============================================
-- 💡 SOLUCIONES COMUNES:
-- ============================================
--
-- A) Si no hay base diaria, créala:
-- INSERT INTO collector_daily_base 
--   (collector_id, panel_id, fecha, monto)
-- VALUES 
--   ('TU_COLLECTOR_ID', 'TU_PANEL_ID', CURRENT_DATE, 0);
--
-- B) Si los pagos no aparecen, verifica que:
--    - cobrador_id en tabla pagos = collector.id
--    - fecha_pago = CURRENT_DATE
--    - panel_id es correcto
--
-- C) Si el cálculo está mal, contacta soporte
-- ============================================
