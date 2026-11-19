package com.jianheng.emp.web;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;

import com.jianheng.emp.security.AccountService;
import com.jianheng.emp.security.AccountService.CurrentUser;
import com.jianheng.emp.security.Role;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class SseRegistryTest {
    private static final long ACCOUNT = 7;

    private final AccountService accounts = mock(AccountService.class);
    private final SseRegistry registry = new SseRegistry();
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new LiveEventsController(accounts, registry)).build();

    SseRegistryTest() {
        when(accounts.current(nullable(Authentication.class)))
            .thenReturn(new CurrentUser(ACCOUNT, "employee", 3L, "employee", "员工", null, List.of(Role.EMPLOYEE)));
    }

    @AfterEach
    void shutdown() {
        registry.shutdown();
    }

    @Test
    void streamsAChangeToEveryOpenConnectionOfTheAccount() throws Exception {
        var result = mvc.perform(get("/api/events").accept(MediaType.TEXT_EVENT_STREAM))
            .andExpect(request().asyncStarted()).andReturn();

        assertTrue(registry.isConnected(ACCOUNT));
        registry.deliver(ACCOUNT);

        var body = result.getResponse().getContentAsString();
        assertTrue(body.contains("event:ready"), body);
        assertTrue(body.contains("event:workflow"), body);
        assertTrue(body.contains("data:changed"), body);
    }

    @Test
    void keepsStreamsPerAccount() throws Exception {
        mvc.perform(get("/api/events").accept(MediaType.TEXT_EVENT_STREAM)).andExpect(request().asyncStarted());
        registry.deliver(ACCOUNT + 1);

        assertTrue(registry.isConnected(ACCOUNT));
        assertFalse(registry.isConnected(ACCOUNT + 1));
    }

    /** 已经断掉的连接在下一次推送失败时被剔除，不会一直占着注册表。 */
    @Test
    void forgetsConnectionsThatCanNoLongerReceive() {
        var emitter = registry.subscribe(ACCOUNT);
        assertTrue(registry.isConnected(ACCOUNT));

        emitter.complete();
        registry.deliver(ACCOUNT);

        assertFalse(registry.isConnected(ACCOUNT));
    }
}
