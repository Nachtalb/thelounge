FROM oven/bun:1.4.2 AS build
WORKDIR /src
COPY . .
RUN bun install --frozen-lockfile \
 && NODE_ENV=production bun run build \
 && rm -rf node_modules \
 && bun install --production --frozen-lockfile --ignore-scripts

# cc (not oven/bun:distroless): sharp needs libstdc++
FROM gcr.io/distroless/cc-debian13:nonroot
COPY --from=build /usr/local/bin/bun /usr/local/bin/bun
ENV NODE_ENV=production THELOUNGE_HOME=/var/opt/thelounge
WORKDIR /app
COPY --from=build /src/index.js /src/package.json /src/.thelounge_home ./
COPY --from=build /src/dist ./dist
COPY --from=build /src/public ./public
COPY --from=build /src/node_modules ./node_modules
EXPOSE 9000
VOLUME /var/opt/thelounge
ENTRYPOINT ["/usr/local/bin/bun"]
CMD ["/app/index.js", "start"]
