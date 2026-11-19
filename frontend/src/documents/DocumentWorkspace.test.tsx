import { App } from 'antd';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { api } from '../api';
import type { Model } from '../api';
import { DocumentWorkspace } from './DocumentWorkspace';

vi.mock('../api', async importOriginal => ({ ...await importOriginal<typeof import('../api')>(), api: vi.fn() }));
vi.mock('../charts/EChart', () => ({ EChart: () => null }));

const rows: Model<'Summary'>[] = [
    { id: 6, kind: 'EXPENSE', status: 'AWAITING_PAYMENT', title: '待付报销', applicant: '向鸿锐', departmentName: 'ERP研发业务部',
        amount: 1356, submittedAt: '2026-11-18T18:57:00' },
    { id: 1, kind: 'EXPENSE', status: 'PAID', title: '已付报销', applicant: '向鸿锐', amount: 111,
        submittedAt: '2026-11-15T02:26:00', paidOn: '2026-11-18' },
    { id: 2, kind: 'EXPENSE', status: 'IN_REVIEW', title: '在审报销', applicant: '苏兴隆', amount: 12.3, submittedAt: '2026-11-16T23:39:00' },
    { id: 3, kind: 'EXPENSE', status: 'RETURNED', title: '被驳报销', applicant: '苏兴隆', amount: 50, submittedAt: '2026-11-17T00:05:00' },
];

test('summarises the ledger rows above the table', async () => {
    vi.mocked(api).mockImplementation(async path => {
        if (path === '/people/departments') return [] as never;
        if (path.startsWith('/expenses/ledger')) return rows as never;
        throw new Error('Unexpected request: ' + path);
    });

    render(<App><DocumentWorkspace section="ledger" navigate={vi.fn()} liveTick={0}
        user={{ id: 5, username: 'lvqinhan', roles: ['FINANCE', 'PAYER'] }} /></App>);

    const stats = await screen.findByLabelText('台账汇总');
    expect(within(stats).getByText('4 笔')).toBeTruthy();
    expect(within(stats).getByText('¥1,529.30')).toBeTruthy();
    expect(within(stats).getByText('¥1,356.00')).toBeTruthy();
    expect(within(stats).getByText('¥111.00')).toBeTruthy();
    expect(within(stats).getByText('¥50.00')).toBeTruthy();
    expect(within(stats).getByText('审批中 1 笔')).toBeTruthy();
    expect(within(stats).getByText('1 笔待登记')).toBeTruthy();
    expect(within(stats).getByText('1 笔已驳回')).toBeTruthy();
});
const inboxRows: Model<'Summary'>[] = [
    { id: 11, kind: 'EXPENSE', status: 'AWAITING_PAYMENT', title: '待登记付款的单', applicant: '向鸿锐', departmentName: 'ERP研发业务部' },
    { id: 12, kind: 'EXPENSE', status: 'IN_REVIEW', title: '已超期的单', applicant: '向鸿锐', dueAt: '2026-11-17T23:39:00' },
    { id: 13, kind: 'LEAVE', status: 'IN_REVIEW', title: '尚未到期的单', applicant: '苏兴隆', dueAt: '2099-01-01T00:00:00' },
];

test('filters the inbox by keyword and by overdue state', async () => {
    vi.mocked(api).mockImplementation(async path => {
        if (path === '/inbox/handled') return [] as never;
        if (path.startsWith('/inbox')) return inboxRows as never;
        throw new Error('Unexpected request: ' + path);
    });

    render(<App><DocumentWorkspace section="inbox" navigate={vi.fn()} liveTick={0}
        user={{ id: 5, username: 'lvqinhan', roles: ['EMPLOYEE'] }} /></App>);

    await screen.findByText('待登记付款的单');
    expect(screen.getByText('已超期的单')).toBeTruthy();
    expect(screen.getByText('尚未到期的单')).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole('switch', { name: '只看超期' }));
    expect(screen.queryByText('待登记付款的单')).toBeNull();
    expect(screen.getByText('已超期的单')).toBeTruthy();
    expect(screen.queryByText('尚未到期的单')).toBeNull();

    await user.click(screen.getByRole('switch', { name: '只看超期' }));
    await user.type(screen.getByRole('searchbox', { name: '搜索我的待办' }), '苏兴隆');
    expect(screen.queryByText('已超期的单')).toBeNull();
    expect(screen.getByText('尚未到期的单')).toBeTruthy();
});

test('lists pending items before processed history without a scope filter', async () => {
    const handledRows: Model<'Handled'>[] = [
        { id: 101, documentId: 12, documentNo: 'BX2026110001', kind: 'EXPENSE', status: 'PAID',
            title: '已处理单', applicant: '苏兴隆', applicantAvatarKey: 'avatar.jpg', action: 'APPROVE',
            comment: '同意', handledAt: '2026-11-19T10:00:00', createdAt: '2026-11-18T09:00:00',
            updatedAt: '2026-11-19T10:00:00', operator: '向鸿锐' },
    ];
    vi.mocked(api).mockImplementation(async path => {
        if (path === '/inbox/handled') return handledRows as never;
        if (path.startsWith('/inbox')) return inboxRows as never;
        throw new Error('Unexpected request: ' + path);
    });

    render(<App><DocumentWorkspace section="inbox" navigate={vi.fn()} liveTick={0}
        user={{ id: 5, username: 'lvqinhan', roles: ['EMPLOYEE'] }} /></App>);

    const pending = await screen.findByText('待登记付款的单');
    const handled = screen.getByText('已处理单');
    expect(screen.queryByRole('combobox', { name: '待办范围' })).toBeNull();
    expect(screen.getByText('通过')).toBeTruthy();
    expect(pending.compareDocumentPosition(handled) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

const homeNotices: Model<'Notice'>[] = [
    { id: 1, documentId: 21, message: '未读一', createdAt: '2026-11-18T09:00:00' },
    { id: 2, documentId: 22, message: '未读二', createdAt: '2026-11-18T08:00:00' },
    { id: 3, documentId: 23, message: '未读三', createdAt: '2026-11-18T07:00:00' },
    { id: 4, documentId: 24, message: '未读四', createdAt: '2026-11-18T06:00:00' },
    { id: 5, documentId: 25, message: '未读五', createdAt: '2026-11-18T05:30:00' },
    { id: 6, documentId: 26, message: '未读六', createdAt: '2026-11-18T05:15:00' },
    { id: 7, documentId: 27, message: '已读的', readAt: '2026-11-18T09:30:00', createdAt: '2026-11-18T05:00:00' },
];

test('shows only the newest unread messages on the workbench and links to the message page', async () => {
    vi.mocked(api).mockImplementation(async path => {
        if (path === '/documents') return [] as never;
        if (path.startsWith('/inbox')) return [] as never;
        if (path === '/notifications') return homeNotices as never;
        throw new Error('Unexpected request: ' + path);
    });
    const navigate = vi.fn();

    render(<App><DocumentWorkspace section="home" navigate={navigate} liveTick={0}
        user={{ id: 5, username: 'lvqinhan', roles: ['EMPLOYEE'] }} /></App>);

    expect(await screen.findByText('未读一')).toBeTruthy();
    expect(screen.getByText('未读二')).toBeTruthy();
    expect(screen.getByText('未读三')).toBeTruthy();
    expect(screen.getByText('未读四')).toBeTruthy();
    expect(screen.getByText('未读五')).toBeTruthy();
    expect(screen.queryByText('未读六')).toBeNull();
    expect(screen.queryByText('已读的')).toBeNull();

    await userEvent.setup().click(screen.getByRole('button', { name: '查看全部' }));
    expect(navigate).toHaveBeenCalledWith('messages');
});