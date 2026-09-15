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
# Stage 0 — base: Node plus the project's pinned npm
#
# The npm version lives in exactly one place: devEngines.packageManager in
# package.json. It is read from there rather than repeated here, because npm
# versions disagree about optional-dependency trees (notably the @emnapi WASM
# fallbacks). A lockfile written by one npm can fail `npm ci` under another with
# "Missing: @emnapi/runtime from lock file" — even between two 11.x releases.
#
# devEngines also makes npm refuse `install`, `ci` and `run` under any other
# version, so every stage that runs npm must start from here.
# ----------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS base

WORKDIR /app

COPY package.json ./
RUN npm install -g --no-audit --no-fund \
      "npm@$(node -p 'require("./package.json").devEngines.packageManager.version')"


# ----------------------------------------------------------------------------
# Stage 1 — dependencies
# ----------------------------------------------------------------------------
FROM base AS deps

COPY package-lock.json ./
RUN npm ci --no-audit --no-fund


# ----------------------------------------------------------------------------
# Stage 2 — build
#
# NEXT_PUBLIC_* must be present here, not at runtime: Next.js substitutes them
# into the client bundle during `next build`. Server-side secrets deliberately
# are NOT build args — they would be baked into image layers.
# ----------------------------------------------------------------------------
FROM base AS builder

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
