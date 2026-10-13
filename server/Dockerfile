# ── Stage: Production image ──────────────────────────────────────────────────
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy dependency manifests first (layer-cache friendly)
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy application source
COPY . .

# Render injects PORT at runtime; default to 5000 locally
EXPOSE 5000

# Health-check so Render knows the container is alive
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-5000}/ || exit 1

CMD ["node", "server.js"]
