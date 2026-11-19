-- 身份证、银行卡、手机号改为存密文：放宽列宽，身份证唯一约束改挂盲索引。
ALTER TABLE employee
    MODIFY id_card VARCHAR(255) NULL,
    MODIFY bank_card VARCHAR(255) NOT NULL DEFAULT '',
    MODIFY phone VARCHAR(255) NOT NULL DEFAULT '',
    MODIFY emergency_phone VARCHAR(255) NOT NULL DEFAULT '',
    ADD COLUMN id_card_bidx CHAR(64) NULL AFTER id_card;

ALTER TABLE employee DROP INDEX uk_employee_id_card;

ALTER TABLE employee ADD UNIQUE KEY uk_employee_id_card_bidx (id_card_bidx);
