package com.jianheng.emp.security.pii;

import java.util.Base64;

/** 测试用固定密钥的 PiiCipher，避免每个测试类各自造密钥。 */
public final class TestPii {
    public static final PiiCipher CIPHER = new PiiCipher("v1:" + Base64.getEncoder().encodeToString(material()));

    private TestPii() {}

    private static byte[] material() {
        byte[] key = new byte[32];
        for (int index = 0; index < key.length; index++) key[index] = (byte) (index * 7 + 1);
        return key;
    }
}
