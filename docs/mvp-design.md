# 企业内部管理平台首版实现方案

## 目标与范围

面向本公司员工，采用统一 Web 门户和模块化单体。员工在手机浏览器发起申请、处理待办并查看进度。人事和财务在 PC 上维护员工档案和报销台账。

| 模块 | 优先级 | 第一阶段交付 |
| --- | --- | --- |
| 人员管理（HRM） | P0 | 维护部门、岗位、负责人和员工档案。支持入职建档和开通账号、调岗、离职登记和停用账号。保留人事变动历史。 |
| OA 审批 | P0 | 员工提交请假、出差和采购申请。主管在统一待办处理，申请人查看进度、退回原因和处理历史。首版请假登记使用起止时间与请假类型。 |
| 费用管理（FMS） | P0 | 员工填写人民币报销明细并上传原始票据，主管和财务依规则审核。财务完成线下全额付款后登记，按部门、日期和状态导出 Excel 台账。 |

资产管理、合同管理、经营看板暂缓。采购流程以审批结果为交付边界。考勤、假期额度、采购执行、银行付款对接、会计凭证和发票验真暂缓。

## 技术栈

| 层次 | 技术 | 用途 |
| --- | --- | --- |
| 前端 | React、TypeScript、Vite、Ant Design | 员工与管理人员使用同一个 Web 应用。 [Ant Design 组件](https://ant.design/components/overview/?locale=en-US) |
| 后端 | Java 25 LTS、Spring Boot 4.1.x（Web）、Jakarta Bean Validation、Maven Wrapper | 模块化单体、REST API、请求校验和构建。 [Java 支持路线图](https://www.oracle.com/java/technologies/java-se-support-roadmap.html) · [Spring Boot Web](https://docs.spring.io/spring-boot/reference/web/servlet.html) |
| 登录与权限 | Spring Security、Spring Session JDBC | 基于角色授权，会话存 MySQL。 [Spring Session JDBC](https://docs.spring.io/spring-session/reference/configuration/jdbc.html) |
| 数据与迁移 | MySQL 8.4（InnoDB）、MySQL Connector/J、MyBatis-Plus（`mybatis-plus-spring-boot4-starter`）、Flyway | 三个 P0 模块统一使用 MyBatis-Plus 访问数据，数据库结构由 Flyway 的 MySQL 迁移管理。 [MyBatis-Plus 安装](https://baomidou.com/getting-started/install/) · [Spring Boot 数据库初始化](https://docs.spring.io/spring-boot/how-to/data-initialization.html) |
| API 契约 | springdoc-openapi 3.2.x、openapi-typescript | 从后端 API 生成 OpenAPI 描述，再生成前端请求和响应类型。 [Spring Boot 兼容矩阵](https://springdoc.org/#what-is-the-compatibility-matrix-of-springdoc-openapi-with-spring-boot) |
| 文件与导出 | 私有文件存储、Apache POI | 保存原始票据，导出 `.xlsx` 台账。 [Apache POI](https://poi.apache.org/components/spreadsheet/) |
| 测试 | JUnit、Spring Boot Test、Testcontainers | 验证业务规则和真实 MySQL 上的事务行为。 |
| 生产部署 | Cloudflare Workers Builds、Workers Static Assets、GitHub Actions、GHCR、Docker Compose、Nginx | 发布流程见[持续集成与发布](#持续集成与发布)。 |

## 数据访问与约束

- 员工档案、部门、岗位和费用类别的基础单表操作使用 `BaseMapper`，简单筛选使用 `LambdaQueryWrapper`。业务写入通过所属模块的服务入口。 [MyBatis-Plus 数据接口](https://baomidou.com/guides/data-interface/)
- 审批待办、报销台账及导出使用 Mapper XML 编写关联查询，列表与导出复用筛选条件和数据权限范围。审批状态变更、票号占用和付款登记使用明确的 Mapper 方法和 SQL，事务边界设在业务服务层。 [MyBatis 动态 SQL](https://mybatis.org/mybatis-3/dynamic-sql.html) · [MyBatis Spring 事务](https://mybatis.org/spring/transactions.html)

报销金额在 Java 用 `BigDecimal`，在 MySQL 用 `DECIMAL`。审批并发处理见[通用审批流程](#通用审批流程)，票号与付款唯一性见[报销流程](#报销流程)。 [MySQL 定点数](https://dev.mysql.com/doc/refman/8.4/en/fixed-point-types.html) · [MySQL 唯一索引](https://dev.mysql.com/doc/refman/8.4/en/create-index.html)

## 部署与文件存储

- 每套环境由一个后端进程承载业务模块和公共能力。该环境的业务数据、登录会话和审批待办共用其 MySQL 实例。首版不部署 Redis、消息队列或独立工作流服务。
- 浏览器通过同域入口访问页面和 API，使用会话 Cookie，写请求执行 CSRF 校验。账号停用或角色变更时撤销该账号的已有会话。 [Spring Security CSRF](https://docs.spring.io/spring-security/reference/servlet/exploits/csrf.html) · [Spring Session 按用户查询会话](https://docs.spring.io/spring-session/reference/api.html)
- 后端将原始附件写入当前环境的私有存储，在数据库保存业务归属、原文件名、存储键和文件哈希。附件目录由 `EMP_UPLOAD_DIR` 指定，读法与默认值见 [`AttachmentService`](../backend/src/main/java/com/jianheng/emp/approval/AttachmentService.java)，变量填写见 [README](../README.md#本地启动)。下载经业务对象授权后由后端提供。生产在统一备份窗口内暂停业务写入，一起备份数据库和附件，并在试点前演练配对恢复。

### 环境划分

| 环境 | 运行方式 | 数据与访问 |
| --- | --- | --- |
| 本地开发与测试 `dev` | 开发联调和发布前验收在本地完成。启动方式见 [README](../README.md#本地启动)。 | 使用独立开发账号和附件目录。测试使用模拟或脱敏数据。 |
| 生产 `prod` | Cloudflare 提供前端和 API 入口。独立 Linux 主机或虚拟机通过 Docker Compose 运行 Nginx、后端和 MySQL 8.4。 | 使用正式域名和 HTTPS，MySQL 仅在内部网络可达。生产数据库、账号、密钥、附件卷和备份独立管理。 |

- 本地使用 `.env.dev`，加载方式见 [README](../README.md#本地启动)。生产使用 `.env.prod`，可将配置文件挂载到后端容器的 `/run/config/.env.prod`，并设置 `SPRING_CONFIG_IMPORT=file:/run/config/.env.prod[.properties]`。本地配置与产物的忽略规则见 [`.gitignore`](../.gitignore)。 [Spring Boot 外部配置](https://docs.spring.io/spring-boot/reference/features/external-config.html) · [Compose 生产部署](https://docs.docker.com/compose/how-tos/production/)
- 本地验证方式见 [README](../README.md#验证)。CI 的 MySQL 集成测试计划使用临时容器。 [Testcontainers 运行环境](https://java.testcontainers.org/supported_docker_environment/)

### 持续集成与发布

**分支。** `master` 是唯一长期分支。开发、联调和验收使用本地 `dev` profile。验收通过后推送 `origin/master`，触发两条生产流水线。

**访问链路。** 应用域名绑定 Cloudflare Worker。静态资源由 Workers Static Assets 提供，前端路由使用 SPA 回退，`/api` 和 `/api/*` 优先交给 Worker 转发到生产源站，再由 Nginx 转给 Spring Boot。前端始终请求相对路径 `/api`。转发保留请求方法、请求体、Cookie、CSRF 请求头及响应 `Set-Cookie`，API 响应走源站且不进入静态缓存。会话 Cookie 限定在应用域名，不设置源站 `Domain`。生产源站应仅接受受信代理的请求。 [Workers 静态资源路由](https://developers.cloudflare.com/workers/wrangler/configuration/#assets)

| 环节 | 触发 | 执行内容 |
| --- | --- | --- |
| CI | 推送 `master` | GitHub Actions 执行前端类型检查、测试和构建。后端用 Maven Wrapper 构建并执行相关测试，数据库集成测试使用临时 MySQL。 |
| 后端生产发布 | 推送 `master` | GitHub Actions 检查待发布提交，构建后端镜像并推送 GHCR，记录 Git SHA 与镜像摘要。生产机备份数据库和附件，拉取指定镜像并通过 Compose 更新后端，检查 Flyway 迁移与应用健康。 |
| 前端生产发布 | 推送 `master` | Cloudflare Workers Builds 连接 GitHub 仓库，将生产分支设为 `master`，关闭预览构建。以 `frontend/` 作为构建根目录，运行 `npm run build` 和 `npx wrangler deploy`。Wrangler 配置将 `dist/` 作为静态资源目录，并设置 Worker API 路由。 |
| 发布验证 | 前后端发布完成后 | 经正式域名检查首页和同域 API，验证会话登录、审批及附件访问。用 Git SHA 对照 Cloudflare 部署版本与后端镜像摘要。需要回退时按记录恢复前端或后端版本，涉及数据库变更时先确认迁移兼容性。 |

后端发布可由 Runner 经 SSH 调用生产机部署脚本，前提是 Runner 能访问部署入口。连接凭据放在 GitHub Secrets。推送镜像使用 `GITHUB_TOKEN` 的 `packages: write` 权限。若 GHCR 镜像为私有，生产机使用有包访问权且带 `read:packages` 权限的凭据拉取镜像。后端生产更新串行执行。 [GitHub Actions 触发事件](https://docs.github.com/en/actions/reference/workflows/events-that-trigger-workflows#push) · [Cloudflare 构建分支](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/) · [Cloudflare 构建配置](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) · [GHCR 权限](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)

Cloudflare 和 GitHub Actions 独立执行，前后端都可能先上线，一侧失败时另一侧也可能成功。涉及接口变化时，先发布向后兼容的 API，再发布依赖新 API 的前端，最后移除旧字段或接口。需要让前端等待后端通过健康检查时，统一用 GitHub Actions 调用 Wrangler，并关闭 Cloudflare 的自动生产构建以保持一个发布入口。 [Cloudflare 外部 CI/CD](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)

## 模块边界和数据归属

| 数据 | 唯一写入模块 | 主要规则 |
| --- | --- | --- |
| 账号、角色、会话 | 账号权限 | 员工可先建档再开通账号。一个员工最多绑定一个账号。停用账号后，已有会话失去业务访问权限。 |
| 部门、岗位、部门负责人、员工 | 组织人员 | 建档按姓名生成唯一 mis，取无声调、无空格的小写全拼；同拼音按建档顺序依次追加 2、3…。mis 建档后固定，同时是登录账号。首版每人一个主部门、一个岗位。离职保留档案，并在同一业务操作中停用账号。 |
| 请假、出差、采购单 | OA 申请 | 员工维护草稿，提交后冻结当轮表单。批准后可按权限查询生效记录。 |
| 审批模板、审批实例、任务和处理记录 | 公共审批 | 各业务模块按申请类型调用同一审批入口。统一待办从当前可处理的任务查询。 |
| 报销单、明细、票据占用、付款记录 | 费用管理 | 费用模块维护票号占用和付款登记。台账从报销与付款记录查询。 |

组织人员模块提供部门树、岗位和负责人，业务单据在提交时保存申请人的部门快照。账号权限模块决定能做什么，业务模块决定能操作哪条记录。单据列表、详情、附件和导出共享各业务模块的数据范围规则，并各自校验操作权限。业务写入统一走所属模块的服务入口。

## 公共能力

| 能力 | 首版实现 |
| --- | --- |
| 账号与权限 | 员工查看自己的申请和本人档案，审批人处理分派给自己的任务。员工档案维护、财务审核和付款登记分别授权。 |
| 审批配置 | 表单字段由各模块定义。审批模板支持串行节点、部门负责人或指定人员、按金额追加审批、替代审批人和发布版本。请假、出差、采购和报销共用审批实例、待办与历史。 |
| 站内通知 | 任务激活、退回、通过、转派和付款登记产生站内消息。任务激活时按模板配置计算截止日期。工作台按未处理任务的截止日期显示超期提醒。 |
| 附件 | 报销和采购复用原件上传及授权下载。原件跟随业务对象的归属和权限。上传界面见 [AttachmentUpload](../frontend/src/documents/AttachmentUpload.tsx)。 |
| 操作审计 | 记录账号停用、角色修改、审批转派、付款登记和台账导出，保留操作者、时间、对象和必要的变更信息。主数据与单据在表上保存创建时间、编辑时间与操作人（`updated_by` 指向账号），列表直接展示，列定义见各业务模块迁移与列表组件。 |
| 导出 | 报销台账按当前权限和页面筛选条件导出。 |

## 通用审批流程

**草稿 → 审批中 → 通过。** 首版支持退回重提和审批转派。提交时冻结当轮表单并按已发布模板解析到具体审批人。节点仅按顺序激活，通过后进入下一节点。模板更新从下一次提交生效。禁自审，分派到申请人时使用替代审批人，缺少合格审批人时提示具体节点。获授权的人员可把未完成任务转派给符合节点权限的在职人员，记录原审批人、新审批人和原因。退回关闭当轮剩余任务，重提开启新一轮，保留历史内容和审批记录。

业务模块在同一事务内保存表单、审批任务、通知和业务状态变更。并发处理时按单据主键执行锁定读，再复核任务和单据状态。 [Spring 事务](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/annotations.html) · [MySQL InnoDB 锁定读](https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html)

## 报销流程

1. **提交。** 服务端校验明细和票据并汇总金额。保存当轮明细、票据引用和部门快照，进入[通用审批流程](#通用审批流程)。默认部门负责人审批后由财务审核，达到门槛时追加指定负责人审批。
2. **核对票据。** 有票号时，提交事务按规范化票据标识建立占用记录，由数据库唯一索引防止并发重复占用。票号可在草稿和退回阶段修改，进入审批后不可修改。退回释放当轮占用，待付款和已付款单据继续占用，历史票据引用保留。文件哈希辅助识别相同文件，无票号的凭证由财务人工核对。
3. **登记付款。** 审批通过后进入待付款。财务实际付款后录入日期、付款凭证或流水号。付款记录按报销单 ID 做唯一约束，登记全额付款和更新单据状态在同一事务完成。台账包含单号、申请人、提交时部门、金额、状态和付款信息。

## 第一阶段实施与验收

| 顺序 | 交付内容 | 验收场景 |
| --- | --- | --- |
| 1. 人员管理 | 门户登录、部门岗位、员工档案、账号和权限 | 人事在[员工档案](/frontend/src/people/PeopleWorkspace.tsx)更新资料和调岗，管理员开通账号。登记离职后旧会话失去访问权限。 |
| 2. OA 审批 | 审批配置、统一待办、请假、出差和采购 | 三类申请能从草稿走到审批通过。退回重提保留历史，并发请求只能处理同一任务一次。 |
| 3. 费用管理 | 报销、票据、审批、付款登记和台账导出 | 金额门槛的两条审批路径都能走通。并发提交只能占用一次票号，同一张单只能记录一次付款。未授权员工无法读取单据或附件。备份恢复后可核对台账并下载原件。 |

每个模块先编写针对业务规则的测试，再实现功能。审批并发、票号占用和付款唯一性测试使用真实 MySQL，附件测试使用真实存储目录。试点由员工、主管、人事和财务使用公司的表单、制度与脱敏附件验证。

## 试点确认项

- 用公司现有组织表、员工表和报销表确认首批字段及费用类别。
- 用实际审批制度确认负责人、替代审批人、财务审核人，以及是否启用金额门槛。
- 确认财务付款登记所需字段、台账列和原始票据格式。
- 用现有请假、出差、采购表确认必填字段和审批人。
