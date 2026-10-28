FROM node:24-trixie-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY . .
RUN yarn install --frozen-lockfile --non-interactive \
 && NODE_ENV=production yarn build \
 && yarn install --production --frozen-lockfile --non-interactive --ignore-scripts

FROM gcr.io/distroless/nodejs24-debian13:nonroot
ENV NODE_ENV=production THELOUNGE_HOME=/var/opt/thelounge
WORKDIR /app
COPY --from=build /src/index.js /src/package.json /src/.thelounge_home ./
COPY --from=build /src/dist ./dist
COPY --from=build /src/public ./public
COPY --from=build /src/node_modules ./node_modules
EXPOSE 9000
VOLUME /var/opt/thelounge
CMD ["/app/index.js", "start"]
