package com.jianheng.emp.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.any;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.jianheng.emp.security.AccountService.AccountInput;
import com.jianheng.emp.security.AccountService.AccountView;
import com.jianheng.emp.security.AccountService.CurrentUser;
import com.jianheng.emp.security.pii.TestPii;
import com.jianheng.emp.web.AuditMapper;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.session.jdbc.JdbcIndexedSessionRepository;
import org.springframework.transaction.support.TransactionSynchronizationManager;

class AccountServiceTest {
    private final AccountMapper mapper = mock(AccountMapper.class);
    private final PasswordEncoder passwords = mock(PasswordEncoder.class);
    private final AccountService service = new AccountService(mapper, mock(AuditMapper.class),
        passwords, TestPii.CIPHER, mock(JdbcIndexedSessionRepository.class), "admin", "");

    @Test
    void createsTheDisabledSystemAccountOnStartup() {
        when(mapper.byUsername("系统")).thenReturn(null);
        var encoder = new BCryptPasswordEncoder();
        var bootstrap = new AccountService(mapper, mock(AuditMapper.class), encoder, TestPii.CIPHER,
            mock(JdbcIndexedSessionRepository.class), "admin", "");

        bootstrap.run(mock(org.springframework.boot.ApplicationArguments.class));

        var hash = ArgumentCaptor.forClass(String.class);
        verify(mapper).insertDisabled(eq("系统"), hash.capture());
        assertTrue(hash.getValue().startsWith("$2"));
    }

    @Test
    void keepsTheSystemAccountWhenItAlreadyExists() {
        when(mapper.byUsername("系统")).thenReturn(mock(AccountMapper.Account.class));

        service.run(mock(org.springframework.boot.ApplicationArguments.class));

        verify(mapper, never()).insertDisabled(any(), any());
    }

    @Test
    void exposesTheMisOfTheSignedInEmployee() {
        var authentication = mock(Authentication.class);
        when(authentication.getName()).thenReturn("xianghongrui");
        when(mapper.byUsername("xianghongrui"))
            .thenReturn(new AccountMapper.Account(7, "xianghongrui", "hash", 3L, "xianghongrui", "向鸿锐", "avatar.jpg", true, null, null, null, "董事"));
        when(mapper.roles(7)).thenReturn(List.of(Role.EMPLOYEE));

        assertEquals("xianghongrui", service.current(authentication).mis());
    }

    @Test
    void leavesTheMisEmptyForAnAccountWithoutAnEmployee() {
        var authentication = mock(Authentication.class);
        when(authentication.getName()).thenReturn("admin");
        when(mapper.byUsername("admin"))
            .thenReturn(new AccountMapper.Account(1, "admin", "hash", null, null, null, null, true, null, null, null, null));
        when(mapper.roles(1)).thenReturn(List.of(Role.ADMIN));

        assertNull(service.current(authentication).mis());
    }

    @Test
    void opensEmployeeAccountsWithTheMisAndIdCardSuffixAsTheInitialPassword() {
        var actor = new CurrentUser(1, "admin", null, null, null, null, List.of(Role.ADMIN));
        var account = new AccountMapper.Account(9, "xianghongrui", "hash", 3L, "xianghongrui", "向鸿锐", null, true, null, null, null, "董事");
        when(mapper.employeeIdCard(3L)).thenReturn(TestPii.CIPHER.encrypt("110105199001011232", "employee.id_card"));
        when(mapper.byEmployee(3L)).thenReturn(null, account, account);
        when(mapper.roles(9L)).thenReturn(List.of(Role.EMPLOYEE));
        when(passwords.encode("011232")).thenReturn("hash");
        TransactionSynchronizationManager.initSynchronization();
        try {
            var view = service.updateEmployeeAccount(actor, 3L, "xianghongrui",
                new AccountInput(Set.of(Role.EMPLOYEE), true));

            verify(mapper).insert("xianghongrui", "hash", 3L);
            assertEquals(new AccountView(9, true, List.of(Role.EMPLOYEE), null, null, null), view);
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void updatesExistingAccountsWithoutTouchingThePassword() {
        var actor = new CurrentUser(1, "admin", null, null, null, null, List.of(Role.ADMIN));
        var account = new AccountMapper.Account(9, "xianghongrui", "hash", 3L, "xianghongrui", "向鸿锐", null, true, null, null, null, "董事");
        when(mapper.byEmployee(3L)).thenReturn(account);
        when(mapper.roles(9L)).thenReturn(List.of(Role.EMPLOYEE));
        TransactionSynchronizationManager.initSynchronization();
        try {
            service.updateEmployeeAccount(actor, 3L, "xianghongrui", new AccountInput(Set.of(Role.EMPLOYEE), true));
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }

        verify(mapper, never()).insert(anyString(), anyString(), anyLong());
        verify(passwords, never()).encode(anyString());
        verify(mapper).setActive(9L, true);
    }

    @Test
    void storesASaltedHashForTheInitialPassword() {
        var mapper = mock(AccountMapper.class);
        var encoder = new BCryptPasswordEncoder();
        var service = new AccountService(mapper, mock(AuditMapper.class), encoder,
            TestPii.CIPHER, mock(JdbcIndexedSessionRepository.class), "admin", "");
        var actor = new CurrentUser(1, "admin", null, null, null, null, List.of(Role.ADMIN));
        var account = new AccountMapper.Account(9, "xianghongrui", encoder.encode("011232"), 3L, "xianghongrui", "向鸿锐", null, true, null, null, null, "董事");
        when(mapper.employeeIdCard(3L)).thenReturn(TestPii.CIPHER.encrypt("110105199001011232", "employee.id_card"));
        when(mapper.byEmployee(3L)).thenReturn(null, account);
        when(mapper.roles(9L)).thenReturn(List.of(Role.EMPLOYEE));
        TransactionSynchronizationManager.initSynchronization();
        try {
            service.updateEmployeeAccount(actor, 3L, "xianghongrui", new AccountInput(Set.of(Role.EMPLOYEE), true));
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }

        var hash = ArgumentCaptor.forClass(String.class);
        verify(mapper).insert(eq("xianghongrui"), hash.capture(), eq(3L));
        assertTrue(hash.getValue().startsWith("$2"));
        assertNotEquals("011232", hash.getValue());
        assertTrue(encoder.matches("011232", hash.getValue()));
    }
}