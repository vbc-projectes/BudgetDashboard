module.exports = {
    // Puerto del servidor
    PORT: process.env.PORT || 3000,
    
    // Base de datos
    DB_PATH: process.env.DB_PATH || 'finanzas.db',

    // Directorio raíz de usuarios
    USERS_ROOT: process.env.USERS_ROOT || 'usuarios',
    
    // Límites
    BODY_LIMIT: '10mb',
    REQUEST_TIMEOUT: 30000,
    QUERY_LIMIT: Number(process.env.QUERY_LIMIT || 2000),
    
    // Cache
    CACHE_DURATION: 60 * 1000, // 1 minuto
    EXCHANGE_RATE_CACHE: 60 * 60 * 1000, // 1 hora
    
    // Seguridad
    // En producción con reverse proxy: CORS_ORIGIN=https://tu-dominio.com (sin barra final)
    CORS_ORIGIN: (process.env.CORS_ORIGIN || '*').replace(/\/$/, ''),
    
    // Reverse proxy: número de proxies de confianza (1 para Nginx/Caddy/Traefik)
    // Docker env vars arrive as strings — convert numeric strings to Number so Express
    // treats it as a hop count (not as an IP/subnet string)
    TRUST_PROXY: (() => {
        const val = process.env.TRUST_PROXY;
        if (val === undefined || val === '') {
            return process.env.NODE_ENV === 'production' ? 1 : false;
        }
        const num = Number(val);
        return isNaN(num) ? val : num; // string IP/preset passthrough if not numeric
    })(),

    // Entorno
    NODE_ENV: process.env.NODE_ENV || 'development'
};
