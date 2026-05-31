const config = require('../config/config');

/**
 * Middleware de seguridad y CORS
 */
function securityMiddleware(req, res, next) {
    res.header('Access-Control-Allow-Origin', config.CORS_ORIGIN);
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Detect whether the request arrived over HTTPS (works behind reverse proxies)
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    const wsScheme = isHttps ? 'wss:' : 'ws:';
    res.header('Content-Security-Policy',
        `default-src 'self'; ` +
        `script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; ` +
        `style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; ` +
        `font-src 'self' https://cdnjs.cloudflare.com; ` +
        `img-src 'self' data:; ` +
        `connect-src 'self' ${wsScheme} https://cdn.jsdelivr.net https://api.exchangerate-api.com https://open.er-api.com https://query1.finance.yahoo.com`
    );
    
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
}

/**
 * Middleware de timeout
 */
function timeoutMiddleware(req, res, next) {
    res.setTimeout(config.REQUEST_TIMEOUT, () => {
        res.status(408).json({ error: 'Request timeout' });
    });
    next();
}

/**
 * Middleware de manejo de errores global
 */
function errorHandler(err, req, res, next) {
    const logger = require('../utils/logger');
    logger.error(`${req.method} ${req.path} — ${err.message}`);
    if (config.NODE_ENV !== 'production') logger.debug(err.stack);
    res.status(500).json({ 
        error: err.message || 'Internal server error',
        details: config.NODE_ENV === 'development' ? err.stack : undefined
    });
}

/**
 * Middleware para rutas no encontradas
 */
function notFoundHandler(req, res) {
    res.status(404).json({ error: 'Ruta no encontrada' });
}

module.exports = {
    securityMiddleware,
    timeoutMiddleware,
    errorHandler,
    notFoundHandler
};
