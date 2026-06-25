# Browser-automation microservice.
# Base image ships Chromium + all OS deps — no `playwright install` at deploy time,
# so Chromium is NEVER downloaded on deploy (unlike a Node-runtime service).
FROM mcr.microsoft.com/playwright:v1.59.1-jammy

# Use the image's built-in browser path (/ms-playwright) instead of node_modules.
ENV PLAYWRIGHT_BROWSERS_PATH=

WORKDIR /app

COPY package*.json ./
# --ignore-scripts: image already bundles browsers; --omit=dev: no nodemon in prod
RUN npm install --ignore-scripts --omit=dev

COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
