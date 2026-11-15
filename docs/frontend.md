# 前端品牌与登录

- 品牌符号与字标：`frontend/src/brand/Brand.tsx`、`frontend/src/brand/brand.css`。符号路径、字标排版与品牌色复用自见衡科技官网。
- 浏览器图标：`frontend/public/favicon.svg`，与官网一致。
- 登录页与会话加载页见 [LoginPage.tsx](../frontend/src/login/LoginPage.tsx)，页面缩放与版式见 [login.css](../frontend/src/login/login.css)。
- 登录页书法标语见 [以技术](../frontend/src/login/slogan-technology.png) 和 [见未来](../frontend/src/login/slogan-future.png)。
- 登录交互、错误文案与表单校验测试：`frontend/src/login/LoginPage.test.tsx`。
- 登录态切换入口：`frontend/src/App.tsx`。
- 全屏 mis 水印：[EmployeeWatermark.tsx](../frontend/src/watermark/EmployeeWatermark.tsx)，样式见 [watermark.css](../frontend/src/watermark/watermark.css)。水印为固定全屏层，覆盖页面和弹窗，不拦截交互。
- 水印身份取 `/api/session/me` 的 `mis`，未绑定员工的账号回退登录账号 `username`；字段来源见 [AccountService.java](../backend/src/main/java/com/jianheng/emp/security/AccountService.java)。
- 全局色板：`frontend/src/styles.css` 的 `:root` 设计令牌，Ant Design 主题对齐该色板（浅色选中底 `colorPrimaryBg`、`colorPrimaryBgHover` 显式指定，避免深色主色自动派生出的偏灰色阶）；主题与 dayjs 中文区域：`frontend/src/main.tsx`。
- 日期与时间输入统一使用 [dates.tsx](../frontend/src/dates.tsx)：对外是 `YYYY-MM-DD` / `YYYY-MM-DDTHH:mm` 字符串，内部封装 Ant Design `DatePicker`；跨字段的下限用 `notBefore`，无效日期用 `disabledDate`。
- 流程呈现统一使用 [process.tsx](../frontend/src/process.tsx)：`ProcessFeed` 是头像节点时间线，节点状态、状态标签、时间、审批人与意见由数据驱动；节点头像复用 [avatar.tsx](../frontend/src/people/avatar.tsx)，数据字段来自 `Summary`/`Event`/`Payment`/`AuditMapper.Entry` 的 `avatarKey`；人事变动按最新在上展示并标出最新/起点，申请详情的「进程」由 [ApprovalProcess.tsx](../frontend/src/documents/ApprovalProcess.tsx) 组装发起、审批和付款节点。
