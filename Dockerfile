# DashboardEconomic — Docker image
# Single-container web app serving the frontend via Express + SQLite
# Build: docker build -t dashboardeconomic .

FROM node:22-slim

# System deps for sqlite3 native build
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first (layer cache)
COPY package.json package-lock.json* ./
# Install only production deps; skip electron (not needed in server mode)
RUN npm install --omit=dev --ignore-scripts \
    && npm rebuild sqlite3 \
    && npm cache clean --force

# Copy application source
COPY src/ ./src/
COPY public/ ./public/
COPY server.js ./
COPY preload.js ./

# Data directory — override with a Docker volume for persistence
ENV USERS_ROOT=/app/usuarios
ENV NODE_ENV=production
ENV PORT=3000

RUN mkdir -p /app/usuarios

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
