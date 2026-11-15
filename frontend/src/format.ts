import type { Model } from './api';

export type Kind = Model<'Draft'>['kind'];
export type DocumentStatus = NonNullable<Model<'Summary'>['status']>;
export type Role = NonNullable<Model<'CurrentUser'>['roles']>[number];
export const kindLabel: Record<Kind, string> = { LEAVE: '请假', TRIP: '出差', PURCHASE: '采购', EXPENSE: '报销' };
export const kinds = Object.entries(kindLabel).map(([value, label]) => ({ value: value as Kind, label }));
export const statusLabel: Record<DocumentStatus, string> = {
    DRAFT: '草稿', IN_REVIEW: '审批中', RETURNED: '已退回', APPROVED: '已通过', AWAITING_PAYMENT: '待付款', PAID: '已付款',
};
export const statusColor: Record<DocumentStatus, string> = {
    DRAFT: 'default', IN_REVIEW: 'processing', RETURNED: 'error', APPROVED: 'success', AWAITING_PAYMENT: 'warning', PAID: 'success',
};
export const roleLabel: Record<Role, string> = {
    ADMIN: '系统管理员', HR: '人事', EMPLOYEE: '员工', APPROVER: '审批人', FINANCE: '财务审核', PAYER: '付款登记',
};
export const operationLabel: Record<string, string> = {
    EMPLOYEE_CREATE: '入职建档', EMPLOYEE_UPDATE: '更新档案', EMPLOYEE_DEPART: '登记离职',
    ACCOUNT_UPDATE: '账号变更', ACCOUNT_DISABLE: '账号停用', APPROVAL_PUBLISH: '发布审批规则',
    APPROVAL_TRANSFER: '转派审批', PAYMENT_RECORD: '登记付款', EXPENSE_EXPORT: '导出台账',
};

export function formatMoney(value?: number | null) {
    return value == null ? '—' : new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(value);
}

export function formatDate(value?: string | null) { return value ? value.replace('T', ' ').slice(0, 16) : '—'; }
