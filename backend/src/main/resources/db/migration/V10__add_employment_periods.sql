CREATE TABLE employment (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    employee_id BIGINT NOT NULL,
    department_id BIGINT NOT NULL,
    position_id BIGINT NOT NULL,
    joined_on DATE NOT NULL,
    departed_on DATE NULL,
    updated_by BIGINT,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    open_employee_id BIGINT GENERATED ALWAYS AS (IF(departed_on IS NULL, employee_id, NULL)) STORED,
    UNIQUE KEY uk_employment_open (open_employee_id),
    KEY ix_employment_employee (employee_id, joined_on),
    CONSTRAINT employment_employee_fk FOREIGN KEY (employee_id) REFERENCES employee(id),
    CONSTRAINT employment_department_fk FOREIGN KEY (department_id) REFERENCES department(id),
    CONSTRAINT employment_position_fk FOREIGN KEY (position_id) REFERENCES job_position(id)
);

INSERT INTO employment(employee_id, department_id, position_id, joined_on, departed_on, updated_by)
SELECT id, department_id, position_id, joined_on, departed_on, updated_by FROM employee;

ALTER TABLE employee
    DROP FOREIGN KEY employee_ibfk_1,
    DROP FOREIGN KEY employee_ibfk_2,
    DROP COLUMN department_id,
    DROP COLUMN position_id,
    DROP COLUMN joined_on,
    DROP COLUMN departed_on;