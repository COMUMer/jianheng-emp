package com.jianheng.emp.approval;

import static com.jianheng.emp.approval.AttachmentCleanupMapper.Orphan;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.util.List;
import org.junit.jupiter.api.Test;

class AttachmentCleanupServiceTest {
    private final AttachmentCleanupMapper mapper = mock(AttachmentCleanupMapper.class);
    private final AttachmentService attachments = mock(AttachmentService.class);
    private final AttachmentCleanupService service = new AttachmentCleanupService(mapper, attachments);

    @Test
    void deletesEveryLockedRowAndReturnsThem() {
        var orphans = List.of(new Orphan(1, "a"), new Orphan(2, "b"));
        when(mapper.lockOrphans(48, 500)).thenReturn(orphans);

        assertEquals(orphans, service.deleteBatch(48, 500));

        verify(mapper).deleteFile(1);
        verify(mapper).deleteFile(2);
    }

    @Test
    void countsCandidatesWithoutDeleting() {
        when(mapper.countOrphans(48)).thenReturn(3L);

        assertEquals(3L, service.count(48));

        verify(mapper, never()).lockOrphans(anyInt(), anyInt());
        verify(mapper, never()).deleteFile(anyLong());
    }

    @Test
    void deletesStoredFilesAfterCommitAndCountsFailures() throws Exception {
        var orphans = List.of(new Orphan(1, "a"), new Orphan(2, "b"));
        doThrow(new IOException("disk")).when(attachments).deleteStored("b");

        assertEquals(1, service.deleteFiles(orphans));

        verify(attachments).deleteStored("a");
        verify(attachments).deleteStored("b");
    }
}
