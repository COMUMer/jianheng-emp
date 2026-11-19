package com.jianheng.emp.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;

import com.jianheng.emp.security.VerificationCodeService.Purpose;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/** 连接本地开发库，验证「邮件没发出去就不落库」，避免空发占掉冷却与每小时配额。 */
@SpringBootTest
class VerificationCodeRollbackTest {
    private static final long EMPLOYEE = 5;
    private static final Purpose PURPOSE = Purpose.RESET_PASSWORD;
    private static final String EMAIL = "probe@example.com";

    @Autowired
    private VerificationCodeService codes;

    @Autowired
    private JdbcTemplate jdbc;

    @MockitoBean
    private Mailer mailer;

    @BeforeEach
    void removeStoredCodes() {
        jdbc.update("DELETE FROM verification_code WHERE employee_id = ? AND purpose = ?", EMPLOYEE, PURPOSE.name());
    }

    @AfterEach
    void removeCodesAgain() {
        removeStoredCodes();
    }

    @Test
    void keepsNoCodeWhenTheMailIsRejected() {
        doThrow(new MailDeliveryException("邮件发送失败，请稍后再试")).when(mailer)
            .sendVerificationCode(anyString(), anyString(), anyLong());

        assertThrows(MailDeliveryException.class, () -> codes.issue(EMPLOYEE, PURPOSE, EMAIL));

        assertEquals(0, storedCodes());
    }

    @Test
    void keepsOneCodeWhenTheMailIsAccepted() {
        var issued = codes.issue(EMPLOYEE, PURPOSE, EMAIL);

        assertEquals(VerificationCodeService.Outcome.SENT, issued.outcome());
        assertEquals(1, storedCodes());
    }

    private int storedCodes() {
        Integer count = jdbc.queryForObject(
            "SELECT COUNT(*) FROM verification_code WHERE employee_id = ? AND purpose = ?", Integer.class,
            EMPLOYEE, PURPOSE.name());
        return count == null ? 0 : count;
    }
}
