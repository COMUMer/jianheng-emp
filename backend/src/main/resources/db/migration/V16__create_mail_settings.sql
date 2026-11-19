CREATE TABLE mail_settings (
    id TINYINT NOT NULL PRIMARY KEY,
    sender VARCHAR(200) NOT NULL,
    subject VARCHAR(200) NOT NULL,
    body_text TEXT NOT NULL,
    body_html MEDIUMTEXT NOT NULL,
    updated_by BIGINT NULL,
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT mail_settings_singleton CHECK (id = 1)
);
