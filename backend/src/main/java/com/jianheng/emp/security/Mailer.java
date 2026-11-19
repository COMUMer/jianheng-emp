package com.jianheng.emp.security;

/** 验证码邮件通道；投递失败必须抛 {@link MailDeliveryException}，不得静默返回。 */
interface Mailer {
    void sendVerificationCode(String to, String code, long minutes);
}