FROM node:24-bookworm-slim AS build
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm test && npm run build && npm run typecheck

FROM node:24-bookworm-slim
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build /app /app
EXPOSE 3000
CMD ["node", "--env-file=.env.local", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0"]
