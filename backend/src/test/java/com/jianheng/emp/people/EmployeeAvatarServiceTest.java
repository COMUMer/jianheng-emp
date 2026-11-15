package com.jianheng.emp.people;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.jianheng.emp.security.AccountService.CurrentUser;
import com.jianheng.emp.security.Role;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.List;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

class EmployeeAvatarServiceTest {
    private final PeopleMapper mapper = mock(PeopleMapper.class);
    private final CurrentUser user = new CurrentUser(7, "xianghongrui", 3L, "xianghongrui", "向鸿锐", null, List.of(Role.EMPLOYEE));

    @TempDir Path directory;

    @Test
    void storesASquareJpegAndRecordsTheAvatarKey() throws Exception {
        when(mapper.employee(3L)).thenReturn(employee(3, null));
        var source = new BufferedImage(80, 40, BufferedImage.TYPE_INT_RGB);
        var png = new ByteArrayOutputStream();
        ImageIO.write(source, "png", png);
        var file = new MockMultipartFile("file", "photo.png", "image/png", png.toByteArray());

        EmployeeAvatarService.AvatarView view;
        TransactionSynchronizationManager.initSynchronization();
        try { view = service().save(user, file); }
        finally { TransactionSynchronizationManager.clearSynchronization(); }

        assertNotNull(view.avatarKey());
        Path stored = directory.resolve("avatars").resolve(view.avatarKey());
        assertTrue(Files.isRegularFile(stored));
        var image = ImageIO.read(stored.toFile());
        assertEquals(256, image.getWidth());
        assertEquals(256, image.getHeight());
        verify(mapper).setAvatar(3L, view.avatarKey(), 7L);
    }

    @Test
    void rejectsFilesThatAreNotImages() {
        when(mapper.employee(3L)).thenReturn(employee(3, null));
        var file = new MockMultipartFile("file", "photo.png", "image/png", "hello".getBytes());

        var error = assertThrows(IllegalArgumentException.class, () -> service().save(user, file));

        assertEquals("请选择有效的图片文件", error.getMessage());
    }

    @Test
    void servesOnlyFilesStoredUnderTheAvatarDirectory() throws Exception {
        Path avatars = Files.createDirectories(directory.resolve("avatars"));
        String key = "11111111-2222-3333-4444-555555555555.jpg";
        Files.write(avatars.resolve(key), new byte[] { 1, 2, 3 });

        var response = service().load(key);

        assertEquals("image/jpeg", response.getHeaders().getContentType().toString());
        assertNotNull(response.getBody());
        assertThrows(ResponseStatusException.class, () -> service().load("../secret.jpg"));
    }

    private EmployeeAvatarService service() {
        return new EmployeeAvatarService(mapper, directory.toString());
    }

    private static PeopleMapper.Employee employee(long id, String avatarKey) {
        return new PeopleMapper.Employee(id, "xianghongrui", "向鸿锐", 1, 1, "13800138000", "xiang@example.com",
            "110105199001011232", "深圳市南山区", "张三", "13900139000", "6222020200112233445",
            "招商银行", "308584000013", avatarKey, LocalDate.of(2026, 1, 1), null, "见衡", "董事", null, null, null);
    }
}
