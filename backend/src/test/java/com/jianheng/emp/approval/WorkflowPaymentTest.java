package com.jianheng.emp.approval;

import static com.jianheng.emp.approval.WorkflowData.*;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

import com.jianheng.emp.people.PeopleMapper;
import com.jianheng.emp.security.AccountMapper;
import com.jianheng.emp.security.AccountService.CurrentUser;
import com.jianheng.emp.security.Role;
import com.jianheng.emp.web.AuditMapper;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;

class WorkflowPaymentTest {
    private final WorkflowMapper mapper = mock(WorkflowMapper.class);
    private final PeopleMapper people = mock(PeopleMapper.class);
    private final AccountMapper accounts = mock(AccountMapper.class);
    private final AuditMapper audit = mock(AuditMapper.class);
    private final WorkflowNotifier notifier = mock(WorkflowNotifier.class);
    private final WorkflowService service = new WorkflowService(mapper, people, accounts, audit, notifier);
    private final CurrentUser payer = new CurrentUser(5, "payer", 11L, null, null, null, List.of(Role.PAYER));

    @Test
    void recordsPaymentFilesWithThePayment() {
        when(mapper.lockDocument(1L)).thenReturn(new Document(1, Kind.EXPENSE, 2, Status.AWAITING_PAYMENT, 1L, null));
        when(mapper.claimPayment(1L, 5L)).thenReturn(1);
        when(mapper.file(10L)).thenReturn(new FileRecord(10, 5, "key", "proof.pdf", "digest",
            "application/pdf", FileCategory.PAYMENT));
        when(mapper.documentsForFile(10L)).thenReturn(List.of());
        when(mapper.paymentDocumentsForFile(10L)).thenReturn(List.of());
        when(mapper.revision(1L)).thenReturn(new Revision(1, 1, "差旅报销", "事由", null, null, null, null, null,
            new BigDecimal("12.30"), null, null, null, null));

        service.pay(payer, 1L, new PaymentInput(LocalDate.now(), List.of(10L)));

        verify(mapper).addPayment(eq(1L), argThat(input -> input.fileIds().equals(List.of(10L))), eq(5L));
        verify(mapper).addPaymentFile(1L, 10L);
        verify(mapper).changeStatus(1L, Status.PAID);
        verify(notifier).notify(2, 1, 5, "「差旅报销」已登记付款");
        verify(audit).record(5L, "PAYMENT_RECORD", 1L, "已登记付款");
    }

    @Test
    void rejectsPaymentWithoutAttachments() {
        when(mapper.lockDocument(1L)).thenReturn(new Document(1, Kind.EXPENSE, 2, Status.AWAITING_PAYMENT, 1L, null));
        when(mapper.claimPayment(1L, 5L)).thenReturn(1);

        var error = assertThrows(IllegalArgumentException.class,
            () -> service.pay(payer, 1L, new PaymentInput(LocalDate.now(), List.of())));

        assertEquals("请上传付款附件", error.getMessage());
        verify(mapper, never()).addPayment(anyLong(), any(), anyLong());
    }

    @Test
    void rejectsPaymentFilesThatAreNotPaymentRecords() {
        when(mapper.lockDocument(1L)).thenReturn(new Document(1, Kind.EXPENSE, 2, Status.AWAITING_PAYMENT, 1L, null));
        when(mapper.claimPayment(1L, 5L)).thenReturn(1);
        when(mapper.file(10L)).thenReturn(new FileRecord(10, 5, "key", "invoice.pdf", "digest",
            "application/pdf", FileCategory.INVOICE));

        var error = assertThrows(IllegalArgumentException.class,
            () -> service.pay(payer, 1L, new PaymentInput(LocalDate.now(), List.of(10L))));

        assertEquals("付款附件必须为付款记录", error.getMessage());
        verify(mapper, never()).addPaymentFile(anyLong(), anyLong());
    }
    @Test
    void paysPurchaseDocumentsToo() {
        when(mapper.lockDocument(1L)).thenReturn(new Document(1, Kind.PURCHASE, 2, Status.AWAITING_PAYMENT, 1L, null));
        when(mapper.claimPayment(1L, 5L)).thenReturn(1);
        when(mapper.file(10L)).thenReturn(new FileRecord(10, 5, "key", "proof.pdf", "digest",
            "application/pdf", FileCategory.PAYMENT));
        when(mapper.documentsForFile(10L)).thenReturn(List.of());
        when(mapper.paymentDocumentsForFile(10L)).thenReturn(List.of());
        when(mapper.revision(1L)).thenReturn(new Revision(1, 1, "采购笔记本", "事由", null, null, null, null, null,
            new BigDecimal("12.30"), null, null, null, null));

        service.pay(payer, 1L, new PaymentInput(LocalDate.now(), List.of(10L)));

        verify(mapper).addPaymentFile(1L, 10L);
        verify(mapper).changeStatus(1L, Status.PAID);
        verify(notifier).notify(2, 1, 5, "「采购笔记本」已登记付款");
    }
}