# jianheng-emp

企业内部管理平台。[首版实现方案](docs/mvp-design.md) · [前端品牌与登录](docs/frontend.md) · [人员档案](docs/people.md)

## 本地启动

需要 JDK 25、Node.js 24 和 MySQL 8.4。使用 [Maven Wrapper](backend/.mvn/wrapper/maven-wrapper.properties) 构建后端。

在本机 MySQL 创建开发库及应用账号，使用 `utf8mb4`，给该账号授予这个数据库的读写及迁移权限。填写仓库根目录的 `.env.dev`：`DB_URL`、`DB_USER`、`DB_PASSWORD` 指向本地开发库，`SERVER_ADDRESS` 控制本地监听地址，`OPENAPI_ENABLED` 控制 OpenAPI，`EMP_UPLOAD_DIR` 指定附件目录（例如 `C:/data/jh-emp/dev/uploads`，也可用仓库内已忽略的 `backend/uploads`，不存在时会自动创建）。配置按 Java Properties 语法填写，值直接写在等号后，字面反斜杠写成 `\\`。

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

打开 Vite 终端输出的本地地址。开发账号由 [Flyway 开发迁移](backend/src/main/resources/db/dev/V3__seed_development_accounts.sql) 创建，账号与初始密码相同。生产在账号表为空时用 `EMP_ADMIN_USER` 和 `EMP_ADMIN_PASSWORD` 初始化管理员，密码至少 10 个字符。启动参数见 [`application.yml`](backend/src/main/resources/application.yml)，本地 API 代理见 [`vite.config.ts`](frontend/vite.config.ts)。

首次配置依次在「人员管理」创建部门、岗位和员工，在员工档案中开通账号并授权，再为部门设置负责人。在「系统设置 → 审批规则」发布请假、出差、采购及报销模板。报销模板需要必经的财务审核节点，付款登记需要单独授权。

## 验证

- 后端沿用本地启动所用的环境变量，在 `backend` 执行 `.\mvnw.cmd '-Dtest=HealthEndpointTest,WorkflowRulesTest' test`。健康检查测试连接本地开发数据库。
- 在 `frontend` 执行 `npm.cmd test` 和 `npm.cmd run build`。
- 后端接口变更后，启动 `dev` 后端，再在 `frontend` 运行 `npm.cmd run api:generate` 更新 TypeScript 契约。
