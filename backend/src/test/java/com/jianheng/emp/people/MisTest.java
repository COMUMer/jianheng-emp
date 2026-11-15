package com.jianheng.emp.people;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class MisTest {
    @Test
    void usesFullLowercasePinyinWithoutSeparators() {
        assertEquals("zhangsan", Mis.base(" 张 三 "));
        assertEquals("lvqinhan", Mis.base("Lv Qinhan"));
        assertEquals("lvbu", Mis.base("吕布"));
    }

    @Test
    void numbersTheMisWhenThePinyinIsAlreadyTaken() {
        assertEquals("zhangsan", Mis.numbered("zhangsan", 1));
        assertEquals("zhangsan2", Mis.numbered("zhangsan", 2));
        assertEquals("zhangsan10", Mis.numbered("zhangsan", 10));
    }

    @Test
    void rejectsNamesThatDoNotProduceAMis() {
        assertThrows(IllegalArgumentException.class, () -> Mis.base("123"));
        assertThrows(IllegalArgumentException.class, () -> Mis.base("a".repeat(41)));
    }
}
