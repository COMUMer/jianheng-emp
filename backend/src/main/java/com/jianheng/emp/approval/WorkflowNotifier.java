package com.jianheng.emp.approval;

import com.jianheng.emp.web.LiveSignal;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 站内消息的唯一写入口：同一次调用里写通知行并登记「有更新」信号。
 *
 * <p>要求调用方已在事务内：通知与业务变更要么一起提交并推送，要么一起回滚。
 */
@Service
class WorkflowNotifier {
    private final WorkflowMapper mapper;
    private final ApplicationEventPublisher events;

    WorkflowNotifier(WorkflowMapper mapper, ApplicationEventPublisher events) {
        this.mapper = mapper;
        this.events = events;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    void notify(long recipient, long document, long actor, String message) {
        mapper.notify(recipient, document, actor, message);
        events.publishEvent(new LiveSignal(recipient));
    }
}
