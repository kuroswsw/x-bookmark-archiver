FROM mcr.microsoft.com/playwright:v1.62.1-noble

ENV DEBIAN_FRONTEND=noninteractive \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN apt-get update \
    && apt-get install -y --no-install-recommends fluxbox novnc websockify x11vnc xvfb \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN npm install --global pnpm@11.19.0 \
    && pnpm install --frozen-lockfile --prod

COPY src ./src
COPY docker ./docker

RUN chmod +x /app/docker/vps-setup.sh

CMD ["node", "src/cli.js", "daemon"]

