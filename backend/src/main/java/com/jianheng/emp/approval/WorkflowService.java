package com.jianheng.emp.approval;

import static com.jianheng.emp.approval.WorkflowData.*;
import static com.jianheng.emp.approval.WorkflowRules.*;

import com.jianheng.emp.people.PeopleMapper;
import com.jianheng.emp.security.AccountMapper;
import com.jianheng.emp.security.AccountService.CurrentUser;
import com.jianheng.emp.security.Role;
import com.jianheng.emp.web.AuditMapper;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import org.springframework.dao.DuplicateKeyException;
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

    WorkflowService(WorkflowMapper mapper, PeopleMapper people, AccountMapper accounts, AuditMapper audit) {
        this.mapper = mapper;
        this.people = people;
        this.accounts = accounts;
        this.audit = audit;
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
            mapper.createDocument(draft.kind(), actor.id());
            document = mapper.lockDocument(mapper.insertedId());
        } else {
            document = lock(id);
            if (actor.id() != document.ownerId()) throw denied();
            if (document.kind() != draft.kind()) throw new IllegalArgumentException("申请类型不可修改");
            requireEditable(document);
        }
        var clean = new Draft(draft.kind(), draft.title().strip(), text(draft.reason()), draft.leaveType(), draft.startsAt(),
            draft.endsAt(), draft.destination(), draft.amount(), lines, fileIds);
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
        if (document.kind() == Kind.EXPENSE) {
            var keys = new ArrayList<String>();
            for (var file : mapper.files(revision.id())) {
                mapper.lockFile(file.id());
                var invoiceKey = mapper.file(file.id()).invoiceKey();
                if (invoiceKey != null) keys.add(invoiceKey);
            }
            keys.sort(Comparator.naturalOrder());
            try {
                for (String key : keys) mapper.reserve(key, id);
            } catch (DuplicateKeyException error) {
                throw conflict("同一票号已被报销单占用，请核对原始票据");
            }
        }
        int ordinal = 0;
        for (var node : nodes) {
            Long assignee = node.assignment() == Assignment.MANAGER ? people.managerAccount(employee.departmentId()) : node.accountId();
            if (!eligible(assignee, actor.id(), node.assignment())) assignee = node.alternateId();
            if (!eligible(assignee, actor.id(), node.assignment())) throw new IllegalArgumentException("找不到可处理「" + node.label() + "」的审批人");
            mapper.addTask(revision.id(), ++ordinal, node, assignee);
        }
        mapper.freeze(revision.id(), employee.departmentId(), employee.departmentName(), template.id());
        mapper.changeStatus(id, Status.IN_REVIEW);
        mapper.event(revision.id(), null, actor.id(), "SUBMIT", "提交审批");
        mapper.touch(id, actor.id());
        activateNext(id, revision.id());
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
            comment = before.username() + " → " + after.username() + "，" + comment;
            mapper.reassign(taskId, after.id());
            mapper.notify(after.id(), id, "有一条转派给你的审批待办");
            mapper.notify(document.ownerId(), id, "你的申请已转派给 " + after.username());
            audit.record(actor.id(), "APPROVAL_TRANSFER", id, comment);
        } else {
            if (actor.id() != task.assigneeId() || !eligible(actor.id(), document.ownerId(), task.assignment())) throw denied();
            if (input.action() == Action.RETURN) {
                if (comment.isBlank()) throw new IllegalArgumentException("请填写退回原因");
                mapper.taskStatus(taskId, TaskStatus.RETURNED);
                mapper.closeWaiting(task.revisionId());
                mapper.changeStatus(id, Status.RETURNED);
                if (document.kind() == Kind.EXPENSE) mapper.release(id);
                mapper.notify(document.ownerId(), id, "你的申请已退回，请查看原因");
            } else {
                mapper.taskStatus(taskId, TaskStatus.APPROVED);
                if (mapper.next(task.revisionId()) == null) {
                    mapper.changeStatus(id, document.kind() == Kind.EXPENSE ? Status.AWAITING_PAYMENT : Status.APPROVED);
                    mapper.notify(document.ownerId(), id, document.kind() == Kind.EXPENSE ? "报销已通过，等待付款" : "你的申请已通过");
                } else activateNext(id, task.revisionId());
            }
        }
        mapper.event(task.revisionId(), taskId, actor.id(), input.action().name(), comment);
        mapper.touch(id, actor.id());
    }

    @Transactional
    public void pay(CurrentUser actor, long id, PaymentInput input) {
        if (!actor.has(Role.PAYER)) throw denied();
        var document = lock(id);
        if (document.kind() != Kind.EXPENSE || document.status() != Status.AWAITING_PAYMENT) throw conflict("该单据当前不可登记付款");
        if (input.paidOn().isAfter(LocalDate.now())) throw new IllegalArgumentException("付款日期不能晚于今天");
        mapper.addPayment(id, new PaymentInput(input.paidOn(), input.reference().strip()), actor.id());
        mapper.changeStatus(id, Status.PAID);
        mapper.touch(id, actor.id());
        mapper.notify(document.ownerId(), id, "报销已登记付款");
        audit.record(actor.id(), "PAYMENT_RECORD", id, input.reference().strip());
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
            summary = new Summary(id, document.kind(), Status.RETURNED, snapshot.title(), summary.applicant(), summary.applicantAvatarKey(),
                snapshot.departmentName(), snapshot.amount(), summary.createdAt(), summary.updatedAt(), summary.operator(),
                snapshot.submittedAt(), null, null, null, null, null, null);
        }
        return new Detail(summary, document.ownerId(), revisions, mapper.payment(id));
    }

    boolean canRead(CurrentUser actor, Document document) {
        if (document == null) return false;
        if (document.ownerId() == actor.id()) return true;
        return mapper.involved(document.id(), actor.id()) || mapper.hasSubmittedRevision(document.id()) && (
            actor.has(Role.ADMIN) || document.kind() == Kind.EXPENSE && (actor.has(Role.FINANCE) || actor.has(Role.PAYER)));
    }

    static Attachment attachment(FileRecord file) {
        return new Attachment(file.id(), file.originalName(), file.digest(), file.invoiceKey());
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
        return employee != null && employee.departedOn() == null
            && accounts.roles(accountId).contains(assignment == Assignment.FINANCE ? Role.FINANCE : Role.APPROVER);
    }

    private void activateNext(long document, long revision) {
        var task = mapper.next(revision);
        mapper.activate(task.id(), LocalDateTime.now().plusHours(task.dueHours()));
        mapper.notify(task.assigneeId(), document, "待处理「" + task.label() + "」");
    }

    private void validateSubmission(Kind kind, Revision revision) {
        if (revision.reason().isBlank()) throw new IllegalArgumentException("请填写申请事由");
        switch (kind) {
            case LEAVE, TRIP -> {
                if (revision.startsAt() == null || revision.endsAt() == null || !revision.endsAt().isAfter(revision.startsAt())) {
                    throw new IllegalArgumentException("结束时间要晚于开始时间");
                }
                if (kind == Kind.LEAVE && text(revision.leaveType()).isBlank()) throw new IllegalArgumentException("请选择请假类型");
                if (kind == Kind.TRIP && text(revision.destination()).isBlank()) throw new IllegalArgumentException("请填写出差地点");
            }
            case PURCHASE -> money(revision.amount());
            case EXPENSE -> {
                money(revision.amount());
                if (mapper.files(revision.id()).isEmpty()) throw new IllegalArgumentException("请上传原始票据");
            }
        }
    }

    private static void requireEditable(Document document) {
        if (document.status() != Status.DRAFT && document.status() != Status.RETURNED) throw conflict("当前状态不可编辑");
    }

    private static String text(String value) { return value == null ? "" : value.strip(); }
    private static ResponseStatusException denied() { return new ResponseStatusException(HttpStatus.FORBIDDEN); }
    private static ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT, message); }
}
