FROM nginx:1.30-alpine
# Apply the latest Alpine security patches to the base image.
ARG APK_UPGRADE=true
RUN if [ "$APK_UPGRADE" = "true" ]; then apk upgrade --no-cache; fi
COPY security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY public /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1
