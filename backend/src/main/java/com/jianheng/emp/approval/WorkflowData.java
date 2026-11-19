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
    public enum FileCategory { INVOICE, PAYMENT, OTHER }

    public record LineInput(@Positive long categoryId, @NotBlank @Size(max=200) String description,
                            @NotNull LocalDate occurredOn, @NotNull BigDecimal amount) {}
    public record Draft(@NotNull Kind kind, @NotBlank @Size(max=160) String title, @Size(max=2000) String reason,
                        @Size(max=40) String leaveType, LocalDate startsAt, LocalDate endsAt,
                        @Size(max=160) String origin, @Size(max=160) String destination, BigDecimal amount,
                        @Size(max=100) List<@Valid @NotNull LineInput> lines, @Size(max=30) List<@NotNull Long> fileIds) {}
    public record Document(long id, Kind kind, long ownerId, Status status, Long currentRevisionId, LocalDateTime createdAt) {}
    public record Revision(long id, long documentId, String title, String reason, String leaveType, LocalDate startsAt,
                           LocalDate endsAt, String destination, String origin, BigDecimal amount, Long departmentId,
                           String departmentName, Long templateId, LocalDateTime submittedAt) {}
    public record Line(long id, long categoryId, String category, String description, LocalDate occurredOn, BigDecimal amount) {}
    public record FileRecord(long id, long uploadedBy, String storageKey, String originalName, String digest,
                             String contentType, FileCategory category) {}
    public record Attachment(long id, String originalName, String digest, String contentType, FileCategory category) {}
    public record FileCategoryInput(@NotNull FileCategory category) {}
    public record Task(long id, long revisionId, int ordinal, String label, long assigneeId, Long alternateId, Assignment assignment,
                       TaskStatus status, int dueHours, LocalDateTime dueAt) {}
    public record TaskView(long id, long revisionId, int ordinal, String label, long assigneeId, String assignee, String assigneeAvatarKey,
                           Long alternateId, String alternate, String alternateAvatarKey, Assignment assignment, TaskStatus status,
                           int dueHours, LocalDateTime dueAt) {}
    public record Event(long id, Long taskId, String actor, String actorAvatarKey, String action, String comment, LocalDateTime occurredAt) {}
    public record Template(long id, Kind kind, LocalDateTime publishedAt, LocalDateTime createdAt, LocalDateTime updatedAt,
                           String operator) {}
    public record Node(String label, Assignment assignment, Long accountId, Long alternateId, BigDecimal minimum, int dueHours) {}
    public record NodeInput(@NotBlank @Size(max=80) String label, @NotNull Assignment assignment, Long accountId,
                            Long alternateId, BigDecimal minimum, @Min(1) @Max(8760) int dueHours) {}
    public record TemplateInput(@NotNull Kind kind, @NotEmpty @Size(max=12) List<@Valid @NotNull NodeInput> nodes) {}
    public record TemplateView(Template template, List<Node> nodes) {}
    public record TaskInput(@NotNull Action action, @Size(max=800) String comment, Long assigneeId) {}
    public record PaymentInput(@NotNull LocalDate paidOn, @NotEmpty @Size(max=30) List<@NotNull Long> fileIds) {}
    public record Payment(LocalDate paidOn, String payer, String payerAvatarKey) {}
    public record Category(long id, String name, boolean active, LocalDateTime createdAt, LocalDateTime updatedAt, String operator) {}
    public record Summary(long id, String documentNo, Kind kind, Status status, String title, String applicant, Long applicantEmployeeId, String applicantAvatarKey,
                          String departmentName, BigDecimal amount, LocalDateTime createdAt, LocalDateTime updatedAt, String operator, Long operatorEmployeeId, String operatorAvatarKey,
                          LocalDateTime submittedAt, Long taskId,
                          String assignee, Long assigneeEmployeeId, String assigneeAvatarKey, String alternate, Long alternateEmployeeId, String alternateAvatarKey,
                          LocalDateTime dueAt, LocalDate paidOn) {}
    public record Handled(long id, long documentId, String documentNo, Kind kind, Status status, String title, String applicant,
                          Long applicantEmployeeId, String applicantAvatarKey, String action, String comment, LocalDateTime handledAt,
                          LocalDateTime createdAt, LocalDateTime updatedAt, String operator, Long operatorEmployeeId,
                          String operatorAvatarKey) {}
    public record RevisionView(Revision revision, List<Line> lines, List<Attachment> files, List<TaskView> tasks, List<Event> events) {}
    public record Detail(Summary summary, long ownerId, List<RevisionView> revisions, Payment payment,
                         List<Attachment> paymentFiles, PayeeAccount payeeAccount) {}
    public record PayeeAccount(String name, String bankName, String bankCard, String cnapsCode) {}
    public record Notice(long id, long documentId, String message, LocalDateTime readAt, LocalDateTime createdAt,
                         String actor, Long actorEmployeeId, String actorAvatarKey) {}
    public record Unread(int unread) {}
    public record InboxCount(int pending) {}
    public record Filter(Status status, Long departmentId, LocalDate from, LocalDate to) {}
}
