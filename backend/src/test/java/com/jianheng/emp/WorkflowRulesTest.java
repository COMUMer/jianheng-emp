package com.jianheng.emp;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.jianheng.emp.approval.WorkflowRules;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class WorkflowRulesTest {
    @Test
    void includesConditionalNodeAtTheThreshold() {
        assertFalse(WorkflowRules.includesNode(new BigDecimal("999.99"), new BigDecimal("1000.00")));
        assertTrue(WorkflowRules.includesNode(new BigDecimal("1000.00"), new BigDecimal("1000.00")));
        assertTrue(WorkflowRules.includesNode(null, null));
    }

    @Test
    void normalizesInvoiceNumbersAndRejectsExtraMoneyPrecision() {
        assertEquals("ABC1234", WorkflowRules.invoiceKey(" abC 1234 "));
        assertEquals(new BigDecimal("12.30"), WorkflowRules.money(new BigDecimal("12.3")));
        assertThrows(IllegalArgumentException.class, () -> WorkflowRules.money(new BigDecimal("12.301")));
    }
}
