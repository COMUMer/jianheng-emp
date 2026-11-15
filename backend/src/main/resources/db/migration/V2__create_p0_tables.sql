CREATE TABLE department (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    parent_id BIGINT,
    manager_id BIGINT,
    FOREIGN KEY (parent_id) REFERENCES department(id)
);
CREATE TABLE job_position (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);
CREATE TABLE employee (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(40) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    department_id BIGINT NOT NULL,
    position_id BIGINT NOT NULL,
    contact VARCHAR(120) NOT NULL DEFAULT '',
    joined_on DATE NOT NULL,
    departed_on DATE,
    FOREIGN KEY (department_id) REFERENCES department(id),
    FOREIGN KEY (position_id) REFERENCES job_position(id)
);
ALTER TABLE department ADD FOREIGN KEY (manager_id) REFERENCES employee(id);
CREATE TABLE account (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(64) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    employee_id BIGINT UNIQUE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    FOREIGN KEY (employee_id) REFERENCES employee(id)
);
CREATE TABLE account_role (
    account_id BIGINT NOT NULL,
    role VARCHAR(24) NOT NULL,
    PRIMARY KEY (account_id, role),
    FOREIGN KEY (account_id) REFERENCES account(id)
);
CREATE TABLE audit_event (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    actor_id BIGINT NOT NULL,
    operation VARCHAR(40) NOT NULL,
    object_id BIGINT,
    detail VARCHAR(2000) NOT NULL,
    occurred_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    INDEX ix_audit_object (operation, object_id, id),
    FOREIGN KEY (actor_id) REFERENCES account(id)
);
CREATE TABLE expense_category (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);
INSERT INTO expense_category(name) VALUES ('差旅费'), ('交通费'), ('办公费'), ('餐饮费'), ('其他');
CREATE TABLE approval_template (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    kind VARCHAR(20) NOT NULL,
    published_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    INDEX ix_template_kind (kind, id)
);
CREATE TABLE approval_template_node (
    template_id BIGINT NOT NULL,
    ordinal INT NOT NULL,
    label VARCHAR(80) NOT NULL,
    assignment VARCHAR(24) NOT NULL,
    account_id BIGINT,
    alternate_id BIGINT,
    minimum DECIMAL(15, 2),
    due_hours INT NOT NULL,
    PRIMARY KEY (template_id, ordinal),
    FOREIGN KEY (template_id) REFERENCES approval_template(id),
    FOREIGN KEY (account_id) REFERENCES account(id),
    FOREIGN KEY (alternate_id) REFERENCES account(id)
);
CREATE TABLE work_document (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    kind VARCHAR(20) NOT NULL,
    owner_id BIGINT NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
    current_revision_id BIGINT,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    INDEX ix_document_owner (owner_id, created_at),
    INDEX ix_document_kind_status (kind, status, id),
    FOREIGN KEY (owner_id) REFERENCES account(id)
);
CREATE TABLE document_revision (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    document_id BIGINT NOT NULL,
    title VARCHAR(160) NOT NULL,
    reason VARCHAR(2000) NOT NULL,
    leave_type VARCHAR(40),
    starts_at DATETIME,
    ends_at DATETIME,
    destination VARCHAR(160),
    amount DECIMAL(15, 2),
    department_id BIGINT,
    department_name VARCHAR(100),
    template_id BIGINT,
    submitted_at DATETIME(6),
    INDEX ix_revision_document (document_id, id),
    FOREIGN KEY (document_id) REFERENCES work_document(id),
    FOREIGN KEY (template_id) REFERENCES approval_template(id)
);
ALTER TABLE work_document ADD FOREIGN KEY (current_revision_id) REFERENCES document_revision(id);
CREATE TABLE expense_line (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    revision_id BIGINT NOT NULL,
    category_id BIGINT NOT NULL,
    description VARCHAR(200) NOT NULL,
    occurred_on DATE NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    FOREIGN KEY (revision_id) REFERENCES document_revision(id),
    FOREIGN KEY (category_id) REFERENCES expense_category(id)
);
CREATE TABLE document_file (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    uploaded_by BIGINT NOT NULL,
    storage_key CHAR(36) NOT NULL UNIQUE,
    original_name VARCHAR(255) NOT NULL,
    digest CHAR(64) NOT NULL,
    invoice_key VARCHAR(100),
    FOREIGN KEY (uploaded_by) REFERENCES account(id)
);
CREATE TABLE revision_file (
    revision_id BIGINT NOT NULL,
    file_id BIGINT NOT NULL,
    PRIMARY KEY (revision_id, file_id),
    FOREIGN KEY (revision_id) REFERENCES document_revision(id),
    FOREIGN KEY (file_id) REFERENCES document_file(id)
);
CREATE TABLE invoice_reservation (
    invoice_key VARCHAR(100) PRIMARY KEY,
    document_id BIGINT NOT NULL,
    FOREIGN KEY (document_id) REFERENCES work_document(id)
);
CREATE TABLE approval_task (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    revision_id BIGINT NOT NULL,
    ordinal INT NOT NULL,
    label VARCHAR(80) NOT NULL,
    assignee_id BIGINT NOT NULL,
    assignment VARCHAR(24) NOT NULL,
    status VARCHAR(24) NOT NULL,
    due_hours INT NOT NULL,
    due_at DATETIME(6),
    UNIQUE (revision_id, ordinal),
    INDEX ix_task_assignee (assignee_id, status, due_at),
    FOREIGN KEY (revision_id) REFERENCES document_revision(id),
    FOREIGN KEY (assignee_id) REFERENCES account(id)
);
CREATE TABLE approval_event (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    revision_id BIGINT NOT NULL,
    task_id BIGINT,
    actor_id BIGINT NOT NULL,
    action VARCHAR(24) NOT NULL,
    comment VARCHAR(1000) NOT NULL,
    occurred_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    FOREIGN KEY (revision_id) REFERENCES document_revision(id),
    FOREIGN KEY (task_id) REFERENCES approval_task(id),
    FOREIGN KEY (actor_id) REFERENCES account(id)
);
CREATE TABLE expense_payment (
    document_id BIGINT PRIMARY KEY,
    paid_on DATE NOT NULL,
    reference VARCHAR(160) NOT NULL,
    paid_by BIGINT NOT NULL,
    FOREIGN KEY (document_id) REFERENCES work_document(id),
    FOREIGN KEY (paid_by) REFERENCES account(id)
);
CREATE TABLE notification (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    recipient_id BIGINT NOT NULL,
    document_id BIGINT NOT NULL,
    message VARCHAR(240) NOT NULL,
    read_at DATETIME(6),
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    INDEX ix_notification_recipient (recipient_id, id),
    FOREIGN KEY (recipient_id) REFERENCES account(id),
    FOREIGN KEY (document_id) REFERENCES work_document(id)
);
