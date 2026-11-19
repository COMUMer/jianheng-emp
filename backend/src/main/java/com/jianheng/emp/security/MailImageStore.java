package com.jianheng.emp.security;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.List;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

@Component
class MailImageStore {
    private static final List<String> EXTENSIONS = List.of(".png", ".jpg");

    private final Path directory;
    private final Path header;

    MailImageStore(@Value("${EMP_UPLOAD_DIR:./data/uploads}") String root) {
        this.directory = Path.of(root).toAbsolutePath().normalize().resolve("mail");
        this.header = directory.resolve(MailAssets.HEADER_CID + ".png");
        try {
            Files.createDirectories(directory);
            if (!Files.isRegularFile(header)) {
                try (var input = new ClassPathResource("mail/brand-header.png").getInputStream()) {
                    Files.copy(input, header);
                }
            }
        } catch (IOException error) {
            throw new UncheckedIOException("无法初始化邮件图片目录", error);
        }
    }

    MailAssets.Image header() {
        return read(header, MailAssets.HEADER_CID, "image/png");
    }

    MailAssets.Image read(String id) {
        if (MailAssets.HEADER_CID.equals(id)) return header();
        if (!MailAssets.isUploadId(id)) return null;
        for (String extension : EXTENSIONS) {
            Path path = directory.resolve(id + extension);
            if (Files.isRegularFile(path)) return read(path, id, contentType(extension));
        }
        return null;
    }

    long size(String id) {
        var image = read(id);
        return image == null ? -1 : image.content().length;
    }

    void write(MailAssets.Image image) {
        try {
            Files.write(directory.resolve(image.filename()), image.content(), StandardOpenOption.CREATE_NEW);
        } catch (java.nio.file.FileAlreadyExistsException error) {
            throw new IllegalArgumentException("图片已存在，请重新选择图片");
        } catch (IOException error) {
            throw new UncheckedIOException("无法保存邮件图片", error);
        }
    }

    void retain(Set<String> ids) {
        try (var files = Files.list(directory)) {
            for (Path path : files.toList()) {
                String name = path.getFileName().toString();
                int dot = name.lastIndexOf('.');
                if (dot <= 0 || !Files.isRegularFile(path)) continue;
                String id = name.substring(0, dot);
                if (MailAssets.HEADER_CID.equals(id) || !MailAssets.isUploadId(id) || ids.contains(id)) continue;
                Files.deleteIfExists(path);
            }
        } catch (IOException error) {
            throw new UncheckedIOException("无法清理邮件图片", error);
        }
    }

    private static MailAssets.Image read(Path path, String id, String contentType) {
        try {
            return new MailAssets.Image(id, contentType, Files.readAllBytes(path));
        } catch (IOException error) {
            throw new UncheckedIOException("无法读取邮件图片", error);
        }
    }

    private static String contentType(String extension) {
        return extension.equals(".png") ? "image/png" : "image/jpeg";
    }
}