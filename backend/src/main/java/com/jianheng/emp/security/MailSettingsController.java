package com.jianheng.emp.security;

import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/mail-settings")
class MailSettingsController {
    private final AccountService accounts;
    private final MailSettingsService settings;
    private final Mailer mailer;

    MailSettingsController(AccountService accounts, MailSettingsService settings, Mailer mailer) {
        this.accounts = accounts;
        this.settings = settings;
        this.mailer = mailer;
    }

    @GetMapping
    MailSettingsView get(Authentication authentication) {
        accounts.require(accounts.current(authentication), Role.ADMIN);
        return settings.view();
    }

    @GetMapping("/images/{id}")
    ResponseEntity<byte[]> image(Authentication authentication, @PathVariable String id) {
        accounts.require(accounts.current(authentication), Role.ADMIN);
        var image = settings.image(id);
        if (image == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok().cacheControl(CacheControl.noCache().cachePrivate())
            .contentType(MediaType.parseMediaType(image.contentType())).body(image.content());
    }

    @PostMapping("/test")
    void sendTest(Authentication authentication, @Valid @RequestBody MailTestInput input) {
        var actor = accounts.current(authentication);
        accounts.require(actor, Role.ADMIN);
        if (!settings.view().resendConfigured()) throw new IllegalArgumentException("邮件服务未配置，请设置 RESEND_API_KEY");
        try {
            mailer.sendVerificationCode(input.recipient().strip(), "ABC123", 2);
        } catch (MailDeliveryException error) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "测试邮件发送失败，请检查发件人和 Resend 配置");
        }
    }

    @PutMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    MailSettingsView save(Authentication authentication, @Valid @RequestPart("settings") MailSettingsInput input,
                          @RequestPart(value = "images", required = false) List<MultipartFile> images) {
        var actor = accounts.current(authentication);
        accounts.require(actor, Role.ADMIN);
        settings.update(actor, input, images == null ? List.of() : images);
        return settings.view();
    }
}