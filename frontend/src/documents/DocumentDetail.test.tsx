import { App } from 'antd';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { api, ApiError } from '../api';
import type { Model } from '../api';
import { DocumentDetail } from './DocumentDetail';

vi.mock('../api', async importOriginal => ({
    ...(await importOriginal<typeof import('../api')>()),
    api: vi.fn(),
}));

const payer: Model<'CurrentUser'> = { id: 5, username: 'payer', employeeId: 11, mis: 'payer', roles: ['PAYER'] };
const detail = {
    summary: { id: 1, kind: 'EXPENSE', title: '11111', applicant: '向鸿锐', status: 'AWAITING_PAYMENT', amount: 111 },
    ownerId: 2,
    payeeAccount: { name: '向鸿锐', bankName: '招商银行深圳分行', bankCard: '6222020200112233445', cnapsCode: '308584000013' },
    revisions: [{
        revision: { id: 1, reason: '111111', submittedAt: '2026-11-15T02:26:25' },
        tasks: [], files: [], lines: [], events: [],
    }],
} as Model<'Detail'>;

test('places the payment action at the end of the latest round', async () => {
    vi.mocked(api).mockResolvedValue(detail as never);
    const user = userEvent.setup();

    render(<App><DocumentDetail id={1} user={payer} close={vi.fn()} edit={vi.fn()} refresh={vi.fn()} /></App>);

    const button = await screen.findByRole('button', { name: '登记付款' });
    expect(button.closest('.detail-round-actions')).toBeTruthy();

    await user.click(button);

    expect(await screen.findByText('付款附件')).toBeTruthy();
    expect(screen.getByText('付款附件').closest('.ant-form-item')?.querySelector('.ant-form-item-required')).toBeTruthy();
    expect(screen.getByText('作为付款凭证')).toBeTruthy();
    expect(screen.getByText('招商银行深圳分行')).toBeTruthy();
    expect(screen.getByText('6222 0202 0011 2233 445')).toBeTruthy();
    expect(screen.getByText('308584000013')).toBeTruthy();
    expect(document.querySelector('.ant-modal input[type="file"]')).toBeTruthy();
});

test('requires an approval comment before approving', async () => {
    const approver: Model<'CurrentUser'> = { id: 7, username: 'approver', roles: ['EMPLOYEE'] };
    const pending = {
        ...detail,
        summary: { ...detail.summary, status: 'IN_REVIEW' },
        revisions: [{
            revision: { id: 1, reason: '报销', submittedAt: '2026-11-15T02:26:25' },
            tasks: [{ id: 2, revisionId: 1, ordinal: 1, label: '财务审批', status: 'ACTIVE', assigneeId: 7, assignment: 'FINANCE' }],
            files: [], lines: [], events: [],
        }],
    } as Model<'Detail'>;
    vi.mocked(api).mockResolvedValue(pending as never);
    const user = userEvent.setup();

    render(<App><DocumentDetail id={1} user={approver} close={vi.fn()} edit={vi.fn()} refresh={vi.fn()} /></App>);

    await user.click(await screen.findByRole('button', { name: /通\s*过/ }));
    const modal = document.querySelector('.ant-modal') as HTMLElement;
    await user.click(within(modal).getByRole('button', { name: '通过审批' }));

    expect(await screen.findByText('请填写审批意见')).toBeTruthy();
    expect(vi.mocked(api).mock.calls.filter(([path]) => path === '/documents/1/tasks/2')).toHaveLength(0);
});

test('claims the document before opening the payment dialog', async () => {
    const payerUser: Model<'CurrentUser'> = { id: 5, username: 'payer', employeeId: 11, mis: 'payer', roles: ['PAYER'] };
    vi.mocked(api).mockImplementation(async path => (path === '/documents/1' ? detail : []) as never);
    const user = userEvent.setup();

    render(<App><DocumentDetail id={1} user={payerUser} close={vi.fn()} edit={vi.fn()} refresh={vi.fn()} /></App>);
    await user.click(await screen.findByRole('button', { name: '登记付款' }));

    expect(await screen.findByText('付款附件')).toBeTruthy();
    expect(vi.mocked(api).mock.calls.some(([path]) => path === '/documents/1/payment/claim')).toBe(true);
});

const paidDetail = {
    ...detail,
    summary: { ...detail.summary, status: 'PAID' },
    payment: { paidOn: '2026-11-20', paidBy: 5, payer: '吕沁函' },
    paymentFiles: [{ id: 11, originalName: '错误回单.png', category: 'PAYMENT' }],
} as Model<'Detail'>;

test('lets the original payer correct the payment date and attachments', async () => {
    vi.mocked(api).mockImplementation(async path => (path === '/documents/1' ? paidDetail : []) as never);
    const user = userEvent.setup();

    render(<App><DocumentDetail id={1} user={payer} close={vi.fn()} edit={vi.fn()} refresh={vi.fn()} /></App>);
    await user.click(await screen.findByRole('button', { name: '更正付款登记' }));
    await waitFor(() => expect(document.querySelector('.ant-modal')).toBeTruthy());

    const modal = document.querySelector('.ant-modal') as HTMLElement;
    expect(within(modal).getByText('错误回单.png')).toBeTruthy();
    await user.click(within(modal).getByRole('button', { name: /确\s*定/ }));

    const call = vi.mocked(api).mock.calls.find(([path, options]) => path === '/documents/1/payment'
        && options?.method === 'PUT');
    expect(call?.[1]?.body).toEqual({ paidOn: '2026-11-20', fileIds: [11] });
});

test('only the original payer may correct the payment', async () => {
    const otherPayer: Model<'CurrentUser'> = { id: 7, username: 'other', employeeId: 12, roles: ['PAYER'] };
    vi.mocked(api).mockImplementation(async path => (path === '/documents/1' ? paidDetail : []) as never);

    render(<App><DocumentDetail id={1} user={otherPayer} close={vi.fn()} edit={vi.fn()} refresh={vi.fn()} /></App>);

    expect(await screen.findByText('错误回单.png')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '更正付款登记' })).toBeNull();
});

test('lets finance ask the payer to fix the payment registration', async () => {
    const finance: Model<'CurrentUser'> = { id: 9, username: 'finance', employeeId: 12, roles: ['FINANCE'] };
    vi.mocked(api).mockImplementation(async path => (path === '/documents/1' ? paidDetail : []) as never);
    const user = userEvent.setup();

    render(<App><DocumentDetail id={1} user={finance} close={vi.fn()} edit={vi.fn()} refresh={vi.fn()} /></App>);
    await user.click(await screen.findByRole('button', { name: '要求更正' }));
    await waitFor(() => expect(document.querySelector('.ant-modal')).toBeTruthy());

    const modal = document.querySelector('.ant-modal') as HTMLElement;
    await user.type(within(modal).getByRole('textbox'), '回单传错了，请重传');
    await user.click(within(modal).getByRole('button', { name: /确\s*定/ }));

    expect(vi.mocked(api).mock.calls.some(([path, options]) => path === '/documents/1/payment/fix-request'
        && (options?.body as { reason?: string })?.reason === '回单传错了，请重传')).toBe(true);
});

test('hides the payment correction entries from other roles', async () => {
    const employee: Model<'CurrentUser'> = { id: 6, username: 'zhangsan', employeeId: 14, roles: ['EMPLOYEE'] };
    vi.mocked(api).mockImplementation(async path => (path === '/documents/1' ? paidDetail : []) as never);

    render(<App><DocumentDetail id={1} user={employee} close={vi.fn()} edit={vi.fn()} refresh={vi.fn()} /></App>);

    expect(await screen.findByText('错误回单.png')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '更正付款登记' })).toBeNull();
    expect(screen.queryByRole('button', { name: '要求更正' })).toBeNull();
});

test('refuses to open the payment dialog when another payer holds the claim', async () => {
    const payerUser: Model<'CurrentUser'> = { id: 5, username: 'payer', employeeId: 11, mis: 'payer', roles: ['PAYER'] };
    vi.mocked(api).mockImplementation(async path => {
        if (path === '/documents/1') return detail as never;
        if (path === '/documents/1/payment/claim') throw new ApiError(409, '该单据正由 吕沁函 登记付款');
        return [] as never;
    });
    const user = userEvent.setup();

    render(<App><DocumentDetail id={1} user={payerUser} close={vi.fn()} edit={vi.fn()} refresh={vi.fn()} /></App>);
    await user.click(await screen.findByRole('button', { name: '登记付款' }));

    expect(await screen.findByText('该单据正由 吕沁函 登记付款')).toBeTruthy();
    expect(screen.queryByText('付款附件')).toBeNull();
});