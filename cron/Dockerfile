FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV DATA_DIR=/data

CMD ["sh", "cron/loop.sh"]
