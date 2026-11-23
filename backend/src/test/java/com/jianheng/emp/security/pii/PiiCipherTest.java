package com.jianheng.emp.security.pii;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Base64;
import org.junit.jupiter.api.Test;

class PiiCipherTest {
    private static final String ID_CARD = "employee.id_card";
    private static String key(int version, byte... seed) {
        byte[] material = new byte[32];
        for (int i = 0; i < material.length; i++) material[i] = (byte) (seed.length == 0 ? i + version : seed[0] + i);
        return "v" + version + ":" + Base64.getEncoder().encodeToString(material);
    }

    private final PiiCipher cipher = new PiiCipher(key(1));

    @Test
    void roundTripsAValue() {
        String stored = cipher.encrypt("11010519491231002X", ID_CARD);
        assertEquals("11010519491231002X", cipher.decrypt(stored, ID_CARD));
    }

    @Test
    void sameValueEncryptsToDifferentCiphertexts() {
        String first = cipher.encrypt("11010519491231002X", ID_CARD);
        String second = cipher.encrypt("11010519491231002X", ID_CARD);
        assertNotEquals(first, second);
        assertTrue(first.startsWith("v1:"));
    }

    @Test
    void rejectsTamperedCiphertext() {
        String stored = cipher.encrypt("11010519491231002X", ID_CARD);
        int split = stored.indexOf(':') + 1;
        // 必须改解码后的字节：base64 末尾字符可能落在填充位上，改字符串不一定改到数据。
        byte[] payload = Base64.getUrlDecoder().decode(stored.substring(split));
        payload[payload.length - 1] ^= 0x01;
        String tampered = stored.substring(0, split) + Base64.getUrlEncoder().withoutPadding().encodeToString(payload);
        assertThrows(IllegalStateException.class, () -> cipher.decrypt(tampered, ID_CARD));
    }

    @Test
    void rejectsCiphertextFromAnotherField() {
        String stored = cipher.encrypt("6222020200112233445", "employee.bank_card");
        assertThrows(IllegalStateException.class, () -> cipher.decrypt(stored, ID_CARD));
    }

    @Test
    void rejectsPlaintextInput() {
        assertThrows(IllegalStateException.class, () -> cipher.decrypt("11010519491231002X", ID_CARD));
    }

    @Test
    void rejectsUnknownKeyVersion() {
        String stored = cipher.encrypt("11010519491231002X", ID_CARD).replace("v1:", "v9:");
        assertThrows(IllegalStateException.class, () -> cipher.decrypt(stored, ID_CARD));
    }

    @Test
    void decryptsValuesWrittenByAnOlderKeyVersion() {
        PiiCipher old = new PiiCipher(key(1));
        String stored = old.encrypt("11010519491231002X", ID_CARD);
        PiiCipher rotated = new PiiCipher(key(1) + "," + key(2));
        assertEquals("11010519491231002X", rotated.decrypt(stored, ID_CARD));
        assertTrue(rotated.encrypt("11010519491231002X", ID_CARD).startsWith("v2:"));
    }

    @Test
    void keepsEmptyValuesUntouched() {
        assertEquals("", cipher.encrypt("", ID_CARD));
        assertEquals("", cipher.decrypt("", ID_CARD));
    }

    @Test
    void blindIndexIsStableAndIgnoresCaseAndSpaces() {
        String first = cipher.blindIndex("11010519491231002x");
        assertEquals(first, cipher.blindIndex(" 11010519491231002X "));
        assertNotEquals(first, cipher.blindIndex("110105194912310021"));
        assertEquals(64, first.length());
        assertFalse(first.contains("110105"));
    }

    @Test
    void reportsTheActiveKeyVersion() {
        assertEquals(1, cipher.activeVersion());
        assertEquals(2, new PiiCipher(key(1) + "," + key(2)).activeVersion());
    }

    @Test
    void requiresAKey() {
        assertThrows(IllegalStateException.class, () -> new PiiCipher(""));
        assertThrows(IllegalStateException.class, () -> new PiiCipher("v1:abcd"));
        assertThrows(IllegalStateException.class, () -> new PiiCipher("abc"));
    }
}
