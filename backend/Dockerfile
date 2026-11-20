# 构建阶段：用 JDK 镜像跑 Maven，产出可执行 jar。
FROM eclipse-temurin:25-jdk AS build
# Maven Wrapper 的下载与 ZIP 解压依赖。
RUN apt-get update \
    && apt-get install -y --no-install-recommends wget ca-certificates unzip \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN ./mvnw -B -DskipTests dependency:go-offline
COPY src src
RUN ./mvnw -B -DskipTests package

# 运行阶段：只含 JRE 与 jar。应用用户固定 uid 1000，与宿主机部署账号一致，
# 这样挂进容器的配置文件可以保持 600 权限而不需要提权。
FROM eclipse-temurin:25-jre
# 基础镜像自带 uid 1000 的账户，直接复用，不再新建同名用户。
# uid 必须固定为 1000，与宿主机挂载目录和配置文件的属主一致。
RUN mkdir -p /app /data/uploads /data/logs \
    && chown -R 1000:1000 /app /data
COPY --chown=1000:1000 --from=build /src/target/jh-emp-*.jar /app/app.jar
USER 1000:1000
WORKDIR /app
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
