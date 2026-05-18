# syntax=docker/dockerfile:1.7

# ---------- builder ----------
FROM node:lts-alpine AS builder
WORKDIR /app

RUN apk add --no-cache libc6-compat \
 && corepack enable

COPY package.json pnpm-lock.yaml ./
# pnpm 11 fails the install with ERR_PNPM_IGNORED_BUILDS if any package
# has lifecycle scripts (sharp does). Workaround: skip scripts on install,
# then explicitly rebuild the packages we trust. Cleaner than fighting
# pnpm.onlyBuiltDependencies in non-interactive contexts.
RUN pnpm install --frozen-lockfile --ignore-scripts \
 && pnpm rebuild sharp

ARG DATABASE_URL
ENV DATABASE_URL=${DATABASE_URL}
ENV NEXT_TELEMETRY_DISABLED=1

COPY . .
RUN pnpm build \
 && test -f .next/standalone/PROJECTS/udd-web/server.js \
 && test -d .next/static

# ---------- runtime ----------
FROM node:lts-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV TZ=UTC
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

LABEL org.opencontainers.image.title="udd-web"
LABEL org.opencontainers.image.source="https://github.com/asherlewis-uk/udd-web"

RUN addgroup -g 1001 -S nodejs \
 && adduser  -u 1001 -S nextjs -G nodejs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static     ./.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1

CMD ["node", "server.js"]
