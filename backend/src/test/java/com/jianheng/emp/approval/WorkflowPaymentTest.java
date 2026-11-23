package com.jianheng.emp.approval;

import static com.jianheng.emp.approval.WorkflowData.*;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.argThat;
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
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class WorkflowPaymentTest {
    private final WorkflowMapper mapper = mock(WorkflowMapper.class);
    private final PeopleMapper people = mock(PeopleMapper.class);
    private final AccountMapper accounts = mock(AccountMapper.class);
    private final AuditMapper audit = mock(AuditMapper.class);
    private final WorkflowNotifier notifier = mock(WorkflowNotifier.class);
    private final WorkflowService service = new WorkflowService(mapper, people, accounts, audit, notifier, TestPii.CIPHER);
    private final CurrentUser payer = new CurrentUser(5, "payer", 11L, null, null, null, List.of(Role.PAYER));
    private final CurrentUser finance = new CurrentUser(9, "finance", 12L, null, null, null, List.of(Role.FINANCE));
    private final CurrentUser admin = new CurrentUser(8, "admin", 13L, null, null, null, List.of(Role.ADMIN));
    private final CurrentUser employee = new CurrentUser(6, "employee", 14L, null, null, null, List.of(Role.EMPLOYEE));
    private final CurrentUser otherPayer = new CurrentUser(6, "other-payer", 14L, null, null, null, List.of(Role.PAYER));

    @Test
    void recordsPaymentFilesWithThePayment() {
        when(mapper.lockDocument(1L)).thenReturn(new Document(1, Kind.EXPENSE, 2, Status.AWAITING_PAYMENT, 1L, null));
        when(mapper.claimPayment(1L, 5L)).thenReturn(1);
        when(mapper.file(10L)).thenReturn(new FileRecord(10, 5, "key", "proof.pdf", "digest",
            "application/pdf", FileCategory.PAYMENT));
        when(mapper.documentsForFile(10L)).thenReturn(List.of());
        when(mapper.paymentDocumentsForFile(10L)).thenReturn(List.of());
        when(mapper.revision(1L)).thenReturn(revision("差旅报销"));

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
        when(mapper.revision(1L)).thenReturn(revision("采购笔记本"));

        service.pay(payer, 1L, new PaymentInput(LocalDate.now(), List.of(10L)));

        verify(mapper).addPaymentFile(1L, 10L);
        verify(mapper).changeStatus(1L, Status.PAID);
        verify(notifier).notify(2, 1, 5, "「采购笔记本」已登记付款");
    }

    @Test
    void correctsThePaymentDateAndFilesInPlace() {
        when(mapper.lockDocument(1L)).thenReturn(new Document(1, Kind.EXPENSE, 2, Status.PAID, 1L, null));
        when(mapper.payment(1L)).thenReturn(payment("2026-11-19"));
        when(mapper.paymentFiles(1L)).thenReturn(
            List.of(paymentFile(10, "旧回单.pdf")),
            List.of(paymentFile(11, "新回单.pdf")));
        when(mapper.file(11L)).thenReturn(paymentFile(11, "新回单.pdf"));
        when(mapper.documentsForFile(11L)).thenReturn(List.of());
        when(mapper.paymentDocumentsForFile(11L)).thenReturn(List.of());
        when(mapper.revision(1L)).thenReturn(revision("差旅报销"));

        service.correctPayment(payer, 1L, new PaymentInput(LocalDate.of(2026, 11, 22), List.of(11L)));

        var order = inOrder(mapper);
        order.verify(mapper).updatePaymentDate(1L, LocalDate.of(2026, 11, 22));
        order.verify(mapper).clearPaymentFiles(1L);
        order.verify(mapper).addPaymentFile(1L, 11L);
        verify(mapper).touch(1L, 5L);
        verify(mapper, never()).changeStatus(anyLong(), any());
        verify(mapper, never()).releasePayment(anyLong(), anyLong());
        verify(audit).record(5L, "PAYMENT_CORRECTION", 1L,
            "付款日期 2026-11-19 → 2026-11-22；移除：旧回单.pdf；新增：新回单.pdf");
        verify(notifier).notify(2, 1, 5, "「差旅报销」付款登记已更正");
    }

    @Test
    void correctsOnlyThePaymentDate() {
        when(mapper.lockDocument(1L)).thenReturn(new Document(1, Kind.EXPENSE, 2, Status.PAID, 1L, null));
        when(mapper.payment(1L)).thenReturn(payment("2026-11-19"));
        when(mapper.paymentFiles(1L)).thenReturn(List.of(paymentFile(10, "回单.pdf")));
        when(mapper.revision(1L)).thenReturn(revision("差旅报销"));

        service.correctPayment(payer, 1L, new PaymentInput(LocalDate.of(2026, 11, 22), List.of(10L)));

        verify(mapper).updatePaymentDate(1L, LocalDate.of(2026, 11, 22));
        verify(mapper, never()).clearPaymentFiles(anyLong());
        verify(mapper, never()).addPaymentFile(anyLong(), anyLong());
        verify(audit).record(5L, "PAYMENT_CORRECTION", 1L, "付款日期 2026-11-19 → 2026-11-22");
        verify(notifier).notify(2, 1, 5, "「差旅报销」付款登记已更正");
    }

    @Test
    void ignoresAnUnchangedPayment() {
        when(mapper.lockDocument(1L)).thenReturn(new Document(1, Kind.EXPENSE, 2, Status.PAID, 1L, null));
        when(mapper.payment(1L)).thenReturn(payment("2026-11-19"));
        when(mapper.paymentFiles(1L)).thenReturn(List.of(paymentFile(10, "回单.pdf")));

        service.correctPayment(payer, 1L, new PaymentInput(LocalDate.of(2026, 11, 19), List.of(10L)));

        verify(mapper, never()).updatePaymentDate(anyLong(), any());
        verify(mapper, never()).clearPaymentFiles(anyLong());
        verify(mapper, never()).addPaymentFile(anyLong(), anyLong());
        verify(audit, never()).record(anyLong(), any(), any(), any());
        verify(notifier, never()).notify(anyLong(), anyLong(), anyLong(), any());
    }

    @Test
    void rejectsCorrectionBeforePaymentIsRegistered() {
        when(mapper.lockDocument(1L)).thenReturn(new Document(1, Kind.EXPENSE, 2, Status.AWAITING_PAYMENT, 1L, null));

        var error = assertThrows(ResponseStatusException.class, () -> service.correctPayment(payer, 1L,
            new PaymentInput(LocalDate.of(2026, 11, 22), List.of(10L))));

        assertEquals(HttpStatus.CONFLICT, error.getStatusCode());
        assertEquals("该单据当前没有已登记的付款", error.getReason());
        verify(mapper, never()).clearPaymentFiles(anyLong());
    }

    @Test
    void rejectsCorrectionWithoutFiles() {
        when(mapper.lockDocument(1L)).thenReturn(new Document(1, Kind.EXPENSE, 2, Status.PAID, 1L, null));
        when(mapper.payment(1L)).thenReturn(payment("2026-11-19"));

        var error = assertThrows(IllegalArgumentException.class, () -> service.correctPayment(payer, 1L,
            new PaymentInput(LocalDate.of(2026, 11, 22), List.of())));

        assertEquals("请上传付款附件", error.getMessage());
        verify(mapper, never()).clearPaymentFiles(anyLong());
    }

    @Test
    void rejectsAFuturePaymentDate() {
        when(mapper.lockDocument(1L)).thenReturn(new Document(1, Kind.EXPENSE, 2, Status.PAID, 1L, null));
        when(mapper.payment(1L)).thenReturn(payment("2026-11-19"));

        var error = assertThrows(IllegalArgumentException.class, () -> service.correctPayment(payer, 1L,
            new PaymentInput(LocalDate.now().plusDays(1), List.of(10L))));

        assertEquals("付款日期不能晚于今天", error.getMessage());
        verify(mapper, never()).updatePaymentDate(anyLong(), any());
    }

    @Test
    void onlyTheOriginalPayerMayCorrectThePayment() {
        when(mapper.lockDocument(1L)).thenReturn(new Document(1, Kind.EXPENSE, 2, Status.PAID, 1L, null));
        when(mapper.payment(1L)).thenReturn(payment("2026-11-19"));

        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ResponseStatusException.class, () -> service.correctPayment(
            otherPayer, 1L, new PaymentInput(LocalDate.of(2026, 11, 22), List.of(10L)))).getStatusCode());
    }

    @Test
    void financeMayNotCorrectThePayment() {
        when(mapper.lockDocument(1L)).thenReturn(new Document(1, Kind.EXPENSE, 2, Status.PAID, 1L, null));

        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ResponseStatusException.class, () -> service.correctPayment(
            finance, 1L, new PaymentInput(LocalDate.of(2026, 11, 22), List.of(10L)))).getStatusCode());
    }

    @Test
    void financeAsksThePayerToCorrectTheAttachments() {
        when(mapper.lockDocument(1L)).thenReturn(new Document(1, Kind.EXPENSE, 2, Status.PAID, 1L, null));
        when(mapper.paymentPayer(1L)).thenReturn(5L);
        when(mapper.revision(1L)).thenReturn(revision("差旅报销"));

        service.requestPaymentFileFix(finance, 1L, "  附件传错了  ");

        verify(notifier).notify(5, 1, 9, "「差旅报销」付款登记被要求更正：附件传错了");
        verify(audit).record(9L, "PAYMENT_FIX_REQUEST", 1L, "附件传错了");
        verify(mapper, never()).changeStatus(anyLong(), any());
    }

    @Test
    void adminsMayAskForTheCorrectionToo() {
        when(mapper.lockDocument(1L)).thenReturn(new Document(1, Kind.EXPENSE, 2, Status.PAID, 1L, null));
        when(mapper.paymentPayer(1L)).thenReturn(5L);
        when(mapper.revision(1L)).thenReturn(revision("差旅报销"));

        service.requestPaymentFileFix(admin, 1L, "请重传");

        verify(notifier).notify(5, 1, 8, "「差旅报销」付款登记被要求更正：请重传");
    }

    @Test
    void rejectsFixRequestFromOtherRoles() {
        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ResponseStatusException.class,
            () -> service.requestPaymentFileFix(employee, 1L, "请重传")).getStatusCode());
        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ResponseStatusException.class,
            () -> service.requestPaymentFileFix(payer, 1L, "请重传")).getStatusCode());
        verify(notifier, never()).notify(anyLong(), anyLong(), anyLong(), any());
    }

    @Test
    void rejectsFixRequestWithoutReason() {
        var error = assertThrows(IllegalArgumentException.class,
            () -> service.requestPaymentFileFix(finance, 1L, "   "));

        assertEquals("请填写要求更正的原因", error.getMessage());
        verify(notifier, never()).notify(anyLong(), anyLong(), anyLong(), any());
    }

    @Test
    void rejectsFixRequestBeforePaymentIsRegistered() {
        when(mapper.lockDocument(1L)).thenReturn(new Document(1, Kind.EXPENSE, 2, Status.AWAITING_PAYMENT, 1L, null));

        var error = assertThrows(ResponseStatusException.class,
            () -> service.requestPaymentFileFix(finance, 1L, "请重传"));

        assertEquals(HttpStatus.CONFLICT, error.getStatusCode());
        assertEquals("该单据当前没有已登记的付款", error.getReason());
    }

    private static Revision revision(String title) {
        return new Revision(1, 1, title, "事由", null, null, null, null, null, new BigDecimal("12.30"),
            null, null, null, null);
    }

    private static FileRecord paymentFile(long id, String name) {
        return new FileRecord(id, 5, "key-" + id, name, "digest", "application/pdf", FileCategory.PAYMENT);
    }

    private static Payment payment(String paidOn) {
        return new Payment(LocalDate.parse(paidOn), 5L, "吕沁函", null);
    }
}
