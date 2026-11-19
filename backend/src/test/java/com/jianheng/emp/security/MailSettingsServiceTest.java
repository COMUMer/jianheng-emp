package com.jianheng.emp.security;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

import com.jianheng.emp.web.AuditMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.web.MockMultipartFile;

class MailSettingsServiceTest {
    private static final String SENDER = "见衡科技 <no-reply@notify.jianheng.comum.cn>";
    private static final String IMAGE_ID = "a33ddb77-0c4e-4c58-abf6-ec2b13197cc5";
    private static final AccountService.CurrentUser ACTOR =
        new AccountService.CurrentUser(7, "admin", null, null, "Admin", null, List.of(Role.ADMIN));

    @TempDir Path uploads;

    private final MailSettingsMapper mapper = mock(MailSettingsMapper.class);
    private final AuditMapper audit = mock(AuditMapper.class);
    private MailImageStore images;
    private MailSettingsService service;

    @BeforeEach
    void setUp() {
        images = new MailImageStore(uploads.toString());
        service = new MailSettingsService(mapper, images, audit, "re_test");
    }

    @Test
    void storesTheBundledHeaderAndRequiresASavedSender() throws Exception {
        var view = service.view();

        assertEquals("", view.sender());
        assertTrue(view.html().contains("cid:jianheng-header"));
        assertTrue(view.resendConfigured());
        try (var files = Files.list(uploads.resolve("mail"))) {
            assertEquals(List.of("jianheng-header.png"), files.map(path -> path.getFileName().toString()).toList());
        }
        assertThrows(IllegalArgumentException.class, () -> service.outgoing("ABC123", 2));

        when(mapper.find()).thenReturn(new MailSettingsMapper.Row(SENDER, MailSettingsService.DEFAULT_SUBJECT,
            MailSettingsService.DEFAULT_HTML, null, null));
        var email = service.outgoing("ABC123", 2);

        assertEquals(List.of("jianheng-header"), email.images().stream().map(MailAssets.Image::id).toList());
        assertFalse(email.images().getFirst().content().length == 0);
        assertTrue(email.text().contains("ABC123"));
        assertTrue(email.html().contains("ABC123"));
        assertTrue(email.html().contains("width=\"100%\""));
        assertTrue(email.html().contains(";width:100%;"));
    }

    @Test
    void savesOneBodyAndItsUploadedImageUnderUploads() throws Exception {
        var settings = new MailSettingsInput(SENDER, "验证码", "<p>你好</p><img src='cid:" + IMAGE_ID
            + "' width='240' onerror='alert(1)'><img src='cid:jianheng-header' width='200%'><p>验证码 <strong>{{code}}</strong></p>");
        var image = new MockMultipartFile("images", IMAGE_ID, "image/png", images.header().content());

        service.update(ACTOR, settings, List.of(image));

        var body = ArgumentCaptor.forClass(String.class);
        verify(mapper).save(eq(SENDER), eq("验证码"), body.capture(), eq(7L));
        assertTrue(body.getValue().contains("cid:" + IMAGE_ID));
        assertTrue(body.getValue().contains("width=\"240\""));
        assertFalse(body.getValue().contains("onerror"));
        assertFalse(body.getValue().contains("200%"));
        assertTrue(Files.isRegularFile(uploads.resolve("mail").resolve(IMAGE_ID + ".png")));
        verify(audit).record(7L, "MAIL_SETTINGS_UPDATE", null, "更新验证码邮件设置");
    }

    @Test
    void sendsOnlyTheImagesInTheSavedBodyAndDerivesPlainText() {
        images.write(new MailAssets.Image(IMAGE_ID, "image/png", images.header().content()));
        when(mapper.find()).thenReturn(new MailSettingsMapper.Row(SENDER, "主题 {{code}}",
            "<p>第一段</p><img src='cid:" + IMAGE_ID + "' width='240'><p>{{code}}<br>{{minutes}} 分钟</p>", null, null));

        var email = service.outgoing("ABC123", 2);

        assertEquals("主题 ABC123", email.subject());
        assertEquals("第一段\nABC123\n2 分钟", email.text());
        assertTrue(email.html().contains("cid:" + IMAGE_ID));
        assertTrue(service.view().html().contains("width=\"240\""));
        assertTrue(email.html().contains("width=\"240\""));
        assertTrue(email.html().contains(";width:240px;"));
        assertEquals(List.of(IMAGE_ID), email.images().stream().map(MailAssets.Image::id).toList());
    }

    @Test
    void removesUploadsNoLongerUsedByTheBody() throws Exception {
        images.write(new MailAssets.Image(IMAGE_ID, "image/png", images.header().content()));

        service.update(ACTOR, new MailSettingsInput(SENDER, "验证码",
            "<img src='cid:jianheng-header'><p>验证码 {{code}}</p>"), List.of());

        assertFalse(Files.exists(uploads.resolve("mail").resolve(IMAGE_ID + ".png")));
        assertTrue(Files.isRegularFile(uploads.resolve("mail").resolve("jianheng-header.png")));
    }

    @Test
    void rejectsInvalidImageDataAndUnresolvedReferences() {
        var input = new MailSettingsInput(SENDER, "验证码", "<img src='cid:" + IMAGE_ID + "'><p>{{code}}</p>");
        assertThrows(IllegalArgumentException.class, () -> service.update(ACTOR, input, List.of()));
        var invalid = new MockMultipartFile("images", IMAGE_ID, "image/png", new byte[] {1, 2, 3});
        assertThrows(IllegalArgumentException.class, () -> service.update(ACTOR, input, List.of(invalid)));
        verify(mapper, never()).save(any(), any(), any(), anyLong());
        assertFalse(Files.exists(uploads.resolve("mail").resolve(IMAGE_ID + ".png")));
    }

    @Test
    void requiresAValidSenderAndVerificationCodeInTheVisibleBody() {
        assertThrows(IllegalArgumentException.class, () -> service.update(ACTOR,
            new MailSettingsInput("not-an-email", "验证码", "<p>{{code}}</p>"), List.of()));
        assertThrows(IllegalArgumentException.class, () -> service.update(ACTOR,
            new MailSettingsInput(SENDER, "验证码", "<img src='cid:jianheng-header' alt='{{code}}'><p>你好</p>"), List.of()));
        assertThrows(IllegalArgumentException.class, () -> service.update(ACTOR,
            new MailSettingsInput(SENDER, "验证码", "<p><strong>{{co</strong>de}}</p>"), List.of()));
        assertThrows(IllegalArgumentException.class, () -> service.update(ACTOR,
            new MailSettingsInput(SENDER, "验证码", "<p>{{name}} {{code}}</p>"), List.of()));
        verify(mapper, never()).save(any(), any(), any(), anyLong());
    }
}