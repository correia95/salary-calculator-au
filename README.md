# salary-calculator-au

Australian take-home pay calculator for the **2026-27 financial year**. Enter a salary and see
net pay after income tax, Medicare levy, Medicare levy surcharge, HECS/HELP repayments and the
Low Income Tax Offset — per year, month, fortnight or week. 100% client-side, no backend, no
tracking.

**Live:** https://salary-calculator-au.pages.dev/

## Stack

- React 18 + TypeScript + Vite
- No runtime dependencies beyond React
- Deploys as a static site to Cloudflare Pages

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

## Deploy (Cloudflare Pages)

1. Push to GitHub (already configured).
2. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Pick the `salary-calculator-au` repo.
4. Build settings:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Build output directory: `dist`
5. Save & Deploy. Subsequent pushes to `main` auto-deploy.

If you later attach a custom domain, update the canonical/OG URLs in `index.html`,
`public/robots.txt` and `public/sitemap.xml`.

## Tax data

Rates and thresholds are hard-coded in [`src/tax.ts`](src/tax.ts) from published ATO figures
for 2026-27 (resident brackets with the 15% second rate, 2% Medicare levy with the $28,011
single low-income threshold, marginal HELP system from $69,528, LITO to $66,667). Estimates
only — not tax advice.
