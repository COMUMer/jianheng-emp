package com.jianheng.emp.approval;

import static com.jianheng.emp.approval.WorkflowData.*;

import com.jianheng.emp.security.AccountService.CurrentUser;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Set;
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
    private static final Set<String> PREVIEWABLE = Set.of(
        "image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf");

    private final WorkflowMapper mapper;
    private final WorkflowService workflow;
    private final Path root;

    AttachmentService(WorkflowMapper mapper, WorkflowService workflow, @Value("${EMP_UPLOAD_DIR:./data/uploads}") String directory) {
        this.mapper = mapper;
        this.workflow = workflow;
        this.root = Path.of(directory).toAbsolutePath().normalize();
    }

    @Transactional(rollbackFor = IOException.class)
    public Attachment upload(CurrentUser user, MultipartFile file, FileCategory category) throws IOException, NoSuchAlgorithmException {
        if (user.employeeId() == null) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        String name = file.getOriginalFilename();
        if (file.isEmpty() || name == null || name.isBlank() || name.length() > 255 || name.matches("(?s).*[\\p{Cntrl}/\\\\].*")) {
            throw new IllegalArgumentException("请选择有效的附件");
        }
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
        mapper.addFile(user.id(), key, name, HexFormat.of().formatHex(digest.digest()), contentType(file), category);
        return WorkflowService.attachment(mapper.file(mapper.insertedId()));
    }

    @Transactional
    public Attachment categorize(CurrentUser user, long id, FileCategory category) {
        if (category == null) throw new IllegalArgumentException("请选择附件类型");
        mapper.lockFile(id);
        var file = mapper.file(id);
        if (file == null || user.id() != file.uploadedBy()) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        if (!mapper.submittedDocumentsForFile(id).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "已提交的附件不能修改类型");
        }
        mapper.updateFileCategory(id, category);
        return WorkflowService.attachment(mapper.file(id));
    }

    public ResponseEntity<FileSystemResource> download(CurrentUser user, long id) {
        var file = readable(user, id);
        return response(file, path(file), false);
    }

    public ResponseEntity<FileSystemResource> preview(CurrentUser user, long id) {
        var file = readable(user, id);
        return response(file, path(file), PREVIEWABLE.contains(file.contentType()));
    }

    private FileRecord readable(CurrentUser user, long id) {
        var file = mapper.file(id);
        if (file == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        if (user.id() == file.uploadedBy()) return file;
        boolean submitted = mapper.submittedDocumentsForFile(id).stream()
            .anyMatch(document -> workflow.canRead(user, mapper.document(document)));
        boolean paid = mapper.paymentDocumentsForFile(id).stream()
            .anyMatch(document -> workflow.canRead(user, mapper.document(document)));
        if (!submitted && !paid) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return file;
    }

    private Path path(FileRecord file) {
        Path source = root.resolve(file.storageKey());
        if (!Files.isRegularFile(source)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return source;
    }

    private static ResponseEntity<FileSystemResource> response(FileRecord file, Path source, boolean inline) {
        var disposition = (inline ? ContentDisposition.inline() : ContentDisposition.attachment())
            .filename(file.originalName(), StandardCharsets.UTF_8);
        return ResponseEntity.ok()
            .contentType(inline ? MediaType.parseMediaType(file.contentType()) : MediaType.APPLICATION_OCTET_STREAM)
            .header(HttpHeaders.CONTENT_DISPOSITION, disposition.build().toString())
            .header(HttpHeaders.CACHE_CONTROL, "no-store")
            .header("X-Content-Type-Options", "nosniff")
            .body(new FileSystemResource(source));
    }

    private static String contentType(MultipartFile file) {
        String raw = file.getContentType();
        if (raw == null) return MediaType.APPLICATION_OCTET_STREAM_VALUE;
        String type = raw.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
        return PREVIEWABLE.contains(type) ? type : MediaType.APPLICATION_OCTET_STREAM_VALUE;
    }
}
