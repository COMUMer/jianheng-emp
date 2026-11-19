package com.jianheng.emp.web.logging;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class RequestLoggingFilterTest {
    private final RequestLoggingFilter filter = new RequestLoggingFilter(1000);

    @AfterEach
    void clearMdc() {
        MDC.clear();
    }

    @Test
    void generatesRequestIdAndClearsMdc() throws Exception {
        var request = new MockHttpServletRequest("GET", "/api/documents");
        var response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getHeader("X-Request-Id")).isNotBlank();
        assertThat(MDC.get("requestId")).isNull();
        assertThat(MDC.get("userName")).isNull();
    }

    @Test
    void keepsAValidClientRequestId() throws Exception {
        var request = new MockHttpServletRequest("GET", "/api/documents");
        request.addHeader("X-Request-Id", "req-20261119-0001");
        var response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getHeader("X-Request-Id")).isEqualTo("req-20261119-0001");
    }

    @Test
    void replacesAnInvalidRequestId() throws Exception {
        var request = new MockHttpServletRequest("GET", "/api/documents");
        request.addHeader("X-Request-Id", "bad\nvalue");
        var response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getHeader("X-Request-Id")).isNotEqualTo("bad\nvalue");
        assertThat(response.getHeader("X-Request-Id")).isNotBlank();
    }
}