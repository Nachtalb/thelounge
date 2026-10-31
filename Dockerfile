FROM oven/bun:1.4.2 AS deps
WORKDIR /src
COPY package.json bun.lock bunfig.toml ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

FROM oven/bun:1.4.2 AS prod-deps
WORKDIR /src
COPY package.json bun.lock bunfig.toml ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --production --frozen-lockfile --ignore-scripts

FROM deps AS build
COPY . .
RUN NODE_ENV=production bun run build

# cc (not oven/bun:distroless): sharp needs libstdc++
FROM gcr.io/distroless/cc-debian13:nonroot
COPY --from=build /usr/local/bin/bun /usr/local/bin/bun
ENV NODE_ENV=production THELOUNGE_HOME=/var/opt/thelounge
WORKDIR /app
COPY --from=build /src/index.js /src/package.json /src/.thelounge_home ./
COPY --from=build /src/dist ./dist
COPY --from=build /src/public ./public
COPY --from=prod-deps /src/node_modules ./node_modules
EXPOSE 9000
VOLUME /var/opt/thelounge
ENTRYPOINT ["/usr/local/bin/bun"]
CMD ["/app/index.js", "start"]
