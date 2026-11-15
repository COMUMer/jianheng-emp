package com.jianheng.emp.security;

import java.util.List;
import org.apache.ibatis.annotations.*;

@Mapper
public interface AccountMapper {
    String ACCOUNT_SELECT = """
        SELECT a.id, a.username, a.password_hash, a.employee_id, e.mis AS employee_mis,
               e.name AS employee_name, e.avatar_key AS employee_avatar_key, a.active,
               a.created_at, a.updated_at, COALESCE(oe.name, op.username) AS operator
        FROM account a LEFT JOIN employee e ON e.id = a.employee_id
        LEFT JOIN account op ON op.id = a.updated_by LEFT JOIN employee oe ON oe.id = op.employee_id
        """;
    record Account(long id, String username, String passwordHash, Long employeeId, String employeeMis,
                   String employeeName, String employeeAvatarKey, boolean active,
                   java.time.LocalDateTime createdAt, java.time.LocalDateTime updatedAt, String operator) {}
    record AccountOption(long id, String username, Long employeeId, String name) {}

    @Select(ACCOUNT_SELECT + "WHERE a.username = #{username}")
    Account byUsername(String username);

    @Select(ACCOUNT_SELECT + "WHERE a.id = #{id}")
    Account byId(long id);

    @Select(ACCOUNT_SELECT + "WHERE a.employee_id = #{id}")
    Account byEmployee(long id);

    @Select("SELECT role FROM account_role WHERE account_id = #{id} ORDER BY role")
    List<Role> roles(long id);

    @Select("""
        SELECT a.id, a.username, a.employee_id, e.name
        FROM account a LEFT JOIN employee e ON e.id = a.employee_id
        WHERE a.active ORDER BY COALESCE(e.name, a.username), a.id
        """)
    List<AccountOption> options();

    @Insert("INSERT INTO account(username, password_hash, employee_id) VALUES(#{username}, #{hash}, #{employeeId})")
    void insert(String username, String hash, Long employeeId);

    @Delete("DELETE FROM account_role WHERE account_id = #{id}")
    void clearRoles(long id);

    @Insert("INSERT INTO account_role(account_id, role) VALUES(#{id}, #{role})")
    void addRole(long id, Role role);

    @Update("UPDATE account SET active = #{active} WHERE id = #{id}")
    void setActive(long id, boolean active);

    @Update("UPDATE account SET password_hash = #{hash} WHERE id = #{id}")
    void setPassword(long id, String hash);

    @Update("UPDATE account SET updated_by = #{actor} WHERE id = #{id}")
    void touchOperator(long id, long actor);

    @Select("SELECT COUNT(*) FROM account")
    int count();
}
