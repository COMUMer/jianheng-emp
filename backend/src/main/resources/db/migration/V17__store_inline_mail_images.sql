UPDATE mail_settings
SET body_html = CONCAT(body_html, '<p>你的验证码是 <strong>{{code}}</strong></p>')
WHERE LOCATE('{{code}}', body_html) = 0;

ALTER TABLE mail_settings DROP COLUMN body_text;

CREATE TABLE mail_image (
    id CHAR(36) NOT NULL PRIMARY KEY,
    content_type VARCHAR(32) NOT NULL,
    content MEDIUMBLOB NOT NULL
);
