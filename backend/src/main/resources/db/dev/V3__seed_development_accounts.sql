-- 本地开发账号。密码以 Spring Security BCrypt 哈希存储。
START TRANSACTION;

INSERT INTO department (name) VALUES ('开发验收部');
SET @development_department_id = LAST_INSERT_ID();

INSERT INTO job_position (name) VALUES ('开发验收岗位');
SET @development_position_id = LAST_INSERT_ID();

INSERT INTO employee (code, name, department_id, position_id, joined_on)
VALUES
    ('DEV-001', 'xianghongrui', @development_department_id, @development_position_id, CURRENT_DATE),
    ('DEV-002', 'yuanyuwei',    @development_department_id, @development_position_id, CURRENT_DATE),
    ('DEV-003', 'suxinglong',   @development_department_id, @development_position_id, CURRENT_DATE),
    ('DEV-004', 'lvqinhan',     @development_department_id, @development_position_id, CURRENT_DATE),
    ('DEV-005', 'fanruxi',      @development_department_id, @development_position_id, CURRENT_DATE);

INSERT INTO account (username, password_hash)
VALUES ('1', '$2a$10$DMrfKXA8H0PrmMLaEcgqMu/x2FM.4TTdcZMjwwH8MI1JlCQorApXK');

INSERT INTO account_role (account_id, role) VALUES (LAST_INSERT_ID(), 'ADMIN');

INSERT INTO account (username, password_hash, employee_id)
SELECT e.name, credentials.password_hash, e.id
FROM (
    SELECT 'DEV-001' AS employee_code, '$2a$10$AI9Y2.sA5Hdv5AE4nzNITO002DJTH2Cc0sFfgX9WIHGpmgdUrHFuy' AS password_hash
    UNION ALL SELECT 'DEV-002', '$2a$10$qir.RGxwYiwMOQrpuNN4ZuJvDcOnllzfnt4/M6zEkIYlSDnhQwXXu'
    UNION ALL SELECT 'DEV-003', '$2a$10$I51FPNH3tGh0VKdR7lVLRuXPqoBpQOeTPKhnkeGOGDw/kq9OhBBpS'
    UNION ALL SELECT 'DEV-004', '$2a$10$zbvjgOfeh7ing90b8Xy2T.FDiet85G6YOqmS1nONJ8UdKlB/dgmiK'
    UNION ALL SELECT 'DEV-005', '$2a$10$a7ShFjLSMNnjmAgZhyXsR.HVzOKLYf/EPEmEEakxoMsw0Zpco0xi6'
) AS credentials
JOIN employee e ON e.code = credentials.employee_code;

INSERT INTO account_role (account_id, role)
SELECT a.id, 'EMPLOYEE'
FROM account a
JOIN employee e ON e.id = a.employee_id
WHERE e.department_id = @development_department_id AND e.position_id = @development_position_id;

COMMIT;
