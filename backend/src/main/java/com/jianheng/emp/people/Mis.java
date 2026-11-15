package com.jianheng.emp.people;

import com.github.houbb.pinyin.constant.enums.PinyinStyleEnum;
import com.github.houbb.pinyin.util.PinyinHelper;
import java.util.Locale;

final class Mis {
    private Mis() {}

    static String base(String name) {
        String compactName = name.replaceAll("(?U)[\\s·・'’-]+", "");
        String base = PinyinHelper.toPinyin(compactName, PinyinStyleEnum.NORMAL, "")
            .toLowerCase(Locale.ROOT).replace("ü", "v");
        if (!base.matches("[a-z]{1,40}")) {
            throw new IllegalArgumentException("姓名须能转换为 1 至 40 个小写拼音字母");
        }
        return base;
    }

    static String numbered(String base, int sequence) {
        return sequence == 1 ? base : base + sequence;
    }
}
