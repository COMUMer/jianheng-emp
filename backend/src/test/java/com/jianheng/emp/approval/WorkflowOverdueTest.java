package com.jianheng.emp.approval;

import static com.jianheng.emp.approval.WorkflowData.*;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;

import com.jianheng.emp.people.PeopleMapper;
import com.jianheng.emp.security.AccountMapper;
import com.jianheng.emp.security.pii.TestPii;
import com.jianheng.emp.web.AuditMapper;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class WorkflowOverdueTest {
    private final WorkflowMapper mapper = mock(WorkflowMapper.class);
    private final PeopleMapper people = mock(PeopleMapper.class);
    private final AccountMapper accounts = mock(AccountMapper.class);
    private final AuditMapper audit = mock(AuditMapper.class);
    private final WorkflowNotifier notifier = mock(WorkflowNotifier.class);
    private final WorkflowService service = new WorkflowService(mapper, people, accounts, audit, notifier, TestPii.CIPHER);

    @Test
    void returnsOverdueTasksAsSystem() {
        when(mapper.task(11)).thenReturn(new Task(11, 3, 1, "部门审批", 8L, 9L, Assignment.MANAGER,
            TaskStatus.ACTIVE, 24, LocalDateTime.now().minusHours(1)));
        when(mapper.revision(3)).thenReturn(new Revision(3, 7, "请假审批", "事由", null, null, null, null, null,
            new BigDecimal("12.30"), null, null, null, null));
        when(mapper.lockDocument(7)).thenReturn(new Document(7, Kind.LEAVE, 2, Status.IN_REVIEW, 3L, null));
        when(mapper.returnOverdueTask(11)).thenReturn(1);
        when(mapper.systemAccountId()).thenReturn(99L);

        service.returnOverdue(11);

        verify(mapper).closeWaiting(3L);
        verify(mapper).changeStatus(7L, Status.RETURNED);
        verify(mapper).event(3L, 11L, 99L, "RETURN", "审批超期，系统自动驳回");
        verify(notifier).notify(8L, 7L, 99L, "「请假审批」审批超期，已自动驳回");
        verify(notifier).notify(9L, 7L, 99L, "「请假审批」审批超期，已自动驳回");
        verify(notifier).notify(2L, 7L, 99L, "「请假审批」因审批超期被系统驳回，请查看原因");
    }

    @Test
    void failsClearlyWhenTheSystemAccountIsMissing() {
        when(mapper.task(11)).thenReturn(new Task(11, 3, 1, "部门审批", 8L, null, Assignment.MANAGER,
            TaskStatus.ACTIVE, 24, LocalDateTime.now().minusHours(1)));
        when(mapper.revision(3)).thenReturn(new Revision(3, 7, "请假审批", "事由", null, null, null, null, null,
            new BigDecimal("12.30"), null, null, null, null));
        when(mapper.lockDocument(7)).thenReturn(new Document(7, Kind.LEAVE, 2, Status.IN_REVIEW, 3L, null));
        when(mapper.returnOverdueTask(11)).thenReturn(1);
        when(mapper.systemAccountId()).thenReturn(null);

        var error = assertThrows(IllegalStateException.class, () -> service.returnOverdue(11));

        assertTrue(error.getMessage().contains("系统账号缺失"));
    }

    @Test
    void ignoresTasksThatAreNotOverdueYet() {
        when(mapper.task(11)).thenReturn(new Task(11, 3, 1, "部门审批", 8L, null, Assignment.MANAGER,
            TaskStatus.ACTIVE, 24, LocalDateTime.now().plusHours(1)));

        service.returnOverdue(11);

        verify(mapper, never()).returnOverdueTask(anyLong());
        verify(mapper, never()).changeStatus(anyLong(), any());
        verifyNoInteractions(notifier);
    }
}