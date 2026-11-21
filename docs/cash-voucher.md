# 资金凭证（公户收支台账）

面向财务的公户收支凭证台账：每笔收款、付款留存银行截图，按月导出给外账会计。不涉及会计科目、分录与报表。

## 边界

| 做 | 不做 |
| --- | --- |
| 公户收付款登记、凭证留存 | 会计科目、借贷分录、账簿 |
| 按月筛选、合计、导出 zip | 利润表、资产负债表 |
| 月结锁定 | 审批流、银行直连、发票验真 |
| 无单据收支的手工录入 | 多币种、多主体合并 |

有单据的付款（报销、采购）沿用现有付款登记，见[付款登记](../backend/src/main/java/com/jianheng/emp/approval/WorkflowService.java)的 `pay`。两类钱最终进同一张流水表，靠 `source` 区分。

## 角色

现有角色见 [Role.java](../backend/src/main/java/com/jianheng/emp/security/Role.java)。

| 操作 | `PAYER` 老板 | `FINANCE` 财务 | `ADMIN` 运维 |
| --- | --- | --- | --- |
| 无单据收支录入 | ✗ | ✓ | ✗ |
| 报销/采购付款登记 | ✓（现有） | ✗ | ✗ |
| 流水查看 | ✓ 只读 | ✓ | ✓ 只读 |
| 导出、月结 | ✗ | ✓ | ✗ |

`ADMIN` 不参与业务，只保留排障只读。

## 数据模型

迁移从 `V33` 起，字段规范同 [V10](../backend/src/main/resources/db/migration/V10__add_employment_periods.sql)。

| 表 | 职责 | 关键列 |
| --- | --- | --- |
| `cash_account` | 对公资金账户 | `name`、`bank`、`account_no`、`type`、`active` |
| `cash_category` | 用途分类 | `name`、`active` |
| `cash_voucher` | 收付款流水 | `account_id`、`direction`、`occurred_on`、`amount`、`counterparty`、`summary`、`category_id`、`source`、`document_id`、`entered_by`、`entered_at` |
| `cash_voucher_file` | 凭证关联 | `voucher_id`、`file_id` |

约束与决策：

- `direction` 取 `IN` / `OUT`，**不用 income/expense**——银行进账不等于会计收入。
- `occurred_on` 是银行流水日期，`entered_at` 是录入时间，两者分开。按月归档用 `occurred_on`。
- `source` 取 `MANUAL` / `DOCUMENT`。`DOCUMENT` 时 `document_id` 必填，`MANUAL` 时必空，应用层校验。
- `account_no` 存完整账号，接口输出只给后四位。
- `file_id` 在 `cash_voucher_file` 上唯一：一张图只能挂一笔。
- 每笔至少一张凭证，由服务入口校验，不散落在 Controller。
- 金额 `DECIMAL(14,2)`，正数，方向靠 `direction`。

## 附件

凭证复用 [`AttachmentService`](../backend/src/main/java/com/jianheng/emp/approval/AttachmentService.java) 与 `document_file`，分类用 `FileCategory.PAYMENT`，不新增枚举。上传、移除、孤儿清理见[附件治理](attachments.md)，本模块只需在 `cash_voucher_file` 上补齐第三处关联判断。

## 流程

**录入**：上传截图 → 填日期（默认今天）、金额、方向（默认支出）、备注 → 保存。保存后表单清空、焦点回上传区，支持连续录入与 Ctrl+V 粘贴。

**月结**：核对本月收入、支出、结余与银行 App 一致后锁定，锁定后不可改，修改需管理员解锁并留痕。

**导出**：按月生成 zip，含 `YYYYMM_流水.xlsx` 与 `凭证/日期_方向_对方_金额_凭证ID.jpg`。文件名带凭证 ID 防重名。某张图缺失时在 Excel 标记「凭证缺失」，不中断导出。

## 与现有模块的衔接

| 场景 | 归属 |
| --- | --- |
| 报销/采购付款 | 现有 `expense_payment`，不重复写流水 |
| 无单据收支 | 本模块 `MANUAL` |
| 将来打通 | 付款登记同一事务写 `cash_voucher`（`source=DOCUMENT`），金额取付款时快照，不取最终版本金额 |

## 验收

1. 不传图不能保存；同一张图不能挂第二笔。
2. 移除附件后，磁盘文件与 `document_file` 记录同时消失，`audit_event` 有记录。
3. 已关联的附件删除被拒绝。
4. 上传后不保存，超过保留期被清理；保存时文件已不存在给出明确提示。
5. 驳回后重新编辑，旧版本附件仍在审批历史可打开。
6. 导出 zip 中每笔都有图，文件名与 Excel 行对应；单张图缺失不中断导出。
7. 月结后不可修改。
8. 普通员工访问流水与凭证返回 404。

## 待确认

- 工资代发等一张回单对应多人时，是否只录汇总金额（当前按唯一约束，只能录汇总）。
- 保留期取 24 小时还是 48 小时。
- 账号完整存储后，是否需要独立的脱敏展示开关。
