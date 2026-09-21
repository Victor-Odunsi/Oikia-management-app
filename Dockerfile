# syntax=docker/dockerfile:1
#
# Backend container for AWS App Runner (staging/sandbox). Builds the Vite
# client and the esbuild server bundle, then ships a runtime image with only
# production dependencies — esbuild's --packages=external (see package.json's
# "build" script) leaves node_modules unbundled, so it must be present here.

FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# Matches server/app.ts's PORT resolution (defaults to 5000 if unset) and the
# port already used by the DigitalOcean/PM2 deployment — keep them aligned.
EXPOSE 5000
CMD ["node", "dist/index.js"]
