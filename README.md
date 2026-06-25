# browser-automation

General-purpose headless browser microservice (Playwright + Chromium). Chromium
lives in a Docker image (`mcr.microsoft.com/playwright`) and is **never downloaded
at deploy time**. Other services (e.g. `servercrm`) call this over HTTP for any
browser-driven work — site scrapers (WEX, …) and generic ops (screenshot, pdf,
extract). It is standalone: it owns its own integrations and does not call back.

## Architecture
```
server.js                  # bootstrap (dotenv + listen)
src/
  app.js                   # express assembly (json, routes, error handler)
  registry.js              # name → automation map (generic dispatch)
  core/                    # site-agnostic browser engine
    browser.js             #   launch (local Chromium) / connect (Browserless opt-in)
    BaseScraper.js         #   base class for stateful multi-step scrapers
    withBrowser.js         #   helper for one-shot ops (launch + guaranteed cleanup)
    poll.js                #   pollUntil() for slow SPAs (Aura/Lightning)
    httpError.js           #   HttpError/badRequest → status mapping
  middleware/
    auth.js                #   x-api-key guard
    errorHandler.js        #   central error → JSON
  automations/             # one folder per site/domain + common ops
    wex/                   #   bocaScraper, reportScraper, salesforceAuth, application
    common/                #   screenshot, pdf, extract
  routes/
    health.js  wex.js  run.js
```

### Adding a new automation
Create `src/automations/<site>/index.js` exporting `[{ name, description, run(params) }]`,
then add it to `src/registry.js`. Stateful scrapers extend `core/BaseScraper`;
one-shot ops use `core/withBrowser`. It's instantly reachable at `POST /run/<name>`.

## API
All endpoints except `/health` and `/` require the `x-api-key` header.

| Method | Path | Purpose |
|---|---|---|
| GET  | `/health` | Render health check |
| GET  | `/monitor` | Dashboard: per-automation usage counts + recent-run log (asks for the API key once) |
| GET  | `/metrics` | JSON usage metrics (totals, per-automation runs/success/fail/avg, recent runs). Durable when `DATABASE_URL` is set, else in-memory (`durable` flag in the response). |
| GET  | `/automations` | List registered automations |
| POST | `/run/:name` | Run any automation by name (body = params) |
| POST | `/wex/boca` or `/wex/boca/:appId` | Create a BOCA task on a WEX application |
| POST | `/wex/report` | Scrape the WEX "App Created — Today" report |

### Examples
```bash
# BOCA task (appId in path or body; assignedTo defaults to the application Owner)
curl -X POST $URL/wex/boca/889510 -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -d '{"priority":"Normal","dueDate":"2026-06-30","status":"Not Started"}'

# Generic: screenshot any URL (returns base64 PNG)
curl -X POST $URL/run/screenshot -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

## Env
See `.env.example`. Required: `API_KEY`; for WEX: `WEX_USERNAME_SCRAPER`,
`WEX_PASSWORD_SCRAPER`, and the Salesforce set (`SF_WEX_CLIENT_KEY`,
`SF_WEX_CLIENT_SECRET`, `SF_WEX_USER`, `SF_WEX_USER_PASSWORD`,
`SF_WEX_SECURITY_CODE`, `WEX_SF_AUTH_URL`).

## Run locally
```bash
npm install
npx playwright install chromium   # local dev only; Docker image already has it
cp .env.example .env              # fill values
npm start
```

## Deploy (Render, Docker)
Blueprint from `render.yaml` → Docker runtime → Chromium bundled, no download.
