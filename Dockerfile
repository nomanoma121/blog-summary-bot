FROM oven/bun:1.3.6

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY index.ts tsconfig.json ./
COPY src ./src

RUN mkdir -p /app/data

CMD ["bun", "run", "index.ts"]
