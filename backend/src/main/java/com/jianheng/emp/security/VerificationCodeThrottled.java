package com.jianheng.emp.security;

/** 验证码发送被冷却或每小时配额拦下；携带剩余等待秒数，接口据此返回 429。 */
public class VerificationCodeThrottled extends RuntimeException {
    private final long retryAfterSeconds;

    public VerificationCodeThrottled(long retryAfterSeconds) {
        super("验证码发送过于频繁，请 " + retryAfterSeconds + " 秒后再试");
        this.retryAfterSeconds = retryAfterSeconds;
    }

    public long retryAfterSeconds() {
        return retryAfterSeconds;
    }
}
