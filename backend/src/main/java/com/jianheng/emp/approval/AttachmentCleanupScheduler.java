package com.jianheng.emp.approval;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** 每天清理超过保留期且无人引用的附件。默认 dry-run，只统计不删除。 */
@Component
class AttachmentCleanupScheduler {
    private static final Logger log = LoggerFactory.getLogger(AttachmentCleanupScheduler.class);

    private final AttachmentCleanupService service;
    private final int retentionHours;
    private final int batchSize;
    private final int maxBatches;
    private final boolean dryRun;

    AttachmentCleanupScheduler(AttachmentCleanupService service,
            @Value("${EMP_ATTACHMENT_ORPHAN_RETENTION_HOURS:48}") int retentionHours,
            @Value("${EMP_ATTACHMENT_ORPHAN_BATCH_SIZE:500}") int batchSize,
            @Value("${EMP_ATTACHMENT_ORPHAN_MAX_BATCHES:20}") int maxBatches,
            @Value("${EMP_ATTACHMENT_ORPHAN_DRY_RUN:true}") boolean dryRun) {
        this.service = service;
        this.retentionHours = retentionHours;
        this.batchSize = batchSize;
        this.maxBatches = maxBatches;
        this.dryRun = dryRun;
        log.atInfo()
            .addKeyValue("event.action", "ATTACHMENT_ORPHAN_CLEANUP_CONFIG")
            .addKeyValue("attachment.dry_run", dryRun)
            .addKeyValue("attachment.retention_hours", retentionHours)
            .addKeyValue("attachment.batch_size", batchSize)
            .addKeyValue("attachment.max_batches", maxBatches)
            .log("attachment orphan cleanup configured");
    }

    @Scheduled(cron = "${EMP_ATTACHMENT_ORPHAN_CRON:0 0 3 * * *}")
    void sweep() {
        long started = System.nanoTime();
        if (dryRun) {
            long candidates = service.count(retentionHours);
            log.atInfo()
                .addKeyValue("event.action", "ATTACHMENT_ORPHAN_SWEEP")
                .addKeyValue("attachment.dry_run", true)
                .addKeyValue("attachment.candidates", candidates)
                .addKeyValue("event.duration_ms", (System.nanoTime() - started) / 1_000_000)
                .log("counted orphan attachments");
            return;
        }
        long deleted = 0;
        int failed = 0;
        try {
            for (int batch = 0; batch < maxBatches; batch++) {
                var orphans = service.deleteBatch(retentionHours, batchSize);
                if (orphans.isEmpty()) break;
                deleted += orphans.size();
                failed += service.deleteFiles(orphans);
                if (orphans.size() < batchSize) break;
            }
        } catch (RuntimeException error) {
            log.warn("Could not sweep orphan attachments", error);
        }
        if (deleted > 0 || failed > 0) {
            log.atInfo()
                .addKeyValue("event.action", "ATTACHMENT_ORPHAN_SWEEP")
                .addKeyValue("attachment.deleted", deleted)
                .addKeyValue("attachment.failed", failed)
                .addKeyValue("event.duration_ms", (System.nanoTime() - started) / 1_000_000)
                .log("deleted orphan attachments");
        }
    }
}
