-- 或签：同一节点的主审批人与替代审批人等价，任一处理即可。
ALTER TABLE approval_task
    ADD COLUMN alternate_id BIGINT NULL AFTER assignee_id,
    ADD INDEX ix_task_alternate (alternate_id, status, due_at),
    ADD CONSTRAINT fk_task_alternate FOREIGN KEY (alternate_id) REFERENCES account(id);
