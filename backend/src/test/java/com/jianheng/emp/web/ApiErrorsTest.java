package com.jianheng.emp.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.jianheng.emp.security.MailDeliveryException;
import com.jianheng.emp.security.VerificationCodeThrottled;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.bind.MissingServletRequestParameterException;

class ApiErrorsTest {
    private final ApiErrors errors = new ApiErrors();

    @Test
    void unexpectedErrorsReturnAnExplanation() {
        var response = errors.unexpected(new IllegalStateException("boom"),
            new MockHttpServletRequest("POST", "/api/attachments"));

        assertEquals(500, response.getStatusCode().value());
        assertTrue(response.getBody().get("message").contains("服务器处理失败"));
    }

    @Test
    void missingParametersReturnAnExplanation() {
        var body = errors.missingParameter(new MissingServletRequestParameterException("category", "FileCategory"));

        assertTrue(body.get("message").contains("请求缺少必要信息"));
    }

    @Test
    void throttledCodesTellTheClientWhenToRetry() {
        var response = errors.throttled(new VerificationCodeThrottled(47));

        assertEquals(429, response.getStatusCode().value());
        assertEquals("47", response.getHeaders().getFirst("Retry-After"));
        assertEquals(47L, response.getBody().get("retryAfterSeconds"));
        assertEquals("验证码发送过于频繁，请 47 秒后再试", response.getBody().get("message"));
    }

    @Test
    void mailFailuresAreReportedAsAnUpstreamFailure() {
        var body = errors.mailFailed(new MailDeliveryException("邮件发送失败，请稍后再试"));

        assertEquals("邮件发送失败，请稍后再试", body.get("message"));
    }
}
