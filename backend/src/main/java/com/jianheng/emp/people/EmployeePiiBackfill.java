package com.jianheng.emp.people;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/** 启动时把历史明文员工敏感字段就地加密；幂等，已是密文的行不变。 */
@Component
class EmployeePiiBackfill implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(EmployeePiiBackfill.class);

    private final PeopleMapper mapper;
    private final EmployeeSensitive sensitive;

    EmployeePiiBackfill(PeopleMapper mapper, EmployeeSensitive sensitive) {
        this.mapper = mapper;
        this.sensitive = sensitive;
    }

    @Override
    public void run(ApplicationArguments args) {
        int encrypted = 0;
        for (var row : mapper.sensitiveRows()) {
            var secured = sensitive.secure(row);
            if (secured.equals(row)) continue;
            mapper.updateSensitive(secured);
            encrypted++;
        }
        if (encrypted > 0) log.info("已加密 {} 条员工敏感字段", encrypted);
    }
}
