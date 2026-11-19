package com.jianheng.emp.security.pii;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 敏感字段的加解密与盲索引。
 *
 * <p>每个值用 AES-256-GCM 随机 IV 加密，密文形如 {@code v1:<base64(iv|ciphertext|tag)>}；同一明文每次密文不同。
 * 需要等值查询或唯一约束的字段（身份证）另算一枚 HMAC-SHA256 盲索引，指纹稳定但无法反推原文。
 *
 * <p>密钥从 {@code PII_KEYS} 读取，格式 {@code v1:<32 字节 base64>}，逗号分隔可并存多个版本用于轮换；
 * 版本号写在密文前缀里，解密时按前缀选密钥。
 */
@Component
public class PiiCipher {
    /** 密文前缀、盲索引和密钥派生都绑定版本号，轮换时旧密文仍可解。 */
    private static final String VERSION_PREFIX = "v";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;
    private static final int KEY_BYTES = 32;
    private static final String HKDF_SALT = "jianheng-emp-pii";
    private static final SecureRandom RANDOM = new SecureRandom();

    private final Map<Integer, SecretKey> encryptionKeys;
    private final Map<Integer, SecretKey> indexKeys;
    private final int activeVersion;

    public PiiCipher(@Value("${pii.keys:}") String keys) {
        var masters = new TreeMap<Integer, byte[]>();
        for (String entry : keys == null ? new String[0] : keys.split(",")) {
            String item = entry.strip();
            if (item.isEmpty()) continue;
            int split = item.indexOf(':');
            if (split < 2 || !item.startsWith(VERSION_PREFIX)) {
                throw new IllegalStateException("PII_KEYS 格式应为 v1:<base64 密钥>，实际为 " + mask(item));
            }
            int version;
            try {
                version = Integer.parseInt(item.substring(VERSION_PREFIX.length(), split));
            } catch (NumberFormatException error) {
                throw new IllegalStateException("PII_KEYS 版本号无法解析：" + mask(item));
            }
            byte[] master;
            try {
                master = Base64.getDecoder().decode(item.substring(split + 1).strip());
            } catch (IllegalArgumentException error) {
                throw new IllegalStateException("PII_KEYS 不是合法的 base64", error);
            }
            if (master.length != KEY_BYTES) {
                throw new IllegalStateException("PII_KEYS 每个密钥必须是 32 字节，当前 " + master.length);
            }
            masters.put(version, master);
        }
        if (masters.isEmpty()) {
            throw new IllegalStateException("未配置 PII_KEYS：身份证、银行卡和手机号无法加解密。"
                + "生成方式见 README 的“敏感字段密钥”一节。");
        }
        this.encryptionKeys = new TreeMap<>();
        this.indexKeys = new TreeMap<>();
        masters.forEach((version, master) -> {
            encryptionKeys.put(version, derive(master, "encryption"));
            indexKeys.put(version, derive(master, "blind-index"));
        });
        this.activeVersion = ((TreeMap<Integer, byte[]>) masters).lastKey();
    }

    /** 加密单个字段值；空值原样返回，避免把空串变成密文。 */
    public String encrypt(String plain, String field) {
        if (plain == null || plain.isEmpty()) return plain == null ? "" : plain;
        byte[] iv = new byte[IV_BYTES];
        RANDOM.nextBytes(iv);
        try {
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, encryptionKeys.get(activeVersion), new GCMParameterSpec(TAG_BITS, iv));
            cipher.updateAAD(field.getBytes(StandardCharsets.UTF_8));
            byte[] sealed = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            byte[] payload = ByteBuffer.allocate(iv.length + sealed.length).put(iv).put(sealed).array();
            return VERSION_PREFIX + activeVersion + ":" + Base64.getUrlEncoder().withoutPadding().encodeToString(payload);
        } catch (GeneralSecurityException error) {
            throw new IllegalStateException("加密失败：" + field, error);
        }
    }

    /** 解密单个字段值；空值原样返回，格式不符直接报错，避免静默带出脏数据。 */
    public String decrypt(String stored, String field) {
        if (stored == null || stored.isEmpty()) return stored == null ? "" : stored;
        int split = stored.indexOf(':');
        if (split < 2 || !stored.startsWith(VERSION_PREFIX)) {
            throw new IllegalStateException(field + " 不是密文，请先执行数据加密迁移");
        }
        int version = Integer.parseInt(stored.substring(VERSION_PREFIX.length(), split));
        SecretKey key = encryptionKeys.get(version);
        if (key == null) throw new IllegalStateException("缺少版本 v" + version + " 的密钥，无法解密 " + field);
        byte[] payload = Base64.getUrlDecoder().decode(stored.substring(split + 1));
        try {
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, payload, 0, IV_BYTES));
            cipher.updateAAD(field.getBytes(StandardCharsets.UTF_8));
            byte[] plain = cipher.doFinal(payload, IV_BYTES, payload.length - IV_BYTES);
            return new String(plain, StandardCharsets.UTF_8);
        } catch (GeneralSecurityException error) {
            throw new IllegalStateException("解密失败，密文被篡改或密钥不匹配：" + field, error);
        }
    }

    /** 等值查询用的盲索引：同一明文永远得到同一指纹，指纹无法反推明文。 */
    public String blindIndex(String plain) {
        if (plain == null || plain.isEmpty()) return "";
        String normalized = plain.strip().toUpperCase(Locale.ROOT);
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(indexKeys.get(activeVersion));
            return HexFormat.of().formatHex(mac.doFinal(normalized.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException error) {
            throw new IllegalStateException("盲索引计算失败", error);
        }
    }

    /** 是否已经是当前版本格式的密文，供数据迁移判断幂等。 */
    public boolean isEncrypted(String value) {
        return value != null && value.matches("v\\d+:.*");
    }

    private static SecretKey derive(byte[] master, String purpose) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(master, "HmacSHA256"));
            byte[] prk = mac.doFinal(HKDF_SALT.getBytes(StandardCharsets.UTF_8));
            mac.init(new SecretKeySpec(prk, "HmacSHA256"));
            mac.update(purpose.getBytes(StandardCharsets.UTF_8));
            mac.update((byte) 1);
            return new SecretKeySpec(Arrays.copyOf(mac.doFinal(), KEY_BYTES), "AES");
        } catch (GeneralSecurityException error) {
            throw new IllegalStateException("密钥派生失败", error);
        }
    }

    private static String mask(String value) {
        return value.length() <= 6 ? "***" : value.substring(0, Math.min(6, value.length())) + "***";
    }
}
