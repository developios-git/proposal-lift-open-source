# ============================================================================
# ProposalLift (open source) — application image
#
# Multi-stage build producing a minimal runtime from Next.js standalone output.
# Modelled on the official vercel/next.js `with-docker` example.
#
# Built locally by each self-hoster rather than pulled from a registry. That is
# deliberate: Next.js inlines NEXT_PUBLIC_* values into the client bundle at
# build time, so a prebuilt image would ship someone else's Supabase project
# inside every user's JavaScript.
# ============================================================================

# Debian slim rather than alpine: the official Next.js example uses slim, and
# musl causes trouble with native dependencies (notably sharp, used for image
# optimization). Pinned so builds stay reproducible.
ARG NODE_VERSION=22-slim


# ----------------------------------------------------------------------------
# Stage 1 — dependencies
#
# Uses the npm bundled with the image. The committed lockfile installs cleanly
# under every current npm (10.9, 11.19, 12), and CI checks that on each change.
#
# What can break it is the lockfile in *your* checkout: some npm 11 releases
# (e.g. 11.6.2, bundled with Node 24.13) silently delete the @emnapi WASM
# fallback entries when you run `npm install`. That npm doesn't notice, but this
# one does, and `npm ci` stops with "Missing: @emnapi/runtime from lock file".
# The message below says how to recover.
# ----------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund || { \
      echo ""; \
      echo "npm ci failed. If the error above says 'Missing: ... from lock file', your"; \
      echo "package-lock.json was rewritten by an npm that drops entries. Fix it with:"; \
      echo "  git checkout package-lock.json"; \
      echo "and, if you install locally, upgrade npm first: npm install -g npm@11"; \
      exit 1; \
    }


# ----------------------------------------------------------------------------
# Stage 2 — build
#
# NEXT_PUBLIC_* must be present here, not at runtime: Next.js substitutes them
# into the client bundle during `next build`. Server-side secrets deliberately
# are NOT build args — they would be baked into image layers.
# ----------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS builder

WORKDIR /app

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_APP_URL

ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build


# ----------------------------------------------------------------------------
# Stage 3 — runtime
# ----------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# `node` is the non-root user built into the official image.
COPY --from=builder --chown=node:node /app/public ./public

RUN mkdir .next && chown node:node .next

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node

EXPOSE 3000

# Server-side secrets (SUPABASE_SECRET_KEY, RESEND_API_KEY, CRON_SECRET) are
# injected at runtime by docker-compose's env_file, never baked into the image.
CMD ["node", "server.js"]
