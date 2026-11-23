# 附件治理

报销、采购、付款三个入口上传的附件统一落在 `document_file` 与 `EMP_UPLOAD_DIR`。上传即落库写盘，只有保存草稿时才通过 `revision_file` / `expense_payment_file` 建立业务关联；关联之前关掉弹窗，文件就成了无人引用的孤儿。本文只解决孤儿，不涉及资金凭证模块。

## 边界

| 做 | 不做 |
| --- | --- |
| 定时清理孤儿（行 + 磁盘文件） | 新增 `DELETE /api/attachments/{id}` |
| 补 `created_at` 与索引 | 上传即绑定（预创建草稿） |
| 结构化日志与孤儿统计 | 软删除、回收站 |

不加删除接口的理由：孤儿本身无业务价值，定时清理已能止漏；少一个可越权删别人文件的入口。代价是磁盘释放延迟一个保留期。

## 孤儿来源

| # | 路径 | 代码位置 |
| --- | --- | --- |
| 1 | 上传后点「取消 / X」关弹窗 | [`DraftEditor`](../frontend/src/documents/DraftEditor.tsx) 的 `onCancel` |
| 2 | 上传后点「移除」 | [`AttachmentUpload.remove`](../frontend/src/documents/AttachmentUpload.tsx) 只过滤本地数组，无删除接口 |
| 3 | 已保存草稿里移除附件再保存 | [`WorkflowService.saveDraft`](../backend/src/main/java/com/jianheng/emp/approval/WorkflowService.java) 的 `clearFiles` |
| 4 | 付款弹窗上传后取消 | [`DocumentDetail`](../frontend/src/documents/DocumentDetail.tsx) 的 `closeAction` |
| 5 | 更正付款登记时被移除的文件 | [`WorkflowService.correctPayment`](../backend/src/main/java/com/jianheng/emp/approval/WorkflowService.java) |

两个上传入口、两份独立 state，排查时别只看一处。

**驳回后移除旧版本附件不是孤儿。** 走 `RETURNED` 分支新建 revision，旧 revision 的 `revision_file` 仍引用它——那是审批历史凭据，必须保留。

## 数据模型

`document_file` 没有时间列，补一列：

```sql
ALTER TABLE document_file
    ADD COLUMN created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    ADD KEY ix_document_file_created (created_at);
```

历史行回填为迁移执行时刻，存量孤儿被当作刚上传，延迟一个保留期清理。安全侧偏移，不需要单独回填脚本。

## 清理任务

### 判定

```sql
SELECT id, storage_key FROM document_file f
WHERE f.created_at < NOW() - INTERVAL :days DAY
  AND NOT EXISTS (SELECT 1 FROM revision_file rf WHERE rf.file_id = f.id)
  AND NOT EXISTS (SELECT 1 FROM expense_payment_file p WHERE p.file_id = f.id)
ORDER BY f.created_at
LIMIT 500
FOR UPDATE
```

三个不能动的地方：

1. **不加 revision 过滤。** `revision_file` 必须全量判断。加 `submitted_at` 或 `current_revision_id` 会把审批历史里的附件判成孤儿，删完历史就打不开。
2. **必须 `FOR UPDATE`。** `saveDraft` 关联附件时也 `lockFile`，两者靠行锁串行化。不加锁会删掉正在关联的文件，回滚后成为 404。
3. **新增附件表要登记。** 将来加 `cash_voucher_file`，就是第三处 `NOT EXISTS`。漏一处会误删，测试必须覆盖「已关联不删」。

### 删除顺序

```
锁行 → 检查 → 删行 → 提交 → 删磁盘（失败记 storage_key）
```

反过来（先删盘、后删行）一旦回滚，文件没了行还在，用户打开就是 404，无法恢复。泄漏只是占空间，404 是数据损坏。删磁盘失败时行已删除，`storage_key` 是唯一线索，必须进日志。

### 调度

| 环境变量 | 默认 | 说明 |
| --- | --- | --- |
| `EMP_ATTACHMENT_ORPHAN_CRON` | `0 0 3 * * *` | 每天 03:00 |
| `EMP_ATTACHMENT_ORPHAN_RETENTION_HOURS` | `48` | 保留期，单位小时 |
| `EMP_ATTACHMENT_ORPHAN_BATCH_SIZE` | `500` | 单批条数 |
| `EMP_ATTACHMENT_ORPHAN_MAX_BATCHES` | `20` | 单次运行上限，防异常时无限跑 |
| `EMP_ATTACHMENT_ORPHAN_DRY_RUN` | `true` | **默认只统计不删除** |

每批独立事务，循环到删 0 条或达上限；逐条 `try/catch`，单条失败不影响同批。单次循环而不是每天 500 条：存量孤儿多时，每天 500 要排很久才能清空。

配置写在仓库根目录的 [`.env.dev`](../.env.dev)（本地）和 `.env.prod`（生产），与环境变量同名。启动日志会打印 `ATTACHMENT_ORPHAN_CLEANUP_CONFIG` 确认生效值。

**默认不删除。** 观察期结束后改为 `EMP_ATTACHMENT_ORPHAN_DRY_RUN=false` 并重启，这一步不做，孤儿会一直留在磁盘上。

`@EnableScheduling` 已在 [`EmpApplication`](../backend/src/main/java/com/jianheng/emp/EmpApplication.java)，写法参照 [`OverdueApprovalScheduler`](../backend/src/main/java/com/jianheng/emp/approval/OverdueApprovalScheduler.java)。

### 日志

```
event.action = ATTACHMENT_ORPHAN_SWEEP
scanned = 120  deleted = 37  failed = 0  duration_ms = 412
```

失败时单独 `log.warn` 打 `storage_key`。没有删除接口，这个任务就是唯一的删除路径，它挂了没人知道——日志和孤儿统计是唯一观测手段。

## 性能

判定是 O(N) 索引查找，不是两张表笛卡尔积：`revision_file.file_id` 与 `expense_payment_file.file_id` 都有外键自动创建的索引，每次判定一次 B+ 树查找。

按 50 人、每人每月 2 笔、每笔 3 个附件算，5 年约 1.8 万行，耗时 100 ms 以内。100 万行约 2–4 秒，1000 万行约 20–40 秒。凌晨任务无延迟敏感，本系统终身不需要换方案。

真正的隐患是排水速率，已由单次循环解决。

## 已知限制

| 限制 | 说明 |
| --- | --- |
| 单实例 | 当前单 backend 容器，`@Scheduled` 天然安全。扩多实例要加数据库锁 |
| 调度线程池 | 默认单线程，清理卡住会阻塞超时驳回，必要时配 `spring.task.scheduling.pool.size` |
| 磁盘容量 | 清理不解决增长，需监控上传卷 |
| 并发撞锁 | 用户在保留期边界保存可能撞锁，提示「附件已过期，请重新上传」 |

## 验收

1. 孤儿（无关联、超保留期）被删，行与磁盘文件同时消失。
2. 未到保留期的不动。
3. 关联到 `revision_file` 的不动，含历史版本。
4. 关联到 `expense_payment_file` 的不动。
5. 磁盘文件已丢失时，删行成功且不报错。
6. 单条失败不影响同批其他行。
7. dry-run 模式只打日志不删。

## 上线节奏

1. 迁移后 dry-run 一周，只统计不删。
2. 确认样本里没有「昨天刚传、今天在用」的文件。
3. 开真删，观察一周，确认删除量收敛。

## 工作量

3 人天：迁移 0.5、清理任务 1、日志与统计 0.5、测试 0.5、演练 0.5。
