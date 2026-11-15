package com.jianheng.emp.approval;

import static com.jianheng.emp.approval.WorkflowData.*;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.*;

import com.jianheng.emp.security.AccountService.CurrentUser;
import com.jianheng.emp.security.Role;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.InOrder;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class AttachmentServiceTest {
    private final WorkflowMapper mapper = mock(WorkflowMapper.class);
    private final WorkflowService workflow = mock(WorkflowService.class);
    private final CurrentUser owner = new CurrentUser(7, "owner", 1L, null, null, null, List.of(Role.EMPLOYEE));
    private final FileRecord file = new FileRecord(5, 7, "key", "invoice.png", "digest", null);

    @TempDir Path directory;

    @Test
    void rejectsMissingAttachment() {
        var error = assertThrows(ResponseStatusException.class, () -> service().updateInvoice(owner, 5, "A1"));
        assertEquals(HttpStatus.NOT_FOUND, error.getStatusCode());
        verify(mapper, never()).changeInvoice(anyLong(), any());
    }

    @Test
    void rejectsAttachmentOwnedByAnotherAccount() {
        when(mapper.file(5)).thenReturn(new FileRecord(5, 9, "key", "invoice.png", "digest", null));
        var error = assertThrows(ResponseStatusException.class, () -> service().updateInvoice(owner, 5, "A1"));
        assertEquals(HttpStatus.FORBIDDEN, error.getStatusCode());
        verify(mapper, never()).changeInvoice(anyLong(), any());
    }

    @Test
    void rejectsAttachmentInReview() {
        when(mapper.file(5)).thenReturn(file);
        when(mapper.documentStatusesForFile(5)).thenReturn(List.of(Status.IN_REVIEW));
        var error = assertThrows(ResponseStatusException.class, () -> service().updateInvoice(owner, 5, "A1"));
        assertEquals(HttpStatus.CONFLICT, error.getStatusCode());
        assertEquals("附件已进入审批流程，不能修改票号", error.getReason());
        verify(mapper, never()).changeInvoice(anyLong(), any());
    }

    @Test
    void rejectsAttachmentAlreadyPaid() {
        when(mapper.file(5)).thenReturn(file);
        when(mapper.documentStatusesForFile(5)).thenReturn(List.of(Status.PAID));
        var error = assertThrows(ResponseStatusException.class, () -> service().updateInvoice(owner, 5, "A1"));
        assertEquals(HttpStatus.CONFLICT, error.getStatusCode());
        verify(mapper, never()).changeInvoice(anyLong(), any());
    }

    @Test
    void allowsInvoiceCorrectionAfterReturn() {
        var updated = new FileRecord(5, 7, "key", "invoice.png", "digest", "NEW-1");
        when(mapper.file(5)).thenReturn(file, updated);
        when(mapper.documentStatusesForFile(5)).thenReturn(List.of(Status.RETURNED));

        var attachment = service().updateInvoice(owner, 5, " new-1 ");

        assertEquals("NEW-1", attachment.invoiceKey());
        verify(mapper).changeInvoice(5, "NEW-1");
    }

    @Test
    void storesNormalizedInvoiceWhileFileIsStillDraft() {
        var updated = new FileRecord(5, 7, "key", "invoice.png", "digest", "ABC1234");
        when(mapper.file(5)).thenReturn(file, updated);

        var attachment = service().updateInvoice(owner, 5, " abC 1234 ");

        assertEquals("ABC1234", attachment.invoiceKey());
        InOrder order = inOrder(mapper);
        order.verify(mapper).lockFile(5);
        order.verify(mapper).changeInvoice(5, "ABC1234");
    }

    @Test
    void clearsInvoiceWhenInputIsBlank() {
        when(mapper.file(5)).thenReturn(file, new FileRecord(5, 7, "key", "invoice.png", "digest", null));

        var attachment = service().updateInvoice(owner, 5, "   ");

        assertNull(attachment.invoiceKey());
        verify(mapper).changeInvoice(5, null);
    }

    @Test
    void rejectsOverlongInvoice() {
        when(mapper.file(5)).thenReturn(file);

        assertThrows(IllegalArgumentException.class, () -> service().updateInvoice(owner, 5, "A".repeat(101)));
        verify(mapper, never()).changeInvoice(anyLong(), any());
    }

    private AttachmentService service() { return new AttachmentService(mapper, workflow, directory.toString()); }
}