package com.jianheng.emp.people;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.jianheng.emp.security.AccountService;
import com.jianheng.emp.security.AccountService.CurrentUser;
import com.jianheng.emp.security.Role;
import com.jianheng.emp.security.pii.TestPii;
import com.jianheng.emp.web.AuditMapper;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.server.ResponseStatusException;

class PeopleServiceTest {
    private final PeopleMapper mapper = mock(PeopleMapper.class);
    private final AuditMapper audit = mock(AuditMapper.class);
    private final AccountService accounts = mock(AccountService.class);
    private final EmployeeSensitive sensitive = new EmployeeSensitive(TestPii.CIPHER);
    private final PeopleService service = new PeopleService(mapper, audit, accounts, sensitive);
    private final CurrentUser actor = new CurrentUser(7, "hr", null, null, null, null, List.of(Role.HR));

    @Test
    void createsAnEmployeeWithIdentityAndFirstEmployment() {
        var input = validInput(" +86 138 0013 8000 ", "11010519491231002x");
        var created = employee(1, "testuser", null);
        mockIdentityDependencies();
        when(mapper.misSequence("testuser")).thenReturn(1);
        when(mapper.employeeIdByMis("testuser")).thenReturn(1L);
        when(mapper.employee(1L)).thenReturn(created);

        var returned = service.saveEmployee(actor, null, input);
        assertEquals(created.id(), returned.id());
        assertEquals("13800138000", returned.phone());
        assertEquals("11010519491231002X", returned.idCard());

        var saved = ArgumentCaptor.forClass(PeopleService.EmployeeInput.class);
        var employment = ArgumentCaptor.forClass(PeopleService.EmploymentInput.class);
        verify(mapper).bumpMisSequence("testuser");
        verify(mapper).createEmployee(eq("testuser"), saved.capture(), eq(blindIndex()), eq(7L));
        verify(mapper).createEmployment(eq(1L), employment.capture(), isNull(), eq(7L));
        assertEquals("13800138000", TestPii.CIPHER.decrypt(saved.getValue().phone(), EmployeeSensitive.PHONE));
        assertEquals("11010519491231002X", TestPii.CIPHER.decrypt(saved.getValue().idCard(), EmployeeSensitive.ID_CARD));
        assertEquals(LocalDate.of(2020, 1, 1), employment.getValue().joinedOn());
        assertEquals(1L, employment.getValue().departmentId());
        verify(audit).record(7L, "EMPLOYEE_CREATE", 1L, "入职建档");
    }

    @Test
    void fillsSixMonthsOfEmploymentFlow() {
        when(mapper.employmentFlow(LocalDate.of(2026, 6, 1)))
            .thenReturn(List.of(new PeopleMapper.EmploymentFlowCount("2026-08", 2, 1)));

        var rows = service.employmentFlow(LocalDate.of(2026, 6, 1));

        assertEquals(6, rows.size());
        assertEquals(new PeopleService.EmploymentFlow("2026-06", 0, 0), rows.getFirst());
        assertEquals(new PeopleService.EmploymentFlow("2026-08", 2, 1), rows.get(2));
        assertEquals(new PeopleService.EmploymentFlow("2026-11", 0, 0), rows.getLast());
    }

    @Test
    void preventsDeactivatingAStaffedOrParentDepartment() {
        var department = department(1, "研发部", null, true);
        when(mapper.department(1L)).thenReturn(department);
        when(mapper.currentDepartmentEmployments(1L)).thenReturn(1);

        var error = assertThrows(IllegalArgumentException.class, () -> service.setDepartmentActive(actor, 1L, false));
        assertEquals("部门还有在职员工，不能停用", error.getMessage());

        when(mapper.currentDepartmentEmployments(1L)).thenReturn(0);
        when(mapper.childDepartments(1L)).thenReturn(1);
        var childError = assertThrows(IllegalArgumentException.class, () -> service.setDepartmentActive(actor, 1L, false));
        assertEquals("请先处理下级部门", childError.getMessage());
        verify(mapper, never()).setDepartmentActive(anyLong(), eq(false), anyLong());
    }

    @Test
    void deletesOnlyAnUnusedInactiveDepartment() {
        var inactive = department(1, "研发部", null, false);
        when(mapper.department(1L)).thenReturn(inactive, department(1, "研发部", null, true));
        when(mapper.childDepartments(1L)).thenReturn(0);
        when(mapper.departmentEmployments(1L)).thenReturn(0);
        when(mapper.departmentDocuments(1L)).thenReturn(0);

        service.deleteDepartment(actor, 1L);

        verify(mapper).deleteDepartment(1L);
        verify(audit).record(7L, "DEPARTMENT_DELETE", 1L, "研发部");
        var error = assertThrows(IllegalArgumentException.class, () -> service.deleteDepartment(actor, 1L));
        assertEquals("请先停用部门", error.getMessage());
    }

    @Test
    void protectsPositionsWithEmploymentHistoryFromDeletion() {
        when(mapper.position(1L)).thenReturn(position(1, "工程师", false));
        when(mapper.positionEmployments(1L)).thenReturn(2);

        var error = assertThrows(IllegalArgumentException.class, () -> service.deletePosition(actor, 1L));
        assertEquals("岗位存在任职记录，不能删除", error.getMessage());
        verify(mapper, never()).deletePosition(1L);
    }

    @Test
    void savesPositionNameAndDescription() {
        service.savePosition(actor, null, new PeopleService.PositionInput(" 工程师 ", " 负责研发交付 "));

        var saved = ArgumentCaptor.forClass(PeopleMapper.Position.class);
        verify(mapper).createPosition(saved.capture(), eq(7L));
        assertEquals("工程师", saved.getValue().name());
        assertEquals("负责研发交付", saved.getValue().description());
    }

    @Test
    void numbersTheMisWhenThePinyinIsAlreadyTaken() {
        mockIdentityDependencies();
        when(mapper.misSequence("testuser")).thenReturn(3);
        when(mapper.employeeIdByMis("testuser3")).thenReturn(2L);
        when(mapper.employee(2L)).thenReturn(employee(2, "testuser3", null));

        service.saveEmployee(actor, null, validInput());

        verify(mapper).createEmployee(eq("testuser3"), any(), eq(blindIndex()), eq(7L));
    }

    @Test
    void returnsTheExistingIdentityWhenTheIdCardIsDuplicated() {
        mockIdentityDependencies();
        when(mapper.employeeByIdCard(blindIndex(), 0L)).thenReturn(9L);
        when(mapper.employee(9L)).thenReturn(employee(9, "testuser", LocalDate.of(2026, 11, 15)));

        var error = assertThrows(EmployeeConflict.class, () -> service.saveEmployee(actor, null, validInput()));

        assertEquals(9L, error.employeeId());
        assertEquals("testuser", error.employeeName());
        assertEquals(LocalDate.of(2026, 11, 15), error.departedOn());
        assertTrue(error.getMessage().contains("重新入职"));
        verify(mapper, never()).createEmployee(any(), any(), any(), anyLong());
    }

    @Test
    void updatesIdentityOnlyOnTheCurrentEmployment() {
        var before = employee(1, "testuser", null);
        when(mapper.department(1L)).thenReturn(department(1, "研发部"));
        when(mapper.position(1L)).thenReturn(position(1, "工程师"));
        when(mapper.lockEmployee(1L)).thenReturn(1L);
        when(mapper.employee(1L)).thenReturn(before);
        when(mapper.currentEmployment(1L)).thenReturn(employment(3, LocalDate.of(2020, 1, 1), null));
        when(mapper.employeeByIdCard(blindIndex(), 1L)).thenReturn(null);

        service.saveEmployee(actor, 1L, validInput());

        verify(mapper).updateEmployee(eq(1L), any(), eq(blindIndex()), eq(7L));
        verify(mapper).updateEmployment(eq(3L), any(), eq(7L));
        verify(audit).record(7L, "EMPLOYEE_UPDATE", 1L, "更新档案");
    }

    @Test
    void recordsTheFullDepartmentPathWhenTheEmploymentChanges() {
        var before = employee(1, "testuser", null, 2, "总办");
        var after = employee(1, "testuser", null, 3, "研发业务部");
        when(mapper.department(3L)).thenReturn(department(3, "研发业务部", 2L));
        when(mapper.position(1L)).thenReturn(position(1, "工程师"));
        when(mapper.lockEmployee(1L)).thenReturn(1L);
        when(mapper.employee(1L)).thenReturn(before, after);
        when(mapper.currentEmployment(1L)).thenReturn(employment(3, LocalDate.of(2020, 1, 1), null));
        when(mapper.employeeByIdCard(blindIndex(), 1L)).thenReturn(null);
        when(mapper.departments()).thenReturn(List.of(
            department(1, "见衡", null), department(2, "总办", 1L), department(3, "研发业务部", 2L)));

        service.saveEmployee(actor, 1L, validInput(3));

        verify(audit).record(7L, "EMPLOYEE_UPDATE", 1L,
            "见衡/总办（工程师） → 见衡/总办/研发业务部（工程师）");
    }

    @Test
    void rejectsProfileUpdatesOnceTheEmploymentIsClosed() {
        when(mapper.department(1L)).thenReturn(department(1, "研发部"));
        when(mapper.position(1L)).thenReturn(position(1, "工程师"));
        when(mapper.lockEmployee(1L)).thenReturn(1L);
        when(mapper.employee(1L)).thenReturn(employee(1, "testuser", LocalDate.of(2026, 11, 15)));
        when(mapper.currentEmployment(1L)).thenReturn(null);

        var error = assertThrows(IllegalArgumentException.class, () -> service.saveEmployee(actor, 1L, validInput()));

        assertTrue(error.getMessage().contains("重新入职"));
        verify(mapper, never()).updateEmployee(anyLong(), any(), any(), anyLong());
    }

    @Test
    void rehiresADepartedEmployeeWithANewEmploymentPeriod() {
        var departed = employee(1, "testuser", LocalDate.of(2026, 11, 15));
        var next = employee(1, "testuser", null);
        when(mapper.lockEmployee(1L)).thenReturn(1L);
        when(mapper.employee(1L)).thenReturn(departed, next);
        when(mapper.employments(1L)).thenReturn(List.of(employment(3, LocalDate.of(2020, 1, 1), LocalDate.of(2026, 11, 15))));
        when(mapper.department(2L)).thenReturn(department(2, "产品部"));
        when(mapper.position(3L)).thenReturn(position(3, "产品经理"));
        when(mapper.departments()).thenReturn(List.of(department(2, "产品部")));

        assertSame(next, service.rehire(actor, 1L, rehire(LocalDate.of(2026, 12, 1), 2, 3, null)));

        var interval = ArgumentCaptor.forClass(PeopleService.EmploymentInput.class);
        verify(mapper).createEmployment(eq(1L), interval.capture(), isNull(), eq(7L));
        assertEquals(LocalDate.of(2026, 12, 1), interval.getValue().joinedOn());
        assertEquals(2L, interval.getValue().departmentId());
        assertEquals(3L, interval.getValue().positionId());
        verify(audit).record(7L, "EMPLOYEE_REHIRE", 1L, "2026-12-01 · 产品部（产品经理）");
    }

    @Test
    void rejectsRehiringAnEmployeeWhoIsStillActive() {
        when(mapper.lockEmployee(1L)).thenReturn(1L);
        when(mapper.employee(1L)).thenReturn(employee(1, "testuser", null));
        when(mapper.employments(1L)).thenReturn(List.of(employment(3, LocalDate.of(2026, 12, 1), null)));

        var error = assertThrows(ResponseStatusException.class,
            () -> service.rehire(actor, 1L, rehire(LocalDate.of(2027, 1, 1), 2, 3, null)));

        assertEquals(409, error.getStatusCode().value());
        verify(mapper, never()).createEmployment(anyLong(), any(), any(), anyLong());
    }

    @Test
    void rejectsARehireDateThatOverlapsThePreviousEmployment() {
        when(mapper.lockEmployee(1L)).thenReturn(1L);
        when(mapper.employee(1L)).thenReturn(employee(1, "testuser", LocalDate.of(2026, 11, 15)));
        when(mapper.employments(1L)).thenReturn(List.of(employment(3, LocalDate.of(2020, 1, 1), LocalDate.of(2026, 11, 15))));

        var error = assertThrows(IllegalArgumentException.class,
            () -> service.rehire(actor, 1L, rehire(LocalDate.of(2026, 11, 15), 2, 3, null)));

        assertTrue(error.getMessage().contains("晚于上次离职"));
        verify(mapper, never()).createEmployment(anyLong(), any(), any(), anyLong());
    }

    @Test
    void rehiresWithAccountActivationWithoutChangingThePassword() {
        var departed = employee(1, "testuser", LocalDate.of(2026, 11, 15));
        when(mapper.lockEmployee(1L)).thenReturn(1L);
        when(mapper.employee(1L)).thenReturn(departed, employee(1, "testuser", null));
        when(mapper.employments(1L)).thenReturn(List.of(employment(3, LocalDate.of(2020, 1, 1), LocalDate.of(2026, 11, 15))));
        when(mapper.department(2L)).thenReturn(department(2, "产品部"));
        when(mapper.position(3L)).thenReturn(position(3, "产品经理"));
        when(mapper.departments()).thenReturn(List.of(department(2, "产品部")));
        var account = new AccountService.AccountInput(Set.of(Role.EMPLOYEE), true);

        service.rehire(actor, 1L, rehire(LocalDate.of(2026, 12, 1), 2, 3, account));

        verify(accounts).updateEmployeeAccount(actor, 1L, "testuser", account);
        verify(audit).record(7L, "EMPLOYEE_REHIRE", 1L, "2026-12-01 · 产品部（产品经理）");
    }

    @Test
    void closesTheCurrentEmploymentOnDeparture() {
        when(mapper.lockDepartments()).thenReturn(List.of(1L));
        when(mapper.lockEmployee(1L)).thenReturn(1L);
        when(mapper.currentEmployment(1L)).thenReturn(employment(3, LocalDate.of(2020, 1, 1), null));

        service.depart(actor, 1L, LocalDate.of(2026, 11, 15));

        verify(mapper).closeEmployment(3L, LocalDate.of(2026, 11, 15), 7L);
        verify(mapper).removeManager(1L);
        verify(accounts).disableEmployee(actor, 1L);
        verify(audit).record(7L, "EMPLOYEE_DEPART", 1L, "2026-11-15");
    }

    @Test
    void rejectsDepartureWhenThereIsNoOpenEmployment() {
        when(mapper.lockDepartments()).thenReturn(List.of(1L));
        when(mapper.lockEmployee(1L)).thenReturn(1L);
        when(mapper.currentEmployment(1L)).thenReturn(null);

        var error = assertThrows(IllegalArgumentException.class,
            () -> service.depart(actor, 1L, LocalDate.of(2026, 11, 15)));

        assertTrue(error.getMessage().contains("已离职"));
        verify(mapper, never()).closeEmployment(anyLong(), any(), anyLong());
    }

    @Test
    void usesTheEmployeeMisAsTheLoginNameWhenSavingTheAccount() {
        var input = new AccountService.AccountInput(Set.of(Role.EMPLOYEE), true);
        var view = new AccountService.AccountView(9, true, List.of(Role.EMPLOYEE), null, null, null);
        when(mapper.lockEmployee(1L)).thenReturn(1L);
        when(mapper.employee(1L)).thenReturn(employee(1, "testuser", null));
        when(mapper.currentEmployment(1L)).thenReturn(employment(3, LocalDate.of(2020, 1, 1), null));
        when(accounts.updateEmployeeAccount(actor, 1L, "testuser", input)).thenReturn(view);

        assertSame(view, service.updateAccount(actor, 1L, input));

        verify(accounts).updateEmployeeAccount(actor, 1L, "testuser", input);
    }

    @Test
    void rejectsAccountChangesForADepartedEmployee() {
        when(mapper.lockEmployee(1L)).thenReturn(1L);
        when(mapper.employee(1L)).thenReturn(employee(1, "testuser", LocalDate.of(2026, 11, 15)));
        when(mapper.currentEmployment(1L)).thenReturn(null);

        var error = assertThrows(IllegalArgumentException.class,
            () -> service.updateAccount(actor, 1L, new AccountService.AccountInput(Set.of(Role.EMPLOYEE), true)));

        assertTrue(error.getMessage().contains("离职"));
        verify(accounts, never()).updateEmployeeAccount(any(), anyLong(), any(), any());
    }

    private void mockIdentityDependencies() {
        when(mapper.department(1L)).thenReturn(department(1, "研发部"));
        when(mapper.position(1L)).thenReturn(position(1, "工程师"));
        when(mapper.employeeByIdCard(blindIndex(), 0L)).thenReturn(null);
    }

    private static String blindIndex() {
        return TestPii.CIPHER.blindIndex("11010519491231002X");
    }

    private static PeopleMapper.Department department(long id, String name) {
        return department(id, name, null);
    }

    private static PeopleMapper.Department department(long id, String name, Long parentId) {
        return department(id, name, parentId, true);
    }

    private static PeopleMapper.Department department(long id, String name, Long parentId, boolean active) {
        return new PeopleMapper.Department(id, name, parentId, null, active, null, null, null);
    }

    private static PeopleMapper.Position position(long id, String name) {
        return position(id, name, true);
    }

    private static PeopleMapper.Position position(long id, String name, boolean active) {
        return new PeopleMapper.Position(id, name, null, active, null, null, null);
    }

    private static PeopleService.RehireInput rehire(LocalDate joinedOn, long departmentId, long positionId,
                                                    AccountService.AccountInput account) {
        return new PeopleService.RehireInput(joinedOn, departmentId, positionId, account);
    }

    private static String encrypt(String value, String field) {
        return TestPii.CIPHER.encrypt(value, field);
    }

    private static PeopleMapper.Employment employment(long id, LocalDate joinedOn, LocalDate departedOn) {
        return new PeopleMapper.Employment(id, 1, "研发部", 1, "工程师", joinedOn, departedOn);
    }

    private static PeopleService.EmployeeInput validInput() {
        return validInput("13800138000", "11010519491231002X");
    }

    private static PeopleService.EmployeeInput validInput(String phone, String idCard) {
        return new PeopleService.EmployeeInput("testuser", 1, 1, phone, "test@example.com", idCard,
            "深圳市南山区", "李四", "13900139000", "6222020200112233445", "招商银行", "308584000013",
            LocalDate.of(2020, 1, 1));
    }

    private static PeopleService.EmployeeInput validInput(long departmentId) {
        var base = validInput();
        return new PeopleService.EmployeeInput(base.name(), departmentId, base.positionId(), base.phone(), base.email(),
            base.idCard(), base.address(), base.emergencyContact(), base.emergencyPhone(), base.bankCard(),
            base.bankName(), base.cnapsCode(), base.joinedOn());
    }

    private static PeopleMapper.Employee employee(long id, String mis, LocalDate departedOn) {
        return new PeopleMapper.Employee(id, mis, "testuser", 1, 1,
            encrypt("13800138000", EmployeeSensitive.PHONE), "test@example.com",
            encrypt("11010519491231002X", EmployeeSensitive.ID_CARD), "深圳市南山区", "李四",
            encrypt("13900139000", EmployeeSensitive.EMERGENCY_PHONE), encrypt("6222020200112233445", EmployeeSensitive.BANK_CARD),
            "招商银行", "308584000013", null, departedOn == null ? LocalDate.of(2026, 12, 1) : LocalDate.of(2020, 1, 1),
            departedOn, "研发部", "工程师", null, null, null, null);
    }

    private static PeopleMapper.Employee employee(long id, String mis, LocalDate departedOn, long departmentId,
                                                  String departmentName) {
        var base = employee(id, mis, departedOn);
        return new PeopleMapper.Employee(base.id(), base.mis(), base.name(), departmentId, base.positionId(),
            base.phone(), base.email(), base.idCard(), base.address(), base.emergencyContact(), base.emergencyPhone(),
            base.bankCard(), base.bankName(), base.cnapsCode(), base.avatarKey(), base.joinedOn(), base.departedOn(),
            departmentName, base.positionName(), base.createdAt(), base.updatedAt(), base.operator(), base.accountActive());
    }
}