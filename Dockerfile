FROM node:lts

ENV NODE_ENV production
ARG CHECKOUT blackjack-and-hookers

ENV THELOUNGE_HOME "/config"
VOLUME "${THELOUNGE_HOME}"

# Expose HTTP.
ENV PORT 9000
EXPOSE ${PORT}

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["yarn", "start"]

WORKDIR  /app

# Install thelounge.
RUN git clone https://github.com/Nachtalb/thelounge /app && \
    git checkout ${CHECKOUT} && \
    NODE_ENV=development yarn --non-interactive --frozen-lockfile install && \
    yarn --non-interactive build && \
    yarn --non-interactive cache clean && \
    ln -fs /app/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
