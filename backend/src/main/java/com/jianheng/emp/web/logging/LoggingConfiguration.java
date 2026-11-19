package com.jianheng.emp.web.logging;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 请求日志过滤器只注册到 Spring Security 链中，避免被 Servlet 容器重复注册。
 */
@Configuration(proxyBeanMethods = false)
public class LoggingConfiguration {
    @Bean
    RequestLoggingFilter requestLoggingFilter(@Value("${EMP_LOG_SLOW_REQUEST_MS:1000}") long slowRequestMs) {
        return new RequestLoggingFilter(slowRequestMs);
    }

    @Bean
    FilterRegistrationBean<RequestLoggingFilter> requestLoggingFilterRegistration(RequestLoggingFilter filter) {
        var registration = new FilterRegistrationBean<>(filter);
        registration.setEnabled(false);
        return registration;
    }
}