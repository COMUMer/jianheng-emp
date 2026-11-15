package com.jianheng.emp.web;

import java.time.LocalDateTime;
import java.util.List;
import org.apache.ibatis.annotations.*;

@Mapper
public interface AuditMapper {
    record Entry(long id, String actor, String actorAvatarKey, String operation, Long objectId, String detail, LocalDateTime occurredAt) {}

    @Insert("INSERT INTO audit_event(actor_id, operation, object_id, detail) VALUES(#{actorId}, #{operation}, #{objectId}, #{detail})")
    void record(long actorId, String operation, Long objectId, String detail);

    @Select("""
        SELECT e.id, a.username AS actor, ea.avatar_key AS actor_avatar_key, e.operation, e.object_id, e.detail, e.occurred_at
        FROM audit_event e JOIN account a ON a.id=e.actor_id LEFT JOIN employee ea ON ea.id=a.employee_id
        ORDER BY e.id DESC LIMIT 200
        """)
    List<Entry> recent();

    @Select("""
        SELECT e.id, a.username AS actor, ea.avatar_key AS actor_avatar_key, e.operation, e.object_id, e.detail, e.occurred_at
        FROM audit_event e JOIN account a ON a.id=e.actor_id LEFT JOIN employee ea ON ea.id=a.employee_id
        WHERE e.operation LIKE 'EMPLOYEE_%' AND e.object_id=#{id} ORDER BY e.id DESC
        """)
    List<Entry> employeeHistory(long id);
}
