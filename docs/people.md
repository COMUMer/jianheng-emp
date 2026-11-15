# 人员档案

- 字段、必填与格式校验：`backend/src/main/java/com/jianheng/emp/people/EmployeeProfile.java`、`PeopleService.java`。
- 表结构与迁移：`backend/src/main/resources/db/migration/V5__add_employee_personal_fields.sql`。
- 前端入口见 [PeopleWorkspace.tsx](../frontend/src/people/PeopleWorkspace.tsx)，档案卡片见 [EmployeeProfile.tsx](../frontend/src/people/EmployeeProfile.tsx)，共用字段见 [EmployeeFields.tsx](../frontend/src/people/EmployeeFields.tsx)。
- 档案卡片禁止使用单侧装饰线。
- 只读脱敏与显示：`frontend/src/people/SensitiveValue.tsx`、`frontend/src/people/mask.ts`。
- 变更留痕：`created_at`/`updated_at`/`updated_by` 由 `backend/src/main/resources/db/migration/V7__add_audit_columns.sql` 建立，写入见 `PeopleService.java`；列表展示创建时间、编辑时间与操作人。
- 头像等自助修改不改变档案的编辑时间与操作人，只有人事/管理员的档案维护才计入留痕（EmployeeAvatarService.java）。
- 访问规则：`backend/src/main/java/com/jianheng/emp/people/PeopleController.java`。
- MIS 生成与唯一性：`backend/src/main/java/com/jianheng/emp/people/Mis.java`、`PeopleService.java`；员工登录账号：`backend/src/main/java/com/jianheng/emp/security/AccountService.java`。
- 我的档案（本人只读）见 [MyProfile.tsx](../frontend/src/people/MyProfile.tsx)；人员管理入口位于「人事管理 HRM」分组下，仅 ADMIN/HR 可见（[navigation.tsx](../frontend/src/navigation.tsx)），接口权限见 [PeopleController.java](../backend/src/main/java/com/jianheng/emp/people/PeopleController.java)。
- 头像：默认姓名头像与裁剪逻辑见 [avatar.tsx](../frontend/src/people/avatar.tsx)，裁剪弹窗见 [AvatarCropModal.tsx](../frontend/src/people/AvatarCropModal.tsx)，服务端归一化与存储见 [EmployeeAvatarService.java](../backend/src/main/java/com/jianheng/emp/people/EmployeeAvatarService.java)（`EMP_UPLOAD_DIR/avatars`）。
