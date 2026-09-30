# ==============================================================================
# Multi-Stage Dockerfile for Budget Planner (Production Runtime)
# ==============================================================================

# --- Stage 1: Builder ---
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root workspace manifests
COPY package*.json ./
COPY packages/engine/package*.json ./packages/engine/
COPY apps/server/package*.json ./apps/server/
COPY apps/web/package*.json ./apps/web/

# Install full dependencies across workspace
RUN npm ci

# Copy full source tree
COPY . .

# Build Vite frontend bundle
RUN npm run build:web

# --- Stage 2: Production Runtime ---
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Install curl for Docker health check probes
RUN apk add --no-cache curl

# Copy root workspace manifests
COPY package*.json ./
COPY packages/engine/package*.json ./packages/engine/
COPY apps/server/package*.json ./apps/server/
COPY apps/web/package*.json ./apps/web/

# Install production dependencies only
RUN npm ci --omit=dev

# Copy engine and server application code
COPY packages/engine ./packages/engine
COPY apps/server ./apps/server

# Copy built frontend from builder stage into apps/web/dist
COPY --from=builder /app/apps/web/dist ./apps/web/dist

# Expose default application port
EXPOSE 4000

# Health check probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://127.0.0.1:${PORT:-4000}/api/health || exit 1

# Start production server
CMD ["node", "apps/server/src/index.js"]
