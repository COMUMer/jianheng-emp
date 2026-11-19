package com.jianheng.emp.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

@Configuration(proxyBeanMethods = false)
class MailConfiguration {
    @Bean
    Mailer mailer(Environment environment, @Value("${mail.resend-key:}") String resendKey,
                  MailSettingsService settings) {
        if (!resendKey.isBlank()) return new ResendMailer(resendKey.strip(), settings);
        return environment.matchesProfiles("dev") ? new LoggingMailer() : new UnavailableMailer();
    }
}