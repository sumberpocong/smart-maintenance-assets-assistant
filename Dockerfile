# ─── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Compiles React frontend to dist/ and Node backend to dist-server/
RUN npm run build

# ─── Runtime stage ────────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Copy only what the server needs at runtime
COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server

# Persistent data directory (if using JSON fallback, though Firestore is preferred)
RUN mkdir -p /app/data
VOLUME ["/app/data"]

ENV NODE_ENV=production \
    PORT=8080 \
    USE_FIRESTORE=true

EXPOSE 8080

CMD ["node", "dist-server/server.js"]
