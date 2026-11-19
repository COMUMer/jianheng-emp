package com.jianheng.emp.people;

import java.time.LocalDate;

public class EmployeeConflict extends RuntimeException {
    private final long employeeId;
    private final String employeeName;
    private final LocalDate departedOn;

    public EmployeeConflict(long employeeId, String employeeName, LocalDate departedOn) {
        super(departedOn == null ? "该员工仍在职，不能重复建档" : "该身份证号已登记，可办理重新入职");
        this.employeeId = employeeId;
        this.employeeName = employeeName;
        this.departedOn = departedOn;
    }

    public long employeeId() { return employeeId; }
    public String employeeName() { return employeeName; }
    public LocalDate departedOn() { return departedOn; }
}