# syntax=docker/dockerfile:1

# Frontend and jar are platform-independent, so both build on the build machine.
FROM --platform=$BUILDPLATFORM node:24 AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM --platform=$BUILDPLATFORM eclipse-temurin:17-jdk AS backend
WORKDIR /app/backend
COPY backend/gradlew backend/build.gradle backend/settings.gradle ./
COPY backend/gradle ./gradle
RUN ./gradlew --no-daemon dependencies > /dev/null
COPY backend/src ./src
COPY --from=frontend /app/frontend/dist /app/frontend/dist
RUN ./gradlew --no-daemon jar && mkdir -p /out/data

FROM eclipse-temurin:17-jre
ENV PORT=8080 DATABASE_PATH=/data/backup.db
COPY --from=backend --chown=1000:1000 /out/data /data
COPY --from=backend /app/backend/build/libs/secret-hitler-online.jar /app/secret-hitler-online.jar
VOLUME /data
EXPOSE 8080
# uid 1000 is the usual owner of a host data directory, so a bind-mounted /data stays writable.
USER 1000:1000
CMD ["java", "-jar", "/app/secret-hitler-online.jar"]
