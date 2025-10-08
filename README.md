# FinanceFlow - App Cobrador v3.0

Aplicación móvil para cobradores con soporte offline completo.

## 🚀 Características

- ✅ **IndexedDB**: Almacenamiento robusto offline (50MB+)
- ✅ **Cifrado AES-GCM**: Protección de datos sensibles
- ✅ **Sincronización inteligente**: Auto-sync al reconectar
- ✅ **Operaciones offline**: Pagos, créditos, clientes
- ✅ **Service Worker**: Cache de assets estáticos
- ✅ **PWA**: Instalable como app nativa

## 📦 Tecnologías

- HTML5 + CSS3 + JavaScript nativo (sin frameworks)
- IndexedDB API nativa
- Web Crypto API (AES-GCM)
- Service Worker API
- Supabase (backend)

## 🔗 Deploy

Desplegado automáticamente en Vercel: https://financeflow-app-cobrador.vercel.app

## 📝 Estructura

```
/
├── index.html           - App principal
├── db.js                - IndexedDB wrapper
├── crypto.js            - Cifrado AES-GCM
├── sync.js              - Sincronización con Supabase
├── payment-forms.js     - Formularios de pagos/recogidas
├── search-pagination.js - Búsqueda y paginación
├── styles-new.css       - Estilos
├── sw.js                - Service Worker
├── config.js            - Configuración Supabase
└── manifest.webmanifest - PWA manifest
```

## 🧪 Desarrollo Local

1. Clonar el repositorio
2. Abrir `index.html` con un servidor local (ej: `python -m http.server`)
3. Navegar a `http://localhost:8000`

## 📱 Instalación como PWA

1. Abrir la app en Chrome móvil
2. Menú → "Agregar a pantalla de inicio"
3. Listo! Funciona offline

## 🔐 Login de Prueba

- Email: `jhonalexander@gmail.com`
- Contraseña: (proporcionada por el administrador)

---

Desarrollado con ❤️ por el equipo de FinanceFlow

