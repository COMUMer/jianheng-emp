package com.jianheng.emp.people;

import com.jianheng.emp.people.PeopleService.EmployeeInput;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Locale;
import java.util.regex.Pattern;

final class EmployeeProfile {
    private static final Pattern PHONE = Pattern.compile("(?:1[3-9]\\d{9}|0\\d{9,11})");
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    private static final Pattern ID_CARD = Pattern.compile("\\d{17}[\\dX]");
    private static final Pattern BANK_CARD = Pattern.compile("\\d{12,19}");
    private static final Pattern CNAPS = Pattern.compile("\\d{12}");
    private static final int[] ID_WEIGHTS = {7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2};
    private static final String ID_CHECK_CODES = "10X98765432";

    private EmployeeProfile() {}

    static EmployeeInput normalize(EmployeeInput input) {
        return new EmployeeInput(text(input.name()), input.departmentId(), input.positionId(),
            phoneDigits(input.phone()), text(input.email()), text(input.idCard()).toUpperCase(Locale.ROOT),
            text(input.address()), text(input.emergencyContact()), phoneDigits(input.emergencyPhone()),
            digits(input.bankCard()), text(input.bankName()), digits(input.cnapsCode()), input.joinedOn());
    }

    static void validate(EmployeeInput input) {
        required(input.name(), "请输入姓名");
        required(input.phone(), "请输入联系电话");
        if (!PHONE.matcher(input.phone()).matches()) throw new IllegalArgumentException("请输入有效的手机号或座机号");
        required(input.email(), "请输入电子邮箱");
        if (!EMAIL.matcher(input.email()).matches()) throw new IllegalArgumentException("请输入有效的电子邮箱");
        required(input.idCard(), "请输入身份证号");
        validateIdCard(input.idCard());
        required(input.address(), "请输入现住址");
        required(input.emergencyContact(), "请输入紧急联系人");
        required(input.emergencyPhone(), "请输入紧急联系电话");
        if (!PHONE.matcher(input.emergencyPhone()).matches()) throw new IllegalArgumentException("请输入有效的紧急联系电话");
        required(input.bankCard(), "请输入银行卡号");
        if (!BANK_CARD.matcher(input.bankCard()).matches()) throw new IllegalArgumentException("请输入 12-19 位银行卡号");
        required(input.bankName(), "请输入开户银行名称");
        required(input.cnapsCode(), "请输入联行号");
        if (!CNAPS.matcher(input.cnapsCode()).matches()) throw new IllegalArgumentException("请输入 12 位联行号");
        if (input.departmentId() <= 0) throw new IllegalArgumentException("请选择部门");
        if (input.positionId() <= 0) throw new IllegalArgumentException("请选择岗位");
        if (input.joinedOn() == null) throw new IllegalArgumentException("请选择入职日期");
    }

    private static void validateIdCard(String idCard) {
        if (!ID_CARD.matcher(idCard).matches()) throw new IllegalArgumentException("请输入 18 位身份证号");
        try {
            var birth = LocalDate.parse(idCard.substring(6, 14), DateTimeFormatter.BASIC_ISO_DATE);
            if (birth.isAfter(LocalDate.now())) throw new IllegalArgumentException("身份证号出生日期无效");
        } catch (DateTimeParseException error) {
            throw new IllegalArgumentException("身份证号出生日期无效");
        }
        int sum = 0;
        for (int index = 0; index < 17; index++) sum += (idCard.charAt(index) - '0') * ID_WEIGHTS[index];
        if (idCard.charAt(17) != ID_CHECK_CODES.charAt(sum % 11)) throw new IllegalArgumentException("身份证号校验位不正确");
    }

    private static String text(String value) {
        return value == null ? "" : value.strip();
    }

    private static String digits(String value) {
        return text(value).replaceAll("[\\s-]", "");
    }

    private static String phoneDigits(String value) {
        String clean = digits(value);
        return clean.startsWith("+86") ? clean.substring(3) : clean;
    }

    private static void required(String value, String message) {
        if (value.isBlank()) throw new IllegalArgumentException(message);
    }
}