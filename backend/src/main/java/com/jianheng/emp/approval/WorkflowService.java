package com.jianheng.emp.approval;

import static com.jianheng.emp.approval.WorkflowData.*;
import static com.jianheng.emp.approval.WorkflowRules.*;

import com.jianheng.emp.people.PeopleMapper;
import com.jianheng.emp.security.AccountMapper;
import com.jianheng.emp.security.AccountService.CurrentUser;
import com.jianheng.emp.security.Role;
import com.jianheng.emp.security.pii.PiiCipher;
import com.jianheng.emp.web.AuditMapper;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
class WorkflowService {
    private final WorkflowMapper mapper;
    private final PeopleMapper people;
    private final AccountMapper accounts;
    private final AuditMapper audit;
    private final WorkflowNotifier notifier;
    private final PiiCipher cipher;

    WorkflowService(WorkflowMapper mapper, PeopleMapper people, AccountMapper accounts, AuditMapper audit,
                    WorkflowNotifier notifier, PiiCipher cipher) {
        this.mapper = mapper;
        this.people = people;
        this.accounts = accounts;
        this.audit = audit;
        this.notifier = notifier;
        this.cipher = cipher;
    }

    @Transactional
    public Detail saveDraft(CurrentUser actor, Long id, Draft draft) {
        if (actor.employeeId() == null) throw new IllegalArgumentException("请先绑定员工档案");
        var lines = draft.lines() == null ? List.<LineInput>of() : draft.lines();
        var fileIds = draft.fileIds() == null ? List.<Long>of() : draft.fileIds();
        if (draft.kind() != Kind.EXPENSE && !lines.isEmpty() || !List.of(Kind.EXPENSE, Kind.PURCHASE).contains(draft.kind()) && !fileIds.isEmpty()) {
            throw new IllegalArgumentException("表单类型不支持这些明细或附件");
        }
        BigDecimal total = draft.kind() == Kind.EXPENSE ? lines.stream().map(line -> money(line.amount()))
            .reduce(BigDecimal.ZERO, BigDecimal::add) : draft.amount() == null ? null : money(draft.amount());
        if (total != null && total.signum() > 0) money(total);
        Document document;
        if (id == null) {
            mapper.createDocument(draft.kind(), actor.id(), nextDocumentNo(draft.kind()));
            document = mapper.lockDocument(mapper.insertedId());
        } else {
            document = lock(id);
            if (actor.id() != document.ownerId()) throw denied();
            if (document.kind() != draft.kind()) throw new IllegalArgumentException("申请类型不可修改");
            requireEditable(document);
        }
        var clean = new Draft(draft.kind(), draft.title().strip(), text(draft.reason()), draft.leaveType(), draft.startsAt(),
            draft.endsAt(), text(draft.origin()), draft.destination(), draft.amount(), lines, fileIds);
        long revision;
        if (document.currentRevisionId() == null || document.status() == Status.RETURNED) {
            mapper.createRevision(document.id(), clean, total);
            revision = mapper.insertedId();
            mapper.pointToRevision(document.id(), revision);
            mapper.changeStatus(document.id(), Status.DRAFT);
        } else {
            revision = document.currentRevisionId();
            mapper.updateDraft(revision, clean, total);
            mapper.clearLines(revision);
            mapper.clearFiles(revision);
        }
        mapper.touch(document.id(), actor.id());
        for (var line : lines) {
            if (mapper.category(line.categoryId()) == null) throw new IllegalArgumentException("费用类别不存在");
            mapper.addLine(revision, line);
        }
        for (long fileId : fileIds.stream().distinct().sorted().toList()) {
            mapper.lockFile(fileId);
            var file = mapper.file(fileId);
            if (file == null || file.uploadedBy() != actor.id()) throw denied();
            if (mapper.documentsForFile(fileId).stream().anyMatch(other -> other != document.id())) {
                throw new IllegalArgumentException("附件已关联其他单据");
            }
            mapper.attach(revision, fileId);
        }
        return detail(actor, document.id());
    }

    @Transactional
    public Detail submit(CurrentUser actor, long id) {
        var document = lock(id);
        if (actor.id() != document.ownerId()) throw denied();
        if (document.status() != Status.DRAFT) throw conflict("请先保存草稿，再提交审批");
        var employee = actor.employeeId() == null ? null : people.employee(actor.employeeId());
        if (employee == null || employee.departedOn() != null) throw denied();
        var revision = mapper.revision(document.currentRevisionId());
        validateSubmission(document.kind(), revision);
        var template = mapper.latest(document.kind());
        if (template == null) throw new IllegalArgumentException("请联系管理员发布该类型的审批规则");
        var nodes = mapper.nodes(template.id()).stream().filter(node -> includesNode(revision.amount(), node.minimum())).toList();
        if (nodes.isEmpty()) throw new IllegalArgumentException("此单据没有匹配的审批节点");
        int ordinal = 0;
        for (var node : nodes) {
            Long primary = node.assignment() == Assignment.MANAGER ? people.managerAccount(employee.departmentId()) : node.accountId();
            boolean primaryOk = eligible(primary, actor.id(), node.assignment());
            boolean alternateOk = eligible(node.alternateId(), actor.id(), node.assignment());
            var pair = approverPair(primaryOk, alternateOk, primary, node.alternateId());
            if (pair == null) throw new IllegalArgumentException("找不到可处理「" + node.label() + "」的审批人");
            mapper.addTask(revision.id(), ++ordinal, node, pair[0], pair[1]);
        }
        mapper.freeze(revision.id(), employee.departmentId(), employee.departmentName(), template.id());
        mapper.changeStatus(id, Status.IN_REVIEW);
        mapper.event(revision.id(), null, actor.id(), "SUBMIT", "提交审批");
        mapper.touch(id, actor.id());
        activateNext(id, revision.id(), actor.id());
        return detail(actor, id);
    }

    @Transactional
    public void handle(CurrentUser actor, long id, long taskId, TaskInput input) {
        var document = lock(id);
        var task = mapper.task(taskId);
        if (task == null || !Objects.equals(document.currentRevisionId(), task.revisionId())
            || document.status() != Status.IN_REVIEW || task.status() != TaskStatus.ACTIVE) {
            throw conflict("这条待办已处理，请刷新列表");
        }
        String comment = text(input.comment());
        if (input.action() == Action.TRANSFER) {
            if (!actor.has(Role.ADMIN)) throw denied();
            if (comment.isBlank() || !eligible(input.assigneeId(), document.ownerId(), task.assignment()) || input.assigneeId() == task.assigneeId()) {
                throw new IllegalArgumentException("请选择有效的新审批人并填写转派原因");
            }
            var before = accounts.byId(task.assigneeId());
            var after = accounts.byId(input.assigneeId());
            comment = mapper.displayName(before.id()) + " → " + mapper.displayName(after.id()) + "，" + comment;
            mapper.reassign(taskId, after.id());
            String headline = subject(task.revisionId());
            notifier.notify(after.id(), id, actor.id(), headline + "已转派给你审批");
            notifier.notify(document.ownerId(), id, actor.id(), headline + "已转派给 " + mapper.displayName(after.id()));
            audit.record(actor.id(), "APPROVAL_TRANSFER", id, comment);
        } else {
            boolean candidate = actor.id() == task.assigneeId() || Objects.equals(actor.id(), task.alternateId());
            if (!candidate || !eligible(actor.id(), document.ownerId(), task.assignment())) throw denied();
            if (comment.isBlank()) throw new IllegalArgumentException(input.action() == Action.RETURN ? "请填写驳回原因" : "请填写审批意见");
            if (input.action() == Action.RETURN) {
                mapper.taskStatus(taskId, TaskStatus.RETURNED);
                mapper.closeWaiting(task.revisionId());
                mapper.changeStatus(id, Status.RETURNED);
                notifier.notify(document.ownerId(), id, actor.id(), subject(task.revisionId()) + "已驳回，请查看原因");
            } else {
                mapper.taskStatus(taskId, TaskStatus.APPROVED);
                if (mapper.next(task.revisionId()) == null) {
                    mapper.changeStatus(id, payable(document.kind()) ? Status.AWAITING_PAYMENT : Status.APPROVED);
                    String headline = subject(task.revisionId());
                    notifier.notify(document.ownerId(), id, actor.id(), headline + (payable(document.kind()) ? "已通过，等待付款" : "已通过"));
                    if (payable(document.kind())) notifyPayers(id, document.ownerId(), actor.id(), headline + "待你登记付款");
                } else activateNext(id, task.revisionId(), actor.id());
            }
        }
        mapper.event(task.revisionId(), taskId, actor.id(), input.action().name(), comment);
        mapper.touch(id, actor.id());
    }

    /**
     * 打开付款登记前抢占：同一单据只允许一个付款人在 5 分钟内登记，避免两人同时填写后重复付款。
     */
    /** 超期未处理的任务由系统自动驳回，并通知审批人与申请人。 */
    @Transactional
    public void returnOverdue(long taskId) {
        var task = mapper.task(taskId);
        if (task == null || task.status() != TaskStatus.ACTIVE || task.dueAt() == null
            || !task.dueAt().isBefore(LocalDateTime.now())) return;
        var revision = mapper.revision(task.revisionId());
        if (revision == null) return;
        var document = lock(revision.documentId());
        if (document.status() != Status.IN_REVIEW || !Objects.equals(document.currentRevisionId(), task.revisionId())) return;
        if (mapper.returnOverdueTask(taskId) == 0) return;
        mapper.closeWaiting(task.revisionId());
        mapper.changeStatus(document.id(), Status.RETURNED);
        long system = mapper.systemAccountId();
        mapper.event(task.revisionId(), taskId, system, Action.RETURN.name(), "审批超期，系统自动驳回");
        String headline = subject(task.revisionId());
        notifier.notify(task.assigneeId(), document.id(), system, headline + "审批超期，已自动驳回");
        if (task.alternateId() != null) notifier.notify(task.alternateId(), document.id(), system, headline + "审批超期，已自动驳回");
        notifier.notify(document.ownerId(), document.id(), system, headline + "因审批超期被系统驳回，请查看原因");
    }
    @Transactional
    public void claimPayment(CurrentUser actor, long id) {
        if (!actor.has(Role.PAYER)) throw denied();
        var document = lock(id);
        if (!payable(document.kind()) || document.status() != Status.AWAITING_PAYMENT) throw conflict("该单据当前不可登记付款");
        if (mapper.claimPayment(id, actor.id()) == 0) throw claimedByOther(id);
    }

    /** 关闭付款弹窗时释放抢占，让其他付款人立即接手。 */
    @Transactional
    public void releasePayment(CurrentUser actor, long id) {
        if (!actor.has(Role.PAYER)) throw denied();
        mapper.releasePayment(id, actor.id());
    }

    @Transactional
    public void pay(CurrentUser actor, long id, PaymentInput input) {
        if (!actor.has(Role.PAYER)) throw denied();
        var document = lock(id);
        if (!payable(document.kind()) || document.status() != Status.AWAITING_PAYMENT) throw conflict("该单据当前不可登记付款");
        if (mapper.claimPayment(id, actor.id()) == 0) throw claimedByOther(id);
        if (input.paidOn().isAfter(LocalDate.now())) throw new IllegalArgumentException("付款日期不能晚于今天");
        if (input.fileIds() == null || input.fileIds().isEmpty()) throw new IllegalArgumentException("请上传付款附件");
        mapper.addPayment(id, new PaymentInput(input.paidOn(), input.fileIds()), actor.id());
        var fileIds = input.fileIds();
        for (long fileId : fileIds.stream().distinct().sorted().toList()) {
            mapper.lockFile(fileId);
            var file = mapper.file(fileId);
            if (file == null || file.uploadedBy() != actor.id()) throw denied();
            if (file.category() != FileCategory.PAYMENT) throw new IllegalArgumentException("付款附件必须为付款记录");
            if (!mapper.documentsForFile(fileId).isEmpty() || !mapper.paymentDocumentsForFile(fileId).isEmpty()) {
                throw new IllegalArgumentException("附件已被其他记录使用");
            }
            mapper.addPaymentFile(id, fileId);
        }
        mapper.changeStatus(id, Status.PAID);
        mapper.releasePayment(id, actor.id());
        mapper.touch(id, actor.id());
        notifier.notify(document.ownerId(), id, actor.id(), subject(document.currentRevisionId()) + "已登记付款");
        audit.record(actor.id(), "PAYMENT_RECORD", id, "已登记付款");
    }

    @Transactional
    public TemplateView publish(CurrentUser actor, TemplateInput input) {
        if (!actor.has(Role.ADMIN)) throw denied();
        if (input.nodes().getFirst().minimum() != null || input.kind() == Kind.EXPENSE && input.nodes().stream()
                .noneMatch(node -> node.assignment() == Assignment.FINANCE && node.minimum() == null)) {
            throw new IllegalArgumentException("首节点必须执行，报销必须包含必经的财务审核节点");
        }
        for (var node : input.nodes()) {
            if (node.assignment() != Assignment.MANAGER && !eligible(node.accountId(), 0, node.assignment())
                || node.alternateId() != null && !eligible(node.alternateId(), 0, node.assignment())) {
                throw new IllegalArgumentException("「" + node.label() + "」需要符合权限的在职审批人");
            }
            if (node.minimum() != null) {
                if (input.kind() != Kind.PURCHASE && input.kind() != Kind.EXPENSE) throw new IllegalArgumentException("该类型不支持金额门槛");
                money(node.minimum());
            }
        }
        mapper.addTemplate(input.kind(), actor.id());
        long id = mapper.insertedId();
        int ordinal = 0;
        for (var node : input.nodes()) mapper.addNode(id, ++ordinal, node);
        audit.record(actor.id(), "APPROVAL_PUBLISH", id, input.kind().name());
        return new TemplateView(mapper.template(id), mapper.nodes(id));
    }

    @Transactional(readOnly = true)
    public Detail detail(CurrentUser actor, long id) {
        var document = mapper.document(id);
        if (!canRead(actor, document)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        var revisions = mapper.revisions(id).stream()
            .filter(revision -> revision.submittedAt() != null || actor.id() == document.ownerId())
            .map(revision -> new RevisionView(revision, mapper.lines(revision.id()), mapper.files(revision.id()).stream()
                .map(WorkflowService::attachment).toList(), mapper.tasks(revision.id()), mapper.events(revision.id()))).toList();
        var summary = mapper.summary(id);
        if (!revisions.isEmpty() && revisions.getFirst().revision().id() != document.currentRevisionId()) {
            var snapshot = revisions.getFirst().revision();
            summary = new Summary(id, summary.documentNo(), document.kind(), Status.RETURNED, snapshot.title(), summary.applicant(), summary.applicantEmployeeId(), summary.applicantAvatarKey(),
                snapshot.departmentName(), snapshot.amount(), summary.createdAt(), summary.updatedAt(), summary.operator(), summary.operatorEmployeeId(), summary.operatorAvatarKey(),
                snapshot.submittedAt(), null, null, null, null, null, null, null, null, null);
        }
        var payment = mapper.payment(id);
        var paymentFiles = payment == null ? List.<Attachment>of() : mapper.paymentFiles(id).stream()
            .map(WorkflowService::attachment).toList();
        return new Detail(summary, document.ownerId(), revisions, payment, paymentFiles, payeeAccount(document));
    }

    /** 报销详情里的收款账户：库中银行卡号是密文，只对能看详情的人还原。 */
    private PayeeAccount payeeAccount(Document document) {
        if (document.kind() != Kind.EXPENSE) return null;
        var payee = mapper.payeeAccount(document.ownerId());
        if (payee == null) return null;
        return new PayeeAccount(payee.name(), payee.bankName(),
            cipher.decrypt(payee.bankCard(), "employee.bank_card"), payee.cnapsCode());
    }

    boolean canRead(CurrentUser actor, Document document) {
        if (document == null) return false;
        if (document.ownerId() == actor.id()) return true;
        return mapper.involved(document.id(), actor.id()) || mapper.hasSubmittedRevision(document.id()) && (
            actor.has(Role.ADMIN) || payable(document.kind()) && (actor.has(Role.FINANCE) || actor.has(Role.PAYER)));
    }

    static Attachment attachment(FileRecord file) {
        return new Attachment(file.id(), file.originalName(), file.digest(), file.contentType(), file.category());
    }

    /** 业务单号：类型前缀 + 年月 + 当月顺序号，计数器表原子自增，保证并发唯一。 */
    private String nextDocumentNo(Kind kind) {
        var period = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMM"));
        mapper.bumpNumber(kind.name(), period);
        long seq = mapper.lastNumber();
        String prefix = switch (kind) {
            case LEAVE -> "QJ";
            case TRIP -> "CC";
            case PURCHASE -> "CG";
            case EXPENSE -> "BX";
        };
        return prefix + period + String.format("%04d", seq);
    }
    private Document lock(long id) {
        var document = mapper.lockDocument(id);
        if (document == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return document;
    }

    private boolean eligible(Long accountId, long owner, Assignment assignment) {
        if (accountId == null || accountId == owner) return false;
        var account = accounts.byId(accountId);
        if (account == null || !account.active() || account.employeeId() == null) return false;
        var employee = people.employee(account.employeeId());
        return employee != null && canApprove(assignment, employee.departedOn(), accounts.roles(accountId));
    }

    private void activateNext(long document, long revision, long actor) {
        var task = mapper.next(revision);
        mapper.activate(task.id(), LocalDateTime.now().plusHours(task.dueHours()));
        String headline = subject(revision);
        notifier.notify(task.assigneeId(), document, actor, headline + "待你审批");
        if (task.alternateId() != null && !Objects.equals(task.alternateId(), task.assigneeId())) {
            notifier.notify(task.alternateId(), document, actor, headline + "待你审批");
        }
    }

    /** 站内消息统一以单据标题开头，不点开也能判断是哪一张单。 */
    private String subject(long revision) { return "「" + mapper.revision(revision).title() + "」"; }

    /** 进待付款时通知全部在职付款账号：这张单会出现在他们的「我的待办」里。 */
    private void notifyPayers(long document, long owner, long actor, String message) {
        for (long payer : accounts.activeIdsWithRole(Role.PAYER)) {
            if (payer != owner) notifier.notify(payer, document, actor, message);
        }
    }

    private void validateSubmission(Kind kind, Revision revision) {
        if (revision.reason().isBlank()) throw new IllegalArgumentException("请填写申请事由");
        var files = mapper.files(revision.id());
        if (files.stream().anyMatch(file -> file.category() == null)) throw new IllegalArgumentException("请为每个附件选择类型");
        switch (kind) {
            case LEAVE, TRIP -> {
                if (revision.startsAt() == null || revision.endsAt() == null || revision.endsAt().isBefore(revision.startsAt())) {
                    throw new IllegalArgumentException("结束时间要晚于开始时间");
                }
                if (kind == Kind.LEAVE && text(revision.leaveType()).isBlank()) throw new IllegalArgumentException("请选择请假类型");
                if (kind == Kind.TRIP && text(revision.origin()).isBlank()) throw new IllegalArgumentException("请填写出发地点");
                if (kind == Kind.TRIP && text(revision.destination()).isBlank()) throw new IllegalArgumentException("请填写出差地点");
            }
            case PURCHASE -> {
                money(revision.amount());
                requirePurchaseAttachment(files.stream().map(FileRecord::category).toList());
            }
            case EXPENSE -> {
                money(revision.amount());
                requireExpenseAttachments(files.stream().map(FileRecord::category).toList());
                if (mapper.inactiveCategoryLines(revision.id()) > 0) {
                    throw new IllegalArgumentException("费用类别已停用，请重新选择");
                }
            }
        }
    }

    private static void requireEditable(Document document) {
        if (document.status() != Status.DRAFT && document.status() != Status.RETURNED) throw conflict("当前状态不可编辑");
    }

    private static String text(String value) { return value == null ? "" : value.strip(); }
    private static ResponseStatusException denied() { return new ResponseStatusException(HttpStatus.FORBIDDEN); }
    private ResponseStatusException claimedByOther(long id) {
        var holder = mapper.paymentClaimBy(id);
        return conflict(holder == null ? "该单据正在被登记付款"
            : "该单据正由 " + mapper.displayName(holder) + " 登记付款");
    }

    private static boolean payable(Kind kind) { return kind == Kind.EXPENSE || kind == Kind.PURCHASE; }
    private static ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT, message); }
}