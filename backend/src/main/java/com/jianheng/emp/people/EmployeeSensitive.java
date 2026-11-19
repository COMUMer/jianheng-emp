package com.jianheng.emp.people;

import com.jianheng.emp.security.pii.PiiCipher;
import org.springframework.stereotype.Component;

/** 员工敏感字段的加解密边界：写库前加密，读库后解密。 */
@Component
class EmployeeSensitive {
    static final String ID_CARD = "employee.id_card";
    static final String BANK_CARD = "employee.bank_card";
    static final String PHONE = "employee.phone";
    static final String EMERGENCY_PHONE = "employee.emergency_phone";

    private final PiiCipher cipher;

    EmployeeSensitive(PiiCipher cipher) {
        this.cipher = cipher;
    }

    /** 写库前的入参：身份证、银行卡、手机号、紧急联系电话换成密文，其余不变。 */
    PeopleService.EmployeeInput secure(PeopleService.EmployeeInput input) {
        return new PeopleService.EmployeeInput(input.name(), input.departmentId(), input.positionId(),
            cipher.encrypt(input.phone(), PHONE), input.email(), cipher.encrypt(input.idCard(), ID_CARD),
            input.address(), input.emergencyContact(), cipher.encrypt(input.emergencyPhone(), EMERGENCY_PHONE),
            cipher.encrypt(input.bankCard(), BANK_CARD), input.bankName(), input.cnapsCode(), input.joinedOn());
    }

    /** 身份证等值查询与唯一约束用的指纹。 */
    String idCardBlindIndex(String idCard) {
        return cipher.blindIndex(idCard);
    }

    /** 存量数据加密：已加密的字段原样保留，指纹按明文重算，空值不加密也不建索引。 */
    PeopleMapper.SensitiveRow secure(PeopleMapper.SensitiveRow row) {
        String idCard = cipher.isEncrypted(row.idCard()) ? cipher.decrypt(row.idCard(), ID_CARD) : text(row.idCard());
        String phone = cipher.isEncrypted(row.phone()) ? cipher.decrypt(row.phone(), PHONE) : text(row.phone());
        String emergencyPhone = cipher.isEncrypted(row.emergencyPhone())
            ? cipher.decrypt(row.emergencyPhone(), EMERGENCY_PHONE) : text(row.emergencyPhone());
        String bankCard = cipher.isEncrypted(row.bankCard()) ? cipher.decrypt(row.bankCard(), BANK_CARD) : text(row.bankCard());
        return new PeopleMapper.SensitiveRow(row.id(),
            cipher.encrypt(phone, PHONE),
            cipher.encrypt(idCard, ID_CARD),
            idCard.isEmpty() ? null : cipher.blindIndex(idCard),
            cipher.encrypt(emergencyPhone, EMERGENCY_PHONE),
            cipher.encrypt(bankCard, BANK_CARD));
    }

    /** 详情：四个字段都还原成明文。 */
    PeopleMapper.Employee reveal(PeopleMapper.Employee employee) {
        return copy(employee,
            cipher.decrypt(employee.phone(), PHONE),
            cipher.decrypt(employee.idCard(), ID_CARD),
            cipher.decrypt(employee.emergencyPhone(), EMERGENCY_PHONE),
            cipher.decrypt(employee.bankCard(), BANK_CARD));
    }

    /** 列表：只还原手机号，证件与银行卡不下发。 */
    PeopleMapper.Employee revealForList(PeopleMapper.Employee employee) {
        return copy(employee,
            cipher.decrypt(employee.phone(), PHONE),
            null,
            cipher.decrypt(employee.emergencyPhone(), EMERGENCY_PHONE),
            null);
    }

    private static PeopleMapper.Employee copy(PeopleMapper.Employee employee, String phone, String idCard,
                                              String emergencyPhone, String bankCard) {
        return new PeopleMapper.Employee(employee.id(), employee.mis(), employee.name(), employee.departmentId(),
            employee.positionId(), phone, employee.email(), idCard, employee.address(), employee.emergencyContact(),
            emergencyPhone, bankCard, employee.bankName(), employee.cnapsCode(), employee.avatarKey(),
            employee.joinedOn(), employee.departedOn(), employee.departmentName(), employee.positionName(),
            employee.createdAt(), employee.updatedAt(), employee.operator(), employee.accountActive());
    }

    private static String text(String value) {
        return value == null ? "" : value;
    }
}
