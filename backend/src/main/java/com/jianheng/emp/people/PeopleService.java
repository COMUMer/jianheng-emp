package com.jianheng.emp.people;

import com.jianheng.emp.security.AccountService;
import com.jianheng.emp.security.AccountService.CurrentUser;
import com.jianheng.emp.web.AuditMapper;
import jakarta.validation.constraints.*;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

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
    public record EmploymentInput(LocalDate joinedOn, long departmentId, long positionId) {}
    public record RehireInput(@NotNull(message = "请选择入职日期") LocalDate joinedOn,
                              @Positive(message = "请选择部门") long departmentId,
                              @Positive(message = "请选择岗位") long positionId,
                              AccountService.AccountInput account) {}
    public record DepartmentInput(@NotBlank @Size(max=100) String name, Long parentId, Long managerId) {}
    public record PositionInput(@NotBlank @Size(max=100) String name, @Size(max=500) String description) {}
    public record ActiveInput(@NotNull(message = "请选择启用状态") Boolean active) {}
    public record NameInput(@NotBlank @Size(max=100) String name) {}
    public record Departure(@NotNull LocalDate date) {}
    public record EmploymentFlow(String month, int hired, int departed) {}
    public record EmployeeDetail(PeopleMapper.Employee employee, AccountService.AccountView account,
                                 List<PeopleMapper.Employment> employments, List<AuditMapper.Entry> history) {}

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

    public PeopleMapper.EmployeeCard employeeCard(long id) {
        var card = mapper.employeeCard(id);
        if (card == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "员工不存在");
        return card;
    }

    @Transactional
    public PeopleMapper.Employee saveEmployee(CurrentUser user, Long id, EmployeeInput input) {
        var clean = EmployeeProfile.normalize(input);
        EmployeeProfile.validateIdentity(clean);
        EmployeeProfile.validateEmployment(clean);
        if (id == null) {
            requireOrganization(clean.departmentId(), clean.positionId(), true);
            var duplicate = mapper.employeeByIdCard(clean.idCard(), 0L);
            if (duplicate != null) throw conflict(duplicate);
            String base = Mis.base(clean.name());
            mapper.bumpMisSequence(base);
            String mis = Mis.numbered(base, mapper.misSequence(base));
            mapper.createEmployee(mis, clean, user.id());
            long employeeId = mapper.employeeIdByMis(mis);
            mapper.createEmployment(employeeId, employment(clean), null, user.id());
            audit.record(user.id(), "EMPLOYEE_CREATE", employeeId, "入职建档");
            return mapper.employee(employeeId);
        }
        mapper.lockEmployee(id);
        var before = employee(id);
        var current = mapper.currentEmployment(id);
        if (current == null) throw new IllegalArgumentException("离职档案仅供查看，请先办理重新入职");
        requireOrganization(clean.departmentId(), clean.positionId(),
            before.departmentId() != clean.departmentId() || before.positionId() != clean.positionId());
        if (mapper.employeeByIdCard(clean.idCard(), id) != null) throw new IllegalArgumentException("身份证号已存在");
        mapper.updateEmployee(id, clean, user.id());
        mapper.updateEmployment(current.id(), employment(clean), user.id());
        var after = mapper.employee(id);
        String detail = "更新档案";
        if (before.departmentId() != after.departmentId() || before.positionId() != after.positionId()) {
            var departments = mapper.departments();
            detail = employmentLabel(departments, before.departmentId(), before.positionName()) + " → "
                + employmentLabel(departments, after.departmentId(), after.positionName());
        }
        audit.record(user.id(), "EMPLOYEE_UPDATE", id, detail);
        return after;
    }

    @Transactional
    public PeopleMapper.Employee rehire(CurrentUser user, long id, RehireInput input) {
        mapper.lockEmployee(id);
        var employee = employee(id);
        var periods = mapper.employments(id);
        if (periods.isEmpty() || periods.getFirst().departedOn() == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "该员工仍在职，不能重复入职");
        }
        var last = periods.getFirst();
        if (!input.joinedOn().isAfter(last.departedOn())) {
            throw new IllegalArgumentException("重新入职日期需晚于上次离职日期");
        }
        requireOrganization(input.departmentId(), input.positionId(), true);
        try {
            mapper.createEmployment(id, new EmploymentInput(input.joinedOn(), input.departmentId(), input.positionId()),
                null, user.id());
        } catch (DuplicateKeyException error) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "该员工已在职，请刷新后重试");
        }
        if (input.account() != null) accounts.updateEmployeeAccount(user, id, employee.mis(), input.account());
        var position = mapper.position(input.positionId());
        audit.record(user.id(), "EMPLOYEE_REHIRE", id, input.joinedOn() + " · "
            + employmentLabel(mapper.departments(), input.departmentId(), position.name()));
        return mapper.employee(id);
    }

    @Transactional
    public void saveDepartment(CurrentUser user, Long id, DepartmentInput input) {
        mapper.lockDepartments();
        var current = id == null ? null : mapper.department(id);
        if (id != null && current == null) throw new IllegalArgumentException("部门不存在");
        Long parentId = input.parentId();
        while (parentId != null) {
            if (Objects.equals(id, parentId)) throw new IllegalArgumentException("上级部门不能形成循环");
            var parent = mapper.department(parentId);
            if (parent == null) throw new IllegalArgumentException("上级部门不存在");
            parentId = parent.parentId();
        }
        if (input.parentId() != null && (id == null || !Objects.equals(current.parentId(), input.parentId()))) {
            var parent = mapper.department(input.parentId());
            if (parent != null && !parent.active()) throw new IllegalArgumentException("请选择启用的上级部门");
        }
        if (input.managerId() != null && employee(input.managerId()).departedOn() != null) {
            throw new IllegalArgumentException("请选择在职负责人");
        }
        var value = new PeopleMapper.Department(id == null ? 0 : id, input.name().strip(), input.parentId(), input.managerId(),
            current == null || current.active(), null, null, null);
        if (id == null) mapper.createDepartment(value, user.id());
        else mapper.updateDepartment(value, user.id());
    }

    @Transactional
    public void savePosition(CurrentUser user, Long id, PositionInput input) {
        var current = id == null ? null : mapper.position(id);
        if (id != null && current == null) throw new IllegalArgumentException("岗位不存在");
        String description = input.description() == null ? null : input.description().strip();
        if (description != null && description.isEmpty()) description = null;
        var value = new PeopleMapper.Position(id == null ? 0 : id, input.name().strip(), description,
            current == null || current.active(), null, null, null);
        if (id == null) mapper.createPosition(value, user.id());
        else mapper.updatePosition(value, user.id());
    }

    @Transactional
    public void setDepartmentActive(CurrentUser user, long id, boolean active) {
        mapper.lockDepartments();
        var department = mapper.department(id);
        if (department == null) throw new IllegalArgumentException("部门不存在");
        if (active && department.parentId() != null) {
            var parent = mapper.department(department.parentId());
            if (parent == null || !parent.active()) throw new IllegalArgumentException("请先启用上级部门");
        }
        if (!active && department.active()) {
            if (mapper.currentDepartmentEmployments(id) > 0) throw new IllegalArgumentException("部门还有在职员工，不能停用");
            if (mapper.childDepartments(id) > 0) throw new IllegalArgumentException("请先处理下级部门");
        }
        mapper.setDepartmentActive(id, active, user.id());
        audit.record(user.id(), "DEPARTMENT_STATUS", id, active ? "启用部门" : "停用部门");
    }

    @Transactional
    public void deleteDepartment(CurrentUser user, long id) {
        mapper.lockDepartments();
        var department = mapper.department(id);
        if (department == null) throw new IllegalArgumentException("部门不存在");
        if (department.active()) throw new IllegalArgumentException("请先停用部门");
        if (mapper.childDepartments(id) > 0) throw new IllegalArgumentException("部门还有下级部门，不能删除");
        if (mapper.departmentEmployments(id) > 0) throw new IllegalArgumentException("部门存在任职记录，不能删除");
        if (mapper.departmentDocuments(id) > 0) throw new IllegalArgumentException("部门已被申请使用，不能删除");
        mapper.deleteDepartment(id);
        audit.record(user.id(), "DEPARTMENT_DELETE", id, department.name());
    }

    @Transactional
    public void setPositionActive(CurrentUser user, long id, boolean active) {
        var position = mapper.position(id);
        if (position == null) throw new IllegalArgumentException("岗位不存在");
        if (!active && position.active() && mapper.currentPositionEmployments(id) > 0) {
            throw new IllegalArgumentException("岗位还有在职员工，不能停用");
        }
        mapper.setPositionActive(id, active, user.id());
        audit.record(user.id(), "POSITION_STATUS", id, active ? "启用岗位" : "停用岗位");
    }

    @Transactional
    public void deletePosition(CurrentUser user, long id) {
        var position = mapper.position(id);
        if (position == null) throw new IllegalArgumentException("岗位不存在");
        if (position.active()) throw new IllegalArgumentException("请先停用岗位");
        if (mapper.positionEmployments(id) > 0) throw new IllegalArgumentException("岗位存在任职记录，不能删除");
        mapper.deletePosition(id);
        audit.record(user.id(), "POSITION_DELETE", id, position.name());
    }

    public List<EmploymentFlow> employmentFlow() {
        return employmentFlow(YearMonth.now().minusMonths(5).atDay(1));
    }

    List<EmploymentFlow> employmentFlow(LocalDate start) {
        var byMonth = mapper.employmentFlow(start).stream()
            .collect(Collectors.toMap(PeopleMapper.EmploymentFlowCount::month, Function.identity()));
        var result = new ArrayList<EmploymentFlow>();
        var first = YearMonth.from(start);
        for (int index = 0; index < 6; index++) {
            var month = first.plusMonths(index).toString();
            var row = byMonth.get(month);
            result.add(new EmploymentFlow(month, row == null ? 0 : row.hired(), row == null ? 0 : row.departed()));
        }
        return result;
    }

    @Transactional
    public void depart(CurrentUser user, long id, LocalDate date) {
        mapper.lockDepartments();
        mapper.lockEmployee(id);
        var current = mapper.currentEmployment(id);
        if (current == null) throw new IllegalArgumentException("该员工已离职");
        if (date.isBefore(current.joinedOn()) || date.isAfter(LocalDate.now())) {
            throw new IllegalArgumentException("请填写有效的离职日期");
        }
        mapper.closeEmployment(current.id(), date, user.id());
        mapper.removeManager(id);
        accounts.disableEmployee(user, id);
        audit.record(user.id(), "EMPLOYEE_DEPART", id, date.toString());
    }

    @Transactional
    public AccountService.AccountView updateAccount(CurrentUser actor, long id, AccountService.AccountInput input) {
        mapper.lockEmployee(id);
        var employee = employee(id);
        if (mapper.currentEmployment(id) == null) throw new IllegalArgumentException("离职员工不可修改账号");
        return accounts.updateEmployeeAccount(actor, id, employee.mis(), input);
    }

    private void requireOrganization(long departmentId, long positionId, boolean requireActive) {
        var department = mapper.department(departmentId);
        var position = mapper.position(positionId);
        if (department == null || position == null) {
            throw new IllegalArgumentException("请选择有效的部门和岗位");
        }
        if (requireActive && (!department.active() || !position.active())) {
            throw new IllegalArgumentException("请选择启用的部门和岗位");
        }
    }

    private static EmploymentInput employment(EmployeeInput input) {
        return new EmploymentInput(input.joinedOn(), input.departmentId(), input.positionId());
    }

    private static String employmentLabel(List<PeopleMapper.Department> departments, long departmentId, String positionName) {
        return departmentPath(departments, departmentId) + "（" + positionName + "）";
    }

    private static String departmentPath(List<PeopleMapper.Department> departments, long departmentId) {
        var byId = departments.stream().collect(Collectors.toMap(PeopleMapper.Department::id, Function.identity()));
        var names = new ArrayDeque<String>();
        var current = byId.get(departmentId);
        while (current != null) {
            names.addFirst(current.name());
            current = current.parentId() == null ? null : byId.get(current.parentId());
        }
        return String.join("/", names);
    }

    private EmployeeConflict conflict(long employeeId) {
        var existing = mapper.employee(employeeId);
        return new EmployeeConflict(employeeId, existing == null ? null : existing.name(),
            existing == null ? null : existing.departedOn());
    }
}