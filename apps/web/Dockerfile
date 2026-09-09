# Post-STEP-22 audit remediation: infra/terraform/modules/regional-stack/
# ecs.tf's web task definition has always expected a real pre-built image
# at deploy time (PLACEHOLDER_ECR_IMAGE_URI) — this is what a real CI/CD
# pipeline builds and pushes to ECR. Multi-stage: deps -> build -> a slim
# runtime stage that only ships the Next.js standalone output, never the
# full monorepo source or node_modules.
#
# Build from the MONOREPO ROOT (not this directory), since a pnpm
# workspace's install/build needs every package's manifest and every
# workspace:* dependency's real source:
#   docker build -f apps/web/Dockerfile -t velocity-web:latest .

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

FROM base AS deps
# Every workspace package.json is needed for pnpm to resolve the
# workspace graph correctly, even though this image only ships apps/web —
# copying just apps/web/package.json would make pnpm install fail to find
# the workspace:* dependencies it needs to link.
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
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .
# Real, tested standalone-output config (see apps/web/next.config.ts) —
# only active under this flag, since it needs real filesystem symlinks
# that Windows blocks without Developer Mode (irrelevant here: this stage
# always runs on Linux).
ENV DOCKER_BUILD=1
# turbo's own --filter (not pnpm's) so the dependency graph is built in
# order — confirmed via `turbo run build --filter=@velocity/web... --dry-run`
# that this correctly includes every workspace:* dependency @velocity/web
# actually needs (including @velocity/worker, imported for its compiled
# Temporal client — apps/web/package.json's own workspace:* list), not
# just apps/web's own source.
RUN pnpm exec turbo run build --filter=@velocity/web...

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
# Next's own standalone-output layout for a monorepo app: server.js and
# its node_modules land nested under the app's path relative to
# outputFileTracingRoot (the monorepo root — see next.config.ts), not at
# the standalone folder's own root.
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
# No apps/web/public directory exists yet (confirmed at Dockerfile-authoring
# time) — add a COPY line here once one does; server.js serves it
# automatically once present at ./apps/web/public.
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "apps/web/server.js"]
