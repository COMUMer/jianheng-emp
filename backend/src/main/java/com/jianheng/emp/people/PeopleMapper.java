package com.jianheng.emp.people;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import org.apache.ibatis.annotations.*;

@Mapper
public interface PeopleMapper {
    record Department(long id, String name, Long parentId, Long managerId, LocalDateTime createdAt, LocalDateTime updatedAt,
                      String operator) {}
    record Position(long id, String name, LocalDateTime createdAt, LocalDateTime updatedAt, String operator) {}
    record Employee(long id, String mis, String name, long departmentId, long positionId, String phone,
                    String email, String idCard, String address, String emergencyContact, String emergencyPhone,
                    String bankCard, String bankName, String cnapsCode, String avatarKey, LocalDate joinedOn, LocalDate departedOn,
                    String departmentName, String positionName, LocalDateTime createdAt, LocalDateTime updatedAt, String operator) {}

    String EMPLOYEES = "SELECT e.*, d.name AS department_name, p.name AS position_name, COALESCE(op.name, a.username) AS operator FROM employee e "
        + "JOIN department d ON d.id=e.department_id JOIN job_position p ON p.id=e.position_id "
        + "LEFT JOIN account a ON a.id=e.updated_by LEFT JOIN employee op ON op.id=a.employee_id ";
    String DEPARTMENTS = "SELECT d.*, COALESCE(op.name, a.username) AS operator FROM department d LEFT JOIN account a ON a.id=d.updated_by LEFT JOIN employee op ON op.id=a.employee_id ";
    String POSITIONS = "SELECT p.*, COALESCE(op.name, a.username) AS operator FROM job_position p LEFT JOIN account a ON a.id=p.updated_by LEFT JOIN employee op ON op.id=a.employee_id ";

    @Select(DEPARTMENTS + "ORDER BY d.name") List<Department> departments();
    @Select(DEPARTMENTS + "WHERE d.id=#{id}") Department department(long id);
    @Select(POSITIONS + "ORDER BY p.name") List<Position> positions();
    @Select(POSITIONS + "WHERE p.id=#{id}") Position position(long id);
    @Select(EMPLOYEES + "ORDER BY e.departed_on IS NOT NULL, e.mis") List<Employee> employees();
    @Select(EMPLOYEES + "WHERE e.id=#{id}") Employee employee(long id);
    @Select(EMPLOYEES + "WHERE e.mis=#{mis}") Employee employeeByMis(String mis);
    @Select("SELECT id FROM employee WHERE id_card=#{idCard} AND id<>#{excludeId}")
    Long employeeByIdCard(@Param("idCard") String idCard, @Param("excludeId") long excludeId);
    @Select("SELECT id FROM employee WHERE id=#{id} FOR UPDATE") Long lockEmployee(long id);
    @Select("SELECT id FROM department ORDER BY id FOR UPDATE") List<Long> lockDepartments();
    @Select("SELECT a.id FROM department d JOIN employee e ON e.id=d.manager_id JOIN account a ON a.employee_id=e.id WHERE d.id=#{id} AND a.active AND e.departed_on IS NULL") Long managerAccount(long id);

    @Insert("INSERT INTO mis_sequence(base, issued) VALUES(#{base}, 1) ON DUPLICATE KEY UPDATE issued = issued + 1")
    void bumpMisSequence(String base);
    @Select("SELECT issued FROM mis_sequence WHERE base=#{base}") int misSequence(String base);

    @Insert("INSERT INTO department(name,parent_id,manager_id,updated_by) VALUES(#{value.name},#{value.parentId},#{value.managerId},#{actor})")
    void createDepartment(@Param("value") Department value, @Param("actor") long actor);
    @Update("UPDATE department SET name=#{value.name},parent_id=#{value.parentId},manager_id=#{value.managerId},updated_by=#{actor} WHERE id=#{value.id}")
    void updateDepartment(@Param("value") Department value, @Param("actor") long actor);
    @Insert("INSERT INTO job_position(name,updated_by) VALUES(#{name},#{actor})") void createPosition(String name, long actor);
    @Update("UPDATE job_position SET name=#{name},updated_by=#{actor} WHERE id=#{id}") void updatePosition(long id, String name, long actor);
    @Insert("INSERT INTO employee(mis,name,department_id,position_id,phone,email,id_card,address,emergency_contact,emergency_phone,bank_card,bank_name,cnaps_code,joined_on,updated_by) "
        + "VALUES(#{mis},#{value.name},#{value.departmentId},#{value.positionId},#{value.phone},#{value.email},#{value.idCard},#{value.address},#{value.emergencyContact},#{value.emergencyPhone},#{value.bankCard},#{value.bankName},#{value.cnapsCode},#{value.joinedOn},#{actor})")
    void createEmployee(String mis, @Param("value") PeopleService.EmployeeInput value, @Param("actor") long actor);
    @Update("UPDATE employee SET name=#{value.name},department_id=#{value.departmentId},position_id=#{value.positionId},phone=#{value.phone},email=#{value.email},id_card=#{value.idCard},address=#{value.address},emergency_contact=#{value.emergencyContact},emergency_phone=#{value.emergencyPhone},bank_card=#{value.bankCard},bank_name=#{value.bankName},cnaps_code=#{value.cnapsCode},joined_on=#{value.joinedOn},updated_by=#{actor} WHERE id=#{id}")
    void updateEmployee(long id, @Param("value") PeopleService.EmployeeInput value, @Param("actor") long actor);
    @Update("UPDATE employee SET avatar_key=#{key}, updated_at=updated_at WHERE id=#{id}") void setAvatar(long id, String key);
    @Update("UPDATE employee SET departed_on=#{date},updated_by=#{actor} WHERE id=#{id}") void depart(long id, LocalDate date, long actor);
    @Update("UPDATE department SET manager_id=NULL WHERE manager_id=#{id}") void removeManager(long id);
}
