# syntax=docker/dockerfile:1.7

# ---- build (deps + compile in ONE stage so .bin symlinks aren't lost) -------
FROM node:20-alpine AS build
WORKDIR /workspace
RUN apk add --no-cache libc6-compat
# Local SDK first so `file:../../packages/client` resolves at install time.
COPY packages/client ./packages/client
COPY apps/studio/package.json apps/studio/package-lock.json* ./apps/studio/
WORKDIR /workspace/apps/studio
RUN npm install --no-audit --no-fund --include=optional
# Now bring in the rest of the studio source and build.
COPY apps/studio ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN node node_modules/next/dist/bin/next build

# ---- runtime ----------------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
# Standalone bundle ships its own minimal node_modules.
COPY --from=build --chown=app:app /workspace/apps/studio/.next/standalone ./
COPY --from=build --chown=app:app /workspace/apps/studio/.next/static ./.next/static
COPY --from=build --chown=app:app /workspace/apps/studio/public ./public
USER app
EXPOSE 3000
CMD ["node", "server.js"]
