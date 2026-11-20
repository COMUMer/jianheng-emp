package com.jianheng.emp.security;

import java.util.List;
import org.apache.ibatis.annotations.*;

@Mapper
public interface AccountMapper {
    String ACCOUNT_SELECT = """
        SELECT a.id, a.username, a.password_hash, a.employee_id, e.mis AS employee_mis,
               e.name AS employee_name, e.avatar_key AS employee_avatar_key, a.active,
               a.created_at, a.updated_at, COALESCE(oe.name, op.username) AS operator,
               p.name AS employee_position_name
        FROM account a LEFT JOIN employee e ON e.id = a.employee_id
        LEFT JOIN employment emp ON emp.id = (
            SELECT emp2.id FROM employment emp2 WHERE emp2.employee_id = e.id
            ORDER BY emp2.joined_on DESC, emp2.id DESC LIMIT 1)
        LEFT JOIN job_position p ON p.id = emp.position_id
        LEFT JOIN account op ON op.id = a.updated_by LEFT JOIN employee oe ON oe.id = op.employee_id
        """;
    record Account(long id, String username, String passwordHash, Long employeeId, String employeeMis,
                   String employeeName, String employeeAvatarKey, boolean active,
                   java.time.LocalDateTime createdAt, java.time.LocalDateTime updatedAt, String operator,
                   String employeePositionName) {
        @AutomapConstructor
        public Account {}

        Account(long id, String username, String passwordHash, Long employeeId, String employeeMis,
                String employeeName, String employeeAvatarKey, boolean active,
                java.time.LocalDateTime createdAt, java.time.LocalDateTime updatedAt, String operator) {
            this(id, username, passwordHash, employeeId, employeeMis, employeeName, employeeAvatarKey, active,
                createdAt, updatedAt, operator, null);
        }
    }
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
        SELECT a.id FROM account a JOIN account_role r ON r.account_id = a.id
        WHERE r.role = #{role} AND a.active ORDER BY a.id
        """)
    List<Long> activeIdsWithRole(Role role);

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

    record ResetTarget(long accountId, long employeeId, String username, String email) {}

    @Select("""
        SELECT a.id AS account_id, e.id AS employee_id, a.username, e.email
        FROM account a JOIN employee e ON e.id = a.employee_id
        WHERE a.username = #{mis} AND a.active
        """)
    ResetTarget resetTarget(String mis);
    @Update("UPDATE account SET active = #{active} WHERE id = #{id}")
    void setActive(long id, boolean active);

    @Update("UPDATE account SET password_hash = #{hash} WHERE id = #{id}")
    void setPassword(long id, String hash);

    @Update("UPDATE account SET updated_by = #{actor} WHERE id = #{id}")
    void touchOperator(long id, long actor);

    /** 系统动作的操作人账号：禁用状态，重复执行不报错。 */
    @Insert("""
        INSERT INTO account(username, password_hash, employee_id, active) VALUES(#{username}, #{hash}, NULL, FALSE)
        ON DUPLICATE KEY UPDATE username = username
        """)
    void insertDisabled(String username, String hash);
    @Select("SELECT id_card FROM employee WHERE id = #{id}")
    String employeeIdCard(long id);
}
