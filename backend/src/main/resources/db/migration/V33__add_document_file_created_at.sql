-- 附件孤儿清理按创建时间判断保留期；存量行回填为迁移时刻，延迟一个保留期清理。
ALTER TABLE document_file
    ADD COLUMN created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    ADD KEY ix_document_file_created (created_at);
