# Lessons Learned — browser-automation

- [2026-06-29] wex/application: `resolveApplication()` in `application.js` does a Salesforce SOQL lookup only (no browser) — it is safe to expose as a fast GET endpoint without a Playwright session. Use it for read-only C-29 lookups; use `WexAppsScraper` for write actions (close/BOCA) that need browser automation.
- [2026-06-29] registry: new automations must be added to the exported array in `src/automations/wex/index.js` AND have a matching route in `src/routes/wex.js` — the registry auto-registers from the array on `store.init()`.
