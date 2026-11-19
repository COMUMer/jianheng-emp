INSERT INTO account(username, password_hash, active)
SELECT '系统', password_hash, 0 FROM account WHERE username = '1';

CREATE INDEX ix_approval_task_due ON approval_task(status, due_at);