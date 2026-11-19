package com.jianheng.emp.security;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record MailTestInput(
    @NotBlank(message = "请输入收件人邮箱")
    @Email(message = "请输入有效的收件人邮箱")
    @Size(max = 200, message = "收件人邮箱过长") String recipient) {}
