# Contributing

## How to run and test

### Local setup
```bash
npm install
npx playwright install chromium   # installs Chromium locally
cp .env.example .env              # fill API_KEY + WEX credentials
npm start                         # starts server on PORT (default 3000)
```

### Manual testing
Once running, test endpoints with `curl`:
```bash
export URL=http://localhost:3000
export KEY=<your-api-key>

# Health check (no auth)
curl $URL/health

# WEX BOCA task (requires WEX credentials in .env)
curl -X POST $URL/wex/boca/889510 \
  -H "x-api-key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"priority":"Normal","dueDate":"2026-12-31"}'

# WEX Apps closer (search by Company Name or App ID)
curl -X POST $URL/wex/apps \
  -H "x-api-key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"companyName":"Acme Corp"}'

# Screenshot (generic automation)
curl -X POST $URL/run/screenshot \
  -H "x-api-key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

### Monitoring
Navigate to `/monitor` in your browser to see real-time metrics (asks for API key once, stores in localStorage).

### Adding a new automation
1. Create `src/automations/<site>/index.js` exporting `[{ name, description, run(params) }]`
2. Register it in `src/registry.js`
3. It's instantly available at `POST /run/<name>`

For stateful multi-step scrapers (like WEX), extend `BaseScraper` from `src/core/BaseScraper.js`. For one-shot ops, use `withBrowser` helper from `src/core/withBrowser.js`.
