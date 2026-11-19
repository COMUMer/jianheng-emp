package com.jianheng.emp.security;

import java.time.LocalDateTime;
import org.apache.ibatis.annotations.*;

@Mapper
interface VerificationCodeMapper {
    record Code(long id, long employeeId, String purpose, String codeHash, int attempts, LocalDateTime expiresAt,
                LocalDateTime consumedAt, LocalDateTime createdAt) {}

    @Insert("INSERT INTO verification_code(employee_id, purpose, code_hash, expires_at) "
        + "VALUES(#{employeeId}, #{purpose}, #{hash}, #{expiresAt})")
    void insert(long employeeId, String purpose, String hash, LocalDateTime expiresAt);

    @Select("SELECT * FROM verification_code WHERE employee_id=#{employeeId} AND purpose=#{purpose} ORDER BY id DESC LIMIT 1")
    Code latest(long employeeId, String purpose);

    @Select("SELECT COUNT(*) FROM verification_code WHERE employee_id=#{employeeId} AND purpose=#{purpose} AND created_at > #{since}")
    int countSince(long employeeId, String purpose, LocalDateTime since);

    @Select("SELECT MIN(created_at) FROM verification_code WHERE employee_id=#{employeeId} AND purpose=#{purpose} AND created_at > #{since}")
    LocalDateTime oldestSince(long employeeId, String purpose, LocalDateTime since);

    @Update("UPDATE verification_code SET attempts = attempts + 1 WHERE id = #{id}")
    void bumpAttempts(long id);

    @Update("UPDATE verification_code SET consumed_at = CURRENT_TIMESTAMP(6) WHERE id = #{id} AND consumed_at IS NULL")
    int consume(long id);
}