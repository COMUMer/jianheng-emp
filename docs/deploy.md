# 部署与交付

生产前端托管在 Cloudflare，后端以容器运行在单台 Linux 主机。本文件是部署形态、发布流程与服务器配置的唯一说明，具体配置以文末索引的文件为准。

## 环境划分

| 环境 | 运行方式 | 数据与访问 |
| --- | --- | --- |
| `dev` | 本机启动后端与 Vite，见 [README](../README.md#本地启动) | 独立开发库与附件目录，使用模拟或脱敏数据 |
| `prod` | Cloudflare 托管前端，单台主机用 Docker Compose 运行后端、MySQL 与隧道 | 正式域名与 HTTPS，数据库不对外暴露，数据与密钥独立管理 |

生产主机为 2 核、可用内存约 1.7G。内存预算：后端 640MB、MySQL 768MB、隧道与系统约 150MB，其余留给文件缓存。这台主机不构建镜像，也不运行其他服务。

## 访问链路

```
浏览器 → Cloudflare（TLS 终止）→ Worker（静态资源 + /api 反代）
       → API 域名 → 隧道 → 主机上的 cloudflared → backend:8080
```

- 前端始终请求相对路径 `/api`，由 Worker 转发到 API 域名。页面与接口同属一个站点，会话 Cookie、CSRF 请求头、`Set-Cookie` 都按同源处理，后端不需要 CORS 配置。
- 主机不开放入站端口，`cloudflared` 以出站连接建立隧道，源站 IP 不出现在 DNS 中。
- 主机上不部署反向代理。TLS 在 Cloudflare 边缘终止，健康检查与排障走回环 `127.0.0.1:8080`。

## 运行时组成

| 服务 | 镜像 | 端口 | 持久化 |
| --- | --- | --- | --- |
| `backend` | `ghcr.io/<owner>/jianheng-emp-server:${IMAGE_TAG}` | `127.0.0.1:8080` | 附件 `/data/uploads`、日志 `/data/logs` |
| `mysql` | `ghcr.io/<owner>/mirror-mysql:8.4.13` | 仅容器网络 | 数据目录 |
| `cloudflared` | `ghcr.io/<owner>/mirror-cloudflared:2026.11.1` | 无 | 无 |

- 宿主机 `/var/lib/jh-emp/{mysql,uploads,logs}` 与容器路径一一对应，备份脚本直接读取。
- 两个容器统一 `TZ=Asia/Shanghai`。数据库存 `DATETIME`，时区不一致会让超期判断整体偏移。
- 日志写入 `EMP_LOG_DIR`，滚动与保留策略见 [application.yml](../backend/src/main/resources/application.yml)。默认总量上限 10GB，生产通过环境变量压到 2GB 以内。
- 发布只更新后端容器，不重启 MySQL 与隧道。

## 仓库内的交付产物

| 路径 | 职责 |
| --- | --- |
| [backend/Dockerfile](../backend/Dockerfile) | 多阶段构建：编译镜像产出 jar，运行镜像只含 JRE 与 jar，以非 root 用户运行 |
| [backend/.mvn/wrapper/maven-wrapper.properties](../backend/.mvn/wrapper/maven-wrapper.properties) | Maven 分发包与 SHA-256 校验配置 |
| `backend/.dockerignore` | 排除构建产物、附件目录与本地配置，避免密钥进入构建上下文 |
| `deploy/compose.yaml` | 三个服务的镜像、内存上限、卷、健康检查与启动依赖 |
| `deploy/deploy.sh` | 主机侧发布：加锁、备份、拉取、更新、健康门禁、回滚、清理 |
| `.github/workflows/backend.yml` | 后端流水线：验证、构建镜像、发布 |
| `frontend/wrangler.jsonc` | 静态资源目录、SPA 回退、`/api/*` 交给 Worker |
| `frontend/worker/api-proxy.ts` | 把 `/api/*` 原样转发到 API 域名，不读取响应体 |

## 流水线

`master` 是唯一长期分支，推送即发布。后端流水线监听 `backend/`、`deploy/` 与自身文件的变化，支持手动触发。

| job | 内容 | 失败后果 |
| --- | --- | --- |
| `verify` | 在临时 MySQL 8.4 上执行 `./mvnw verify`，覆盖全部 Flyway 迁移 | 不构建镜像 |
| `image` | 构建镜像并推送 GHCR，标签为 `sha-<7 位>` 与 `latest` | 不发布 |
| `deploy` | 上传 `deploy/` 并执行发布脚本 | 主机保持或回滚到上一版本 |

- 发布串行执行，同一时间只允许一个发布。
- 镜像仓库保持公开：镜像内不含密钥，主机不需要任何仓库凭据。
- 前端由 Cloudflare Workers Builds 构建：生产分支 `master`，构建命令 `cd frontend && npm ci && npm run build`，部署 `cd frontend && npx wrangler deploy`。这是前端唯一发布入口。
- 两条流水线互不等待。接口变更先发布向后兼容的 API，再切换前端，最后移除旧字段。

## 配置与密钥

| 位置 | 内容 |
| --- | --- |
| GitHub Secrets | `SSH_HOST`、`SSH_USER`、`SSH_KEY`、`SSH_KNOWN_HOSTS`、`ENV_FILE`、`ENV_PROD` |
| 主机 `/opt/jh-emp/.env` | 数据库名与账号、隧道 token |
| 主机 `/opt/jh-emp/.env.prod` | `prod` profile、管理员初始账号、发信密钥、敏感字段密钥 `PII_KEYS`；只读挂载进容器，由 `SPRING_CONFIG_IMPORT` 导入 |

生产的配置真相源是 Secrets 里的 `ENV_FILE` 与 `ENV_PROD`，主机上的文件是它们的副本，每次发布覆盖写入，不做手工修改。写入由部署账号完成，不需要提权：镜像内的应用用户固定 uid 1000，与部署账号一致，因此挂进容器的 `.env.prod` 保持 600 也可读。数据库账号与密码只出现在 `.env`，`.env.prod` 不重复保存。写入失败即中止发布，线上不受影响。

## 发布、回滚与备份

发布由 [deploy.sh](../deploy/deploy.sh) 完成，依次是加锁、备份、拉取镜像、切换后端容器、健康门禁；失败时用发布前记录的标签重建容器，成功时清理旧镜像与过期备份。任一步失败即中止，线上容器保持运行。

- 锁被占用时脚本打印占用进程与解除命令。单个来源的拉取上限 300 秒（`PULL_TIMEOUT` 可覆盖），避免网络卡死长期占锁。
- 镜像按 `GHCR_MIRRORS` 的顺序转取（默认 `ghcr.nju.edu.cn` → `ghcr.1ms.run` → `ghcr.io`），成功后改回官方名字：GHCR 从境内拉大文件会被限速到近乎停滞。某个来源失败自动换下一个，全部失败才中止发布。
- 镜像标签由流水线传入，`.env` 只有一个写入者。

**回滚**：自动回滚只在单次发布内生效，脚本在改动前记录当时 `.current` 的标签。手动回滚用本地保留的上一个标签：`IMAGE_TAG=sha-xxxxxxx docker compose up -d --no-deps backend`，或重跑流水线指定旧标签。只回滚镜像；若该次发布同时改过 `compose.yaml`，需要一并取回上一版配置。

**迁移**：Flyway 随启动执行，回滚镜像不会回滚数据库结构。迁移遵循先扩展、后收缩，同一版本内不删除已被使用的列。

**备份**：数据库与附件成对恢复，保留 7 天，试点前演练一次配对恢复。发布与重启都不清理备份目录。

## 首次上线

1. 主机安装 Docker，创建 `/opt/jh-emp` 与 `/var/lib/jh-emp/{mysql,uploads,logs}`；前者与 uploads、logs 归部署账号，mysql 归容器内的 uid 999
2. Cloudflare 创建隧道，公开主机名指向 `http://backend:8080`，token 记入 `ENV_FILE`
3. 配置 GitHub Secrets：SSH 四项与 `ENV_FILE`、`ENV_PROD`
4. 用 `workflow_dispatch` 触发首次发布，确认镜像、部署与健康检查
5. 手工验证一次回滚，确认本地保留的上一个标签能重建容器
6. 连接 Cloudflare Workers Builds，推送一次验证前端与 `/api` 转发

## 验收

- 只改 `docs/` 的提交不触发任何构建
- 发布后镜像标签等于提交 SHA，`/api/health` 为 `UP`
- 主机除 SSH 外无开放端口
- 发布后已登录用户不掉线
- 健康检查失败时自动回到上一标签
- 仓库或镜像源不可达时发布失败，线上容器继续服务
- 前端 `/api/events` 能实时收到信号，不退化为轮询
- 带伪造 `X-Forwarded-For` 与 `CF-Connecting-IP` 的请求，日志记录的仍是真实地址

## 已知风险

| 风险 | 处理 |
| --- | --- |
| GHCR 在境内拉取大文件受阻 | 按 `ghcr.nju.edu.cn` → `ghcr.1ms.run` → `ghcr.io` 顺序转取；全部不可用时发布失败、线上继续服务 |
| 隧道增加一跳延迟 | 用真实网络测首屏与事件流，不可接受则改为主机反向代理与自有证书 |
| 登录接口无频率限制 | 在 Cloudflare 为 `/api/session/login` 配置限流规则 |
| 客户端地址依赖受信头 | 统一取 `CF-Connecting-IP`（`emp.http.client-ip-header` 可改），不读 `X-Forwarded-For`；前提是源站不开放入站端口 |
| 有写权限的人可从分支运行改过的 workflow | 分支保护禁止绕过，CODEOWNERS 管 `.github/workflows/` 与 `deploy/`，需要全自动时不再叠加环境审批 |
| `PII_KEYS` 丢失 | 身份证、银行卡等字段无法解密，且不可重新生成；与数据库备份分开保管，轮换时保留旧版本密钥 |
| 迁移不可回滚 | 备份先行，迁移遵循扩展与收缩 |
| 磁盘增长 | 发布时清理旧镜像，备份保留 7 天，日志总量设上限 |
| 生产关闭控制台日志 | 排查看 `EMP_LOG_DIR` 下的文件；`docker logs` 只剩启动阶段与 JVM 输出 |

## 索引

- 运行时配置：[application.yml](../backend/src/main/resources/application.yml)、[application-prod.yml](../backend/src/main/resources/application-prod.yml)
- 本地启动与验证：[README](../README.md)
- 模块边界与业务流程：[mvp-design.md](mvp-design.md)
