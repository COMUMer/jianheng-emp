ALTER TABLE work_document
    ADD COLUMN payment_claim_by BIGINT NULL,
    ADD COLUMN payment_claim_at DATETIME(6) NULL,
    ADD KEY ix_work_document_payment_claim (payment_claim_by);
