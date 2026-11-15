package com.jianheng.emp.approval;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.Normalizer;
import java.util.Locale;

public final class WorkflowRules {
    private WorkflowRules() {}

    public static boolean includesNode(BigDecimal amount, BigDecimal minimum) {
        return minimum == null || amount != null && amount.compareTo(minimum) >= 0;
    }

    public static BigDecimal money(BigDecimal amount) {
        if (amount == null || amount.signum() <= 0 || amount.stripTrailingZeros().scale() > 2
                || amount.compareTo(new BigDecimal("10000000000000")) >= 0) {
            throw new IllegalArgumentException("金额必须大于零，且最多保留两位小数");
        }
        return amount.setScale(2, RoundingMode.UNNECESSARY);
    }

    public static String invoiceKey(String value) {
        if (value == null || value.isBlank()) return null;
        String key = Normalizer.normalize(value, Normalizer.Form.NFKC).replaceAll("(?U)\\s+", "")
            .toUpperCase(Locale.ROOT);
        if (key.length() > 100) throw new IllegalArgumentException("票号过长");
        return key.isEmpty() ? null : key;
    }
}
