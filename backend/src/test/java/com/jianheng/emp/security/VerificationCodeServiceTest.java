package com.jianheng.emp.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.HexFormat;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class VerificationCodeServiceTest {
    private static final long EMPLOYEE = 3;
    private static final String EMAIL = "employee@example.com";
    private static final String CODE = "ABC123";
    private static final VerificationCodeService.Purpose PURPOSE = VerificationCodeService.Purpose.CHANGE_PASSWORD;

    private final VerificationCodeMapper mapper = mock(VerificationCodeMapper.class);
    private final Mailer mailer = mock(Mailer.class);
    private final VerificationCodeService service = new VerificationCodeService(mapper, mailer);

    @Test
    void sendsOneCodeAndStartsTheCooldown() {
        var issued = service.issue(EMPLOYEE, PURPOSE, EMAIL);

        assertEquals(new VerificationCodeService.Issued(VerificationCodeService.Outcome.SENT,
            VerificationCodeService.RESEND_COOLDOWN_SECONDS), issued);
        var code = ArgumentCaptor.forClass(String.class);
        var expiresAt = ArgumentCaptor.forClass(LocalDateTime.class);
        verify(mapper).insert(eq(EMPLOYEE), eq(PURPOSE.name()), anyString(), expiresAt.capture());
        verify(mailer).sendVerificationCode(eq(EMAIL), code.capture(), eq(10L));
        assertTrue(code.getValue().matches("[2-9A-HJ-NP-Z]{6}"), code.getValue());
        long ttl = Duration.between(LocalDateTime.now(), expiresAt.getValue()).toSeconds();
        assertTrue(ttl >= VerificationCodeService.TTL_SECONDS - 2 && ttl <= VerificationCodeService.TTL_SECONDS, "" + ttl);
    }

    @Test
    void skipsSendingWhileTheCooldownRuns() {
        when(mapper.latest(EMPLOYEE, PURPOSE.name())).thenReturn(code(CODE, 0, LocalDateTime.now(), null));

        var issued = service.issue(EMPLOYEE, PURPOSE, EMAIL);

        assertEquals(VerificationCodeService.Outcome.COOLDOWN, issued.outcome());
        assertTrue(issued.retryAfterSeconds() >= VerificationCodeService.RESEND_COOLDOWN_SECONDS - 1
            && issued.retryAfterSeconds() <= VerificationCodeService.RESEND_COOLDOWN_SECONDS, "" + issued.retryAfterSeconds());
        verifyNoInteractions(mailer);
        verify(mapper, never()).insert(anyLong(), anyString(), anyString(), any());
    }

    @Test
    void sendsAgainRightAfterTheCooldownExpires() {
        when(mapper.latest(EMPLOYEE, PURPOSE.name()))
            .thenReturn(code(CODE, 0, LocalDateTime.now().minusSeconds(VerificationCodeService.RESEND_COOLDOWN_SECONDS + 1), null));

        var issued = service.issue(EMPLOYEE, PURPOSE, EMAIL);

        assertEquals(VerificationCodeService.Outcome.SENT, issued.outcome());
        verify(mailer).sendVerificationCode(eq(EMAIL), anyString(), eq(10L));
    }

    @Test
    void reportsTheRemainingHourWhenTheHourlyLimitIsReached() {
        when(mapper.countSince(eq(EMPLOYEE), eq(PURPOSE.name()), any())).thenReturn(5);
        when(mapper.oldestSince(eq(EMPLOYEE), eq(PURPOSE.name()), any()))
            .thenReturn(LocalDateTime.now().minusMinutes(20));

        var issued = service.issue(EMPLOYEE, PURPOSE, EMAIL);

        assertEquals(VerificationCodeService.Outcome.LIMIT, issued.outcome());
        assertTrue(issued.retryAfterSeconds() >= 2399 && issued.retryAfterSeconds() <= 2400,
            "" + issued.retryAfterSeconds());
        verifyNoInteractions(mailer);
        verify(mapper, never()).insert(anyLong(), anyString(), anyString(), any());
    }

    @Test
    void fallsBackToTheCooldownWhenTheLimitWindowHasNoRows() {
        when(mapper.countSince(eq(EMPLOYEE), eq(PURPOSE.name()), any())).thenReturn(5);

        var issued = service.issue(EMPLOYEE, PURPOSE, EMAIL);

        assertEquals(new VerificationCodeService.Issued(VerificationCodeService.Outcome.LIMIT,
            VerificationCodeService.RESEND_COOLDOWN_SECONDS), issued);
        verifyNoInteractions(mailer);
    }

    @Test
    void reportsFailureInsteadOfPretendingTheMailWasSent() {
        doThrow(new MailDeliveryException("邮件发送失败，请稍后再试")).when(mailer)
            .sendVerificationCode(anyString(), anyString(), anyLong());

        assertThrows(MailDeliveryException.class, () -> service.issue(EMPLOYEE, PURPOSE, EMAIL));

        verify(mapper).insert(eq(EMPLOYEE), eq(PURPOSE.name()), anyString(), any(LocalDateTime.class));
        verify(mailer).sendVerificationCode(eq(EMAIL), anyString(), eq(10L));
    }

    @Test
    void checksTheCodeWithoutConsumingIt() {
        when(mapper.latest(EMPLOYEE, PURPOSE.name())).thenReturn(code(CODE, 0, LocalDateTime.now(), null));

        service.check(EMPLOYEE, PURPOSE, " abc123 ");

        verify(mapper, never()).consume(anyLong());
    }

    @Test
    void consumesTheCodeWhenThePasswordIsChanged() {
        when(mapper.latest(EMPLOYEE, PURPOSE.name())).thenReturn(code(CODE, 0, LocalDateTime.now(), null));
        when(mapper.consume(1L)).thenReturn(1);

        service.verify(EMPLOYEE, PURPOSE, CODE);

        verify(mapper).consume(1L);
    }

    @Test
    void countsFailedAttemptsWithoutConsumingTheCode() {
        when(mapper.latest(EMPLOYEE, PURPOSE.name())).thenReturn(code(CODE, 0, LocalDateTime.now(), null));

        assertThrows(IllegalArgumentException.class, () -> service.check(EMPLOYEE, PURPOSE, "ZZZZZZ"));

        verify(mapper).bumpAttempts(1L);
        verify(mapper, never()).consume(anyLong());
    }

    @Test
    void rejectsACodeOnceItsLifetimeIsOver() {
        var createdAt = LocalDateTime.now().minusSeconds(VerificationCodeService.TTL_SECONDS + 1);
        when(mapper.latest(EMPLOYEE, PURPOSE.name())).thenReturn(new VerificationCodeMapper.Code(1, EMPLOYEE,
            PURPOSE.name(), hash(EMPLOYEE, CODE), 0, createdAt.plusSeconds(VerificationCodeService.TTL_SECONDS), null, createdAt));

        assertThrows(IllegalArgumentException.class, () -> service.check(EMPLOYEE, PURPOSE, CODE));

        verify(mapper, never()).consume(anyLong());
    }

    @Test
    void rejectsACodeAfterTheFifthWrongAttempt() {
        when(mapper.latest(EMPLOYEE, PURPOSE.name())).thenReturn(code(CODE, 5, LocalDateTime.now(), null));

        assertThrows(IllegalArgumentException.class, () -> service.check(EMPLOYEE, PURPOSE, CODE));

        verify(mapper, never()).consume(anyLong());
        verify(mapper, never()).bumpAttempts(anyLong());
    }

    private static VerificationCodeMapper.Code code(String raw, int attempts, LocalDateTime createdAt, LocalDateTime consumed) {
        return new VerificationCodeMapper.Code(1, EMPLOYEE, PURPOSE.name(), hash(EMPLOYEE, raw), attempts,
            createdAt.plusSeconds(VerificationCodeService.TTL_SECONDS), consumed, createdAt);
    }

    private static String hash(long employeeId, String raw) {
        try {
            var digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest((employeeId + ":" + raw).getBytes(StandardCharsets.UTF_8)));
        } catch (Exception error) {
            throw new IllegalStateException(error);
        }
    }
}
