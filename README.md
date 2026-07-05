# ANSEM Holder API

A tiny serverless backend that returns the **real, live holder count** for the
$ANSEM Solana token, using the [Helius](https://helius.dev) RPC API.

This exists because browsers can't safely call most blockchain indexer APIs
directly (CORS restrictions, hidden API keys, and pagination across 100+
requests for large tokens). This function does that work server-side and
hands your frontend a single clean number.

## Deploy to Vercel (no coding required)

### 1. Get a free Helius API key
1. Go to https://dashboard.helius.dev and sign up (free, no credit card).
2. Copy your API key from the dashboard homepage.

### 2. Push this folder to its own GitHub repo
Create a new repo (e.g. `ansem-holder-api`) and upload these files the same
way you uploaded the tracker site: **Add file → Upload files**, then commit.

Files needed:
- `api/holders.js`
- `package.json`
- `README.md` (optional, for reference)

### 3. Import the repo into Vercel
1. Go to https://vercel.com and sign in (GitHub login is easiest).
2. Click **Add New → Project**.
3. Select your `ansem-holder-api` repo and click **Import**.
4. Before deploying, expand **Environment Variables** and add:
   - **Key**: `HELIUS_API_KEY`
   - **Value**: (paste your Helius API key here)
5. Click **Deploy**.

Vercel will give you a URL like:
```
https://ansem-holder-api-yourname.vercel.app
```

Your live endpoint will be:
```
https://ansem-holder-api-yourname.vercel.app/api/holders
```

Visiting that URL directly in a browser should return JSON like:
```json
{ "holders": 104213, "source": "live", "updatedAt": 1751234567890 }
```

### 4. Point the tracker site at this endpoint
In the `ansem-live-tracker` repo, update `config.js`'s API section to call
this URL instead of Solscan directly (see the updated `config.js` /
`script.js` provided alongside this file).

## Notes

- The function caches results for 5 minutes per serverless instance to avoid
  re-scanning the full holder list (which can be 100+ paginated RPC calls)
  on every page load.
- Free Helius tier includes 1,000,000 credits/month, which is more than
  enough for a tracker refreshing every few minutes.
- Never commit your API key into code — it's kept in Vercel's Environment
  Variables and read via `process.env.HELIUS_API_KEY`.
