# @stampd/api on Railway. Build context: the repo root (service settings: docs/runbook.md "Hosting").
FROM node:22-bookworm-slim
# openssl: Prisma's migrate engine. corepack: the pnpm version pinned in package.json.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* && corepack enable
ENV CI=true
WORKDIR /repo
COPY . .
# Installs api and the workspace packages it uses; postinstall runs prisma generate.
RUN pnpm install --frozen-lockfile --filter "@stampd/api..."
RUN pnpm --filter @stampd/api build
ENV NODE_ENV=production
CMD ["node", "apps/api/dist/index.js"]
