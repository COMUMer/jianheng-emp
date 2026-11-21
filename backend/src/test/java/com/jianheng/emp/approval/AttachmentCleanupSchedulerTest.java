package com.jianheng.emp.approval;

import static com.jianheng.emp.approval.AttachmentCleanupMapper.Orphan;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.*;

import java.util.List;
import org.junit.jupiter.api.Test;

class AttachmentCleanupSchedulerTest {
    private final AttachmentCleanupService service = mock(AttachmentCleanupService.class);

    @Test
    void countsWithoutDeletingWhileInDryRun() {
        when(service.count(48)).thenReturn(7L);

        new AttachmentCleanupScheduler(service, 48, 500, 20, true).sweep();

        verify(service).count(48);
        verify(service, never()).deleteBatch(anyInt(), anyInt());
    }

    @Test
    void deletesBatchesUntilEmpty() {
        var first = List.of(new Orphan(1, "a"), new Orphan(2, "b"));
        when(service.deleteBatch(48, 2)).thenReturn(first, List.of());

        new AttachmentCleanupScheduler(service, 48, 2, 20, false).sweep();

        verify(service, times(2)).deleteBatch(48, 2);
        verify(service).deleteFiles(first);
    }

    @Test
    void stopsAfterAPartialBatch() {
        when(service.deleteBatch(48, 5)).thenReturn(List.of(new Orphan(1, "a")));

        new AttachmentCleanupScheduler(service, 48, 5, 20, false).sweep();

        verify(service, times(1)).deleteBatch(48, 5);
    }

    @Test
    void stopsAtMaxBatches() {
        when(service.deleteBatch(48, 1)).thenReturn(List.of(new Orphan(1, "a")));

        new AttachmentCleanupScheduler(service, 48, 1, 3, false).sweep();

        verify(service, times(3)).deleteBatch(48, 1);
    }
}
