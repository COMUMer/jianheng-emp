# jianheng-emp

企业内部管理平台。[首版实现方案](docs/mvp-design.md) · [部署与交付](docs/deploy.md) · [前端品牌与登录](docs/frontend.md) · [人员档案](docs/people.md)

## 本地启动

需要 JDK 25、Node.js 24 和 MySQL 8.4。使用 [Maven Wrapper](backend/.mvn/wrapper/maven-wrapper.properties) 构建后端。

在本机 MySQL 创建开发库及应用账号，使用 `utf8mb4`，给该账号授予这个数据库的读写及迁移权限。填写仓库根目录的 `.env.dev`：`DB_URL`、`DB_USER`、`DB_PASSWORD` 指向本地开发库，`SERVER_ADDRESS` 控制本地监听地址，`OPENAPI_ENABLED` 控制 OpenAPI，`EMP_UPLOAD_DIR` 指定附件目录（例如 `C:/data/jh-emp/dev/uploads`，也可用仓库内已忽略的 `backend/uploads`，不存在时会自动创建），`EMP_LOG_DIR` 指定日志目录。配置按 Java Properties 语法填写，值直接写在等号后，字面反斜杠写成 `\\`。

在能运行 `java -version` 的 PowerShell 窗口中，从仓库根目录启动后端。

```powershell
Set-Location backend
$env:SPRING_CONFIG_IMPORT = 'file:../.env.dev[.properties]'
.\mvnw.cmd spring-boot:run
```

在第二个 PowerShell 窗口从仓库根目录启动前端。

```powershell
Set-Location frontend
npm.cmd ci
npm.cmd run dev -- --host 127.0.0.1 --port 5175 --strictPort
```

## 日志

后端日志统一写入 `${EMP_LOG_DIR}/backend.log`，单文件 JSON Lines（ECS），默认最多保留 90 天、单文件 100MB、总量 10GB。`EMP_LOG_DIR` 未设置时使用 `./data/logs`；生产可将 `EMP_LOG_DIR` 指向持久卷，例如 `/var/log/jh-emp`。启动日志会打印解析后的路径，HTTP 请求、登录、401/403、异常和慢请求都写入同一文件，按 `request.id` 和 `trace.id` 关联。

打开 Vite 终端输出的本地地址。开发账号由 [Flyway 开发迁移](backend/src/main/resources/db/dev/V3__seed_development_accounts.sql) 创建，账号与初始密码相同。生产在账号表为空时用 `EMP_ADMIN_USER` 和 `EMP_ADMIN_PASSWORD` 初始化管理员，密码至少 10 个字符。启动参数见 [`application.yml`](backend/src/main/resources/application.yml)，本地 API 代理见 [`vite.config.ts`](frontend/vite.config.ts)。

首次配置依次在「人员管理」创建部门、岗位和员工，在员工档案中开通账号并授权，再为部门设置负责人。在「系统设置 → 审批规则」发布请假、出差、采购及报销模板。报销模板需要必经的财务审核节点，付款登记需要单独授权。

## 邮件验证码（Resend）

验证码邮件通过 Resend HTTP API 发送，无需安装 SDK。未配置 `RESEND_API_KEY` 时，`dev` 把验证码打印到后端日志，生产环境会提示“邮件服务未配置”。

1. 在 [Resend](https://resend.com) 控制台添加发信域名，按提示到 DNS 服务商添加 DKIM、SPF、MX 记录，等待域名状态变为 Verified。推荐使用子域（如 `mail.comum.cn`），避免与根域现有邮箱的 MX/SPF 记录冲突。
2. 在 API Keys 创建仅有 Sending access 权限的密钥。
3. 在 `.env.dev`（生产为 `.env.prod`）填写 `RESEND_API_KEY=re_...`。
4. 重启后端，在「系统设置 → 邮件设置」填写发件人。发件人必须使用已验证域名；仅联调时可临时使用 `onboarding@resend.dev`，此时只能发到 Resend 账号自己的邮箱。
5. 发送验证码后，可在 Resend 控制台 Emails 查看投递结果；后端日志会记录 Resend 的非 2xx 响应。
6. 密钥只放环境变量，不提交仓库。读取逻辑见 [MailConfiguration.java](backend/src/main/java/com/jianheng/emp/security/MailConfiguration.java) 与 [ResendMailer.java](backend/src/main/java/com/jianheng/emp/security/ResendMailer.java)。

管理员可在「邮件设置」编辑验证码邮件、插入图片并预览。相关入口见 [邮件设置与预览](docs/frontend.md#前端品牌与登录)。

可先用 API 直接验证密钥和发件域名：

```powershell
$headers = @{ Authorization = "Bearer $env:RESEND_API_KEY" }
$body = @{ from = 'JH-EMP <no-reply@mail.example.com>'; to = @('you@example.com'); subject = 'Resend 联调'; text = 'ok' } | ConvertTo-Json
Invoke-RestMethod -Method Post 'https://api.resend.com/emails' -Headers $headers -ContentType 'application/json' -Body $body
```

## 敏感字段密钥（身份证、银行卡、手机号）

身份证、银行卡、手机号和紧急联系电话在库里存密文。密钥由 `PII_KEYS` 提供，格式 `v1:<32 字节 base64>`，多个版本用逗号分隔用于轮换（密文前缀记录版本）。

生成后写入 `.env.dev`（生产为 `.env.prod`）：

```powershell
$key = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($key)
'PII_KEYS=v1:' + [Convert]::ToBase64String($key)
```

Linux 或 macOS 用 `echo "PII_KEYS=v1:$(openssl rand -base64 32)"`。等号后面的值必须是 `v1:` 加 44 个 base64 字符（共 47 个字符，即 32 字节），否则启动会报 `PII_KEYS 每个密钥必须是 32 字节`。

- 密钥只放环境变量，不提交仓库；**丢失后这些字段无法解密**，需与数据库备份分开保存。
- 启动时 [EmployeePiiBackfill.java](backend/src/main/java/com/jianheng/emp/people/EmployeePiiBackfill.java) 把历史明文就地加密；加解密与盲索引见 [PiiCipher.java](backend/src/main/java/com/jianheng/emp/security/pii/PiiCipher.java)。
- 身份证需要等值查重，额外存一列 HMAC 盲索引 `employee.id_card_bidx` 并加唯一约束。

## 验证

- 后端沿用本地启动所用的环境变量，在 `backend` 执行 `.\mvnw.cmd '-Dtest=HealthEndpointTest,WorkflowRulesTest' test`。健康检查测试连接本地开发数据库。
- 在 `frontend` 执行 `npm.cmd test` 和 `npm.cmd run build`。
- 后端接口变更后，启动 `dev` 后端，再在 `frontend` 运行 `npm.cmd run api:generate` 更新 TypeScript 契约。
