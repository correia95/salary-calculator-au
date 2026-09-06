# salary-calculator-au

Australian take-home pay calculator for the **2026-27 financial year**. Enter a salary and see
net pay after income tax, Medicare levy, Medicare levy surcharge, HECS/HELP repayments and the
Low Income Tax Offset — per year, month, fortnight or week. 100% client-side, no backend, no
tracking.

**Live:** https://salary-calculator-au.correia95.workers.dev/

## Stack

- React 18 + TypeScript + Vite
- No runtime dependencies beyond React
- Deploys as a static-assets Cloudflare Worker (`wrangler.jsonc`, no Worker code)

## Develop

```bash
npm install
npm run dev
```

## Build

```bash
npm run build   # outputs to dist/
npm run preview
```

## Deploy (Cloudflare Workers)

Live at **https://salary-calculator-au.correia95.workers.dev**.

```bash
npm run deploy   # = npm run build && wrangler deploy
```

`wrangler deploy` reads `CLOUDFLARE_API_TOKEN` from the environment (set in the machine's
Claude Code user settings). Config is [`wrangler.jsonc`](wrangler.jsonc) — static assets from
`dist/`, no Worker code.

Pushes to `main` also auto-deploy via [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
once the repo has the `CLOUDFLARE_ENABLED=true` variable and `CLOUDFLARE_API_TOKEN` secret.

If you later attach a custom domain, update the canonical/OG URLs in `index.html`,
`public/robots.txt` and `public/sitemap.xml`.

## Tax data

Rates and thresholds are hard-coded in [`src/tax.ts`](src/tax.ts) from published ATO figures
for 2026-27 (resident brackets with the 15% second rate, 2% Medicare levy with the $28,011
single low-income threshold, marginal HELP system from $69,528, LITO to $66,667). Estimates
only — not tax advice.
