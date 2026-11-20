package com.jianheng.emp.approval;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
class OverdueApprovalScheduler {
    private static final Logger log = LoggerFactory.getLogger(OverdueApprovalScheduler.class);

    private final WorkflowMapper mapper;
    private final WorkflowService workflow;

    OverdueApprovalScheduler(WorkflowMapper mapper, WorkflowService workflow) {
        this.mapper = mapper;
        this.workflow = workflow;
    }

    @Scheduled(fixedDelayString = "${emp.approval.overdue-sweep:60000}")
    void sweep() {
        long started = System.nanoTime();
        int returned = 0;
        for (long taskId : mapper.overdueTaskIds()) {
            try {
                workflow.returnOverdue(taskId);
                returned++;
            } catch (RuntimeException error) {
                log.warn("Could not return overdue approval task {}", taskId, error);
            }
        }
        if (returned > 0) {
            log.atInfo()
                .addKeyValue("event.action", "APPROVAL_OVERDUE_SWEEP")
                .addKeyValue("event.duration_ms", (System.nanoTime() - started) / 1_000_000)
                .addKeyValue("approval.returned", returned)
                .log("returned overdue approvals");
        }
    }
}