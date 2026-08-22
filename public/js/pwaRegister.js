/**
 * Registra el service worker solo en modo web (no Electron, ver apiConfig.js
 * para el mismo patrón de detección). En Electron la página se carga vía
 * file:// y los service workers no son válidos ahí.
 */
if (typeof window.electronAPI === 'undefined' && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch((err) => {
            console.warn('Service worker no registrado:', err.message);
        });
    });
}
