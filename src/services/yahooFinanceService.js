// fetch nativo en Node.js 18+ (no necesita polyfill)
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const logger = require('../utils/logger');

// Caché de tasa de cambio USD->EUR (se actualiza cada hora)
let exchangeRate = 0.92;
let exchangeRateTime = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hora

// Cachés en memoria para precios e históricos
const PRICE_CACHE_DURATION = 5 * 60 * 1000; // 5 minutos
const HISTORY_CACHE_DURATION = 30 * 60 * 1000; // 30 minutos
const METADATA_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 horas
const priceCache = new Map();
const historicalCache = new Map();
const metadataCache = new Map();
// Deduplicación de peticiones históricas en vuelo (evita llamadas paralelas duplicadas al mismo ticker)
const historicalInFlight = new Map();

// Control de ruido de logs para tickers inválidos/no disponibles
const failedTickerLogCache = new Map();
const FAILED_TICKER_LOG_TTL = 10 * 60 * 1000; // 10 minutos

const EXCHANGE_SUFFIXES = ['.F', '.DE', '.MI', '.PA', '.AS', '.MC', '.L', '.SW', '.BR', '.AT', '.BE', '.HK'];

// Alias manuales para tickers abreviados/frecuentes en brokers.
const TICKER_ALIASES = {
    '3CP': ['3CP.F', '1810.HK'],
    '82W': ['HIMS'],
    'ABEA': ['GOOG', 'GOOGL'],
    'AMZ': ['AMZN']
};

const CURRENCY_ALIASES = {
    GBX: 'GBP',
    GBP: 'GBP',
    GBp: 'GBP',
    US$: 'USD',
    HK$: 'HKD'
};

const SUBUNIT_DIVISOR_BY_CURRENCY = {
    GBX: 100,
    GBp: 100
};

const STOOQ_MARKET_MAP = {
    '.HK': { stooqSuffix: '.HK', currency: 'HKD' },
    '.F': { stooqSuffix: '.DE', currency: 'EUR' },
    '.DE': { stooqSuffix: '.DE', currency: 'EUR' },
    '.MI': { stooqSuffix: '.IT', currency: 'EUR' },
    '.PA': { stooqSuffix: '.FR', currency: 'EUR' },
    '.AS': { stooqSuffix: '.NL', currency: 'EUR' },
    '.MC': { stooqSuffix: '.ES', currency: 'EUR' },
    '.L': { stooqSuffix: '.UK', currency: 'GBP' },
    '.SW': { stooqSuffix: '.CH', currency: 'CHF' },
    '.BR': { stooqSuffix: '.BE', currency: 'EUR' },
    '.AT': { stooqSuffix: '.AT', currency: 'EUR' },
    '.BE': { stooqSuffix: '.BE', currency: 'EUR' },
    '.US': { stooqSuffix: '.US', currency: 'USD' }
};

function shouldLogTickerFailure(ticker) {
    const now = Date.now();
    const last = failedTickerLogCache.get(ticker) || 0;
    if (now - last > FAILED_TICKER_LOG_TTL) {
        failedTickerLogCache.set(ticker, now);
        return true;
    }
    return false;
}

function normalizeCurrencyCode(currency) {
    const raw = String(currency || '').trim();
    if (!raw) {
        return '';
    }
    return CURRENCY_ALIASES[raw] || raw.toUpperCase();
}

function normalizeMonetaryAmountByCurrency(amount, currency) {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount)) {
        return null;
    }

    const rawCurrency = String(currency || '').trim();
    const divisor = SUBUNIT_DIVISOR_BY_CURRENCY[rawCurrency] || 1;
    return numericAmount / divisor;
}

function extractQuoteMarketPrice(quote) {
    if (!quote || typeof quote !== 'object') {
        return null;
    }

    const candidates = [
        quote.regularMarketPrice,
        quote.postMarketPrice,
        quote.preMarketPrice,
        quote.regularMarketPreviousClose,
        quote.previousClose
    ];

    for (const value of candidates) {
        const numeric = Number(value);
        if (Number.isFinite(numeric) && numeric > 0) {
            return numeric;
        }
    }

    return null;
}

function buildTickerCandidates(ticker) {
    const normalizedTicker = String(ticker || '').trim().toUpperCase();
    const candidates = [];
    const seen = new Set();

    const addCandidate = (symbol) => {
        const normalizedSymbol = String(symbol || '').trim().toUpperCase();
        if (!normalizedSymbol || seen.has(normalizedSymbol)) {
            return;
        }
        seen.add(normalizedSymbol);
        candidates.push(normalizedSymbol);
    };

    addCandidate(normalizedTicker);

    const aliases = TICKER_ALIASES[normalizedTicker] || [];
    aliases.forEach(addCandidate);

    if (!normalizedTicker.includes('.')) {
        EXCHANGE_SUFFIXES.forEach((suffix) => addCandidate(`${normalizedTicker}${suffix}`));
    }

    return candidates;
}

function looksLikeProviderInfrastructureError(error) {
    const message = String(error?.message || '').toLowerCase();
    if (!message) {
        return false;
    }

    return (
        message.includes('unexpected redirect') ||
        message.includes('unauthorized') ||
        message.includes('no set-cookie header') ||
        message.includes('fetch failed') ||
        message.includes('timed out') ||
        message.includes('econnreset') ||
        message.includes('enotfound') ||
        message.includes('socket')
    );
}

function mapYahooTickerToStooqCandidate(yahooTicker) {
    const normalizedTicker = String(yahooTicker || '').trim().toUpperCase();
    if (!normalizedTicker) {
        return null;
    }

    const suffixIndex = normalizedTicker.lastIndexOf('.');
    if (suffixIndex <= 0) {
        return {
            stooqSymbol: `${normalizedTicker}.US`.toLowerCase(),
            resolvedTicker: normalizedTicker,
            currency: 'USD'
        };
    }

    const base = normalizedTicker.slice(0, suffixIndex);
    const suffix = normalizedTicker.slice(suffixIndex);
    const marketConfig = STOOQ_MARKET_MAP[suffix];
    if (!marketConfig) {
        return null;
    }

    return {
        stooqSymbol: `${base}${marketConfig.stooqSuffix}`.toLowerCase(),
        resolvedTicker: normalizedTicker,
        currency: marketConfig.currency
    };
}

function buildStooqCandidates(ticker) {
    const yahooCandidates = buildTickerCandidates(ticker);
    const stooqCandidates = [];
    const seen = new Set();

    for (const yahooCandidate of yahooCandidates) {
        const mapped = mapYahooTickerToStooqCandidate(yahooCandidate);
        if (!mapped || seen.has(mapped.stooqSymbol)) {
            continue;
        }
        seen.add(mapped.stooqSymbol);
        stooqCandidates.push(mapped);
    }

    return stooqCandidates;
}

function parseStooqCsvRows(csvText) {
    const text = String(csvText || '').trim();
    if (!text) {
        return [];
    }

    return text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}

function parseStooqNumeric(value) {
    const numeric = Number(String(value || '').trim());
    return Number.isFinite(numeric) ? numeric : null;
}

const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://finance.yahoo.com/',
    'Origin': 'https://finance.yahoo.com'
};

/**
 * Consulta el precio actual via Yahoo Finance v8 chart API directamente (sin yahoo-finance2).
 * Más tolerante a bloqueos de cookies/GDPR que la librería.
 */
async function fetchYahooDirectQuote(ticker) {
    try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
        const res = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        const data = await res.json();
        const result = data?.chart?.result?.[0];
        if (!result) return null;
        const meta  = result.meta || {};
        const price = meta.regularMarketPrice || meta.chartPreviousClose || meta.previousClose;
        const currency = meta.currency || 'USD';
        if (!price || price <= 0) return null;
        return { candidate: ticker, quote: { currency }, marketPrice: price, source: 'yahoo-direct' };
    } catch (_) {
        return null;
    }
}

/**
 * Obtiene histórico via Yahoo Finance v8 chart API directamente.
 */
async function fetchYahooDirectHistorical(ticker, startDate, endDate) {
    try {
        const p1 = Math.floor(startDate.getTime() / 1000);
        const p2 = Math.floor(endDate.getTime() / 1000);
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&period1=${p1}&period2=${p2}`;
        const res = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(10000) });
        if (!res.ok) return null;
        const data = await res.json();
        const result = data?.chart?.result?.[0];
        if (!result) return null;
        const timestamps = result.timestamp || [];
        const closes     = result.indicators?.quote?.[0]?.close || [];
        const currency   = result.meta?.currency || 'USD';
        if (!timestamps.length) return null;
        const rows = timestamps
            .map((ts, i) => ({ date: new Date(ts * 1000), close: closes[i] }))
            .filter(r => r.close != null && Number.isFinite(r.close) && r.close > 0);
        if (!rows.length) return null;
        return { candidate: ticker, currency, data: rows };
    } catch (_) {
        return null;
    }
}

async function fetchStooqQuote(ticker) {
    const candidates = buildStooqCandidates(ticker);

    for (const candidate of candidates) {
        try {
            const url = `https://stooq.com/q/l/?s=${encodeURIComponent(candidate.stooqSymbol)}&f=sd2t2ohlcv&h&e=csv`;
            const response = await fetch(url, {
                headers: {
                    accept: 'text/csv,*/*;q=0.8',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'referer': 'https://stooq.com/'
                },
                signal: AbortSignal.timeout(8000)
            });
            if (!response.ok) {
                continue;
            }

            const csv = await response.text();
            const rows = parseStooqCsvRows(csv);
            if (rows.length < 2) {
                continue;
            }

            const columns = rows[1].split(',').map((value) => value.trim());
            if (columns.length < 7) {
                continue;
            }

            const close = parseStooqNumeric(columns[6]);
            if (!Number.isFinite(close) || close <= 0) {
                continue;
            }

            return {
                candidate: candidate.resolvedTicker,
                quote: { currency: candidate.currency },
                marketPrice: close,
                source: 'stooq'
            };
        } catch (error) {
            if (shouldLogTickerFailure(candidate.stooqSymbol)) {
                logger.debug(`stooq unavailable for ${candidate.stooqSymbol}: ${error.message}`);
            }
        }
    }

    return null;
}

async function fetchStooqHistorical(ticker, startDate, endDate) {
    const candidates = buildStooqCandidates(ticker);

    for (const candidate of candidates) {
        try {
            const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(candidate.stooqSymbol)}&i=d`;
            const response = await fetch(url, {
                headers: {
                    accept: 'text/csv,*/*;q=0.8',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'referer': 'https://stooq.com/'
                },
                signal: AbortSignal.timeout(10000)
            });
            if (!response.ok) {
                continue;
            }

            const csv = await response.text();
            const rows = parseStooqCsvRows(csv);
            if (rows.length < 2) {
                continue;
            }

            const data = [];
            for (let i = 1; i < rows.length; i += 1) {
                const columns = rows[i].split(',').map((value) => value.trim());
                if (columns.length < 5) {
                    continue;
                }

                const rowDate = new Date(columns[0]);
                const close = parseStooqNumeric(columns[4]);
                if (!Number.isFinite(close) || close <= 0 || Number.isNaN(rowDate.getTime())) {
                    continue;
                }

                if (rowDate < startDate || rowDate > endDate) {
                    continue;
                }

                data.push({
                    date: rowDate,
                    close
                });
            }

            if (data.length > 0) {
                return {
                    candidate: candidate.resolvedTicker,
                    currency: candidate.currency,
                    data
                };
            }
        } catch (error) {
            if (shouldLogTickerFailure(candidate.stooqSymbol)) {
                logger.debug(`stooq history failed for ${candidate.stooqSymbol}: ${error.message}`);
            }
        }
    }

    return null;
}

async function quoteFirstAvailablePrice(ticker) {
    const candidates = buildTickerCandidates(ticker);
    // Yahoo (directo + librería) solo para base + aliases explícitos.
    // Los sufijos de bolsa (.AS, .L, .F…) se reservan para stooq, que conoce la moneda correcta.
    // Esto evita que AMZN resuelva erróneamente a AMZN.AS (Amsterdam) cuando Yahoo bloquea .com
    const basePlusAliases = new Set([
        ticker.toUpperCase(),
        ...(TICKER_ALIASES[ticker.toUpperCase()] || []).map(a => a.toUpperCase())
    ]);
    const yahooCandidates = candidates.filter(c => basePlusAliases.has(c));
    let hadInfrastructureError = false;

    // 1. Intento directo via Yahoo v8 chart API (más tolerante a bloqueos GDPR/crumb)
    for (const candidate of yahooCandidates) {
        const direct = await fetchYahooDirectQuote(candidate);
        if (direct) return direct;
    }

    // 2. Intento via librería yahoo-finance2
    for (const candidate of yahooCandidates) {
        try {
            const quote = await yahooFinance.quote(candidate);
            const marketPrice = extractQuoteMarketPrice(quote);
            if (marketPrice) {
                return {
                    candidate,
                    quote,
                    marketPrice,
                    source: 'yahoo'
                };
            }
        } catch (e) {
            const isInfrastructureError = looksLikeProviderInfrastructureError(e);
            hadInfrastructureError = hadInfrastructureError || isInfrastructureError;
            if (shouldLogTickerFailure(candidate)) {
                logger.debug(`yahoo quote unavailable for ${candidate}: ${e.message}`);
            }
            // Si Yahoo está caído por consentimiento/redirección, no tiene sentido seguir probando sufijos.
            if (isInfrastructureError) {
                break;
            }
        }
    }

    const stooqQuote = await fetchStooqQuote(ticker);
    if (stooqQuote) {
        if (hadInfrastructureError) {
            logger.warn(`yahoo provider unavailable for ${ticker}; falling back to stooq`);
        } else {
            logger.debug(`yahoo has no data for ${ticker}; falling back to stooq`);
        }
        return stooqQuote;
    }

    return null;
}

function buildHistoricalCacheKey(ticker, period) {
    return `${ticker}::${period}`;
}

function getFreshCacheEntry(cacheMap, key, ttlMs) {
    const entry = cacheMap.get(key);
    if (!entry) {
        return null;
    }

    const now = Date.now();
    if ((now - entry.savedAt) <= ttlMs) {
        return entry;
    }

    return null;
}

function getAnyCacheEntry(cacheMap, key) {
    return cacheMap.get(key) || null;
}

function setCacheEntry(cacheMap, key, value) {
    const entry = {
        value,
        savedAt: Date.now()
    };
    cacheMap.set(key, entry);
    return entry;
}

function addCacheMetadata(payload, cacheEntry, cacheStatus, mensaje) {
    const response = {
        ...payload,
        fromCache: cacheStatus !== 'live',
        cacheStatus
    };

    if (cacheEntry && cacheEntry.savedAt) {
        response.cacheTimestamp = new Date(cacheEntry.savedAt).toISOString();
    }

    if (mensaje) {
        response.mensaje = mensaje;
    }

    return response;
}

/**
 * Obtiene la tasa de cambio USD a EUR
 */
async function obtenerTasaCambio() {
    const base = arguments[0] || 'USD';
    const target = arguments[1] || 'EUR';

    const normalizedBase = normalizeCurrencyCode(base) || 'USD';
    const normalizedTarget = normalizeCurrencyCode(target) || 'EUR';

    if (normalizedBase === normalizedTarget) {
        return 1;
    }

    const ahora = Date.now();
    const cacheKey = `${normalizedBase}->${normalizedTarget}`;

    if (cacheKey === 'USD->EUR' && exchangeRate > 0 && (ahora - exchangeRateTime) < CACHE_DURATION) {
        return exchangeRate;
    }

    try {
        const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${encodeURIComponent(normalizedBase)}`);
        const data = await response.json();
        const rate = Number(data?.rates?.[normalizedTarget]);
        if (Number.isFinite(rate) && rate > 0) {
            if (cacheKey === 'USD->EUR') {
                exchangeRate = rate;
                exchangeRateTime = ahora;
            }
            logger.info(`FX rate updated: 1 ${normalizedBase} = ${rate} ${normalizedTarget}`);
            return rate;
        }
    } catch (e) {
        logger.warn(`FX rate fetch failed for ${normalizedBase}->${normalizedTarget}: ${e.message}`);
    }

    if (cacheKey === 'USD->EUR') {
        return exchangeRate;
    }

    return null;
}

async function convertPriceToEUR(amount, currency) {
    const normalizedCurrency = normalizeCurrencyCode(currency) || 'EUR';
    const normalizedAmount = normalizeMonetaryAmountByCurrency(amount, currency);

    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
        return null;
    }

    if (normalizedCurrency === 'EUR') {
        return normalizedAmount;
    }

    const rate = await obtenerTasaCambio(normalizedCurrency, 'EUR');
    if (!Number.isFinite(rate) || rate <= 0) {
        return null;
    }

    return normalizedAmount * rate;
}

/**
 * Obtiene el precio de un activo y lo convierte a EUR
 */
async function getAssetPrice(ticker) {
    const normalizedTicker = String(ticker || '').trim().toUpperCase();
    if (!normalizedTicker) {
        throw new Error('Ticker vacío');
    }

    const priceCacheKey = normalizedTicker;
    const freshCache = getFreshCacheEntry(priceCache, priceCacheKey, PRICE_CACHE_DURATION);
    if (freshCache) {
        return addCacheMetadata(freshCache.value, freshCache, 'cache-hit');
    }

    const resolved = await quoteFirstAvailablePrice(normalizedTicker);
    if (!resolved) {
        const staleCache = getAnyCacheEntry(priceCache, priceCacheKey);
        if (staleCache) {
            logger.warn(`using stale price cache for ${normalizedTicker} (provider failure)`);
            return addCacheMetadata(
                staleCache.value,
                staleCache,
                'cache-fallback',
                'Mostrando último precio en caché por error temporal del proveedor'
            );
        }
        throw new Error('No se pudo obtener el precio');
    }

    const sourceCurrency = normalizeCurrencyCode(resolved.quote?.currency || 'USD') || 'USD';
    const priceEUR = await convertPriceToEUR(resolved.marketPrice, sourceCurrency);
    if (!Number.isFinite(priceEUR) || priceEUR <= 0) {
        const staleCache = getAnyCacheEntry(priceCache, priceCacheKey);
        if (staleCache) {
            logger.warn(`using stale price cache for ${normalizedTicker} (conversion failure)`);
            return addCacheMetadata(
                staleCache.value,
                staleCache,
                'cache-fallback',
                'Mostrando último precio en caché por error temporal del proveedor'
            );
        }
        throw new Error(`No se pudo convertir precio de ${sourceCurrency} a EUR`);
    }

    if (resolved.candidate !== normalizedTicker) {
        logger.debug(`ticker resolved: ${normalizedTicker} -> ${resolved.candidate}`);
    }

    const payload = {
        ticker: normalizedTicker,
        resolvedTicker: resolved.candidate,
        currentPrice: parseFloat(priceEUR.toFixed(2)),
        currency: 'EUR',
        originalPrice: resolved.marketPrice,
        originalCurrency: sourceCurrency
    };

    const savedEntry = setCacheEntry(priceCache, priceCacheKey, payload);
    return addCacheMetadata(payload, savedEntry, 'live');
}

/**
 * Obtiene datos históricos de un activo
 * @param {string} ticker - Símbolo del activo
 * @param {string} period - Período ('1mo', '3mo', '6mo', '1y', '2y', '5y')
 * @returns {Promise<Object>} Objeto con ticker, period, currency y data array
 */
async function getHistoricalData(ticker, period = '1y') {
    const normalizedTicker = String(ticker || '').trim().toUpperCase();
    if (!normalizedTicker) {
        throw new Error('Ticker vacío');
    }

    const historyCacheKey = buildHistoricalCacheKey(normalizedTicker, period);
    const freshCache = getFreshCacheEntry(historicalCache, historyCacheKey, HISTORY_CACHE_DURATION);
    if (freshCache) {
        return addCacheMetadata(freshCache.value, freshCache, 'cache-hit');
    }

    // Deduplicar peticiones paralelas: si ya hay una en vuelo para el mismo clave, esperar su resultado
    if (historicalInFlight.has(historyCacheKey)) {
        return historicalInFlight.get(historyCacheKey);
    }

    const promise = _doFetchHistoricalData(normalizedTicker, period, historyCacheKey);
    historicalInFlight.set(historyCacheKey, promise);
    try {
        return await promise;
    } finally {
        historicalInFlight.delete(historyCacheKey);
    }
}

async function _doFetchHistoricalData(normalizedTicker, period, historyCacheKey) {

    logger.debug(`getHistoricalData ticker=${normalizedTicker} period=${period}`);
    
    try {
        // Calcular fechas basadas en el período
        const endDate = new Date();
        const startDate = new Date();
        
        switch (period) {
            case '1mo':
                startDate.setMonth(startDate.getMonth() - 1);
                break;
            case '3mo':
                startDate.setMonth(startDate.getMonth() - 3);
                break;
            case '6mo':
                startDate.setMonth(startDate.getMonth() - 6);
                break;
            case '2y':
                startDate.setFullYear(startDate.getFullYear() - 2);
                break;
            case '5y':
                startDate.setFullYear(startDate.getFullYear() - 5);
                break;
            case '1y':
            default:
                startDate.setFullYear(startDate.getFullYear() - 1);
                break;
        }
        
        logger.debug(`  date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
        
        const queryOptions = {
            period1: startDate,
            period2: endDate,
            interval: '1d'
        };
        
        let result = null;
        let finalTicker = normalizedTicker;
        let inferredCurrency = null;
        let hadInfrastructureError = false;
        const candidates = buildTickerCandidates(normalizedTicker);
        // Yahoo solo para base + aliases explícitos (evitar resolución errónea a bolsas europeas)
        const basePlusAliases = new Set([
            normalizedTicker,
            ...(TICKER_ALIASES[normalizedTicker] || []).map(a => a.toUpperCase())
        ]);
        const yahooCandidates = candidates.filter(c => basePlusAliases.has(c));

        // 1. Intento directo via Yahoo v8 chart API
        for (const candidate of yahooCandidates) {
            const direct = await fetchYahooDirectHistorical(candidate, startDate, endDate);
            if (direct && direct.data.length > 0) {
                result = direct.data;
                finalTicker = direct.candidate;
                inferredCurrency = direct.currency;
                logger.debug(`  history found via direct API: ${candidate} (${direct.data.length} points)`);
                break;
            }
        }

        // 2. Intento via librería yahoo-finance2
        if (!result) {
        for (const candidate of yahooCandidates) {
            try {
                logger.debug(`  trying yahoo-finance2 history: ${candidate}`);
                const historical = await yahooFinance.historical(candidate, queryOptions);
                if (Array.isArray(historical) && historical.length > 0) {
                    result = historical;
                    finalTicker = candidate;
                    logger.debug(`  history found via yahoo-finance2: ${candidate}`);
                    break;
                }
            } catch (e) {
                const isInfrastructureError = looksLikeProviderInfrastructureError(e);
                hadInfrastructureError = hadInfrastructureError || isInfrastructureError;
                if (shouldLogTickerFailure(candidate)) {
                    logger.debug(`  yahoo history failed for ${candidate}: ${e.message}`);
                }
                // Si Yahoo está caído por consentimiento/redirección, saltar a fallback sin ruido.
                if (isInfrastructureError) {
                    break;
                }
            }
        }
        }

        if (!result || !Array.isArray(result) || result.length === 0) {
            const stooqHistorical = await fetchStooqHistorical(normalizedTicker, startDate, endDate);
            if (stooqHistorical) {
                result = stooqHistorical.data;
                finalTicker = stooqHistorical.candidate;
                inferredCurrency = stooqHistorical.currency;
                if (hadInfrastructureError) {
                    logger.warn(`yahoo history unavailable for ${normalizedTicker}; falling back to stooq`);
                } else {
                    logger.debug(`yahoo has no history for ${normalizedTicker}; falling back to stooq`);
                }
            }
        }

        if (!result || !Array.isArray(result) || result.length === 0) {
            logger.error(`no historical data found for ${normalizedTicker}`);
            throw new Error(`No se encontraron datos históricos. Verifica que el ticker "${normalizedTicker}" sea correcto (ej: AAPL, MSFT, GOOGL)`);
        }

        logger.debug(`  ${result.length} data points for ${finalTicker}`);

        // Obtener la moneda del ticker
        let currency = inferredCurrency || 'USD';
        if (!inferredCurrency) {
            try {
                const quote = await yahooFinance.quote(finalTicker);
                currency = quote?.currency || 'USD';
            } catch (e) {
                logger.warn(`could not fetch currency for ${finalTicker}: ${e.message}`);
            }
        }

        const normalizedCurrency = normalizeCurrencyCode(currency) || 'USD';
        const tasa = normalizedCurrency === 'EUR' ? 1 : await obtenerTasaCambio(normalizedCurrency, 'EUR');
        if (!Number.isFinite(tasa) || tasa <= 0) {
            throw new Error(`No se pudo convertir histórico de ${normalizedCurrency} a EUR`);
        }
        
        // Formatear datos
        const historicalData = result
            .filter(item => item.close != null && !isNaN(item.close))
            .map(item => {
                const date = item.date instanceof Date 
                    ? item.date.toISOString().split('T')[0]
                    : new Date(item.date).toISOString().split('T')[0];
                
                return {
                    date: date,
                    price: parseFloat((normalizeMonetaryAmountByCurrency(item.close, currency) * tasa).toFixed(2))
                };
            });

        logger.debug(`  ${historicalData.length} formatted data points`);

        const payload = {
            ticker: finalTicker,
            period,
            currency: 'EUR',
            data: historicalData
        };

        const savedEntry = setCacheEntry(historicalCache, historyCacheKey, payload);
        return addCacheMetadata(payload, savedEntry, 'live');
    } catch (error) {
        const staleCache = getAnyCacheEntry(historicalCache, historyCacheKey);
        if (staleCache) {
            logger.warn(`using stale history cache for ${normalizedTicker} (${period}) (provider failure)`);
            return addCacheMetadata(
                staleCache.value,
                staleCache,
                'cache-fallback',
                'Mostrando histórico en caché por error temporal del proveedor'
            );
        }

        logger.error(`getHistoricalData failed for ${normalizedTicker}:`, error.message);
        throw error;
    }
}

/**
 * Obtiene eventos de dividendos para un ticker desde una fecha de inicio.
 * Returns: [{ date: 'YYYY-MM-DD', dividendPerShare: number (EUR) }]
 */
async function getDividendEvents(ticker, startDate) {
    const normalizedTicker = String(ticker || '').trim().toUpperCase();
    if (!normalizedTicker) return [];

    const candidates = buildTickerCandidates(normalizedTicker);
    const period1 = startDate instanceof Date ? startDate : new Date(startDate || '2000-01-01');
    const period2 = new Date();

    // Determine currency conversion rate once
    let tasa = 1;
    let sourceCurrency = 'USD';
    try {
        const quote = await yahooFinance.quote(normalizedTicker);
        sourceCurrency = normalizeCurrencyCode(quote?.currency || 'USD') || 'USD';
        tasa = sourceCurrency === 'EUR' ? 1 : await obtenerTasaCambio(sourceCurrency, 'EUR');
        if (!Number.isFinite(tasa) || tasa <= 0) tasa = 1;
    } catch (_) {}

    for (const candidate of candidates) {
        try {
            const result = await yahooFinance.historical(candidate, {
                period1, period2, interval: '1d', events: 'dividends'
            });
            if (!Array.isArray(result) || result.length === 0) continue;

            const events = result
                .filter(item => item.dividends != null && item.dividends > 0)
                .map(item => {
                    const dateStr = item.date instanceof Date
                        ? item.date.toISOString().slice(0, 10)
                        : new Date(item.date).toISOString().slice(0, 10);
                    const rawAmount = normalizeMonetaryAmountByCurrency(item.dividends, sourceCurrency);
                    return {
                        date: dateStr,
                        dividendPerShare: parseFloat(((rawAmount || item.dividends) * tasa).toFixed(6))
                    };
                });

            if (events.length > 0) return { events, resolvedTicker: candidate };
        } catch (_) {}
    }
    return { events: [], resolvedTicker: normalizedTicker };
}

const QUOTE_TYPE_MAP = {
    EQUITY:     'accion',
    ETF:        'etf',
    MUTUALFUND: 'fondo',
    BOND:       'bono',
    FUTURE:     'otro',
    OPTION:     'otro',
    CRYPTOCURRENCY: 'otro'
};

/**
 * Obtiene metadatos de un activo (sector, tipo_activo) vía Yahoo Finance quoteSummary.
 * Cachea resultados 24h. Si falla, retorna { sector: null, tipo_activo: null }.
 */
async function getAssetMetadata(ticker) {
    const normalizedTicker = String(ticker || '').trim().toUpperCase();
    if (!normalizedTicker) return { sector: null, tipo_activo: null };

    const cached = metadataCache.get(normalizedTicker);
    if (cached && Date.now() - cached.ts < METADATA_CACHE_DURATION) return cached.value;

    try {
        const candidates = buildTickerCandidates(normalizedTicker);
        for (const candidate of candidates) {
            try {
                const summary = await yahooFinance.quoteSummary(candidate, {
                    modules: ['assetProfile', 'price']
                });
                const sector = summary?.assetProfile?.sector || null;
                const rawType = (summary?.price?.quoteType || '').toUpperCase();
                const tipo_activo = QUOTE_TYPE_MAP[rawType] || (rawType ? 'otro' : null);
                const value = { sector, tipo_activo };
                metadataCache.set(normalizedTicker, { ts: Date.now(), value });
                return value;
            } catch (_) {}
        }
    } catch (_) {}

    const fallback = { sector: null, tipo_activo: null };
    metadataCache.set(normalizedTicker, { ts: Date.now(), value: fallback });
    return fallback;
}

module.exports = { getAssetPrice, obtenerTasaCambio, getHistoricalData, getDividendEvents, getAssetMetadata };
