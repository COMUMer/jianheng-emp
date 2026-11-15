package com.jianheng.emp.people;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.jianheng.emp.security.AccountService;
import com.jianheng.emp.security.AccountService.CurrentUser;
import com.jianheng.emp.security.Role;
import com.jianheng.emp.web.AuditMapper;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class PeopleServiceTest {
    private final PeopleMapper mapper = mock(PeopleMapper.class);
    private final AuditMapper audit = mock(AuditMapper.class);
    private final AccountService accounts = mock(AccountService.class);
    private final PeopleService service = new PeopleService(mapper, audit, accounts);
    private final CurrentUser actor = new CurrentUser(7, "hr", null, null, null, null, List.of(Role.HR));

    @Test
    void createsAnEmployeeWithNormalizedProfileFields() {
        var input = validInput(" +86 138 0013 8000 ", "11010519491231002x");
        var created = employee(1, "testuser");
        mockCreateDependencies();
        when(mapper.misSequence("testuser")).thenReturn(1);
        when(mapper.employeeByMis("testuser")).thenReturn(created);

        assertSame(created, service.saveEmployee(actor, null, input));

        var saved = ArgumentCaptor.forClass(PeopleService.EmployeeInput.class);
        verify(mapper).bumpMisSequence("testuser");
        verify(mapper).createEmployee(eq("testuser"), saved.capture(), eq(7L));
        assertEquals("13800138000", saved.getValue().phone());
        assertEquals("11010519491231002X", saved.getValue().idCard());
        assertEquals("6222020200112233445", saved.getValue().bankCard());
        assertEquals("308584000013", saved.getValue().cnapsCode());
        verify(audit).record(actor.id(), "EMPLOYEE_CREATE", 1L, "入职建档");
    }

    @Test
    void numbersTheMisWhenThePinyinIsAlreadyTaken() {
        var created = employee(2, "testuser3");
        mockCreateDependencies();
        when(mapper.misSequence("testuser")).thenReturn(3);
        when(mapper.employeeByMis("testuser3")).thenReturn(created);

        assertSame(created, service.saveEmployee(actor, null, validInput()));

        verify(mapper).createEmployee(eq("testuser3"), any(), eq(7L));
    }

    @Test
    void rejectsADuplicateIdCardWhenCreating() {
        when(mapper.department(1L)).thenReturn(new PeopleMapper.Department(1, "研发部", null, null, null, null, null));
        when(mapper.position(1L)).thenReturn(new PeopleMapper.Position(1, "工程师", null, null, null));
        when(mapper.employeeByIdCard("11010519491231002X", 0L)).thenReturn(9L);

        var error = assertThrows(IllegalArgumentException.class, () -> service.saveEmployee(actor, null, validInput()));

        assertEquals("身份证号已存在", error.getMessage());
        verify(mapper, never()).createEmployee(any(), any(), anyLong());
    }

    @Test
    void rejectsADuplicateIdCardWhenUpdating() {
        var before = employee(1, "testuser");
        when(mapper.department(1L)).thenReturn(new PeopleMapper.Department(1, "研发部", null, null, null, null, null));
        when(mapper.position(1L)).thenReturn(new PeopleMapper.Position(1, "工程师", null, null, null));
        when(mapper.lockEmployee(1L)).thenReturn(1L);
        when(mapper.employee(1L)).thenReturn(before);
        when(mapper.employeeByIdCard("11010519491231002X", 1L)).thenReturn(9L);

        var error = assertThrows(IllegalArgumentException.class, () -> service.saveEmployee(actor, 1L, validInput()));

        assertEquals("身份证号已存在", error.getMessage());
        verify(mapper, never()).updateEmployee(anyLong(), any(), anyLong());
    }

    @Test
    void usesTheEmployeeMisAsTheLoginNameWhenSavingTheAccount() {
        var input = new AccountService.AccountInput("password123", Set.of(Role.EMPLOYEE), true);
        var view = new AccountService.AccountView(9, true, List.of(Role.EMPLOYEE), null, null, null);
        when(mapper.lockEmployee(1L)).thenReturn(1L);
        when(mapper.employee(1L)).thenReturn(employee(1, "testuser"));
        when(accounts.updateEmployeeAccount(actor, 1L, "testuser", input)).thenReturn(view);

        assertSame(view, service.updateAccount(actor, 1L, input));

        verify(accounts).updateEmployeeAccount(actor, 1L, "testuser", input);
    }

    private void mockCreateDependencies() {
        when(mapper.department(1L)).thenReturn(new PeopleMapper.Department(1, "研发部", null, null, null, null, null));
        when(mapper.position(1L)).thenReturn(new PeopleMapper.Position(1, "工程师", null, null, null));
        when(mapper.employeeByIdCard("11010519491231002X", 0L)).thenReturn(null);
    }

    private static PeopleService.EmployeeInput validInput() {
        return validInput("13800138000", "11010519491231002X");
    }

    private static PeopleService.EmployeeInput validInput(String phone, String idCard) {
        return new PeopleService.EmployeeInput("testuser", 1, 1, phone, "test@example.com", idCard,
            "深圳市南山区", "李四", "13900139000", "6222020200112233445", "招商银行", "308584000013",
            LocalDate.of(2020, 1, 1));
    }

    private static PeopleMapper.Employee employee(long id, String mis) {
        return new PeopleMapper.Employee(id, mis, "testuser", 1, 1, "13800138000", "test@example.com",
            "11010519491231002X", "深圳市南山区", "李四", "13900139000", "6222020200112233445",
            "招商银行", "308584000013", null, LocalDate.of(2020, 1, 1), null, "研发部", "工程师", null, null, null);
    }
}
