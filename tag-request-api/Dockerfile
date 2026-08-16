FROM node:18-alpine

WORKDIR /app
COPY tag-request-api/server.js ./

ENV PORT=3001
ENV DATA_DIR=/data
EXPOSE 3001

CMD ["node", "server.js"]
