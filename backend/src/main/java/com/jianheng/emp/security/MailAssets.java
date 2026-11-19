package com.jianheng.emp.security;

import java.io.IOException;
import java.util.Locale;
import java.util.regex.Pattern;
import javax.imageio.ImageIO;
import javax.imageio.stream.MemoryCacheImageInputStream;
import org.springframework.web.multipart.MultipartFile;

final class MailAssets {
    static final String HEADER_CID = "jianheng-header";
    static final long MAX_IMAGE_BYTES = 3 * 1024 * 1024;
    static final long MAX_TOTAL_BYTES = 8 * 1024 * 1024;
    private static final long MAX_PIXELS = 16_000_000;
    private static final Pattern UPLOAD_ID = Pattern.compile("[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}");

    record Image(String id, String contentType, byte[] content) {
        String filename() { return id + (contentType.equals("image/png") ? ".png" : ".jpg"); }
    }

    static boolean isUploadId(String id) { return id != null && UPLOAD_ID.matcher(id).matches(); }

    static Image readUpload(MultipartFile file) {
        var id = file.getOriginalFilename();
        if (!isUploadId(id)) throw new IllegalArgumentException("图片编号无效，请重新选择图片");
        if (file.isEmpty() || file.getSize() > MAX_IMAGE_BYTES) {
            throw new IllegalArgumentException("请选择不超过 3 MB 的图片");
        }
        try (var input = file.getInputStream(); var source = new MemoryCacheImageInputStream(input)) {
            var readers = ImageIO.getImageReaders(source);
            if (!readers.hasNext()) throw new IllegalArgumentException("请选择有效的 PNG 或 JPEG 图片");
            var reader = readers.next();
            try {
                var contentType = switch (reader.getFormatName().toLowerCase(Locale.ROOT)) {
                    case "png" -> "image/png";
                    case "jpeg" -> "image/jpeg";
                    default -> throw new IllegalArgumentException("仅支持 PNG 和 JPEG 图片");
                };
                reader.setInput(source, true, true);
                if ((long) reader.getWidth(0) * reader.getHeight(0) > MAX_PIXELS) {
                    throw new IllegalArgumentException("图片分辨率过大，请缩小后重试");
                }
                reader.read(0);
                return new Image(id, contentType, file.getBytes());
            } finally {
                reader.dispose();
            }
        } catch (IOException error) {
            throw new IllegalArgumentException("无法读取图片，请选择有效的 PNG 或 JPEG 文件", error);
        }
    }

    private MailAssets() {}
}
