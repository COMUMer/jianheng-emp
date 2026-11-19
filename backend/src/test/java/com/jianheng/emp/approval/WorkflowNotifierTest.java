package com.jianheng.emp.approval;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import com.jianheng.emp.web.LiveSignal;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

class WorkflowNotifierTest {
    private final WorkflowMapper mapper = mock(WorkflowMapper.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final WorkflowNotifier notifier = new WorkflowNotifier(mapper, events);

    @Test
    void writesTheNoticeAndAnnouncesTheChange() {
        notifier.notify(7, 42, 3, "待处理「部门负责人」");

        verify(mapper).notify(7, 42, 3, "待处理「部门负责人」");
        verify(events).publishEvent(new LiveSignal(7));
    }
}