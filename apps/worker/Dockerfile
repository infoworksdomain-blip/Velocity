# Post-STEP-22 audit remediation — see apps/web/Dockerfile's own header
# comment for the shared rationale (infra/terraform's worker task
# definition has always expected a real image at PLACEHOLDER_ECR_IMAGE_URI).
# apps/worker has no browser-facing output, so this is a much simpler
# tsc-build + plain `node dist/index.js` runtime — no standalone-output
# tracing needed.
#
# Build from the MONOREPO ROOT:
#   docker build -f apps/worker/Dockerfile -t velocity-worker:latest .

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/render/package.json apps/render/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/providers/package.json packages/providers/package.json
COPY packages/text-engine/package.json packages/text-engine/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile

FROM base AS builder
# Same real bug apps/web/Dockerfile's own comment documents, fixed the
# same way: pnpm gives every workspace package its own node_modules
# (symlinks into the root .pnpm store), not just the root one — copying
# only the root node_modules left per-package devDependencies
# unresolvable for whichever package needed them. Copying the whole deps
# output is the correct fix.
COPY --from=deps /app ./
COPY . .
# Confirmed via `turbo run build --filter=@velocity/worker... --dry-run`
# that this builds exactly @velocity/worker plus the workspace:*
# dependencies it actually needs (contracts, core, db, providers,
# text-engine) — no apps/web/apps/render/@velocity/ui build cost paid.
RUN pnpm exec turbo run build --filter=@velocity/worker...

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nodejs
# Real production dependencies only — workspace:* packages resolve to
# their built dist/ output via the node_modules symlinks pnpm already set
# up in the deps stage, so copying node_modules + every workspace
# package's dist/ (not its src/) is what a real runtime needs.
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nodejs:nodejs /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=builder --chown=nodejs:nodejs /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder --chown=nodejs:nodejs /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder --chown=nodejs:nodejs /app/packages/core/dist ./packages/core/dist
COPY --from=builder --chown=nodejs:nodejs /app/packages/db/dist ./packages/db/dist
COPY --from=builder --chown=nodejs:nodejs /app/packages/providers/dist ./packages/providers/dist
COPY --from=builder --chown=nodejs:nodejs /app/packages/text-engine/dist ./packages/text-engine/dist
USER nodejs
WORKDIR /app/apps/worker
CMD ["node", "dist/index.js"]
