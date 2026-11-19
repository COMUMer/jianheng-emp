package com.jianheng.emp.security;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record MailSettingsInput(
    @NotBlank(message = "请输入发件人") @Size(max = 200, message = "发件人过长") String sender,
    @NotBlank(message = "请输入邮件主题") @Size(max = 200, message = "邮件主题过长") String subject,
    @NotBlank(message = "请输入邮件正文") @Size(max = 100000, message = "邮件正文过长") String html) {}
