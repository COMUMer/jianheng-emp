package com.jianheng.emp.approval;

import static com.jianheng.emp.approval.AttachmentCleanupMapper.Orphan;

import java.io.IOException;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 删除无人引用的附件。先删行、提交后再删磁盘文件，避免回滚造成文件丢失但记录残存。 */
@Service
class AttachmentCleanupService {
    private static final Logger log = LoggerFactory.getLogger(AttachmentCleanupService.class);

    private final AttachmentCleanupMapper mapper;
    private final AttachmentService attachments;

    AttachmentCleanupService(AttachmentCleanupMapper mapper, AttachmentService attachments) {
        this.mapper = mapper;
        this.attachments = attachments;
    }

    long count(int hours) {
        return mapper.countOrphans(hours);
    }

    /** 锁定并删除一批孤儿记录；磁盘文件由调用方在事务提交后删除。 */
    @Transactional
    List<Orphan> deleteBatch(int hours, int limit) {
        var orphans = mapper.lockOrphans(hours, limit);
        for (var orphan : orphans) mapper.deleteFile(orphan.id());
        return orphans;
    }

    /** 事务提交后删除磁盘文件，返回失败数量。行已删除，失败时 storageKey 是唯一线索。 */
    int deleteFiles(List<Orphan> orphans) {
        int failed = 0;
        for (var orphan : orphans) {
            try {
                attachments.deleteStored(orphan.storageKey());
            } catch (IOException | RuntimeException error) {
                failed++;
                log.warn("Could not delete orphan attachment {}", orphan.storageKey(), error);
            }
        }
        return failed;
    }
}
