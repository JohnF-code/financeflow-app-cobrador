// Service Worker para App Cobrador - Soporte offline completo
const CACHE_NAME = 'cobrador-cache-v6.2';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './config.js',
    './styles-new.css',
    './search-pagination.js',
    './payment-forms.js',
    './manifest.webmanifest',
    './db.js',              // 🆕 IndexedDB wrapper
    './crypto.js',          // 🆕 Cifrado
    './sync.js',            // 🆕 Sincronización
    './iphone-debug.js',    // 🍎 Diagnóstico iPhone
    'https://unpkg.com/@supabase/supabase-js@2'
];

// Instalación: cachear assets críticos
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching app shell');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => {
        console.log('[SW] Skip waiting');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('[SW] Installation failed:', error);
      })
  );
});

// Activación: limpiar cachés antiguos
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name !== CACHE_NAME)
            .map(name => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Claiming clients');
        return self.clients.claim();
      })
  );
});

// Fetch: estrategia Cache First para recursos estáticos, Network First para API
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo cachear GET requests
  if (request.method !== 'GET') {
    return;
  }

  // No cachear llamadas a Supabase API - dejar pasar sin interceptar
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(
      fetch(request).catch(error => {
        console.error('[SW] Supabase fetch failed:', error);
        return new Response(JSON.stringify({ error: 'Network error' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }
  
  // No cachear llamadas a unpkg.com - dejar pasar sin interceptar
  if (url.hostname.includes('unpkg.com')) {
    event.respondWith(
      fetch(request).catch(error => {
        console.error('[SW] Unpkg fetch failed:', error);
        return caches.match(request);
      })
    );
    return;
  }

  // Cache First para recursos estáticos
  if (url.pathname.includes('.css') || 
      url.pathname.includes('.js') || 
      url.pathname.includes('.html') ||
      url.pathname.includes('.webmanifest')) {
    event.respondWith(
      caches.match(request)
        .then(cachedResponse => {
          if (cachedResponse) {
            console.log('[SW] Serving from cache:', request.url);
            return cachedResponse;
          }
          
          return fetch(request)
            .then(response => {
              if (response && response.status === 200) {
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                  cache.put(request, responseClone);
                });
              }
              return response;
            });
        })
        .catch(() => {
          console.log('[SW] Fetch failed for:', request.url);
          return new Response('Offline', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' }
          });
        })
    );
    return;
  }

  // Network First para todo lo demás
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request)
          .then(cachedResponse => {
            if (cachedResponse) {
              console.log('[SW] Network failed, serving from cache:', request.url);
              return cachedResponse;
            }
            return new Response('Offline', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: { 'Content-Type': 'text/plain' }
            });
          });
      })
  );
});

// Background Sync para sincronización automática
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-offline-data') {
    event.waitUntil(notifyClientsToSync());
  }
});

async function notifyClientsToSync() {
  console.log('[SW] Notifying clients to sync offline data...');
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type: 'SYNC_OFFLINE_DATA' });
  });
}


