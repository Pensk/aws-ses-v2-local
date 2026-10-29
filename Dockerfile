# Node.js 24 LTS ("Krypton"), pinned by digest. Supported until 2028-04-30.
FROM node:24.22.2-alpine3.24@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85

LABEL org.opencontainers.image.title="aws-ses-v2-local" \
      org.opencontainers.image.description="Run the aws-ses-v2-local SES emulator in Docker" \
      org.opencontainers.image.authors="Pensk <superpensk@gmail.com>" \
      org.opencontainers.image.source="https://github.com/Pensk/aws-ses-v2-local" \
      org.opencontainers.image.url="https://hub.docker.com/r/pensk/aws-ses-v2-local" \
      org.opencontainers.image.documentation="https://github.com/domdomegg/aws-ses-v2-local#readme" \
      org.opencontainers.image.version="2.11.0" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.base.name="docker.io/library/node:24.22.2-alpine3.24" \
      org.opencontainers.image.base.digest="sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85"

ENV NODE_ENV=production
WORKDIR /app

# The upstream package version is pinned in package.json and package-lock.json.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
    && npm cache clean --force

ENV PATH=/app/node_modules/.bin:$PATH

# Emails and templates are held in memory, so nothing needs to be writable.
USER node

EXPOSE 8005
# Upstream defaults to listening on "::", which fails on hosts without IPv6.
CMD ["aws-ses-v2-local", "--host", "0.0.0.0"]
