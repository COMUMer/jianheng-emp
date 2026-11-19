package com.jianheng.emp;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.jianheng.emp.approval.WorkflowData.Assignment;
import com.jianheng.emp.approval.WorkflowData.FileCategory;
import com.jianheng.emp.approval.WorkflowRules;
import com.jianheng.emp.security.Role;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;

class WorkflowRulesTest {
    @Test
    void includesConditionalNodeAtTheThreshold() {
        assertFalse(WorkflowRules.includesNode(new BigDecimal("999.99"), new BigDecimal("1000.00")));
        assertTrue(WorkflowRules.includesNode(new BigDecimal("1000.00"), new BigDecimal("1000.00")));
        assertTrue(WorkflowRules.includesNode(null, null));
    }

    @Test
    void requiresFinanceRoleOnlyForFinanceNodes() {
        assertTrue(WorkflowRules.canApprove(Assignment.MANAGER, null, List.of(Role.EMPLOYEE)));
        assertTrue(WorkflowRules.canApprove(Assignment.NAMED, null, List.of(Role.EMPLOYEE)));
        assertFalse(WorkflowRules.canApprove(Assignment.FINANCE, null, List.of(Role.EMPLOYEE)));
        assertTrue(WorkflowRules.canApprove(Assignment.FINANCE, null, List.of(Role.FINANCE)));
        assertFalse(WorkflowRules.canApprove(Assignment.NAMED, LocalDate.of(2026, 1, 1), List.of(Role.EMPLOYEE)));
    }

    @Test
    void requiresInvoiceAndPaymentForExpenseAttachments() {
        assertDoesNotThrow(() -> WorkflowRules.requireExpenseAttachments(List.of(FileCategory.INVOICE, FileCategory.PAYMENT)));
        assertEquals("请上传发票", assertThrows(IllegalArgumentException.class,
            () -> WorkflowRules.requireExpenseAttachments(List.of(FileCategory.PAYMENT))).getMessage());
        assertEquals("请上传付款记录", assertThrows(IllegalArgumentException.class,
            () -> WorkflowRules.requireExpenseAttachments(List.of(FileCategory.INVOICE))).getMessage());
        assertEquals("请为每个附件选择类型", assertThrows(IllegalArgumentException.class,
            () -> WorkflowRules.requireExpenseAttachments(Arrays.asList(FileCategory.INVOICE, FileCategory.PAYMENT, null))).getMessage());
    }

    @Test
    void requiresAttachmentForPurchase() {
        assertDoesNotThrow(() -> WorkflowRules.requirePurchaseAttachment(List.of(FileCategory.OTHER)));
        assertEquals("请上传采购附件", assertThrows(IllegalArgumentException.class,
            () -> WorkflowRules.requirePurchaseAttachment(List.of())).getMessage());
    }

    @Test
    void pairsBothCandidatesForOrSign() {
        assertArrayEquals(new Long[]{1L, 2L}, WorkflowRules.approverPair(true, true, 1L, 2L));
        assertArrayEquals(new Long[]{1L, null}, WorkflowRules.approverPair(true, false, 1L, 2L));
        assertArrayEquals(new Long[]{2L, null}, WorkflowRules.approverPair(false, true, 1L, 2L));
        assertArrayEquals(new Long[]{1L, null}, WorkflowRules.approverPair(true, true, 1L, 1L));
        assertNull(WorkflowRules.approverPair(false, false, 1L, 2L));
    }

    @Test
    void rejectsExtraMoneyPrecision() {
        assertEquals(new BigDecimal("12.30"), WorkflowRules.money(new BigDecimal("12.3")));
        assertThrows(IllegalArgumentException.class, () -> WorkflowRules.money(new BigDecimal("12.301")));
    }
}
