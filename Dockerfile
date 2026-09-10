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
# ----------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS deps

# Pin npm rather than inheriting whatever the base image ships. node:22-slim
# currently bundles npm 10, which reads optional-dependency trees (notably the
# @emnapi WASM fallbacks) differently from npm 11 — so a lockfile written by
# npm 11 makes `npm ci` fail with "Missing: @emnapi/runtime from lock file".
# The lockfile is fine; the npm reading it has to match.
ARG NPM_VERSION=11

WORKDIR /app

RUN npm install -g "npm@${NPM_VERSION}"

COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund


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
