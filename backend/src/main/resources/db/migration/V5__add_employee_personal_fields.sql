ALTER TABLE employee
    CHANGE contact phone VARCHAR(32) NOT NULL DEFAULT '',
    ADD email VARCHAR(120) NOT NULL DEFAULT '' AFTER phone,
    ADD id_card VARCHAR(18) NULL AFTER email,
    ADD address VARCHAR(200) NOT NULL DEFAULT '' AFTER id_card,
    ADD emergency_contact VARCHAR(100) NOT NULL DEFAULT '' AFTER address,
    ADD emergency_phone VARCHAR(32) NOT NULL DEFAULT '' AFTER emergency_contact,
    ADD bank_card VARCHAR(19) NOT NULL DEFAULT '' AFTER emergency_phone,
    ADD bank_name VARCHAR(100) NOT NULL DEFAULT '' AFTER bank_card,
    ADD cnaps_code VARCHAR(12) NOT NULL DEFAULT '' AFTER bank_name,
    ADD UNIQUE KEY uk_employee_id_card (id_card);