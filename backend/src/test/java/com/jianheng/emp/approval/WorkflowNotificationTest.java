package com.jianheng.emp.approval;

import static com.jianheng.emp.approval.WorkflowData.*;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

import com.jianheng.emp.people.PeopleMapper;
import com.jianheng.emp.security.AccountMapper;
import com.jianheng.emp.security.pii.TestPii;
import com.jianheng.emp.security.AccountService.CurrentUser;
import com.jianheng.emp.security.Role;
import com.jianheng.emp.web.AuditMapper;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;

/** 站内消息必须覆盖「待办」和「待付款」两类事项，且一眼看出是哪张单。 */
class WorkflowNotificationTest {
    private static final long DOCUMENT = 7;
    private static final long REVISION = 3;
    private static final long OWNER = 2;

    private final WorkflowMapper mapper = mock(WorkflowMapper.class);
    private final PeopleMapper people = mock(PeopleMapper.class);
    private final AccountMapper accounts = mock(AccountMapper.class);
    private final AuditMapper audit = mock(AuditMapper.class);
    private final WorkflowNotifier notifier = mock(WorkflowNotifier.class);
    private final WorkflowService service = new WorkflowService(mapper, people, accounts, audit, notifier, TestPii.CIPHER);

    @Test
    void tellsTheNextApproverWhichDocumentWaitsForThem() {
        approveAs(8, Assignment.MANAGER, Kind.LEAVE,
            new Task(12, REVISION, 2, "财务审批", 9, null, Assignment.FINANCE, TaskStatus.WAITING, 24, null));

        verify(notifier).notify(9, DOCUMENT, 8, "「请假一天」待你审批");
    }

    @Test
    void notifiesEveryPayerWhenAnExpenseIsReadyForPayment() {
        when(accounts.activeIdsWithRole(Role.PAYER)).thenReturn(List.of(5L, 6L));

        approveAs(8, Assignment.FINANCE, Kind.EXPENSE, null);

        verify(mapper).changeStatus(DOCUMENT, Status.AWAITING_PAYMENT);
        verify(notifier).notify(5, DOCUMENT, 8, "「差旅报销」待你登记付款");
        verify(notifier).notify(6, DOCUMENT, 8, "「差旅报销」待你登记付款");
        verify(notifier).notify(OWNER, DOCUMENT, 8, "「差旅报销」已通过，等待付款");
    }

    @Test
    void doesNotRepeatThePaymentReminderToTheOwner() {
        when(accounts.activeIdsWithRole(Role.PAYER)).thenReturn(List.of(OWNER, 5L));

        approveAs(8, Assignment.MANAGER, Kind.EXPENSE, null);

        verify(notifier, never()).notify(eq(OWNER), eq(DOCUMENT), eq(8L), eq("「差旅报销」待你登记付款"));
        verify(notifier).notify(5, DOCUMENT, 8, "「差旅报销」待你登记付款");
    }

    private void approveAs(long approver, Assignment assignment, Kind kind, Task next) {
        long employeeId = approver + 10;
        List<Role> roles = kind == Kind.EXPENSE ? List.of(Role.FINANCE) : List.of(Role.EMPLOYEE);
        when(mapper.lockDocument(DOCUMENT)).thenReturn(new Document(DOCUMENT, kind, OWNER, Status.IN_REVIEW, REVISION, null));
        when(mapper.task(11)).thenReturn(new Task(11, REVISION, 1, "部门审批", approver, null, assignment, TaskStatus.ACTIVE, 24, null));
        when(mapper.next(REVISION)).thenReturn(next);
        when(mapper.revision(REVISION)).thenReturn(new Revision(REVISION, DOCUMENT,
            switch (kind) { case EXPENSE -> "差旅报销"; case PURCHASE -> "采购笔记本"; default -> "请假一天"; }, "事由", null, null, null, null, null, new BigDecimal("12.30"),
            null, null, null, null));
        when(accounts.byId(approver)).thenReturn(new AccountMapper.Account(approver, "u", "h", employeeId,
            null, null, null, true, null, null, null, null));
        when(accounts.roles(approver)).thenReturn(roles);
        when(people.employee(employeeId)).thenReturn(new PeopleMapper.Employee(employeeId, "mis", "审批人", 1, 1,
            null, null, null, null, null, null, null, null, null, null, LocalDate.now(), null, "部门", "岗位", null, null, null, null));

        service.handle(new CurrentUser(approver, "u", employeeId, null, null, null, roles), DOCUMENT, 11,
            new TaskInput(Action.APPROVE, "同意", null));
    }
    @Test
    void sendsPurchasesToPaymentAfterTheFinalApproval() {
        when(accounts.activeIdsWithRole(Role.PAYER)).thenReturn(List.of(5L));

        approveAs(8, Assignment.NAMED, Kind.PURCHASE, null);

        verify(mapper).changeStatus(DOCUMENT, Status.AWAITING_PAYMENT);
        verify(notifier).notify(5, DOCUMENT, 8, "「采购笔记本」待你登记付款");
        verify(notifier).notify(OWNER, DOCUMENT, 8, "「采购笔记本」已通过，等待付款");
    }
}