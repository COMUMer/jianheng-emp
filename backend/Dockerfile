# 构建阶段：用 JDK 镜像跑 Maven，产出可执行 jar。
FROM eclipse-temurin:25-jdk AS build
WORKDIR /src
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN ./mvnw -B -q -DskipTests dependency:go-offline
COPY src src
RUN ./mvnw -B -DskipTests package

# 运行阶段：只含 JRE 与 jar。应用用户固定 uid 1000，与宿主机部署账号一致，
# 这样挂进容器的配置文件可以保持 600 权限而不需要提权。
FROM eclipse-temurin:25-jre
RUN useradd --uid 1000 --user-group --home-dir /app --create-home --shell /usr/sbin/nologin app \
    && mkdir -p /data/uploads /data/logs \
    && chown -R app:app /data
COPY --chown=app:app --from=build /src/target/jh-emp-*.jar /app/app.jar
USER app
WORKDIR /app
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
