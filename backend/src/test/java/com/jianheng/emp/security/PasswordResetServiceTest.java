package com.jianheng.emp.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.jianheng.emp.security.AccountService.CurrentUser;
import com.jianheng.emp.security.VerificationCodeService.Issued;
import com.jianheng.emp.security.VerificationCodeService.Outcome;
import com.jianheng.emp.security.VerificationCodeService.Purpose;
import com.jianheng.emp.web.AuditMapper;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

class PasswordResetServiceTest {
    private static final long EMPLOYEE = 3;
    private static final String EMAIL = "employee@example.com";
    private static final long COOLDOWN = VerificationCodeService.RESEND_COOLDOWN_SECONDS;
    private static final AccountMapper.ResetTarget TARGET =
        new AccountMapper.ResetTarget(9, EMPLOYEE, "employee-03", EMAIL);

    private final AccountMapper accounts = mock(AccountMapper.class);
    private final AccountService accountService = mock(AccountService.class);
    private final VerificationCodeService codes = mock(VerificationCodeService.class);
    private final PasswordEncoder passwords = mock(PasswordEncoder.class);
    private final AuditMapper audit = mock(AuditMapper.class);
    private final PasswordResetService service =
        new PasswordResetService(accounts, accountService, codes, passwords, audit);
    private final CurrentUser user =
        new CurrentUser(9, "employee-03", EMPLOYEE, "employee-03", "员工", null, List.of(Role.EMPLOYEE));

    @Test
    void reportsTheCooldownWhenTheCodeWasSent() {
        when(accounts.resetTarget("employee-03")).thenReturn(TARGET);
        when(codes.issue(EMPLOYEE, Purpose.CHANGE_PASSWORD, EMAIL)).thenReturn(new Issued(Outcome.SENT, COOLDOWN));

        assertEquals(new CodeIssued(COOLDOWN), service.requestChange(user));
    }

    @Test
    void refusesToReportSuccessWhileTheCooldownRuns() {
        when(accounts.resetTarget("employee-03")).thenReturn(TARGET);
        when(codes.issue(EMPLOYEE, Purpose.CHANGE_PASSWORD, EMAIL)).thenReturn(new Issued(Outcome.COOLDOWN, 42));

        var error = assertThrows(VerificationCodeThrottled.class, () -> service.requestChange(user));

        assertEquals(42, error.retryAfterSeconds());
        assertTrue(error.getMessage().contains("42"), error.getMessage());
    }

    @Test
    void refusesToReportSuccessWhenTheHourlyLimitIsReached() {
        when(accounts.resetTarget("employee-03")).thenReturn(TARGET);
        when(codes.issue(EMPLOYEE, Purpose.CHANGE_PASSWORD, EMAIL)).thenReturn(new Issued(Outcome.LIMIT, 2400));

        var error = assertThrows(VerificationCodeThrottled.class, () -> service.requestChange(user));

        assertEquals(2400, error.retryAfterSeconds());
    }

    @Test
    void refusesToSendWhenTheAccountIsNotLinkedToAnEmployee() {
        var unlinked = new CurrentUser(1, "1", null, null, null, null, List.of(Role.ADMIN));

        assertThrows(IllegalStateException.class, () -> service.requestChange(unlinked));

        verifyNoInteractions(codes);
    }

    @Test
    void requestsACodeForTheMatchingMailbox() {
        when(accounts.resetTarget("employee-03")).thenReturn(TARGET);
        when(codes.issue(EMPLOYEE, Purpose.RESET_PASSWORD, EMAIL)).thenReturn(new Issued(Outcome.SENT, COOLDOWN));

        assertEquals(new CodeIssued(COOLDOWN), service.requestReset(" employee-03 ", EMAIL.toUpperCase()));

        verify(codes).issue(EMPLOYEE, Purpose.RESET_PASSWORD, EMAIL);
    }

    @Test
    void acceptsTheRequestWithoutSendingWhenTheAccountOrMailboxDoesNotMatch() {
        when(accounts.resetTarget("employee-03")).thenReturn(TARGET);

        assertEquals(new CodeIssued(COOLDOWN), service.requestReset("employee-03", "other@example.com"));

        verifyNoInteractions(codes);
    }

    @Test
    void reportsTheDeliveryFailureOfTheResetMail() {
        when(accounts.resetTarget("employee-03")).thenReturn(TARGET);
        when(codes.issue(EMPLOYEE, Purpose.RESET_PASSWORD, EMAIL))
            .thenThrow(new MailDeliveryException("邮件发送失败，请稍后再试"));

        assertThrows(MailDeliveryException.class, () -> service.requestReset("employee-03", EMAIL));
    }

    @Test
    void refusesToReportSuccessWhileTheResetIsThrottled() {
        when(accounts.resetTarget("employee-03")).thenReturn(TARGET);
        when(codes.issue(EMPLOYEE, Purpose.RESET_PASSWORD, EMAIL)).thenReturn(new Issued(Outcome.COOLDOWN, 30));

        var error = assertThrows(VerificationCodeThrottled.class, () -> service.requestReset("employee-03", EMAIL));

        assertEquals(30, error.retryAfterSeconds());
    }

    @Test
    void refusesToResetWithoutTheMatchingMailbox() {
        when(accounts.resetTarget(anyString())).thenReturn(null);

        assertThrows(IllegalArgumentException.class,
            () -> service.reset("nobody", EMAIL, "ABC123", "new-secret"));
    }

    @Test
    void refusesToCheckAnUnknownIdentity() {
        when(accounts.resetTarget("employee-03")).thenReturn(TARGET);

        assertThrows(IllegalArgumentException.class,
            () -> service.checkIdentity(" employee-03 ", "other@example.com"));
    }

    @Test
    void checksTheResetCodeWithoutConsumingIt() {
        when(accounts.resetTarget("employee-03")).thenReturn(TARGET);

        service.verifyReset("employee-03", EMAIL, "ABC123");

        verify(codes).check(EMPLOYEE, Purpose.RESET_PASSWORD, "ABC123");
    }
}
