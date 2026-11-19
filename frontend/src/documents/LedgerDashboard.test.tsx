import { render, screen } from '@testing-library/react';
import dayjs from 'dayjs';
import { expect, test, vi } from 'vitest';
import type { Model } from '../api';
import { LedgerDashboard } from './LedgerDashboard';

vi.mock('../charts/EChart', () => ({ EChart: () => null }));

type Summary = Model<'Summary'>;

const now = dayjs();
const rows: Summary[] = [
    { id: 1, title: '付款完成', status: 'PAID', amount: 100, departmentName: '财务部',
        submittedAt: now.toISOString(), updatedAt: now.toISOString() },
    { id: 2, title: '审批中', status: 'IN_REVIEW', amount: 25, departmentName: '研发部',
        submittedAt: now.toISOString(), updatedAt: now.toISOString() },
    { id: 3, title: '被退回', status: 'RETURNED', amount: 50, departmentName: '研发部',
        submittedAt: now.toISOString(), updatedAt: now.toISOString() },
];

test('breaks the current rows down by status and by department', () => {
    render(<LedgerDashboard rows={rows} />);

    expect(screen.getByRole('heading', { name: '费用总览' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '申请分布' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '按状态' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '按部门' })).toBeTruthy();
    expect(screen.getByText('已付款')).toBeTruthy();
    expect(screen.getByText('审批中')).toBeTruthy();
    expect(screen.getByText('已驳回')).toBeTruthy();
    expect(screen.getByText('研发部')).toBeTruthy();
    expect(screen.getByText('财务部')).toBeTruthy();
});
