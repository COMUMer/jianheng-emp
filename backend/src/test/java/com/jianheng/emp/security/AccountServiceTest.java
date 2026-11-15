package com.jianheng.emp.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.jianheng.emp.security.AccountService.AccountInput;
import com.jianheng.emp.security.AccountService.AccountView;
import com.jianheng.emp.security.AccountService.CurrentUser;
import com.jianheng.emp.web.AuditMapper;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.session.jdbc.JdbcIndexedSessionRepository;
import org.springframework.transaction.support.TransactionSynchronizationManager;

class AccountServiceTest {
    private final AccountMapper mapper = mock(AccountMapper.class);
    private final PasswordEncoder passwords = mock(PasswordEncoder.class);
    private final AccountService service = new AccountService(mapper, mock(AuditMapper.class),
        passwords, mock(JdbcIndexedSessionRepository.class), "admin", "");

    @Test
    void exposesTheMisOfTheSignedInEmployee() {
        var authentication = mock(Authentication.class);
        when(authentication.getName()).thenReturn("xianghongrui");
        when(mapper.byUsername("xianghongrui"))
            .thenReturn(new AccountMapper.Account(7, "xianghongrui", "hash", 3L, "xianghongrui", "向鸿锐", "avatar.jpg", true, null, null, null));
        when(mapper.roles(7)).thenReturn(List.of(Role.EMPLOYEE));

        assertEquals("xianghongrui", service.current(authentication).mis());
    }

    @Test
    void leavesTheMisEmptyForAnAccountWithoutAnEmployee() {
        var authentication = mock(Authentication.class);
        when(authentication.getName()).thenReturn("admin");
        when(mapper.byUsername("admin"))
            .thenReturn(new AccountMapper.Account(1, "admin", "hash", null, null, null, null, true, null, null, null));
        when(mapper.roles(1)).thenReturn(List.of(Role.ADMIN));

        assertNull(service.current(authentication).mis());
    }

    @Test
    void opensEmployeeAccountsWithTheMisAsLoginName() {
        var actor = new CurrentUser(1, "admin", null, null, null, null, List.of(Role.ADMIN));
        var account = new AccountMapper.Account(9, "xianghongrui", "hash", 3L, "xianghongrui", "向鸿锐", null, true, null, null, null);
        when(mapper.byEmployee(3L)).thenReturn(null, account, account);
        when(mapper.roles(9L)).thenReturn(List.of(Role.EMPLOYEE));
        when(passwords.encode("password123")).thenReturn("hash");
        TransactionSynchronizationManager.initSynchronization();
        try {
            var view = service.updateEmployeeAccount(actor, 3L, "xianghongrui",
                new AccountInput("password123", Set.of(Role.EMPLOYEE), true));

            verify(mapper).insert("xianghongrui", "hash", 3L);
            assertEquals(new AccountView(9, true, List.of(Role.EMPLOYEE), null, null, null), view);
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }
}
