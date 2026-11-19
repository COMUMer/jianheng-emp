package com.jianheng.emp.security;

import java.time.LocalDateTime;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

@Mapper
interface MailSettingsMapper {
    record Row(String sender, String subject, String bodyHtml,
               LocalDateTime updatedAt, String updatedBy) {}

    @Select("""
        SELECT s.sender, s.subject, s.body_html AS bodyHtml,
               s.updated_at AS updatedAt, a.username AS updatedBy
        FROM mail_settings s
        LEFT JOIN account a ON a.id = s.updated_by
        WHERE s.id = 1
        """)
    Row find();

    @Insert("""
        INSERT INTO mail_settings(id, sender, subject, body_html, updated_by)
        VALUES(1, #{sender}, #{subject}, #{html}, #{actor})
        ON DUPLICATE KEY UPDATE sender=VALUES(sender), subject=VALUES(subject),
            body_html=VALUES(body_html), updated_by=VALUES(updated_by),
            updated_at=CURRENT_TIMESTAMP(6)
        """)
    void save(String sender, String subject, String html, long actor);
}
