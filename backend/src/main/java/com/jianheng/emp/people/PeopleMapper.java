package com.jianheng.emp.people;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import org.apache.ibatis.annotations.*;

@Mapper
public interface PeopleMapper {
    record Department(long id, String name, Long parentId, Long managerId, boolean active,
                      LocalDateTime createdAt, LocalDateTime updatedAt, String operator) {}
    record Position(long id, String name, String description, boolean active,
                    LocalDateTime createdAt, LocalDateTime updatedAt, String operator) {}
    record Employee(long id, String mis, String name, long departmentId, long positionId, String phone,
                    String email, String idCard, String address, String emergencyContact, String emergencyPhone,
                    String bankCard, String bankName, String cnapsCode, String avatarKey, LocalDate joinedOn, LocalDate departedOn,
                    String departmentName, String positionName, LocalDateTime createdAt, LocalDateTime updatedAt, String operator,
                    Boolean accountActive) {}
    record EmployeeCard(long id, String name, String mis, String avatarKey, String departmentName, String positionName,
                        LocalDate joinedOn, LocalDate departedOn) {}
    record Employment(long id, long departmentId, String departmentName, long positionId, String positionName,
                      LocalDate joinedOn, LocalDate departedOn) {}
    record EmploymentFlowCount(String month, int hired, int departed) {}
    record SensitiveRow(long id, String phone, String idCard, String idCardBidx, String emergencyPhone,
                        String bankCard) {}

    String EMPLOYEE_SELECT = """
        SELECT e.id, e.mis, e.name, emp.department_id, emp.position_id, e.phone, e.email, e.id_card, e.address,
               e.emergency_contact, e.emergency_phone, e.bank_card, e.bank_name, e.cnaps_code, e.avatar_key,
               emp.joined_on, emp.departed_on, d.name AS department_name, p.name AS position_name,
               e.created_at, e.updated_at, COALESCE(op.name, a.username) AS operator, acc.active AS account_active
        FROM employee e
        JOIN employment emp ON emp.id = (
            SELECT emp2.id FROM employment emp2 WHERE emp2.employee_id = e.id
            ORDER BY emp2.joined_on DESC, emp2.id DESC LIMIT 1)
        JOIN department d ON d.id = emp.department_id
        JOIN job_position p ON p.id = emp.position_id
        LEFT JOIN account a ON a.id = e.updated_by
        LEFT JOIN employee op ON op.id = a.employee_id
        LEFT JOIN account acc ON acc.employee_id = e.id
        """;
    String EMPLOYMENT_SELECT = """
        SELECT emp.id, emp.department_id, d.name AS department_name, emp.position_id, p.name AS position_name,
               emp.joined_on, emp.departed_on
        FROM employment emp JOIN department d ON d.id = emp.department_id JOIN job_position p ON p.id = emp.position_id
        """;
    String DEPARTMENTS = "SELECT d.*, COALESCE(op.name, a.username) AS operator FROM department d LEFT JOIN account a ON a.id=d.updated_by LEFT JOIN employee op ON op.id=a.employee_id ";
    String POSITIONS = "SELECT p.*, COALESCE(op.name, a.username) AS operator FROM job_position p LEFT JOIN account a ON a.id=p.updated_by LEFT JOIN employee op ON op.id=a.employee_id ";

    @Select(DEPARTMENTS + "ORDER BY d.name") List<Department> departments();
    @Select(DEPARTMENTS + "WHERE d.id=#{id}") Department department(long id);
    @Select(POSITIONS + "ORDER BY p.name") List<Position> positions();
    @Select(POSITIONS + "WHERE p.id=#{id}") Position position(long id);
    @Select(EMPLOYEE_SELECT + "ORDER BY emp.departed_on IS NOT NULL, e.mis") List<Employee> employees();
    @Select(EMPLOYEE_SELECT + "WHERE e.id=#{id}") Employee employee(long id);
    @Select("""
        SELECT e.id, e.name, e.mis, e.avatar_key, d.name AS department_name, p.name AS position_name,
               emp.joined_on, emp.departed_on
        FROM employee e
        JOIN employment emp ON emp.id = (
            SELECT emp2.id FROM employment emp2 WHERE emp2.employee_id = e.id
            ORDER BY emp2.joined_on DESC, emp2.id DESC LIMIT 1)
        JOIN department d ON d.id = emp.department_id
        JOIN job_position p ON p.id = emp.position_id
        WHERE e.id = #{id}
        """) EmployeeCard employeeCard(long id);
    @Select(EMPLOYEE_SELECT + "WHERE e.mis=#{mis}") Employee employeeByMis(String mis);
    @Select("SELECT id FROM employee WHERE id_card_bidx=#{blindIndex} AND id<>#{excludeId}")
    Long employeeByIdCard(@Param("blindIndex") String blindIndex, @Param("excludeId") long excludeId);
    @Select("SELECT id FROM employee WHERE mis=#{mis}") Long employeeIdByMis(String mis);
    @Select("SELECT id FROM employee WHERE id=#{id} FOR UPDATE") Long lockEmployee(long id);
    @Select("SELECT id FROM department ORDER BY id FOR UPDATE") List<Long> lockDepartments();
    @Select(EMPLOYMENT_SELECT + "WHERE emp.employee_id=#{id} ORDER BY emp.joined_on DESC, emp.id DESC")
    List<Employment> employments(long id);
    @Select(EMPLOYMENT_SELECT + "WHERE emp.employee_id=#{id} AND emp.departed_on IS NULL") Employment currentEmployment(long id);
    @Select("""
        SELECT month, CAST(SUM(hired) AS SIGNED) AS hired, CAST(SUM(departed) AS SIGNED) AS departed
        FROM (
            SELECT DATE_FORMAT(joined_on, '%Y-%m') AS month, 1 AS hired, 0 AS departed
            FROM employment WHERE joined_on >= #{from}
            UNION ALL
            SELECT DATE_FORMAT(departed_on, '%Y-%m'), 0, 1
            FROM employment WHERE departed_on IS NOT NULL AND departed_on >= #{from}
        ) flow GROUP BY month ORDER BY month
        """)
    List<EmploymentFlowCount> employmentFlow(LocalDate from);
    @Select("""
        SELECT a.id FROM department d JOIN employee e ON e.id=d.manager_id JOIN account a ON a.employee_id=e.id
        JOIN employment emp ON emp.employee_id=e.id AND emp.departed_on IS NULL
        WHERE d.id=#{id} AND a.active
        """)
    Long managerAccount(long id);

    @Insert("INSERT INTO mis_sequence(base, issued) VALUES(#{base}, 1) ON DUPLICATE KEY UPDATE issued = issued + 1")
    void bumpMisSequence(String base);
    @Select("SELECT issued FROM mis_sequence WHERE base=#{base}") int misSequence(String base);

    @Insert("INSERT INTO department(name,parent_id,manager_id,updated_by) VALUES(#{value.name},#{value.parentId},#{value.managerId},#{actor})")
    void createDepartment(@Param("value") Department value, @Param("actor") long actor);
    @Update("UPDATE department SET name=#{value.name},parent_id=#{value.parentId},manager_id=#{value.managerId},updated_by=#{actor} WHERE id=#{value.id}")
    void updateDepartment(@Param("value") Department value, @Param("actor") long actor);
    @Insert("INSERT INTO job_position(name,description,updated_by) VALUES(#{value.name},#{value.description},#{actor})")
    void createPosition(@Param("value") Position value, @Param("actor") long actor);
    @Update("UPDATE job_position SET name=#{value.name}, description=#{value.description}, updated_by=#{actor} WHERE id=#{value.id}")
    void updatePosition(@Param("value") Position value, @Param("actor") long actor);

    @Update("UPDATE department SET active=#{active}, updated_by=#{actor} WHERE id=#{id}")
    void setDepartmentActive(long id, boolean active, long actor);
    @Delete("DELETE FROM department WHERE id=#{id}") void deleteDepartment(long id);
    @Select("SELECT COUNT(*) FROM department WHERE parent_id=#{id}") int childDepartments(long id);
    @Select("SELECT COUNT(*) FROM employment WHERE department_id=#{id}") int departmentEmployments(long id);
    @Select("SELECT COUNT(*) FROM employment WHERE department_id=#{id} AND departed_on IS NULL")
    int currentDepartmentEmployments(long id);
    @Select("SELECT COUNT(*) FROM document_revision WHERE department_id=#{id}") int departmentDocuments(long id);

    @Update("UPDATE job_position SET active=#{active}, updated_by=#{actor} WHERE id=#{id}")
    void setPositionActive(long id, boolean active, long actor);
    @Delete("DELETE FROM job_position WHERE id=#{id}") void deletePosition(long id);
    @Select("SELECT COUNT(*) FROM employment WHERE position_id=#{id}") int positionEmployments(long id);
    @Select("SELECT COUNT(*) FROM employment WHERE position_id=#{id} AND departed_on IS NULL")
    int currentPositionEmployments(long id);

    @Insert("""
        INSERT INTO employee(mis,name,phone,email,id_card,id_card_bidx,address,emergency_contact,emergency_phone,bank_card,bank_name,cnaps_code,updated_by)
        VALUES(#{mis},#{value.name},#{value.phone},#{value.email},#{value.idCard},#{idCardBidx},#{value.address},#{value.emergencyContact},
               #{value.emergencyPhone},#{value.bankCard},#{value.bankName},#{value.cnapsCode},#{actor})
        """)
    void createEmployee(String mis, @Param("value") PeopleService.EmployeeInput value,
                        @Param("idCardBidx") String idCardBidx, @Param("actor") long actor);
    @Update("""
        UPDATE employee SET name=#{value.name},phone=#{value.phone},email=#{value.email},id_card=#{value.idCard},
               id_card_bidx=#{idCardBidx},address=#{value.address},emergency_contact=#{value.emergencyContact},
               emergency_phone=#{value.emergencyPhone},bank_card=#{value.bankCard},bank_name=#{value.bankName},
               cnaps_code=#{value.cnapsCode},updated_by=#{actor}
        WHERE id=#{id}
        """)
    void updateEmployee(long id, @Param("value") PeopleService.EmployeeInput value,
                        @Param("idCardBidx") String idCardBidx, @Param("actor") long actor);
    @Update("UPDATE employee SET avatar_key=#{key}, updated_at=updated_at WHERE id=#{id}") void setAvatar(long id, String key);
    @Select("SELECT id, phone, id_card, id_card_bidx, emergency_phone, bank_card FROM employee ORDER BY id")
    List<SensitiveRow> sensitiveRows();
    @Update("""
        UPDATE employee SET phone=#{row.phone}, id_card=#{row.idCard}, id_card_bidx=#{row.idCardBidx},
               emergency_phone=#{row.emergencyPhone}, bank_card=#{row.bankCard}
        WHERE id=#{row.id}
        """)
    void updateSensitive(@Param("row") SensitiveRow row);

    @Insert("""
        INSERT INTO employment(employee_id,department_id,position_id,joined_on,departed_on,updated_by)
        VALUES(#{employeeId},#{value.departmentId},#{value.positionId},#{value.joinedOn},#{departedOn},#{actor})
        """)
    void createEmployment(@Param("employeeId") long employeeId, @Param("value") PeopleService.EmploymentInput value,
                          @Param("departedOn") LocalDate departedOn, @Param("actor") long actor);
    @Update("""
        UPDATE employment SET department_id=#{value.departmentId},position_id=#{value.positionId},joined_on=#{value.joinedOn},
               updated_by=#{actor} WHERE id=#{id}
        """)
    void updateEmployment(long id, @Param("value") PeopleService.EmploymentInput value, @Param("actor") long actor);
    @Update("UPDATE employment SET departed_on=#{date},updated_by=#{actor} WHERE id=#{id}")
    void closeEmployment(long id, LocalDate date, long actor);

    @Update("UPDATE department SET manager_id=NULL WHERE manager_id=#{id}") void removeManager(long id);
}