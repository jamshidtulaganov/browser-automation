# browser-automation

Headless browser microservice exposing Playwright + Chromium over HTTP. Other services call it for browser-driven work — WEX site scrapers, screenshots, PDFs, generic extracts. 

To run locally: `npm install`, `npx playwright install chromium`, copy `.env.example` to `.env` (fill `API_KEY` + WEX credentials), then `npm start`.
