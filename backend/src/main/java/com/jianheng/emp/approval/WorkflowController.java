package com.jianheng.emp.approval;

import static com.jianheng.emp.approval.WorkflowData.*;

import com.jianheng.emp.people.PeopleService;
import com.jianheng.emp.security.AccountMapper;
import com.jianheng.emp.security.AccountService;
import com.jianheng.emp.security.Role;
import com.jianheng.emp.web.AuditMapper;
import jakarta.validation.Valid;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.util.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api")
class WorkflowController {
    private final WorkflowService workflow;
    private final WorkflowMapper mapper;
    private final AccountService accounts;
    private final AccountMapper accountMapper;
    private final AttachmentService files;
    private final AuditMapper audit;

    WorkflowController(WorkflowService workflow, WorkflowMapper mapper, AccountService accounts,
                       AccountMapper accountMapper, AttachmentService files, AuditMapper audit) {
        this.workflow = workflow;
        this.mapper = mapper;
        this.accounts = accounts;
        this.accountMapper = accountMapper;
        this.files = files;
        this.audit = audit;
    }

    @GetMapping("/documents") List<Summary> mine(Authentication user) { return mapper.mine(accounts.current(user).id()); }
    @GetMapping("/documents/{id}") Detail detail(Authentication user, @PathVariable long id) { return workflow.detail(accounts.current(user), id); }
    @PostMapping("/documents") Detail create(Authentication user, @Valid @RequestBody Draft input) { return workflow.saveDraft(accounts.current(user), null, input); }
    @PutMapping("/documents/{id}") Detail edit(Authentication user, @PathVariable long id, @Valid @RequestBody Draft input) { return workflow.saveDraft(accounts.current(user), id, input); }
    @PostMapping("/documents/{id}/submit") Detail submit(Authentication user, @PathVariable long id) { return workflow.submit(accounts.current(user), id); }
    @PostMapping("/documents/{id}/tasks/{taskId}") void handle(Authentication user, @PathVariable long id, @PathVariable long taskId,
        @Valid @RequestBody TaskInput input) { workflow.handle(accounts.current(user), id, taskId, input); }
    @PostMapping("/documents/{id}/payment/claim") void claimPayment(Authentication user, @PathVariable long id) {
        workflow.claimPayment(accounts.current(user), id);
    }

    @DeleteMapping("/documents/{id}/payment/claim") void releasePayment(Authentication user, @PathVariable long id) {
        workflow.releasePayment(accounts.current(user), id);
    }

    @PostMapping("/documents/{id}/payment") void pay(Authentication user, @PathVariable long id, @Valid @RequestBody PaymentInput input) {
        workflow.pay(accounts.current(user), id, input);
    }

    @GetMapping("/inbox") List<Summary> inbox(Authentication user, @RequestParam(defaultValue="false") boolean all) {
        var actor = accounts.current(user);
        if (all) accounts.require(actor, Role.ADMIN);
        return mapper.inbox(actor.id(), all, actor.has(Role.PAYER));
    }
    @GetMapping("/inbox/count") InboxCount inboxCount(Authentication user) {
        var actor = accounts.current(user);
        return new InboxCount(mapper.inboxCount(actor.id(), false, actor.has(Role.PAYER)));
    }

    @GetMapping("/inbox/handled") List<Handled> handled(Authentication user) {
        return mapper.handled(accounts.current(user).id());
    }

    @GetMapping("/notifications") List<Notice> notices(Authentication user) { return mapper.notices(accounts.current(user).id()); }
    @GetMapping("/notifications/unread") Unread unread(Authentication user) { return new Unread(mapper.unread(accounts.current(user).id())); }
    @PostMapping("/notifications/{id}/read") void read(Authentication user, @PathVariable long id) { mapper.readNotice(id, accounts.current(user).id()); }

    @GetMapping("/approval/templates/{kind}") TemplateView template(Authentication user, @PathVariable Kind kind) {
        accounts.require(accounts.current(user), Role.ADMIN);
        var template = mapper.latest(kind);
        return template == null ? null : new TemplateView(template, mapper.nodes(template.id()));
    }
    @PostMapping("/approval/templates") TemplateView publish(Authentication user, @Valid @RequestBody TemplateInput input) {
        return workflow.publish(accounts.current(user), input);
    }
    @GetMapping("/approval/assignees") List<AccountMapper.AccountOption> assignees(Authentication user) {
        accounts.require(accounts.current(user), Role.ADMIN);
        return accountMapper.options();
    }

    @GetMapping("/expenses/categories") List<Category> categories() { return mapper.categories(); }
    @PostMapping("/expenses/categories") void createCategory(Authentication user, @Valid @RequestBody PeopleService.NameInput input) {
        var actor = accounts.current(user);
        accounts.require(actor, Role.ADMIN, Role.FINANCE);
        String name = input.name().strip();
        mapper.addCategory(name, actor.id());
        audit.record(actor.id(), "EXPENSE_CATEGORY_CREATE", mapper.insertedId(), name);
    }
    @PutMapping("/expenses/categories/{id}") void updateCategory(Authentication user, @PathVariable long id, @Valid @RequestBody PeopleService.NameInput input) {
        var actor = accounts.current(user);
        accounts.require(actor, Role.ADMIN, Role.FINANCE);
        var category = mapper.category(id);
        if (category == null) throw new IllegalArgumentException("费用类别不存在");
        String name = input.name().strip();
        mapper.changeCategory(id, name, actor.id());
        audit.record(actor.id(), "EXPENSE_CATEGORY_RENAME", id, category.name() + " → " + name);
    }
    @PutMapping("/expenses/categories/{id}/active") void setCategoryActive(Authentication user, @PathVariable long id,
        @Valid @RequestBody PeopleService.ActiveInput input) {
        var actor = accounts.current(user);
        accounts.require(actor, Role.ADMIN, Role.FINANCE);
        if (mapper.category(id) == null) throw new IllegalArgumentException("费用类别不存在");
        mapper.setCategoryActive(id, input.active(), actor.id());
        audit.record(actor.id(), "EXPENSE_CATEGORY_STATUS", id, input.active() ? "启用费用类别" : "停用费用类别");
    }
    @DeleteMapping("/expenses/categories/{id}") void deleteCategory(Authentication user, @PathVariable long id) {
        var actor = accounts.current(user);
        accounts.require(actor, Role.ADMIN, Role.FINANCE);
        var category = mapper.category(id);
        if (category == null) throw new IllegalArgumentException("费用类别不存在");
        if (category.active()) throw new IllegalArgumentException("请先停用费用类别");
        if (mapper.categoryUses(id) > 0) throw new IllegalArgumentException("费用类别已被使用，不能删除");
        mapper.deleteCategory(id);
        audit.record(actor.id(), "EXPENSE_CATEGORY_DELETE", id, category.name());
    }

    @GetMapping("/expenses/ledger") List<Summary> ledger(Authentication user, @RequestParam(required=false) Status status,
        @RequestParam(required=false) Long departmentId, @RequestParam(required=false) LocalDate from, @RequestParam(required=false) LocalDate to) {
        accounts.require(accounts.current(user), Role.FINANCE, Role.PAYER, Role.ADMIN);
        return mapper.ledger(filter(status, departmentId, from, to));
    }

    @GetMapping("/expenses/export") ResponseEntity<byte[]> export(Authentication user, @RequestParam(required=false) Status status,
        @RequestParam(required=false) Long departmentId, @RequestParam(required=false) LocalDate from, @RequestParam(required=false) LocalDate to) throws IOException {
        var actor = accounts.current(user);
        accounts.require(actor, Role.FINANCE, Role.PAYER, Role.ADMIN);
        var rows = mapper.ledger(filter(status, departmentId, from, to));
        try (var workbook = new XSSFWorkbook(); var output = new ByteArrayOutputStream()) {
            var sheet = workbook.createSheet("报销台账");
            var header = sheet.createRow(0);
            var labels = List.of("单号", "申请人", "提交部门", "标题", "金额（元）", "状态", "提交时间", "付款日期");
            for (int column = 0; column < labels.size(); column++) {
                header.createCell(column).setCellValue(labels.get(column));
                sheet.setColumnWidth(column, 20 * 256);
            }
            var moneyStyle = workbook.createCellStyle();
            moneyStyle.setDataFormat(workbook.createDataFormat().getFormat("#,##0.00"));
            int index = 1;
            for (var document : rows) {
                var row = sheet.createRow(index++);
                row.createCell(0).setCellValue(document.documentNo());
                row.createCell(1).setCellValue(document.applicant());
                row.createCell(2).setCellValue(document.departmentName());
                row.createCell(3).setCellValue(document.title());
                var amount = row.createCell(4);
                amount.setCellValue(document.amount().doubleValue());
                amount.setCellStyle(moneyStyle);
                row.createCell(5).setCellValue(switch (document.status()) {
                    case DRAFT -> "草稿";
                    case IN_REVIEW -> "审批中";
                    case RETURNED -> "已驳回";
                    case APPROVED -> "已通过";
                    case AWAITING_PAYMENT -> "待付款";
                    case PAID -> "已付款";
                });
                row.createCell(6).setCellValue(Objects.toString(document.submittedAt(), ""));
                row.createCell(7).setCellValue(Objects.toString(document.paidOn(), ""));
            }
            sheet.createFreezePane(0, 1);
            workbook.write(output);
            audit.record(actor.id(), "EXPENSE_EXPORT", null, "导出 " + rows.size() + " 条报销记录");
            return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=expense-ledger.xlsx")
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).body(output.toByteArray());
        }
    }

    @PostMapping(value="/attachments", consumes="multipart/form-data") Attachment upload(Authentication user, @RequestParam MultipartFile file,
        @RequestParam(required=false) FileCategory category) throws IOException, NoSuchAlgorithmException {
        return files.upload(accounts.current(user), file, category);
    }
    @PatchMapping("/attachments/{id}") Attachment categorize(Authentication user, @PathVariable long id,
        @Valid @RequestBody FileCategoryInput input) {
        return files.categorize(accounts.current(user), id, input.category());
    }
    @GetMapping("/attachments/{id}") ResponseEntity<FileSystemResource> download(Authentication user, @PathVariable long id) {
        return files.download(accounts.current(user), id);
    }
    @GetMapping("/attachments/{id}/preview") ResponseEntity<FileSystemResource> preview(Authentication user, @PathVariable long id) {
        return files.preview(accounts.current(user), id);
    }

    private static Filter filter(Status status, Long department, LocalDate from, LocalDate to) {
        if (from != null && to != null && from.isAfter(to)) throw new IllegalArgumentException("起始日期不能晚于结束日期");
        return new Filter(status, department, from, to);
    }
}
