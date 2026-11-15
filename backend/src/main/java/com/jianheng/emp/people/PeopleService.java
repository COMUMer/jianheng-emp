package com.jianheng.emp.people;

import com.jianheng.emp.security.AccountService;
import com.jianheng.emp.security.AccountService.CurrentUser;
import com.jianheng.emp.web.AuditMapper;
import jakarta.validation.constraints.*;
import java.time.LocalDate;
import java.util.List;
import java.util.Objects;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PeopleService {
    public record EmployeeInput(@NotBlank(message = "请输入姓名") @Size(max = 100, message = "姓名不能超过 100 个字符") String name,
                                @Positive(message = "请选择部门") long departmentId,
                                @Positive(message = "请选择岗位") long positionId,
                                @NotBlank(message = "请输入联系电话") @Size(max = 32, message = "联系电话过长") String phone,
                                @NotBlank(message = "请输入电子邮箱") @Size(max = 120, message = "电子邮箱过长") String email,
                                @NotBlank(message = "请输入身份证号") @Size(max = 18, message = "身份证号过长") String idCard,
                                @NotBlank(message = "请输入现住址") @Size(max = 200, message = "现住址过长") String address,
                                @NotBlank(message = "请输入紧急联系人") @Size(max = 100, message = "紧急联系人过长") String emergencyContact,
                                @NotBlank(message = "请输入紧急联系电话") @Size(max = 32, message = "紧急联系电话过长") String emergencyPhone,
                                @NotBlank(message = "请输入银行卡号") @Size(max = 32, message = "银行卡号过长") String bankCard,
                                @NotBlank(message = "请输入开户银行名称") @Size(max = 100, message = "开户银行名称过长") String bankName,
                                @NotBlank(message = "请输入联行号") @Size(max = 16, message = "联行号过长") String cnapsCode,
                                @NotNull(message = "请选择入职日期") LocalDate joinedOn) {}
    public record DepartmentInput(@NotBlank @Size(max=100) String name, Long parentId, Long managerId) {}
    public record NameInput(@NotBlank @Size(max=100) String name) {}
    public record Departure(@NotNull LocalDate date) {}
    public record EmployeeDetail(PeopleMapper.Employee employee, AccountService.AccountView account, List<AuditMapper.Entry> history) {}

    private final PeopleMapper mapper;
    private final AuditMapper audit;
    private final AccountService accounts;

    PeopleService(PeopleMapper mapper, AuditMapper audit, AccountService accounts) {
        this.mapper = mapper;
        this.audit = audit;
        this.accounts = accounts;
    }

    public PeopleMapper.Employee employee(long id) {
        var employee = mapper.employee(id);
        if (employee == null) throw new IllegalArgumentException("员工不存在");
        return employee;
    }

    @Transactional
    public PeopleMapper.Employee saveEmployee(CurrentUser user, Long id, EmployeeInput input) {
        var clean = EmployeeProfile.normalize(input);
        EmployeeProfile.validate(clean);
        if (mapper.department(clean.departmentId()) == null || mapper.position(clean.positionId()) == null) {
            throw new IllegalArgumentException("请选择有效的部门和岗位");
        }
        if (id == null) {
            if (mapper.employeeByIdCard(clean.idCard(), 0L) != null) throw new IllegalArgumentException("身份证号已存在");
            String base = Mis.base(clean.name());
            mapper.bumpMisSequence(base);
            String mis = Mis.numbered(base, mapper.misSequence(base));
            mapper.createEmployee(mis, clean, user.id());
            var created = mapper.employeeByMis(mis);
            audit.record(user.id(), "EMPLOYEE_CREATE", created.id(), "入职建档");
            return created;
        }
        mapper.lockEmployee(id);
        var before = employee(id);
        if (before.departedOn() != null) throw new IllegalArgumentException("离职档案仅供查看");
        if (mapper.employeeByIdCard(clean.idCard(), id) != null) throw new IllegalArgumentException("身份证号已存在");
        mapper.updateEmployee(id, clean, user.id());
        var after = employee(id);
        String detail = before.departmentId() != after.departmentId() || before.positionId() != after.positionId()
            ? before.departmentName() + " / " + before.positionName() + " → " + after.departmentName() + " / " + after.positionName()
            : "更新档案";
        audit.record(user.id(), "EMPLOYEE_UPDATE", id, detail);
        return after;
    }

    @Transactional
    public void saveDepartment(CurrentUser user, Long id, DepartmentInput input) {
        mapper.lockDepartments();
        if (id != null && mapper.department(id) == null) throw new IllegalArgumentException("部门不存在");
        Long parentId = input.parentId();
        while (parentId != null) {
            if (Objects.equals(id, parentId)) throw new IllegalArgumentException("上级部门不能形成循环");
            var parent = mapper.department(parentId);
            if (parent == null) throw new IllegalArgumentException("上级部门不存在");
            parentId = parent.parentId();
        }
        if (input.managerId() != null && employee(input.managerId()).departedOn() != null) {
            throw new IllegalArgumentException("请选择在职负责人");
        }
        var value = new PeopleMapper.Department(id == null ? 0 : id, input.name().strip(), input.parentId(), input.managerId(),
            null, null, null);
        if (id == null) mapper.createDepartment(value, user.id());
        else mapper.updateDepartment(value, user.id());
    }

    @Transactional
    public void depart(CurrentUser user, long id, LocalDate date) {
        mapper.lockDepartments();
        mapper.lockEmployee(id);
        var employee = employee(id);
        if (employee.departedOn() != null || date.isBefore(employee.joinedOn()) || date.isAfter(LocalDate.now())) {
            throw new IllegalArgumentException("请填写有效的离职日期");
        }
        mapper.depart(id, date, user.id());
        mapper.removeManager(id);
        accounts.disableEmployee(user, id);
        audit.record(user.id(), "EMPLOYEE_DEPART", id, date.toString());
    }

    @Transactional
    public AccountService.AccountView updateAccount(CurrentUser actor, long id, AccountService.AccountInput input) {
        mapper.lockEmployee(id);
        var employee = employee(id);
        if (employee.departedOn() != null) throw new IllegalArgumentException("离职员工不可修改账号");
        return accounts.updateEmployeeAccount(actor, id, employee.mis(), input);
    }
}
