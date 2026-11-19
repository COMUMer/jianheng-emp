package com.jianheng.emp.security;

import com.jianheng.emp.web.AuditMapper;
import java.util.HashMap;
import java.util.List;
import java.util.Set;
import java.util.function.UnaryOperator;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
class MailSettingsService {
    static final String DEFAULT_SUBJECT = "见衡企业管理 验证码";
    static final String DEFAULT_HTML = "<img src=\"cid:" + MailAssets.HEADER_CID + "\" alt=\"见衡科技\">"
        + "<p>你的验证码是 <strong>{{code}}</strong></p>"
        + "<p>{{minutes}} 分钟内有效。若非本人操作请忽略本邮件。</p>";

    private static final Pattern SENDER = Pattern.compile(
        "^(?:[^<>\\r\\n]+\\s*)?<([^<>@\\s]+@[^<>@\\s]+\\.[^<>@\\s]+)>$|^[^<>@\\s]+@[^<>@\\s]+\\.[^<>@\\s]+$");
    private static final Pattern TOKEN = Pattern.compile("\\{\\{([^{}]+)}}");
    private static final Set<String> TOKENS = Set.of("code", "minutes");

    record Outgoing(String sender, String subject, String text, String html, List<MailAssets.Image> images) {}

    private final MailSettingsMapper mapper;
    private final MailImageStore images;
    private final AuditMapper audit;
    private final boolean resendConfigured;

    MailSettingsService(MailSettingsMapper mapper, MailImageStore images, AuditMapper audit,
                        @Value("${mail.resend-key:}") String resendKey) {
        this.mapper = mapper;
        this.images = images;
        this.audit = audit;
        this.resendConfigured = !resendKey.isBlank();
    }

    MailSettingsView view() {
        var row = mapper.find();
        return row == null
            ? new MailSettingsView("", DEFAULT_SUBJECT, DEFAULT_HTML, resendConfigured, null, null)
            : new MailSettingsView(row.sender(), row.subject(), new MailContent(row.bodyHtml()).html(),
                resendConfigured, row.updatedAt(), row.updatedBy());
    }

    MailAssets.Image image(String id) {
        return images.read(id);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    Outgoing outgoing(String code, long minutes) {
        var template = mapper.find();
        if (template == null) throw new IllegalArgumentException("请先在系统设置的邮件设置中填写发件人");
        var content = new MailContent(template.bodyHtml());
        var imageIds = content.imageIds();
        List<MailAssets.Image> attachments = imageIds.stream().map(id -> {
            var image = images.read(id);
            if (image == null) throw new IllegalStateException("邮件正文图片缺失");
            return image;
        }).toList();

        UnaryOperator<String> replace = value -> value.replace("{{code}}", code).replace("{{minutes}}", Long.toString(minutes));
        content.replaceText(replace);
        return new Outgoing(template.sender(), replace.apply(template.subject()), content.text(), content.emailHtml(), attachments);
    }

    @Transactional
    void update(AccountService.CurrentUser actor, MailSettingsInput input, List<MultipartFile> files) {
        var sender = input.sender().strip();
        var subject = input.subject().strip();
        var content = new MailContent(input.html());
        var text = content.text();
        if (!SENDER.matcher(sender).matches()) throw new IllegalArgumentException("发件人格式应为：名称 <邮箱> 或 邮箱");
        if (!content.hasText("{{code}}")) throw new IllegalArgumentException("请使用工具栏在正文中插入完整的验证码变量");
        validateTokens(subject);
        validateTokens(text);

        var usedUploads = content.imageIds().stream().filter(MailAssets::isUploadId).toList();
        var uploaded = new HashMap<String, MailAssets.Image>();
        for (var file : files) {
            var image = MailAssets.readUpload(file);
            if (!usedUploads.contains(image.id()) || uploaded.putIfAbsent(image.id(), image) != null) {
                throw new IllegalArgumentException("上传的图片与正文不一致，请重新选择图片");
            }
        }

        long totalBytes = 0;
        for (String id : usedUploads) {
            var image = uploaded.get(id);
            var size = image == null ? images.size(id) : image.content().length;
            if (size < 0) throw new IllegalArgumentException("正文图片已失效，请刷新页面后重新上传");
            totalBytes += size;
        }
        if (totalBytes > MailAssets.MAX_TOTAL_BYTES) throw new IllegalArgumentException("正文上传图片合计不能超过 8 MB");

        // The singleton settings write locks concurrent saves before looking up existing images.
        mapper.save(sender, subject, content.html(), actor.id());
        uploaded.values().forEach(images::write);
        var retained = new java.util.HashSet<String>(usedUploads);
        retained.add(MailAssets.HEADER_CID);
        images.retain(retained);
        audit.record(actor.id(), "MAIL_SETTINGS_UPDATE", null, "更新验证码邮件设置");
    }

    private static void validateTokens(String value) {
        var matcher = TOKEN.matcher(value);
        while (matcher.find()) {
            if (!TOKENS.contains(matcher.group(1))) {
                throw new IllegalArgumentException("邮件模板仅支持 {{code}} 和 {{minutes}}");
            }
        }
    }
}
