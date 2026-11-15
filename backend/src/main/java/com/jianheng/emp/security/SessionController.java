package com.jianheng.emp.security;

import com.jianheng.emp.web.AuditMapper;
import java.util.List;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
class SessionController {
    record Csrf(String headerName, String token) {}

    private final AccountService accounts;
    private final AuditMapper audit;

    SessionController(AccountService accounts, AuditMapper audit) {
        this.accounts = accounts;
        this.audit = audit;
    }

    @GetMapping("/session/csrf")
    Csrf csrf(CsrfToken token) { return new Csrf(token.getHeaderName(), token.getToken()); }

    @GetMapping("/session/me")
    AccountService.CurrentUser me(Authentication authentication) { return accounts.current(authentication); }

    @GetMapping("/audit")
    List<AuditMapper.Entry> audit(Authentication authentication) {
        accounts.require(accounts.current(authentication), Role.ADMIN);
        return audit.recent();
    }
}
