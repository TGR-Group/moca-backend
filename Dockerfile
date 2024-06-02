FROM node:20

WORKDIR /moca

COPY ./ ./

RUN npm install -g pnpm && pnpm i
