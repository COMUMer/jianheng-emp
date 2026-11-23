# 企业内部管理平台首版实现方案

## 目标与范围

面向本公司员工，采用统一 Web 门户和模块化单体。员工在手机浏览器发起申请、处理待办并查看进度。人事和财务在 PC 上维护员工档案和报销台账。

| 模块 | 优先级 | 第一阶段交付 |
| --- | --- | --- |
| 人员管理（HRM） | P0 | 维护部门、岗位、负责人和员工档案。支持入职建档和开通账号、调岗、离职登记和停用账号。保留人事变动历史。 |
| OA 审批 | P0 | 员工提交请假、出差和采购申请。主管在统一待办处理，申请人查看进度、退回原因和处理历史。首版请假登记使用起止时间与请假类型。 |
| 费用管理（FMS） | P0 | 员工填写人民币报销明细并上传发票、付款记录和其他材料，主管和财务依规则审核。财务完成线下全额付款后登记，按部门、日期和状态导出 Excel 台账。 |

资产管理、合同管理、经营看板暂缓。采购审批通过后与报销一样进入付款登记。考勤、假期额度、采购执行、银行付款对接、会计凭证和发票验真暂缓。

## 技术栈

| 层次 | 技术 | 用途 |
| --- | --- | --- |
| 前端 | React、React Router、TypeScript、Vite、Ant Design | 员工与管理人员使用同一个 Web 应用。 [Ant Design 组件](https://ant.design/components/overview/?locale=en-US) |
| 后端 | Java 25 LTS、Spring Boot 4.1.x（Web）、Jakarta Bean Validation、Maven Wrapper | 模块化单体、REST API、请求校验和构建。 [Java 支持路线图](https://www.oracle.com/java/technologies/java-se-support-roadmap.html) · [Spring Boot Web](https://docs.spring.io/spring-boot/reference/web/servlet.html) |
| 登录与权限 | Spring Security、Spring Session JDBC | 基于角色授权，会话存 MySQL。 [Spring Session JDBC](https://docs.spring.io/spring-session/reference/configuration/jdbc.html) |
| 数据与迁移 | MySQL 8.4（InnoDB）、MySQL Connector/J、MyBatis-Plus（`mybatis-plus-spring-boot4-starter`）、Flyway | 三个 P0 模块统一使用 MyBatis-Plus 访问数据，数据库结构由 Flyway 的 MySQL 迁移管理。 [MyBatis-Plus 安装](https://baomidou.com/getting-started/install/) · [Spring Boot 数据库初始化](https://docs.spring.io/spring-boot/how-to/data-initialization.html) |
| API 契约 | springdoc-openapi 3.2.x、openapi-typescript | 从后端 API 生成 OpenAPI 描述，再生成前端请求和响应类型。 [Spring Boot 兼容矩阵](https://springdoc.org/#what-is-the-compatibility-matrix-of-springdoc-openapi-with-spring-boot) |
| 文件与导出 | 私有文件存储、Apache POI | 保存报销附件，导出 `.xlsx` 台账。 [Apache POI](https://poi.apache.org/components/spreadsheet/) |
| 测试 | JUnit、Spring Boot Test、Testcontainers | 验证业务规则和真实 MySQL 上的事务行为。 |
| 生产部署 | Cloudflare Workers（静态资源与 API 反代）、GitHub Actions、GHCR、Docker Compose、Cloudflare Tunnel | 形态与流程见[部署与交付](deploy.md)。 |

## 数据访问与约束

- 员工档案、部门、岗位和费用类别的基础单表操作使用 `BaseMapper`，简单筛选使用 `LambdaQueryWrapper`。业务写入通过所属模块的服务入口。 [MyBatis-Plus 数据接口](https://baomidou.com/guides/data-interface/)
- 待办、报销台账及导出使用 Mapper XML 编写关联查询，列表与导出复用筛选条件和数据权限范围。审批状态变更和付款登记使用明确的 Mapper 方法和 SQL，事务边界设在业务服务层。 [MyBatis 动态 SQL](https://mybatis.org/mybatis-3/dynamic-sql.html) · [MyBatis Spring 事务](https://mybatis.org/spring/transactions.html)

报销金额在 Java 用 `BigDecimal`，在 MySQL 用 `DECIMAL`。审批并发处理见[通用审批流程](#通用审批流程)，付款唯一性见[报销流程](#报销流程)。 [MySQL 定点数](https://dev.mysql.com/doc/refman/8.4/en/fixed-point-types.html) · [MySQL 唯一索引](https://dev.mysql.com/doc/refman/8.4/en/create-index.html)

## 部署与文件存储

- 每套环境由一个后端进程承载业务模块和公共能力。该环境的业务数据、登录会话和待办共用其 MySQL 实例。首版不部署 Redis、消息队列或独立工作流服务。
- 浏览器通过同域入口访问页面和 API，使用会话 Cookie，写请求执行 CSRF 校验。账号停用或角色变更时撤销该账号的已有会话。 [Spring Security CSRF](https://docs.spring.io/spring-security/reference/servlet/exploits/csrf.html) · [Spring Session 按用户查询会话](https://docs.spring.io/spring-session/reference/api.html)
- 后端将原始附件写入当前环境的私有存储，在数据库保存业务归属、原文件名、存储键和文件哈希。附件目录由 `EMP_UPLOAD_DIR` 指定，读法与默认值见 [`AttachmentService`](../backend/src/main/java/com/jianheng/emp/approval/AttachmentService.java)，变量填写见 [README](../README.md#本地启动)。后端运行日志统一写入 `EMP_LOG_DIR` 指定的文件，滚动、保留与总量策略见 [`application.yml`](../backend/src/main/resources/application.yml)。下载和在线预览经业务对象授权后由后端提供。生产在统一备份窗口内暂停业务写入，一起备份数据库和附件，并在试点前演练配对恢复。

### 环境划分

| 环境 | 运行方式 | 数据与访问 |
| --- | --- | --- |
| 本地开发与测试 `dev` | 开发联调和发布前验收在本地完成。启动方式见 [README](../README.md#本地启动)。 | 使用独立开发账号和附件目录。测试使用模拟或脱敏数据。 |
| 生产 `prod` | Cloudflare 提供前端与 API 入口，单台 Linux 主机通过 Docker Compose 运行后端、MySQL 8.4 与隧道。 | 使用正式域名和 HTTPS，数据库不对外暴露。生产数据库、账号、密钥、附件卷和备份独立管理，见[部署与交付](deploy.md)。 |

- 本地使用 `.env.dev`，加载方式见 [README](../README.md#本地启动)；生产的配置分工、密钥与发布方式见[部署与交付](deploy.md)。本地配置与产物的忽略规则见 [`.gitignore`](../.gitignore)。 [Spring Boot 外部配置](https://docs.spring.io/spring-boot/reference/features/external-config.html)
- 本地验证方式见 [README](../README.md#验证)。CI 的 MySQL 集成测试计划使用临时容器。 [Testcontainers 运行环境](https://java.testcontainers.org/supported_docker_environment/)

### 持续集成与发布

`master` 是唯一长期分支，推送触发后端流水线与 Cloudflare 构建。前后端独立发布，接口变更先发布向后兼容的 API，再切换前端，最后移除旧字段。流水线、发布与回滚见[部署与交付](deploy.md)。

## 模块边界和数据归属

| 数据 | 唯一写入模块 | 主要规则 |
| --- | --- | --- |
| 账号、角色、会话 | 账号权限 | 员工可先建档再开通账号。一个员工最多绑定一个账号。停用账号后，已有会话失去业务访问权限。密码用 BCrypt 加盐哈希保存；新开通员工账号的初始密码为身份证后 6 位，已有账号的密码不会因档案或账号编辑而改变。 |
| 部门、岗位、部门负责人、员工 | 组织人员 | 建档按姓名生成唯一 mis，取无声调、无空格的小写全拼；同拼音按建档顺序依次追加 2、3…。mis 建档后固定，同时是登录账号。员工身份（身份证、mis）唯一，每段任职单独记录部门、岗位与起止日期。离职保留档案与任职段，并在同一业务操作中停用账号；再次入职复用身份和 mis，新开一段任职，不重复建档。 |
| 请假、出差、采购单 | OA 申请 | 员工维护草稿，提交后冻结当轮表单。批准后可按权限查询生效记录；采购在批准后进入付款登记。 |
| 审批模板、审批实例、任务和处理记录 | 公共审批 | 各业务模块按申请类型调用同一审批入口。统一待办从当前可处理的任务查询。 |
| 报销单、明细、附件、付款记录 | 费用管理 | 费用模块维护附件分类和付款登记。台账从报销与付款记录查询。 |

组织人员模块提供部门树、岗位和负责人，业务单据在提交时保存申请人的部门快照。账号权限模块决定能做什么，业务模块决定能操作哪条记录。单据列表、详情、附件和导出共享各业务模块的数据范围规则，并各自校验操作权限。业务写入统一走所属模块的服务入口。

## 公共能力

| 能力 | 首版实现 |
| --- | --- |
| 账号与权限 | 员工查看自己的申请和本人档案，审批人处理分派给自己的任务。员工档案维护、财务审核和付款登记分别授权。 |
| 审批配置 | 表单字段由各模块定义。审批模板支持串行节点、部门负责人或指定人员、按金额追加审批、替代审批人和发布版本。请假、出差、采购和报销共用审批实例、待办与历史。 |
| 站内通知 | 任务激活、退回、通过、转派、付款登记与付款附件更正产生站内消息。任务激活时按模板配置计算截止日期。工作台按未处理任务的截止日期显示超期提醒。超期任务由系统自动驳回，操作人取启动时自动补齐的禁用账号「系统」（[AccountService.java](../backend/src/main/java/com/jianheng/emp/security/AccountService.java)、[WorkflowService.java](../backend/src/main/java/com/jianheng/emp/approval/WorkflowService.java)）。 |
| 附件 | 报销附件分为发票、付款记录和其他材料，上传时不预设类型，每个附件在列表中单独选择；提交前所有附件必须有类型，发票和付款记录必需；采购附件为其他材料，提交前至少一份。费用类别、部门和岗位用 `active` 停用，停用项不进入新选择，历史单据继续引用，仅未被使用的停用记录可删除。图片和 PDF 可按单据权限在线预览，其他格式下载查看。上传与分类见 [AttachmentUpload](../frontend/src/documents/AttachmentUpload.tsx)、[AttachmentService.java](../backend/src/main/java/com/jianheng/emp/approval/AttachmentService.java)；未分类与分类迁移见 [V12](../backend/src/main/resources/db/migration/V12__categorize_expense_attachments.sql) 和 [V13](../backend/src/main/resources/db/migration/V13__allow_uncategorized_files.sql)。预览见 [AttachmentPreview](../frontend/src/documents/AttachmentPreview.tsx)。 |
| 操作审计 | 记录账号停用、角色修改、审批转派、付款登记、付款附件更正和台账导出，保留操作者、时间、对象和必要的变更信息。主数据与单据在表上保存创建时间、编辑时间与操作人（`updated_by` 指向账号），列表直接展示，列定义见各业务模块迁移与列表组件。 |
| 导出 | 报销台账按当前权限和页面筛选条件导出。 |

## 通用审批流程

**草稿 → 审批中 → 通过。** 首版支持退回重提和审批转派。提交时冻结当轮表单并按已发布模板解析到具体审批人。节点仅按顺序激活，通过后进入下一节点。模板更新从下一次提交生效。流程节点、审批记录、付款记录和转派说明里的操作人显示名统一取员工姓名，未绑定档案时回退登录账号名（见 `WorkflowMapper.java` 的 `events`/`payment` 查询与 `WorkflowMapper.xml` 的 `Summary`）。禁自审。节点可配置替代审批人，与主审批人等价、任一处理即可；主审批人停用、未绑定员工、离职或为申请人时自动只派替代人，两者都不可用时提示具体节点。获授权的人员可把未完成任务转派给符合节点权限的在职人员，记录原审批人、新审批人和原因。退回关闭当轮剩余任务，重提开启新一轮，保留历史内容和审批记录。任务超过截止时间由`OverdueApprovalScheduler`每分钟扫描并自动驳回，审批记录操作人记为「系统」，并给主/替代审批人和申请人发站内消息。

业务模块在同一事务内保存表单、审批任务、通知和业务状态变更。并发处理时按单据主键执行锁定读，再复核任务和单据状态。 [Spring 事务](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/annotations.html) · [MySQL InnoDB 锁定读](https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html)

## 报销流程

1. **提交。** 服务端校验明细、发票和付款记录并汇总金额。保存当轮明细、附件引用和部门快照，进入[通用审批流程](#通用审批流程)。默认部门负责人审批后由财务审核，达到门槛时追加指定负责人审批。
2. **附件校验。** 提交时要求至少一份发票和一份付款记录，其他材料可选。附件分类随上传写入，文件哈希辅助识别相同文件。审批人、财务和管理员按单据权限预览或下载附件。
**单号规则。** 提交前创建单据时即分配业务单号：类型前缀（QJ/CC/CG/BX）+ 年月 + 当月四位顺序号，如 `BX2026110003`；顺序号由 `document_number` 计数表按「类型 + 年月」原子自增，单号在 `work_document.document_no` 上唯一。历史单据在迁移中按创建月份回填。列表、搜索、详情、导出统一使用该单号。

3. **登记付款。** 报销和采购单据审批通过后进入待付款；打开付款表单前先抢占（`work_document.payment_claim_*`，5 分钟过期或取消即释放），同一单据同时只允许一个付款人录入，其他付款人看到「正由 XX 登记付款」。财务实际付款后录入日期并上传付款凭证附件。付款记录按报销单 ID 做唯一约束，登记全额付款和更新单据状态在同一事务完成。已登记付款后，原付款人可更正付款日期与付款附件，付款人与单据状态不变；财务或管理员可要求付款人更正。被替换的附件按[附件治理](attachments.md)清理。待付款报销单同时进入具有付款角色账号的「待办」，办理入口在单据详情。台账包含单号、申请人、提交时部门、金额、状态和付款信息。

## 第一阶段实施与验收

| 顺序 | 交付内容 | 验收场景 |
| --- | --- | --- |
| 1. 人员管理 | 门户登录、部门岗位、员工档案、账号和权限 | 人事在[员工档案](/frontend/src/people/PeopleWorkspace.tsx)更新资料和调岗，管理员开通账号。登记离职后旧会话失去访问权限；重新入职复用身份档案并新开任职段。 |
| 2. OA 审批 | 审批配置、统一待办、请假、出差和采购 | 三类申请能从草稿走到审批通过。退回重提保留历史，并发请求只能处理同一任务一次。 |
| 3. 费用管理 | 报销、附件、审批、付款登记和台账导出 | 金额门槛的两条审批路径都能走通。发票和付款记录缺失时不能提交。财务可预览发票和付款记录；未授权员工无法读取单据或附件。同一张单只能记录一次付款。备份恢复后可核对台账并下载原件。 |

每个模块先编写针对业务规则的测试，再实现功能。审批并发和付款唯一性测试使用真实 MySQL，附件测试使用真实存储目录。试点由员工、主管、人事和财务使用公司的表单、制度与脱敏附件验证。

## 试点确认项

- 用公司现有组织表、员工表和报销表确认首批字段及费用类别。
- 用实际审批制度确认负责人、替代审批人、财务审核人，以及是否启用金额门槛。
- 确认财务付款登记所需字段、台账列，以及发票、付款记录的格式和附件预览范围。
- 用现有请假、出差、采购表确认必填字段和审批人。
