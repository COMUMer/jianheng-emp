package com.jianheng.emp.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionTemplate;

/** 只有在业务事务提交之后，另一端才会收到「有更新」。 */
@SpringBootTest
@Import(LiveSignalTest.Config.class)
class LiveSignalTest {
    @Autowired
    private ApplicationEventPublisher events;

    @Autowired
    private PlatformTransactionManager transactions;

    @Autowired
    private Config.Recorder recorder;

    @Test
    void announcesChangesOnlyAfterTheTransactionCommits() {
        var template = new TransactionTemplate(transactions);
        recorder.signals.clear();

        template.executeWithoutResult(status -> {
            events.publishEvent(new LiveSignal(7));
            status.setRollbackOnly();
        });
        assertTrue(recorder.signals.isEmpty(), recorder.signals.toString());

        template.executeWithoutResult(status -> events.publishEvent(new LiveSignal(8)));
        assertEquals(List.of(8L), recorder.signals.stream().map(LiveSignal::accountId).toList());
    }

    @TestConfiguration
    static class Config {
        @Bean
        Recorder recorder() {
            return new Recorder();
        }

        static class Recorder {
            final List<LiveSignal> signals = new CopyOnWriteArrayList<>();

            @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
            public void on(LiveSignal signal) {
                signals.add(signal);
            }
        }
    }
}
