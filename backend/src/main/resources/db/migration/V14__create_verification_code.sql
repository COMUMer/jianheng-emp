CREATE TABLE verification_code (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    employee_id BIGINT NOT NULL,
    purpose VARCHAR(24) NOT NULL,
    code_hash CHAR(64) NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    expires_at DATETIME(6) NOT NULL,
    consumed_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    KEY ix_verification_lookup (employee_id, purpose, id),
    CONSTRAINT verification_employee_fk FOREIGN KEY (employee_id) REFERENCES employee(id)
);