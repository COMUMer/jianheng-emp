package com.jianheng.emp.approval;

import java.util.List;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

/**
 * 附件孤儿清理。判定必须全量检查所有业务关联表，不能按 revision 状态或当前版本过滤，
 * 否则会把审批历史里的附件判成孤儿。新增附件关联表时必须在这里补一处 NOT EXISTS。
 */
@Mapper
public interface AttachmentCleanupMapper {
    record Orphan(long id, String storageKey) {}

    @Select("""
        SELECT f.id, f.storage_key FROM document_file f
        WHERE f.created_at < TIMESTAMPADD(HOUR, -#{hours}, CURRENT_TIMESTAMP(6))
          AND NOT EXISTS (SELECT 1 FROM revision_file rf WHERE rf.file_id = f.id)
          AND NOT EXISTS (SELECT 1 FROM expense_payment_file p WHERE p.file_id = f.id)
        ORDER BY f.created_at
        LIMIT #{limit}
        FOR UPDATE
        """)
    List<Orphan> lockOrphans(int hours, int limit);

    @Select("""
        SELECT COUNT(*) FROM document_file f
        WHERE f.created_at < TIMESTAMPADD(HOUR, -#{hours}, CURRENT_TIMESTAMP(6))
          AND NOT EXISTS (SELECT 1 FROM revision_file rf WHERE rf.file_id = f.id)
          AND NOT EXISTS (SELECT 1 FROM expense_payment_file p WHERE p.file_id = f.id)
        """)
    long countOrphans(int hours);

    @Delete("DELETE FROM document_file WHERE id = #{id}")
    void deleteFile(long id);
}
