FROM node:lts

ENV NODE_ENV production

ENV THELOUNGE_HOME "/config"
VOLUME "${THELOUNGE_HOME}"

# Expose HTTP.
ENV PORT 9000
EXPOSE ${PORT}

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["yarn", "start"]

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY . /app

WORKDIR  /app

# Install thelounge.
RUN NODE_ENV=development yarn --non-interactive --frozen-lockfile install && \
    yarn --non-interactive build && \
    yarn --non-interactive cache clean && \
