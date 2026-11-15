package com.jianheng.emp.approval;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.List;

public final class WorkflowData {
    public enum Kind { LEAVE, TRIP, PURCHASE, EXPENSE }
    public enum Status { DRAFT, IN_REVIEW, RETURNED, APPROVED, AWAITING_PAYMENT, PAID }
    public enum Assignment { MANAGER, FINANCE, NAMED }
    public enum TaskStatus { WAITING, ACTIVE, APPROVED, RETURNED, CLOSED }
    public enum Action { APPROVE, RETURN, TRANSFER }

    public record LineInput(@Positive long categoryId, @NotBlank @Size(max=200) String description,
                            @NotNull LocalDate occurredOn, @NotNull BigDecimal amount) {}
    public record Draft(@NotNull Kind kind, @NotBlank @Size(max=160) String title, @Size(max=2000) String reason,
                        @Size(max=40) String leaveType, LocalDateTime startsAt, LocalDateTime endsAt,
                        @Size(max=160) String destination, BigDecimal amount,
                        @Size(max=100) List<@Valid @NotNull LineInput> lines, @Size(max=30) List<@NotNull Long> fileIds) {}
    public record Document(long id, Kind kind, long ownerId, Status status, Long currentRevisionId, LocalDateTime createdAt) {}
    public record Revision(long id, long documentId, String title, String reason, String leaveType, LocalDateTime startsAt,
                           LocalDateTime endsAt, String destination, BigDecimal amount, Long departmentId,
                           String departmentName, Long templateId, LocalDateTime submittedAt) {}
    public record Line(long id, long categoryId, String category, String description, LocalDate occurredOn, BigDecimal amount) {}
    public record FileRecord(long id, long uploadedBy, String storageKey, String originalName, String digest, String invoiceKey) {}
    public record Attachment(long id, String originalName, String digest, String invoiceKey) {}
    public record AttachmentInvoice(String invoice) {}
    public record Task(long id, long revisionId, int ordinal, String label, long assigneeId, Assignment assignment,
                       TaskStatus status, int dueHours, LocalDateTime dueAt) {}
    public record Event(long id, Long taskId, String actor, String actorAvatarKey, String action, String comment, LocalDateTime occurredAt) {}
    public record Template(long id, Kind kind, LocalDateTime publishedAt, LocalDateTime createdAt, LocalDateTime updatedAt,
                           String operator) {}
    public record Node(String label, Assignment assignment, Long accountId, Long alternateId, BigDecimal minimum, int dueHours) {}
    public record NodeInput(@NotBlank @Size(max=80) String label, @NotNull Assignment assignment, Long accountId,
                            Long alternateId, BigDecimal minimum, @Min(1) @Max(8760) int dueHours) {}
    public record TemplateInput(@NotNull Kind kind, @NotEmpty @Size(max=12) List<@Valid @NotNull NodeInput> nodes) {}
    public record TemplateView(Template template, List<Node> nodes) {}
    public record TaskInput(@NotNull Action action, @Size(max=800) String comment, Long assigneeId) {}
    public record PaymentInput(@NotNull LocalDate paidOn, @NotBlank @Size(max=160) String reference) {}
    public record Payment(LocalDate paidOn, String reference, String payer, String payerAvatarKey) {}
    public record Category(long id, String name, LocalDateTime createdAt, LocalDateTime updatedAt, String operator) {}
    public record Summary(long id, Kind kind, Status status, String title, String applicant, String applicantAvatarKey,
                          String departmentName, BigDecimal amount, LocalDateTime createdAt, LocalDateTime updatedAt, String operator,
                          LocalDateTime submittedAt, Long taskId,
                          String assignee, String assigneeAvatarKey, LocalDateTime dueAt, LocalDate paidOn, String reference) {}
    public record RevisionView(Revision revision, List<Line> lines, List<Attachment> files, List<Task> tasks, List<Event> events) {}
    public record Detail(Summary summary, long ownerId, List<RevisionView> revisions, Payment payment) {}
    public record Notice(long id, long documentId, String message, LocalDateTime readAt, LocalDateTime createdAt) {}
    public record Filter(Status status, Long departmentId, LocalDate from, LocalDate to) {}
}
