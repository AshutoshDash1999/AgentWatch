FROM node:20-alpine AS builder
WORKDIR /app

# Install deps first (separate layer so it caches unless lockfile changes)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source — .dockerignore excludes node_modules/.next so we never
# overwrite the just-installed Linux-native packages with Windows ones
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Runtime ────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Standalone output: server.js + minimal node_modules + .next/ build artefacts
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Static assets must live at .next/static relative to server.js
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Public assets (favicon, etc.)
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

# Render (and every other cloud) sets $PORT at runtime.
# Next.js standalone server.js already reads process.env.PORT,
# but we pass it explicitly so there is zero ambiguity.
ENV PORT=3000
EXPOSE 3000

CMD ["sh", "-c", "node server.js"]
