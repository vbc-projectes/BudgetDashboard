# DashboardEconomic — Docker image
# Single-container web app serving the frontend via Express + SQLite
# Build: docker build -t dashboardeconomic .

FROM node:20-alpine

# System deps for sqlite3 native build
RUN apk add --no-cache python3 make g++

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
    CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["node", "server.js"]
