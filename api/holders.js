/**
 * api/holders.js
 *
 * Vercel Serverless Function.
 * Fetches the real, current holder count for the ANSEM token mint from
 * Solana, using the Helius RPC `getTokenAccounts` method (paginated),
 * counting unique owner wallets with a non-zero balance.
 *
 * Results are cached in memory for CACHE_TTL_MS to avoid re-scanning the
 * full holder list (which can be 100+ paginated calls for a 100k+ holder
 * token) on every single page load. The cache is per serverless instance,
 * so in practice this refreshes every few minutes across all visitors.
 *
 * Required environment variable (set in Vercel dashboard, NOT in code):
 *   HELIUS_API_KEY = your Helius API key
 */

const TOKEN_MINT = "9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const PAGE_LIMIT = 1000; // max accounts per Helius getTokenAccounts call
const MAX_PAGES = 200; // safety cap (200 * 1000 = up to 200k holders)

let cache = {
  count: null,
  updatedAt: 0,
};

async function fetchHolderCount(apiKey) {
  const url = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
  const owners = new Set();
  let page = 1;

  while (page <= MAX_PAGES) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "ansem-holder-count",
        method: "getTokenAccounts",
        params: {
          page,
          limit: PAGE_LIMIT,
          mint: TOKEN_MINT,
          displayOptions: {},
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Helius HTTP ${res.status}`);
    }

    const data = await res.json();

    if (data.error) {
      throw new Error(`Helius RPC error: ${data.error.message || "unknown"}`);
    }

    const accounts = data?.result?.token_accounts ?? [];
    if (accounts.length === 0) break;

    for (const acc of accounts) {
      // Only count accounts with a non-zero balance as real holders
      const amount = acc.amount ?? "0";
      if (amount !== "0" && acc.owner) {
        owners.add(acc.owner);
      }
    }

    if (accounts.length < PAGE_LIMIT) break; // last page reached
    page += 1;
  }

  return owners.size;
}

export default async function handler(req, res) {
  // Allow the GitHub Pages site (or any origin) to call this endpoint
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const now = Date.now();
  const cacheIsFresh = cache.count !== null && now - cache.updatedAt < CACHE_TTL_MS;

  if (cacheIsFresh) {
    res.status(200).json({
      holders: cache.count,
      source: "cache",
      updatedAt: cache.updatedAt,
    });
    return;
  }

  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Server misconfigured: missing HELIUS_API_KEY" });
    return;
  }

  try {
    const count = await fetchHolderCount(apiKey);
    cache = { count, updatedAt: now };
    res.status(200).json({
      holders: count,
      source: "live",
      updatedAt: now,
    });
  } catch (err) {
    // If we have a stale cached value, prefer serving that over an error
    if (cache.count !== null) {
      res.status(200).json({
        holders: cache.count,
        source: "stale-cache",
        updatedAt: cache.updatedAt,
        warning: String(err.message || err),
      });
      return;
    }
    res.status(502).json({ error: String(err.message || err) });
  }
}
