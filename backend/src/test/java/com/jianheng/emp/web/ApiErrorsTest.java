package com.jianheng.emp.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.jianheng.emp.people.EmployeeConflict;
import com.jianheng.emp.security.MailDeliveryException;
import com.jianheng.emp.security.VerificationCodeThrottled;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
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

    private static java.util.Map<String, Object> keyValues(ILoggingEvent event) {
        var values = new java.util.HashMap<String, Object>();
        event.getKeyValuePairs().forEach(pair -> values.put(pair.key, pair.value));
        return values;
    }

    @Test
    void businessRejectionsAreLoggedWithStatusAndReason() {
        var appender = new ListAppender<ILoggingEvent>();
        appender.start();
        var logger = (Logger) LoggerFactory.getLogger(ApiErrors.class);
        logger.addAppender(appender);
        try {
            errors.invalid(new IllegalArgumentException("身份证号已存在"));
            errors.employeeConflict(new EmployeeConflict(9, "张三", null));

            assertEquals(2, appender.list.size());
            var rejected = keyValues(appender.list.getFirst());
            assertEquals(Level.WARN, appender.list.getFirst().getLevel());
            assertEquals("REQUEST_REJECTED", rejected.get("event.action"));
            assertEquals(400, rejected.get("http.response.status_code"));
            assertEquals("身份证号已存在", rejected.get("error.message"));
            assertEquals(409, keyValues(appender.list.getLast()).get("http.response.status_code"));
        } finally {
            logger.detachAppender(appender);
        }
    }

    @Test
    void mailFailuresAreReportedAsAnUpstreamFailure() {
        var body = errors.mailFailed(new MailDeliveryException("邮件发送失败，请稍后再试"));

        assertEquals("邮件发送失败，请稍后再试", body.get("message"));
    }
}
