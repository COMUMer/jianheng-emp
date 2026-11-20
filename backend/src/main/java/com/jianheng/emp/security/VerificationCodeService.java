package com.jianheng.emp.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.HexFormat;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 邮件验证码：6 位字母数字，10 分钟内有效，单次使用，失败 5 次作废。 */
@Service
class VerificationCodeService {
    private static final Logger log = LoggerFactory.getLogger(VerificationCodeService.class);

    enum Purpose { CHANGE_PASSWORD, RESET_PASSWORD }

    /** 发送结果：只有真正交给邮件服务的验证码才算 `SENT`，其余情况调用方不得提示「已发送」。 */
    enum Outcome { SENT, COOLDOWN, LIMIT }

    /** `SENT` 时 `retryAfterSeconds` 为下一次允许重发的间隔；被节流时为剩余等待时间。 */
    record Issued(Outcome outcome, long retryAfterSeconds) {}

    static final int TTL_SECONDS = 600;
    static final int RESEND_COOLDOWN_SECONDS = 60;
    private static final int HOURLY_LIMIT = 5;
    private static final int MAX_ATTEMPTS = 5;
    private static final String ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

    private final VerificationCodeMapper mapper;
    private final Mailer mailer;
    private final SecureRandom random = new SecureRandom();

    VerificationCodeService(VerificationCodeMapper mapper, Mailer mailer) {
        this.mapper = mapper;
        this.mailer = mailer;
    }

    /**
     * 生成并发送验证码。
     *
     * <p>验证码先入库再交给邮件服务；发送抛错时整个事务回滚，避免一封没发出去的验证码占用冷却与每小时配额。
     */
    @Transactional
    Issued issue(long employeeId, Purpose purpose, String email) {
        var now = LocalDateTime.now();
        if (mapper.countSince(employeeId, purpose.name(), now.minusHours(1)) >= HOURLY_LIMIT) {
            var oldest = mapper.oldestSince(employeeId, purpose.name(), now.minusHours(1));
            return new Issued(Outcome.LIMIT, oldest == null ? RESEND_COOLDOWN_SECONDS : secondsUntil(oldest.plusHours(1), now));
        }
        var latest = mapper.latest(employeeId, purpose.name());
        if (latest != null && latest.createdAt() != null) {
            var deadline = latest.createdAt().plusSeconds(RESEND_COOLDOWN_SECONDS);
            if (deadline.isAfter(now)) return new Issued(Outcome.COOLDOWN, secondsUntil(deadline, now));
        }
        var code = randomCode();
        mapper.insert(employeeId, purpose.name(), hash(employeeId, code), now.plusSeconds(TTL_SECONDS));
        mailer.sendVerificationCode(email, code, TTL_SECONDS / 60);
        log.atInfo()
            .addKeyValue("event.action", "VERIFICATION_CODE_ISSUED")
            .addKeyValue("event.outcome", "success")
            .addKeyValue("code.purpose", purpose.name())
            .addKeyValue("code.ttl_seconds", TTL_SECONDS)
            .addKeyValue("mail.recipient", MailAddresses.mask(email))
            .log("verification code issued");
        return new Issued(Outcome.SENT, RESEND_COOLDOWN_SECONDS);
    }

    /** 校验并消费验证码；所有失败都抛同一句提示。 */
    void verify(long employeeId, Purpose purpose, String code) {
        var latest = validCode(employeeId, purpose, code);
        if (mapper.consume(latest.id()) == 0) throw invalid();
    }

    /** 分步改密：只校验、不消费验证码，最终保存时再由 verify 消费。 */
    void check(long employeeId, Purpose purpose, String code) {
        validCode(employeeId, purpose, code);
    }

    private VerificationCodeMapper.Code validCode(long employeeId, Purpose purpose, String code) {
        var latest = mapper.latest(employeeId, purpose.name());
        if (latest == null) throw invalid();
        var expired = !latest.expiresAt().isAfter(LocalDateTime.now());
        if (expired || latest.consumedAt() != null || latest.attempts() >= MAX_ATTEMPTS) throw invalid();
        if (!MessageDigest.isEqual(hash(employeeId, code.strip().toUpperCase()).getBytes(StandardCharsets.US_ASCII),
            latest.codeHash().getBytes(StandardCharsets.US_ASCII))) {
            mapper.bumpAttempts(latest.id());
            throw invalid();
        }
        return latest;
    }

    private String randomCode() {
        var builder = new StringBuilder(6);
        for (int index = 0; index < 6; index++) builder.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
        return builder.toString();
    }

    private static long secondsUntil(LocalDateTime deadline, LocalDateTime now) {
        return Math.max(1, (long) Math.ceil(Duration.between(now, deadline).toMillis() / 1000.0));
    }

    private static String hash(long employeeId, String code) {
        try {
            var digest = MessageDigest.getInstance("SHA-256");
            var bytes = digest.digest((employeeId + ":" + code).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(bytes);
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException(error);
        }
    }

    private static IllegalArgumentException invalid() {
        return new IllegalArgumentException("验证码无效或已过期，请重新获取");
    }
}
