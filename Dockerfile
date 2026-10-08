# Stage 1: Build & Prisma Generation
FROM node:20-slim AS builder

WORKDIR /app

# Install build dependencies and OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl python3 make g++ ca-certificates
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy all configuration and workspace files
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
COPY prisma ./prisma/

# Install dependencies with explicit build script authorization
RUN pnpm install --frozen-lockfile --dangerously-allow-all-builds || pnpm install --dangerously-allow-all-builds

COPY . .

# Generate Prisma Client and build NestJS
RUN pnpm prisma generate
RUN pnpm build

# Stage 2: Production Runtime
FROM node:20-slim AS runner

WORKDIR /app

# Install runtime OpenSSL required by Prisma engine
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "dist/main.js"]