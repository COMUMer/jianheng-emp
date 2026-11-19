CREATE TABLE expense_payment_file (
    document_id BIGINT NOT NULL,
    file_id BIGINT NOT NULL,
    PRIMARY KEY (document_id, file_id),
    FOREIGN KEY (document_id) REFERENCES expense_payment(document_id),
    FOREIGN KEY (file_id) REFERENCES document_file(id)
);