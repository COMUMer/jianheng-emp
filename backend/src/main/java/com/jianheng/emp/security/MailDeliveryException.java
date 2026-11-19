package com.jianheng.emp.security;

/** 验证码邮件没有交给邮件服务；调用方必须如实提示失败，不得当作已送达。 */
public class MailDeliveryException extends RuntimeException {
    public MailDeliveryException(String message) {
        super(message);
    }

    public MailDeliveryException(String message, Throwable cause) {
        super(message, cause);
    }
}
