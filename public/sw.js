'use strict';
// Service worker for the web (non-Electron) build.
// Scope is intentionally narrow: it only ever answers same-origin GET
// requests for the static app shell. Everything else (API calls, CDN
// scripts, non-GET requests) passes straight through to the network
// exactly as it does today — this file adds an offline/caching layer,
// it does not change what any request returns while online.

const CACHE_VERSION = 'v1';
const CACHE_NAME = `dashboard-shell-${CACHE_VERSION}`;

const APP_SHELL = [
    '/',
    '/index.html',
    '/style.css',
    '/main.js',
    '/manifest.json',
    '/favicon.svg',
    '/favicon.ico',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/icon-512-maskable.png',
    '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) =>
            Promise.all(
                APP_SHELL.map((url) =>
                    cache.add(url).catch(() => {
                        // Missing/optional shell resource: skip it, don't fail install.
                    })
                )
            )
        ).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((names) => Promise.all(
                names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
            ))
            .then(() => self.clients.claim())
    );
});

function isAppShellRequest(url) {
    if (url.origin !== self.location.origin) return false;
    if (APP_SHELL.includes(url.pathname)) return true;
    return /\.(?:css|js|png|svg|ico|json)$/.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return; // never intercept writes
    const url = new URL(request.url);

    // Full page navigations: network-first so users always get the latest
    // shell when online, with the cached shell as an offline fallback.
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
                    return response;
                })
                .catch(() => caches.match('/index.html'))
        );
        return;
    }

    if (!isAppShellRequest(url)) return; // let API/CDN/data requests hit the network untouched

    // Static app-shell assets: stale-while-revalidate.
    event.respondWith(
        caches.match(request).then((cached) => {
            const networkFetch = fetch(request)
                .then((response) => {
                    if (response && response.ok) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(() => cached);
            return cached || networkFetch;
        })
    );
});
