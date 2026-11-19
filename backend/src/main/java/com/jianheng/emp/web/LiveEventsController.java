package com.jianheng.emp.web;

import com.jianheng.emp.security.AccountService;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
class LiveEventsController {
    private final AccountService accounts;
    private final SseRegistry registry;

    LiveEventsController(AccountService accounts, SseRegistry registry) {
        this.accounts = accounts;
        this.registry = registry;
    }

    /** 实时信号：只推「有更新」，内容由前端按权限重新拉取。 */
    @GetMapping(path = "/api/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    SseEmitter events(Authentication authentication) {
        return registry.subscribe(accounts.current(authentication).id());
    }
}
