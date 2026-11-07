# Open Brain, self-hosted. `docker compose up` runs this next to a Postgres;
# on its own it needs DATABASE_URL and OPENBRAIN_OWNER_KEY at the least.

FROM node:22-slim AS build
WORKDIR /app
RUN npm install -g pnpm@11.10.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000
RUN npm install -g pnpm@11.10.0
# The whole tree, dev dependencies included: migrations run through tsx at boot.
COPY --from=build --chown=node:node /app ./
# Where the git mirror writes. Made here so a mounted volume inherits the owner.
RUN mkdir -p .openbrain && chown node:node .openbrain
USER node
EXPOSE 3000
# Migrations are idempotent, so every boot applies whatever is new and starts.
CMD ["sh", "-c", "pnpm db:migrate && pnpm start"]
