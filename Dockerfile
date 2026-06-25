# Browser-automation microservice.
# Base image ships Chromium + all OS deps — no `playwright install` at deploy time,
# so Chromium is NEVER downloaded on deploy (unlike a Node-runtime service).
FROM mcr.microsoft.com/playwright:v1.59.1-jammy

# Use the image's pre-installed browsers at /ms-playwright. (Setting this to an
# empty string sends Playwright to node_modules/.local-browsers — which is empty
# because we install with --ignore-scripts — and Chromium launch then fails.)
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

COPY package*.json ./
# --ignore-scripts: image already bundles browsers; --omit=dev: no nodemon in prod
RUN npm install --ignore-scripts --omit=dev

COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
