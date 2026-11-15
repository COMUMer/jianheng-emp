package com.jianheng.emp.people;

import com.jianheng.emp.security.AccountService;
import com.jianheng.emp.security.Role;
import com.jianheng.emp.web.AuditMapper;
import jakarta.validation.Valid;
import java.io.IOException;
import java.util.List;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/people")
class PeopleController {
    private final PeopleMapper mapper;
    private final PeopleService people;
    private final AccountService accounts;
    private final AuditMapper audit;
    private final EmployeeAvatarService avatars;

    PeopleController(PeopleMapper mapper, PeopleService people, AccountService accounts, AuditMapper audit,
                     EmployeeAvatarService avatars) {
        this.mapper = mapper;
        this.people = people;
        this.accounts = accounts;
        this.audit = audit;
        this.avatars = avatars;
    }

    @GetMapping("/departments") List<PeopleMapper.Department> departments() { return mapper.departments(); }
    @GetMapping("/positions") List<PeopleMapper.Position> positions() { return mapper.positions(); }

    @GetMapping("/employees") List<PeopleMapper.Employee> employees(Authentication auth) {
        hr(auth);
        return mapper.employees();
    }

    @GetMapping("/employees/{id}") PeopleService.EmployeeDetail detail(Authentication auth, @PathVariable long id) {
        var actor = accounts.current(auth);
        boolean manager = actor.has(Role.ADMIN) || actor.has(Role.HR);
        if (!manager && !java.util.Objects.equals(actor.employeeId(), id)) accounts.require(actor, Role.ADMIN, Role.HR);
        return new PeopleService.EmployeeDetail(people.employee(id), actor.has(Role.ADMIN) ? accounts.employeeAccount(id) : null, audit.employeeHistory(id));
    }

    @PostMapping("/me/avatar") EmployeeAvatarService.AvatarView uploadAvatar(Authentication auth, @RequestParam("file") MultipartFile file) throws IOException {
        return avatars.save(accounts.current(auth), file);
    }

    @GetMapping("/avatars/{key}") ResponseEntity<FileSystemResource> avatar(@PathVariable String key) {
        return avatars.load(key);
    }

    @PostMapping("/employees") PeopleMapper.Employee create(Authentication auth, @Valid @RequestBody PeopleService.EmployeeInput input) {
        return people.saveEmployee(hr(auth), null, input);
    }

    @PutMapping("/employees/{id}") PeopleMapper.Employee update(Authentication auth, @PathVariable long id, @Valid @RequestBody PeopleService.EmployeeInput input) {
        return people.saveEmployee(hr(auth), id, input);
    }

    @PostMapping("/employees/{id}/departure") void depart(Authentication auth, @PathVariable long id, @Valid @RequestBody PeopleService.Departure input) {
        people.depart(hr(auth), id, input.date());
    }

    @PutMapping("/employees/{id}/account") AccountService.AccountView account(Authentication auth, @PathVariable long id, @RequestBody AccountService.AccountInput input) {
        var actor = accounts.current(auth);
        accounts.require(actor, Role.ADMIN);
        return people.updateAccount(actor, id, input);
    }

    @PostMapping("/departments") void createDepartment(Authentication auth, @Valid @RequestBody PeopleService.DepartmentInput input) {
        people.saveDepartment(hr(auth), null, input);
    }

    @PutMapping("/departments/{id}") void updateDepartment(Authentication auth, @PathVariable long id, @Valid @RequestBody PeopleService.DepartmentInput input) {
        people.saveDepartment(hr(auth), id, input);
    }

    @PostMapping("/positions") void createPosition(Authentication auth, @Valid @RequestBody PeopleService.NameInput input) {
        mapper.createPosition(input.name().strip(), hr(auth).id());
    }

    @PutMapping("/positions/{id}") void updatePosition(Authentication auth, @PathVariable long id, @Valid @RequestBody PeopleService.NameInput input) {
        mapper.updatePosition(id, input.name().strip(), hr(auth).id());
    }

    private AccountService.CurrentUser hr(Authentication auth) {
        var actor = accounts.current(auth);
        accounts.require(actor, Role.ADMIN, Role.HR);
        return actor;
    }
}
