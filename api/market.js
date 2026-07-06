/**
 * api/market.js
 *
 * Vercel Serverless Function.
 * Fetches live price, market cap, liquidity, and 24h volume for the ANSEM
 * token from Dexscreener's free public API (no key required).
 *
 * Results are cached in memory briefly to avoid hammering Dexscreener on
 * every page load across many visitors.
 */

const TOKEN_MINT = "9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump";
const CACHE_TTL_MS = 60 * 1000; // 1 minute — price moves fast, but no need to refetch every request

let cache = {
  data: null,
  updatedAt: 0,
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(body);
}

async function fetchMarketData() {
  const url = `https://api.dexscreener.com/latest/dex/tokens/${TOKEN_MINT}`;
  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Dexscreener HTTP ${response.status}`);
  }

  const data = await response.json();
  const pairs = data && data.pairs;

  if (!Array.isArray(pairs) || pairs.length === 0) {
    throw new Error("No trading pairs found for this token");
  }

  // Pick the pair with the highest liquidity as the most representative one
  const bestPair = pairs.reduce((best, current) => {
    const bestLiquidity = (best && best.liquidity && best.liquidity.usd) || 0;
    const currentLiquidity = (current && current.liquidity && current.liquidity.usd) || 0;
    return currentLiquidity > bestLiquidity ? current : best;
  }, pairs[0]);

  return {
    priceUsd: bestPair.priceUsd ? Number(bestPair.priceUsd) : null,
    marketCapUsd: bestPair.marketCap != null ? Number(bestPair.marketCap) : null,
    fdvUsd: bestPair.fdv != null ? Number(bestPair.fdv) : null,
    liquidityUsd: (bestPair.liquidity && bestPair.liquidity.usd) || null,
    volume24hUsd: (bestPair.volume && bestPair.volume.h24) || null,
    priceChange24h: (bestPair.priceChange && bestPair.priceChange.h24) || null,
    dexUrl: bestPair.url || null,
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "public, max-age=30, s-maxage=30");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const now = Date.now();
  const cacheIsFresh = cache.data !== null && now - cache.updatedAt < CACHE_TTL_MS;

  if (cacheIsFresh) {
    sendJson(res, 200, { ...cache.data, source: "cache", updatedAt: cache.updatedAt });
    return;
  }

  try {
    const marketData = await fetchMarketData();
    cache = { data: marketData, updatedAt: now };
    sendJson(res, 200, { ...marketData, source: "live", updatedAt: now });
  } catch (err) {
    if (cache.data !== null) {
      sendJson(res, 200, {
        ...cache.data,
        source: "stale-cache",
        updatedAt: cache.updatedAt,
        warning: String((err && err.message) || err),
      });
      return;
    }
    sendJson(res, 502, { error: String((err && err.message) || err) });
  }
};
