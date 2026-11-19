package com.jianheng.emp.people;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.jianheng.emp.people.PeopleService.EmployeeInput;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.time.LocalDate;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

class EmployeeProfileTest {
    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void acceptsACompleteProfile() {
        assertTrue(validator.validate(validInput()).isEmpty());
        assertDoesNotThrow(() -> {
            var clean = EmployeeProfile.normalize(validInput());
            EmployeeProfile.validateIdentity(clean);
            EmployeeProfile.validateEmployment(clean);
        });
    }

    @Test
    void normalizesSpacingCaseAndCountryCode() {
        var input = new EmployeeInput(" 张三 ", 1, 1, " +86 138 0013 8000 ",
            " zhangsan@example.com ", "11010519491231002x", " 深圳市南山区科技园 1 号 ",
            " 李四 ", "0755-12345678", "6222 0202 0011 2233 445",
            " 招商银行深圳分行 ", "3085 8400 0013", LocalDate.of(2020, 1, 1));

        var clean = EmployeeProfile.normalize(input);

        assertEquals("张三", clean.name());
        assertEquals("13800138000", clean.phone());
        assertEquals("zhangsan@example.com", clean.email());
        assertEquals("11010519491231002X", clean.idCard());
        assertEquals("深圳市南山区科技园 1 号", clean.address());
        assertEquals("李四", clean.emergencyContact());
        assertEquals("075512345678", clean.emergencyPhone());
        assertEquals("6222020200112233445", clean.bankCard());
        assertEquals("招商银行深圳分行", clean.bankName());
        assertEquals("308584000013", clean.cnapsCode());
    }

    @Test
    void rejectsAnInvalidIdCardChecksum() {
        var input = new EmployeeInput("张三", 1, 1, "13800138000", "zhangsan@example.com",
            "110105194912310021", "深圳", "李四", "13900139000", "6222020200112233445",
            "招商银行", "308584000013", LocalDate.of(2020, 1, 1));

        var error = assertThrows(IllegalArgumentException.class, () -> EmployeeProfile.validateIdentity(input));
        assertTrue(error.getMessage().contains("校验位"));
    }

    @Test
    void rejectsInvalidPhoneBankCardAndCnapsFormats() {
        assertThrows(IllegalArgumentException.class, () -> EmployeeProfile.validateIdentity(withPhone("12345")));
        assertThrows(IllegalArgumentException.class, () -> EmployeeProfile.validateIdentity(withBankCard("1234")));
        assertThrows(IllegalArgumentException.class, () -> EmployeeProfile.validateIdentity(withCnaps("123")));
        assertThrows(IllegalArgumentException.class, () -> EmployeeProfile.validateIdentity(withEmail("not-an-email")));
    }

    @Test
    void validatesTheEmploymentFieldsSeparatelyFromIdentity() {
        var input = new EmployeeInput("张三", 0, 0, "13800138000", "zhangsan@example.com",
            "11010519491231002X", "深圳", "李四", "13900139000", "6222020200112233445",
            "招商银行", "308584000013", null);

        var error = assertThrows(IllegalArgumentException.class, () -> EmployeeProfile.validateEmployment(input));

        assertEquals("请选择部门", error.getMessage());
    }

    @Test
    void requiresEveryNewProfileField() {
        var empty = new EmployeeInput(null, 0, 0, null, null, null, null, null, null, null, null, null, null);
        Set<String> fields = validator.validate(empty).stream()
            .map(item -> item.getPropertyPath().toString()).collect(Collectors.toSet());

        assertTrue(fields.containsAll(Set.of("name", "departmentId", "positionId", "phone", "email", "idCard",
            "address", "emergencyContact", "emergencyPhone", "bankCard", "bankName", "cnapsCode", "joinedOn")));
    }

    private static EmployeeInput validInput() {
        return new EmployeeInput("张三", 1, 1, "13800138000", "zhangsan@example.com",
            "11010519491231002X", "深圳市南山区科技园 1 号", "李四", "13900139000",
            "6222020200112233445", "招商银行深圳分行", "308584000013", LocalDate.of(2020, 1, 1));
    }

    private static EmployeeInput withPhone(String phone) {
        var base = validInput();
        return new EmployeeInput(base.name(), base.departmentId(), base.positionId(), phone, base.email(),
            base.idCard(), base.address(), base.emergencyContact(), base.emergencyPhone(), base.bankCard(),
            base.bankName(), base.cnapsCode(), base.joinedOn());
    }

    private static EmployeeInput withEmail(String email) {
        var base = validInput();
        return new EmployeeInput(base.name(), base.departmentId(), base.positionId(), base.phone(), email,
            base.idCard(), base.address(), base.emergencyContact(), base.emergencyPhone(), base.bankCard(),
            base.bankName(), base.cnapsCode(), base.joinedOn());
    }

    private static EmployeeInput withBankCard(String bankCard) {
        var base = validInput();
        return new EmployeeInput(base.name(), base.departmentId(), base.positionId(), base.phone(), base.email(),
            base.idCard(), base.address(), base.emergencyContact(), base.emergencyPhone(), bankCard,
            base.bankName(), base.cnapsCode(), base.joinedOn());
    }

    private static EmployeeInput withCnaps(String cnaps) {
        var base = validInput();
        return new EmployeeInput(base.name(), base.departmentId(), base.positionId(), base.phone(), base.email(),
            base.idCard(), base.address(), base.emergencyContact(), base.emergencyPhone(), base.bankCard(),
            base.bankName(), cnaps, base.joinedOn());
    }
}