FROM node:22-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Final stage: Caddy serves the built SPA
FROM caddy:2-alpine

COPY --from=build /app/dist /srv
# Caddyfile is mounted at runtime via compose volume
