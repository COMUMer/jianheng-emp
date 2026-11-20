package com.jianheng.emp.approval;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.jianheng.emp.people.PeopleService;
import com.jianheng.emp.security.AccountMapper;
import com.jianheng.emp.security.AccountService;
import com.jianheng.emp.security.AccountService.CurrentUser;
import com.jianheng.emp.security.Role;
import com.jianheng.emp.web.AuditMapper;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.Authentication;

class WorkflowCategoryAuditTest {
    private final WorkflowMapper mapper = mock(WorkflowMapper.class);
    private final AccountService accounts = mock(AccountService.class);
    private final AuditMapper audit = mock(AuditMapper.class);
    private final WorkflowController controller = new WorkflowController(mock(WorkflowService.class), mapper,
        accounts, mock(AccountMapper.class), mock(AttachmentService.class), audit);
    private final CurrentUser actor = new CurrentUser(7, "admin", null, null, null, null, List.of(Role.ADMIN));
    private final Authentication authentication = mock(Authentication.class);

    @Test
    void recordsWhoAddedACategory() {
        when(accounts.current(authentication)).thenReturn(actor);
        when(mapper.insertedId()).thenReturn(21L);

        controller.createCategory(authentication, new PeopleService.NameInput("住房/房租费"));

        verify(mapper).addCategory("住房/房租费", 7L);
        verify(audit).record(7L, "EXPENSE_CATEGORY_CREATE", 21L, "住房/房租费");
    }

    @Test
    void recordsBothNamesWhenACategoryIsRenamed() {
        when(accounts.current(authentication)).thenReturn(actor);
        when(mapper.category(3L)).thenReturn(new WorkflowData.Category(3, "办公费", true, null, null, null));

        controller.updateCategory(authentication, 3L, new PeopleService.NameInput("办公用品"));

        verify(mapper).changeCategory(3L, "办公用品", 7L);
        verify(audit).record(7L, "EXPENSE_CATEGORY_RENAME", 3L, "办公费 → 办公用品");
    }
}
