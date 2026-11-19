package com.jianheng.emp.security;

import com.jianheng.emp.web.AuditMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
class SessionController {
    record Csrf(String headerName, String token) {}

    record PasswordCode(@NotBlank(message = "请输入账号") String mis,
                        @NotBlank(message = "请输入邮箱") @Email(message = "请输入有效的邮箱") String email) {}
    record PasswordIdentity(@NotBlank(message = "请输入账号") String mis,
                            @NotBlank(message = "请输入邮箱") @Email(message = "请输入有效的邮箱") String email) {}
    record PasswordVerify(@NotBlank(message = "请输入账号") String mis,
                          @NotBlank(message = "请输入邮箱") @Email(message = "请输入有效的邮箱") String email,
                          @NotBlank(message = "请输入验证码") @Size(min = 6, max = 6, message = "验证码为 6 位") String code) {}
    record PasswordReset(@NotBlank(message = "请输入账号") String mis,
                         @NotBlank(message = "请输入邮箱") @Email(message = "请输入有效的邮箱") String email,
                         @NotBlank(message = "请输入验证码") @Size(min = 6, max = 6, message = "验证码为 6 位") String code,
                         @NotBlank(message = "请输入新密码") @Size(min = 6, max = 72, message = "密码至少 6 个字符") String newPassword) {}

    private final AccountService accounts;
    private final AuditMapper audit;
    private final PasswordResetService reset;

    SessionController(AccountService accounts, AuditMapper audit, PasswordResetService reset) {
        this.accounts = accounts;
        this.audit = audit;
        this.reset = reset;
    }

    @PostMapping("/session/password/code")
    CodeIssued passwordCode(@Valid @RequestBody PasswordCode input) {
        return reset.requestReset(input.mis(), input.email());
    }

    @PostMapping("/session/password/check")
    void passwordCheck(@Valid @RequestBody PasswordIdentity input) {
        reset.checkIdentity(input.mis(), input.email());
    }

    @PostMapping("/session/password/verify")
    void passwordVerify(@Valid @RequestBody PasswordVerify input) {
        reset.verifyReset(input.mis(), input.email(), input.code());
    }

    @PostMapping("/session/password/reset")
    void passwordReset(@Valid @RequestBody PasswordReset input) {
        reset.reset(input.mis(), input.email(), input.code(), input.newPassword());
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
