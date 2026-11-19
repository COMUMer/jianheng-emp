package com.jianheng.emp.approval;

import static com.jianheng.emp.approval.WorkflowData.*;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.*;

import com.jianheng.emp.security.AccountService.CurrentUser;
import com.jianheng.emp.security.Role;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

class AttachmentServiceTest {
    private final WorkflowMapper mapper = mock(WorkflowMapper.class);
    private final WorkflowService workflow = mock(WorkflowService.class);
    private final CurrentUser owner = new CurrentUser(7, "owner", 1L, null, null, null, List.of(Role.EMPLOYEE));

    @TempDir Path directory;

    @Test
    void storesUploadedFileWithCategoryAndContentType() throws Exception {
        when(mapper.insertedId()).thenReturn(5L);
        when(mapper.file(5L)).thenReturn(new FileRecord(5, 7, "key", "invoice.pdf", "digest",
            "application/pdf", FileCategory.INVOICE));
        var upload = new MockMultipartFile("file", "invoice.pdf", "application/pdf", "%PDF-1.4".getBytes());

        Attachment saved;
        TransactionSynchronizationManager.initSynchronization();
        try { saved = service().upload(owner, upload, FileCategory.INVOICE); }
        finally { TransactionSynchronizationManager.clearSynchronization(); }

        assertEquals(FileCategory.INVOICE, saved.category());
        assertEquals("application/pdf", saved.contentType());
        var key = ArgumentCaptor.forClass(String.class);
        var digest = ArgumentCaptor.forClass(String.class);
        verify(mapper).addFile(eq(7L), key.capture(), eq("invoice.pdf"), digest.capture(),
            eq("application/pdf"), eq(FileCategory.INVOICE));
        assertTrue(Files.isRegularFile(directory.resolve(key.getValue())));
        assertEquals(64, digest.getValue().length());
    }

    @Test
    void storesUnsupportedTypesAsOctetStream() throws Exception {
        when(mapper.insertedId()).thenReturn(5L);
        when(mapper.file(5L)).thenReturn(new FileRecord(5, 7, "key", "contract.docx", "digest",
            "application/octet-stream", FileCategory.OTHER));
        var upload = new MockMultipartFile("file", "contract.docx",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document", new byte[] { 1 });

        TransactionSynchronizationManager.initSynchronization();
        try { service().upload(owner, upload, FileCategory.OTHER); }
        finally { TransactionSynchronizationManager.clearSynchronization(); }

        verify(mapper).addFile(eq(7L), anyString(), eq("contract.docx"), anyString(),
            eq("application/octet-stream"), eq(FileCategory.OTHER));
    }

    @Test
    void previewsPdfInlineAndDownloadsAsAttachment() throws Exception {
        Files.write(directory.resolve("key"), new byte[] { 1, 2, 3 });
        when(mapper.file(5)).thenReturn(new FileRecord(5, 7, "key", "invoice.pdf", "digest",
            "application/pdf", FileCategory.INVOICE));

        var preview = service().preview(owner, 5);
        assertEquals(MediaType.APPLICATION_PDF, preview.getHeaders().getContentType());
        assertTrue(preview.getHeaders().getContentDisposition().isInline());
        assertEquals("nosniff", preview.getHeaders().getFirst("X-Content-Type-Options"));

        var download = service().download(owner, 5);
        assertEquals(MediaType.APPLICATION_OCTET_STREAM, download.getHeaders().getContentType());
        assertTrue(download.getHeaders().getContentDisposition().isAttachment());
    }

    @Test
    void showsPaymentFilesToTheDocumentOwner() throws Exception {
        Files.write(directory.resolve("key"), new byte[] { 1, 2, 3 });
        when(mapper.file(5)).thenReturn(new FileRecord(5, 9, "key", "proof.pdf", "digest",
            "application/pdf", FileCategory.PAYMENT));
        when(mapper.submittedDocumentsForFile(5)).thenReturn(List.of());
        when(mapper.paymentDocumentsForFile(5)).thenReturn(List.of(1L));
        var document = new Document(1, Kind.EXPENSE, 7, Status.PAID, 1L, null);
        when(mapper.document(1L)).thenReturn(document);
        when(workflow.canRead(owner, document)).thenReturn(true);

        var preview = service().preview(owner, 5);

        assertEquals(MediaType.APPLICATION_PDF, preview.getHeaders().getContentType());
    }

    @Test
    void hidesAttachmentsFromUnrelatedAccounts() {
        when(mapper.file(5)).thenReturn(new FileRecord(5, 9, "key", "invoice.pdf", "digest",
            "application/pdf", FileCategory.INVOICE));
        when(mapper.submittedDocumentsForFile(5)).thenReturn(List.of());

        var error = assertThrows(ResponseStatusException.class, () -> service().preview(owner, 5));

        assertEquals(HttpStatus.NOT_FOUND, error.getStatusCode());
    }

    @Test
    void rejectsUploadsWithoutAnEmployee() {
        var user = new CurrentUser(7, "owner", null, null, null, null, List.of(Role.EMPLOYEE));
        var upload = new MockMultipartFile("file", "a.pdf", "application/pdf", new byte[] { 1 });

        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ResponseStatusException.class,
            () -> service().upload(user, upload, FileCategory.INVOICE)).getStatusCode());
    }

    @Test
    void allowsUploadsBeforeTheCategoryIsChosen() throws Exception {
        when(mapper.insertedId()).thenReturn(5L);
        when(mapper.file(5L)).thenReturn(new FileRecord(5, 7, "key", "pending.pdf", "digest",
            "application/pdf", null));
        var upload = new MockMultipartFile("file", "pending.pdf", "application/pdf", "%PDF-1.4".getBytes());

        Attachment saved;
        TransactionSynchronizationManager.initSynchronization();
        try { saved = service().upload(owner, upload, null); }
        finally { TransactionSynchronizationManager.clearSynchronization(); }

        assertNull(saved.category());
        verify(mapper).addFile(eq(7L), anyString(), eq("pending.pdf"), anyString(),
            eq("application/pdf"), isNull());
    }

    @Test
    void categorizesAnOwnedDraftFile() {
        when(mapper.file(5L)).thenReturn(
            new FileRecord(5, 7, "key", "invoice.pdf", "digest", "application/pdf", null),
            new FileRecord(5, 7, "key", "invoice.pdf", "digest", "application/pdf", FileCategory.INVOICE));
        when(mapper.submittedDocumentsForFile(5L)).thenReturn(List.of());

        var saved = service().categorize(owner, 5, FileCategory.INVOICE);

        assertEquals(FileCategory.INVOICE, saved.category());
        verify(mapper).updateFileCategory(5, FileCategory.INVOICE);
    }

    @Test
    void refusesToCategorizeASubmittedFile() {
        when(mapper.file(5L)).thenReturn(new FileRecord(5, 7, "key", "invoice.pdf", "digest",
            "application/pdf", null));
        when(mapper.submittedDocumentsForFile(5L)).thenReturn(List.of(1L));

        var error = assertThrows(ResponseStatusException.class,
            () -> service().categorize(owner, 5, FileCategory.INVOICE));

        assertEquals(HttpStatus.CONFLICT, error.getStatusCode());
        verify(mapper, never()).updateFileCategory(anyLong(), any());
    }

    private AttachmentService service() { return new AttachmentService(mapper, workflow, directory.toString()); }
}
