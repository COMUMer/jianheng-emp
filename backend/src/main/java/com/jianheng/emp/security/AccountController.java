package com.jianheng.emp.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/account")
class AccountController {
    record ChangePassword(@NotBlank(message = "请输入验证码") @Size(min = 6, max = 6, message = "验证码为 6 位") String code,
                          @NotBlank(message = "请输入新密码") @Size(min = 6, max = 72, message = "密码至少 6 个字符")
                          String newPassword) {}
    record VerifyPasswordCode(@NotBlank(message = "请输入验证码") @Size(min = 6, max = 6, message = "验证码为 6 位") String code) {}
    record PasswordEmail(String email) {}

    private final AccountService accounts;
    private final PasswordResetService reset;

    AccountController(AccountService accounts, PasswordResetService reset) {
        this.accounts = accounts;
        this.reset = reset;
    }

    @PostMapping("/password/code")
    CodeIssued sendPasswordCode(Authentication authentication) { return reset.requestChange(accounts.current(authentication)); }

    @GetMapping("/password/email")
    PasswordEmail passwordEmail(Authentication authentication) {
        return new PasswordEmail(reset.emailOf(accounts.current(authentication)));
    }

    @PostMapping("/password/verify")
    void verifyPassword(Authentication authentication, @Valid @RequestBody VerifyPasswordCode input) {
        reset.verify(accounts.current(authentication), input.code());
    }

    @PutMapping("/password")
    void changePassword(Authentication authentication, @Valid @RequestBody ChangePassword input, HttpServletRequest request) {
        var session = request.getSession(false);
        reset.change(accounts.current(authentication), input.code(), input.newPassword(), session == null ? null : session.getId());
    }
}
