package com.jianheng.emp.security;

/** 日志里展示收件人：只保留首字母和域名，不落完整邮箱。 */
final class MailAddresses {
    private MailAddresses() {}

    static String mask(String address) {
        int at = address == null ? -1 : address.indexOf('@');
        return at <= 1 ? "***" : address.charAt(0) + "***" + address.substring(at);
    }
}
