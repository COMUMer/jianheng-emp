ALTER TABLE notification
    ADD COLUMN actor_id BIGINT NULL AFTER document_id,
    ADD CONSTRAINT fk_notification_actor FOREIGN KEY (actor_id) REFERENCES account(id);
