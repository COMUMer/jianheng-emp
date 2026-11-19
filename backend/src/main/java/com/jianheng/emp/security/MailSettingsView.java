package com.jianheng.emp.security;

import jakarta.validation.constraints.NotNull;
import java.time.LocalDateTime;

/** 管理员可编辑的验证码邮件设置；API Key 仍由 RESEND_API_KEY 环境变量提供。 */
public record MailSettingsView(@NotNull String sender, @NotNull String subject, @NotNull String html,
                               boolean resendConfigured, LocalDateTime updatedAt, String updatedBy) {}
