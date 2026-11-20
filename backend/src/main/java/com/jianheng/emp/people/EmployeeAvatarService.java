package com.jianheng.emp.people;

import com.jianheng.emp.security.AccountService.CurrentUser;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Service
public class EmployeeAvatarService {
    private static final Logger log = LoggerFactory.getLogger(EmployeeAvatarService.class);

    public record AvatarView(String avatarKey) {}

    private static final int SIZE = 256;
    private static final long MAX_BYTES = 5L * 1024 * 1024;

    private final PeopleMapper mapper;
    private final Path directory;

    EmployeeAvatarService(PeopleMapper mapper, @Value("${EMP_UPLOAD_DIR:./data/uploads}") String root) {
        this.mapper = mapper;
        this.directory = Path.of(root).toAbsolutePath().normalize().resolve("avatars");
    }

    @Transactional(rollbackFor = IOException.class)
    public AvatarView save(CurrentUser user, MultipartFile file) throws IOException {
        if (user.employeeId() == null) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        if (file.isEmpty() || file.getSize() > MAX_BYTES) throw new IllegalArgumentException("请选择不超过 5MB 的图片");
        var employee = mapper.employee(user.employeeId());
        if (employee == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        byte[] image = squareJpeg(file);
        Files.createDirectories(directory);
        String key = UUID.randomUUID() + ".jpg";
        Path destination = directory.resolve(key);
        Files.write(destination, image);
        mapper.setAvatar(user.employeeId(), key);
        removeAfterCommit(destination, employee.avatarKey());
        return new AvatarView(key);
    }

    public ResponseEntity<FileSystemResource> load(String key) {
        if (!key.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.jpg")) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        Path source = directory.resolve(key).normalize();
        if (!source.startsWith(directory) || !Files.isRegularFile(source)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return ResponseEntity.ok().contentType(MediaType.IMAGE_JPEG)
            .header(HttpHeaders.CACHE_CONTROL, "private, max-age=31536000, immutable")
            .body(new FileSystemResource(source));
    }

    private static byte[] squareJpeg(MultipartFile file) throws IOException {
        BufferedImage source;
        try (var input = file.getInputStream()) { source = ImageIO.read(input); }
        if (source == null) throw new IllegalArgumentException("请选择有效的图片文件");
        int edge = Math.min(source.getWidth(), source.getHeight());
        int left = (source.getWidth() - edge) / 2;
        int top = (source.getHeight() - edge) / 2;
        var square = new BufferedImage(SIZE, SIZE, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = square.createGraphics();
        try {
            graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            graphics.setColor(Color.WHITE);
            graphics.fillRect(0, 0, SIZE, SIZE);
            graphics.drawImage(source, 0, 0, SIZE, SIZE, left, top, left + edge, top + edge, null);
        } finally { graphics.dispose(); }
        var writer = ImageIO.getImageWritersByFormatName("jpeg").next();
        try {
            var params = writer.getDefaultWriteParam();
            params.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            params.setCompressionQuality(0.9f);
            var output = new ByteArrayOutputStream();
            try (var stream = ImageIO.createImageOutputStream(output)) {
                writer.setOutput(stream);
                writer.write(null, new IIOImage(square, null, null), params);
            }
            return output.toByteArray();
        } finally { writer.dispose(); }
    }

    private void removeAfterCommit(Path uploaded, String previousKey) {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCompletion(int status) {
                try {
                    if (status != STATUS_COMMITTED) Files.deleteIfExists(uploaded);
                    else if (previousKey != null) Files.deleteIfExists(directory.resolve(previousKey));
                } catch (IOException error) {
                    log.warn("头像文件清理失败 key={}", uploaded.getFileName(), error);
                }
            }
        });
    }
}
