package com.jianheng.emp.security;

/** 验证码请求已被受理时返回的重发间隔，前端据此启动倒计时，避免前后端各写一套节流规则。 */
public record CodeIssued(long retryAfterSeconds) {}
