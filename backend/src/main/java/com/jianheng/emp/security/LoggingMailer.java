package com.jianheng.emp.security;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

final class LoggingMailer implements Mailer {
    private static final Logger log = LoggerFactory.getLogger(LoggingMailer.class);

    @Override
    public void sendVerificationCode(String to, String code, long minutes) {
        log.warn("开发环境未配置 RESEND_API_KEY，验证码仅打印到日志：邮箱={} 验证码={} 有效期={}分钟", to, code, minutes);
    }
}

final class UnavailableMailer implements Mailer {
    @Override
    public void sendVerificationCode(String to, String code, long minutes) {
        throw new MailDeliveryException("邮件服务未配置（RESEND_API_KEY）");
    }
}