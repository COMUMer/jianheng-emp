package com.jianheng.emp.security;

import com.jianheng.emp.web.AuditMapper;
import java.util.*;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import com.jianheng.emp.security.pii.PiiCipher;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.session.jdbc.JdbcIndexedSessionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AccountService implements UserDetailsService, ApplicationRunner {
    public record CurrentUser(long id, String username, Long employeeId, String mis, String name, String avatarKey,
                              List<Role> roles, String positionName) {
        public CurrentUser(long id, String username, Long employeeId, String mis, String name, String avatarKey,
                           List<Role> roles) {
            this(id, username, employeeId, mis, name, avatarKey, roles, null);
        }
        public boolean has(Role role) { return roles.contains(role); }
    }
    public record AccountInput(Set<Role> roles, boolean active) {}
    public record AccountView(long id, boolean active, List<Role> roles, java.time.LocalDateTime createdAt,
                              java.time.LocalDateTime updatedAt, String operator) {}

    private final AccountMapper mapper;
    private final AuditMapper audit;
    private final PasswordEncoder passwords;
    private final PiiCipher cipher;
    private final JdbcIndexedSessionRepository sessions;
    private final String adminUsername;
    private final String adminPassword;

    public AccountService(AccountMapper mapper, AuditMapper audit, PasswordEncoder passwords, PiiCipher cipher,
                          JdbcIndexedSessionRepository sessions,
                          @Value("${EMP_ADMIN_USER:admin}") String adminUsername,
                          @Value("${EMP_ADMIN_PASSWORD:}") String adminPassword) {
        this.mapper = mapper;
        this.audit = audit;
        this.passwords = passwords;
        this.cipher = cipher;
        this.sessions = sessions;
        this.adminUsername = adminUsername;
        this.adminPassword = adminPassword;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (mapper.count() != 0 || adminPassword.isBlank()) return;
        validateCredentials(adminUsername, adminPassword);
        mapper.insert(adminUsername, passwords.encode(adminPassword), null);
        mapper.addRole(mapper.byUsername(adminUsername).id(), Role.ADMIN);
    }

    @Override
    public UserDetails loadUserByUsername(String username) {
        var account = mapper.byUsername(username);
        if (account == null) throw new UsernameNotFoundException(username);
        return User.withUsername(account.username()).password(account.passwordHash()).disabled(!account.active())
            .authorities(mapper.roles(account.id()).stream().map(Enum::name).toArray(String[]::new)).build();
    }

    public CurrentUser current(Authentication authentication) {
        var account = mapper.byUsername(authentication.getName());
        if (account == null || !account.active()) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        return new CurrentUser(account.id(), account.username(), account.employeeId(), account.employeeMis(),
            account.employeeName(), account.employeeAvatarKey(), mapper.roles(account.id()), account.employeePositionName());
    }

    public void require(CurrentUser user, Role... roles) {
        if (Arrays.stream(roles).noneMatch(user::has)) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
    }

    public AccountView employeeAccount(long employeeId) {
        var account = mapper.byEmployee(employeeId);
        return account == null ? null : new AccountView(account.id(), account.active(), mapper.roles(account.id()),
            account.createdAt(), account.updatedAt(), account.operator());
    }

    @Transactional
    public AccountView updateEmployeeAccount(CurrentUser actor, long employeeId, String loginName, AccountInput input) {
        var account = mapper.byEmployee(employeeId);
        var roles = input.roles() == null || input.roles().isEmpty()
            ? EnumSet.of(Role.EMPLOYEE) : EnumSet.copyOf(input.roles());
        if (roles.contains(Role.ADMIN)) throw new IllegalArgumentException("员工账号不可授予系统管理员角色");
        roles.add(Role.EMPLOYEE);
        if (account == null) {
            String idCard = cipher.decrypt(mapper.employeeIdCard(employeeId), "employee.id_card");
            if (idCard == null || idCard.length() < 6) throw new IllegalArgumentException("员工身份证号不完整，无法开通账号");
            String initialPassword = idCard.substring(idCard.length() - 6).toUpperCase(Locale.ROOT);
            mapper.insert(loginName, passwords.encode(initialPassword), employeeId);
            account = mapper.byEmployee(employeeId);
        }
        mapper.clearRoles(account.id());
        for (Role role : roles) mapper.addRole(account.id(), role);
        mapper.setActive(account.id(), input.active());
        mapper.touchOperator(account.id(), actor.id());
        audit.record(actor.id(), "ACCOUNT_UPDATE", account.id(), (input.active() ? "启用 " : "停用 ") + roles);
        invalidateAfterCommit(account.username());
        return employeeAccount(employeeId);
    }

    @Transactional
    public void disableEmployee(CurrentUser actor, long employeeId) {
        var account = mapper.byEmployee(employeeId);
        if (account == null || !account.active()) return;
        mapper.setActive(account.id(), false);
        mapper.touchOperator(account.id(), actor.id());
        audit.record(actor.id(), "ACCOUNT_DISABLE", account.id(), account.username());
        invalidateAfterCommit(account.username());
    }

    private void invalidateAfterCommit(String username) { revokeSessions(username, null); }

    /** 撤销该账号的会话；keepSessionId 非空时保留这一个（本人改密后当前页面不掉线）。 */
    @Transactional
    public void revokeSessions(String username, String keepSessionId) {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() {
                sessions.findByPrincipalName(username).keySet().stream()
                    .filter(sessionId -> !sessionId.equals(keepSessionId))
                    .forEach(sessions::deleteById);
            }
        });
    }

    private static void validateCredentials(String username, String password) {
        if (username == null || !username.matches("[A-Za-z0-9_.@-]{3,64}")) {
            throw new IllegalArgumentException("账号须为 3 至 64 位字母、数字或 ._@-");
        }
        validatePassword(password);
    }

    static void validatePassword(String password) {
        if (password == null || password.length() < 6 || password.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 72) {
            throw new IllegalArgumentException("密码至少 6 个字符，且 UTF-8 编码不超过 72 字节");
        }
    }
}