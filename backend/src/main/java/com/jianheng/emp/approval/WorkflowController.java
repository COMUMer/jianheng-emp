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
    @PostMapping("/documents/{id}/payment") void pay(Authentication user, @PathVariable long id, @Valid @RequestBody PaymentInput input) {
        workflow.pay(accounts.current(user), id, input);
    }

    @GetMapping("/inbox") List<Summary> inbox(Authentication user, @RequestParam(defaultValue="false") boolean all) {
        var actor = accounts.current(user);
        if (all) accounts.require(actor, Role.ADMIN);
        return mapper.inbox(actor.id(), all);
    }

    @GetMapping("/notifications") List<Notice> notices(Authentication user) { return mapper.notices(accounts.current(user).id()); }
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
        mapper.addCategory(input.name().strip(), actor.id());
    }
    @PutMapping("/expenses/categories/{id}") void updateCategory(Authentication user, @PathVariable long id, @Valid @RequestBody PeopleService.NameInput input) {
        var actor = accounts.current(user);
        accounts.require(actor, Role.ADMIN, Role.FINANCE);
        mapper.changeCategory(id, input.name().strip(), actor.id());
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
            var labels = List.of("单号", "申请人", "提交部门", "标题", "金额（元）", "状态", "提交时间", "付款日期", "付款凭证");
            for (int column = 0; column < labels.size(); column++) {
                header.createCell(column).setCellValue(labels.get(column));
                sheet.setColumnWidth(column, 20 * 256);
            }
            var moneyStyle = workbook.createCellStyle();
            moneyStyle.setDataFormat(workbook.createDataFormat().getFormat("#,##0.00"));
            int index = 1;
            for (var document : rows) {
                var row = sheet.createRow(index++);
                row.createCell(0).setCellValue(Long.toString(document.id()));
                row.createCell(1).setCellValue(document.applicant());
                row.createCell(2).setCellValue(document.departmentName());
                row.createCell(3).setCellValue(document.title());
                var amount = row.createCell(4);
                amount.setCellValue(document.amount().doubleValue());
                amount.setCellStyle(moneyStyle);
                row.createCell(5).setCellValue(switch (document.status()) {
                    case DRAFT -> "草稿";
                    case IN_REVIEW -> "审批中";
                    case RETURNED -> "已退回";
                    case APPROVED -> "已通过";
                    case AWAITING_PAYMENT -> "待付款";
                    case PAID -> "已付款";
                });
                row.createCell(6).setCellValue(Objects.toString(document.submittedAt(), ""));
                row.createCell(7).setCellValue(Objects.toString(document.paidOn(), ""));
                row.createCell(8).setCellValue(document.reference());
            }
            sheet.createFreezePane(0, 1);
            workbook.write(output);
            audit.record(actor.id(), "EXPENSE_EXPORT", null, "导出 " + rows.size() + " 条报销记录");
            return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=expense-ledger.xlsx")
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).body(output.toByteArray());
        }
    }

    @PostMapping(value="/attachments", consumes="multipart/form-data") Attachment upload(Authentication user, @RequestParam MultipartFile file,
        @RequestParam(required=false) String invoice) throws IOException, NoSuchAlgorithmException {
        return files.upload(accounts.current(user), file, invoice);
    }
    @GetMapping("/attachments/{id}") ResponseEntity<FileSystemResource> download(Authentication user, @PathVariable long id) {
        return files.download(accounts.current(user), id);
    }
    @PatchMapping("/attachments/{id}") Attachment updateInvoice(Authentication user, @PathVariable long id, @RequestBody AttachmentInvoice input) {
        return files.updateInvoice(accounts.current(user), id, input.invoice());
    }

    private static Filter filter(Status status, Long department, LocalDate from, LocalDate to) {
        if (from != null && to != null && from.isAfter(to)) throw new IllegalArgumentException("起始日期不能晚于结束日期");
        return new Filter(status, department, from, to);
    }
}
