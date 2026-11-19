package com.jianheng.emp.approval;

import com.jianheng.emp.approval.WorkflowData.Assignment;
import com.jianheng.emp.approval.WorkflowData.FileCategory;
import com.jianheng.emp.security.Role;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.Collection;
import java.util.Objects;

public final class WorkflowRules {
    private WorkflowRules() {}

    public static boolean includesNode(BigDecimal amount, BigDecimal minimum) {
        return minimum == null || amount != null && amount.compareTo(minimum) >= 0;
    }

    public static boolean canApprove(Assignment assignment, LocalDate departedOn, Collection<Role> roles) {
        return departedOn == null && (assignment != Assignment.FINANCE || roles.contains(Role.FINANCE));
    }

    /** 或签：主审批人与替代审批人都可用时两人并列，任一处理即可；只有一方可用时另一人为空。 */
    public static Long[] approverPair(boolean primaryEligible, boolean alternateEligible, Long primary, Long alternate) {
        if (!primaryEligible && !alternateEligible) return null;
        Long assignee = primaryEligible ? primary : alternate;
        Long peer = primaryEligible && alternateEligible && !Objects.equals(primary, alternate) ? alternate : null;
        return new Long[]{assignee, peer};
    }

    public static BigDecimal money(BigDecimal amount) {
        if (amount == null || amount.signum() <= 0 || amount.stripTrailingZeros().scale() > 2
                || amount.compareTo(new BigDecimal("10000000000000")) >= 0) {
            throw new IllegalArgumentException("金额必须大于零，且最多保留两位小数");
        }
        return amount.setScale(2, RoundingMode.UNNECESSARY);
    }

    public static void requireExpenseAttachments(Collection<FileCategory> categories) {
        if (categories.stream().anyMatch(Objects::isNull)) throw new IllegalArgumentException("请为每个附件选择类型");
        if (!categories.contains(FileCategory.INVOICE)) throw new IllegalArgumentException("请上传发票");
        if (!categories.contains(FileCategory.PAYMENT)) throw new IllegalArgumentException("请上传付款记录");
    }

    public static void requirePurchaseAttachment(Collection<FileCategory> categories) {
        if (categories.isEmpty()) throw new IllegalArgumentException("请上传采购附件");
    }
}
