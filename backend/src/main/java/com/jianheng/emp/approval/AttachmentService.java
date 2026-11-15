package com.jianheng.emp.approval;

import static com.jianheng.emp.approval.WorkflowData.*;

import com.jianheng.emp.security.AccountService.CurrentUser;
import java.io.IOException;
import java.nio.file.*;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Service
class AttachmentService {
    private final WorkflowMapper mapper;
    private final WorkflowService workflow;
    private final Path root;

    AttachmentService(WorkflowMapper mapper, WorkflowService workflow, @Value("${EMP_UPLOAD_DIR:./data/uploads}") String directory) {
        this.mapper = mapper;
        this.workflow = workflow;
        this.root = Path.of(directory).toAbsolutePath().normalize();
    }

    @Transactional(rollbackFor = IOException.class)
    public Attachment upload(CurrentUser user, MultipartFile file, String invoice) throws IOException, NoSuchAlgorithmException {
        if (user.employeeId() == null) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        String name = file.getOriginalFilename();
        if (file.isEmpty() || name == null || name.isBlank() || name.length() > 255 || name.matches("(?s).*[\\p{Cntrl}/\\\\].*")) {
            throw new IllegalArgumentException("请选择有效的原始附件");
        }
        String invoiceKey = WorkflowRules.invoiceKey(invoice);
        Files.createDirectories(root);
        String key = UUID.randomUUID().toString();
        Path destination = root.resolve(key);
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCompletion(int status) {
                if (status != STATUS_COMMITTED) {
                    try { Files.deleteIfExists(destination); }
                    catch (IOException error) { org.slf4j.LoggerFactory.getLogger(AttachmentService.class).warn("Could not remove failed upload {}", key, error); }
                }
            }
        });
        var digest = MessageDigest.getInstance("SHA-256");
        try (var source = new DigestInputStream(file.getInputStream(), digest)) {
            Files.copy(source, destination);
        }
        mapper.addFile(user.id(), key, name, HexFormat.of().formatHex(digest.digest()), invoiceKey);
        return WorkflowService.attachment(mapper.file(mapper.insertedId()));
    }

    @Transactional
    public Attachment updateInvoice(CurrentUser user, long id, String invoice) {
        mapper.lockFile(id);
        var file = mapper.file(id);
        if (file == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        if (user.id() != file.uploadedBy()) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        if (mapper.documentStatusesForFile(id).stream().anyMatch(status -> status != Status.DRAFT && status != Status.RETURNED)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "附件已进入审批流程，不能修改票号");
        }
        mapper.changeInvoice(id, WorkflowRules.invoiceKey(invoice));
        return WorkflowService.attachment(mapper.file(id));
    }

    public ResponseEntity<FileSystemResource> download(CurrentUser user, long id) {
        var file = mapper.file(id);
        if (file == null || user.id() != file.uploadedBy() && mapper.submittedDocumentsForFile(id).stream()
            .noneMatch(document -> workflow.canRead(user, mapper.document(document)))) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        Path source = root.resolve(file.storageKey());
        if (!Files.isRegularFile(source)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_OCTET_STREAM)
            .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(file.originalName(), java.nio.charset.StandardCharsets.UTF_8).build().toString())
            .header(HttpHeaders.CACHE_CONTROL, "no-store").body(new FileSystemResource(source));
    }
}
