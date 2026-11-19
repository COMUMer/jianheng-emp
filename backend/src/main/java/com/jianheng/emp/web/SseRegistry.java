package com.jianheng.emp.web;

import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 实时信号通道：按账号保存在线的 SSE 连接，业务事务提交后把「有更新」推给在线的一端。
 *
 * <p>只推信号不推内容；连接失效立即剔除，由浏览器重连与前端轮询兜底。
 */
@Component
class SseRegistry {
    private static final Logger log = LoggerFactory.getLogger(SseRegistry.class);
    private static final Duration STREAM_TIMEOUT = Duration.ofMinutes(30);
    private static final long HEARTBEAT_SECONDS = 20;

    private record Stream(long accountId, SseEmitter emitter) {}

    private final Map<Long, Set<Stream>> streams = new ConcurrentHashMap<>();
    private final ScheduledExecutorService heartbeats = Executors.newSingleThreadScheduledExecutor(SseRegistry::daemon);
    private final ExecutorService deliveries = Executors.newFixedThreadPool(2, SseRegistry::daemon);

    SseRegistry() {
        heartbeats.scheduleAtFixedRate(this::heartbeat, HEARTBEAT_SECONDS, HEARTBEAT_SECONDS, TimeUnit.SECONDS);
    }

    SseEmitter subscribe(long accountId) {
        var emitter = new SseEmitter(STREAM_TIMEOUT.toMillis());
        var stream = new Stream(accountId, emitter);
        emitter.onCompletion(() -> unregister(stream));
        emitter.onTimeout(() -> {
            unregister(stream);
            emitter.complete();
        });
        emitter.onError(error -> unregister(stream));
        streams.computeIfAbsent(accountId, id -> ConcurrentHashMap.newKeySet()).add(stream);
        deliver(stream, SseEmitter.event().name("ready").data("connected"));
        return emitter;
    }

    /** 业务事务提交之后才推送；回滚的事务不会惊动任何在线的另一端。 */
    @TransactionalEventListener(fallbackExecution = true)
    public void onSignal(LiveSignal signal) {
        deliveries.execute(() -> deliver(signal.accountId()));
    }

    /** 同步推给某个账号的全部在线连接；失败即剔除。 */
    void deliver(long accountId) {
        for (var stream : streams.getOrDefault(accountId, Set.of())) {
            deliver(stream, SseEmitter.event().name("workflow").data("changed"));
        }
    }

    private void deliver(Stream stream, SseEmitter.SseEventBuilder event) {
        try {
            stream.emitter().send(event);
        } catch (IOException | RuntimeException error) {
            log.debug("SSE 推送失败，剔除连接 account={}", stream.accountId(), error);
            unregister(stream);
        }
    }

    private void heartbeat() {
        streams.values().forEach(open -> open.forEach(stream -> deliver(stream, SseEmitter.event().comment("ping"))));
    }

    private void unregister(Stream stream) {
        streams.computeIfPresent(stream.accountId(), (id, open) -> {
            open.remove(stream);
            return open.isEmpty() ? null : open;
        });
    }

    boolean isConnected(long accountId) {
        return !streams.getOrDefault(accountId, Set.of()).isEmpty();
    }

    @PreDestroy
    void shutdown() {
        heartbeats.shutdownNow();
        deliveries.shutdownNow();
        streams.values().forEach(open -> open.forEach(stream -> stream.emitter().complete()));
        streams.clear();
    }

    private static Thread daemon(Runnable task) {
        var thread = new Thread(task, "sse");
        thread.setDaemon(true);
        return thread;
    }
}
