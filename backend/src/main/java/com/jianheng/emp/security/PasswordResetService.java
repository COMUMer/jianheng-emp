package com.jianheng.emp.security;

import com.jianheng.emp.security.AccountService.CurrentUser;
import com.jianheng.emp.security.VerificationCodeService.Purpose;
import com.jianheng.emp.web.AuditMapper;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 邮箱验证码改密：登录页忘记密码与登录后主动改密共用一套验证码。 */
@Service
class PasswordResetService {
    private final AccountMapper accounts;
    private final AccountService accountService;
    private final VerificationCodeService codes;
    private final PasswordEncoder passwords;
    private final AuditMapper audit;

    PasswordResetService(AccountMapper accounts, AccountService accountService, VerificationCodeService codes,
                         PasswordEncoder passwords, AuditMapper audit) {
        this.accounts = accounts;
        this.accountService = accountService;
        this.codes = codes;
        this.passwords = passwords;
        this.audit = audit;
    }

    /** 登录页：只向「账号 + 档案邮箱」都匹配的员工发码；不匹配时静默受理，不透露账号是否存在。 */
    CodeIssued requestReset(String mis, String email) {
        var target = accounts.resetTarget(mis.strip());
        if (target == null || !target.email().strip().equalsIgnoreCase(email.strip())) {
            return new CodeIssued(VerificationCodeService.RESEND_COOLDOWN_SECONDS);
        }
        return send(target.employeeId(), Purpose.RESET_PASSWORD, target.email().strip());
    }

    @Transactional
    void reset(String mis, String email, String code, String newPassword) {
        var target = matched(mis, email);
        codes.verify(target.employeeId(), Purpose.RESET_PASSWORD, code);
        AccountService.validatePassword(newPassword);
        accounts.setPassword(target.accountId(), passwords.encode(newPassword));
        accountService.revokeSessions(target.username(), null);
        audit.record(target.accountId(), "PASSWORD_RESET", target.accountId(), "邮箱验证码重置密码");
    }

    /** 登录页分步：先确认「账号 + 档案邮箱」匹配，通过后才进入验证码。 */
    void checkIdentity(String mis, String email) {
        matched(mis, email, "账号或档案邮箱不正确");
    }

    /** 登录页分步：校验验证码（不消费），通过后才展示新密码输入。 */
    void verifyReset(String mis, String email, String code) {
        var target = matched(mis, email);
        codes.check(target.employeeId(), Purpose.RESET_PASSWORD, code);
    }

    /** 登录后：把验证码发到本人档案邮箱。 */
    CodeIssued requestChange(CurrentUser user) {
        var target = ownTarget(user);
        return send(target.employeeId(), Purpose.CHANGE_PASSWORD, target.email().strip());
    }

    /** 只有真正交给邮件服务才返回成功；被节流或发信失败一律抛出，由接口如实返回。 */
    private CodeIssued send(long employeeId, Purpose purpose, String email) {
        var issued = codes.issue(employeeId, purpose, email);
        if (issued.outcome() != VerificationCodeService.Outcome.SENT) {
            throw new VerificationCodeThrottled(issued.retryAfterSeconds());
        }
        return new CodeIssued(issued.retryAfterSeconds());
    }

    /** 分步改密：先确认验证码，再展示新密码输入。 */
    void verify(CurrentUser user, String code) {
        var target = ownTarget(user);
        codes.check(target.employeeId(), Purpose.CHANGE_PASSWORD, code);
    }

    @Transactional
    void change(CurrentUser user, String code, String newPassword, String keepSessionId) {
        var target = ownTarget(user);
        codes.verify(target.employeeId(), Purpose.CHANGE_PASSWORD, code);
        AccountService.validatePassword(newPassword);
        accounts.setPassword(target.accountId(), passwords.encode(newPassword));
        accountService.revokeSessions(target.username(), keepSessionId);
        audit.record(target.accountId(), "PASSWORD_CHANGE", target.accountId(), "验证码修改密码");
    }

    String emailOf(CurrentUser user) { return ownTarget(user).email().strip(); }

    private AccountMapper.ResetTarget ownTarget(CurrentUser user) {
        var target = accounts.resetTarget(user.username());
        if (target == null || user.employeeId() == null) throw new IllegalStateException("账号未绑定员工档案");
        return target;
    }

    private AccountMapper.ResetTarget matched(String mis, String email) {
        return matched(mis, email, "账号、邮箱或验证码不正确");
    }

    private AccountMapper.ResetTarget matched(String mis, String email, String message) {
        var target = accounts.resetTarget(mis.strip());
        if (target == null || !target.email().strip().equalsIgnoreCase(email.strip())) {
            throw new IllegalArgumentException(message);
        }
        return target;
    }
}
