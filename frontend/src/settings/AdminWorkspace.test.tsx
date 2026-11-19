import { App } from 'antd';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { api } from '../api';
import { AdminWorkspace } from './AdminWorkspace';

vi.mock('../api', async importOriginal => ({ ...await importOriginal<typeof import('../api')>(), api: vi.fn() }));

const audit = [
    { id: 1, occurredAt: '2026-11-18T10:00:00', actor: '吕沁函', operation: 'APPROVAL_TRANSFER', objectId: 6, detail: '转派给樊洳西' },
    { id: 2, occurredAt: '2026-11-10T10:00:00', actor: '管理员', operation: 'PAYMENT_RECORD', objectId: 1, detail: '登记付款' },
];

test('narrows the audit log by keyword', async () => {
    vi.mocked(api).mockImplementation(async path => {
        if (path === '/audit') return audit as never;
        if (path === '/expenses/categories') return [] as never;
        if (path.startsWith('/approval/')) return [] as never;
        throw new Error('Unexpected request: ' + path);
    });
    const user = userEvent.setup();

    render(<App><AdminWorkspace user={{ id: 1, username: '1', roles: ['ADMIN'] }} /></App>);
    await user.click(await screen.findByRole('tab', { name: '操作审计' }));
    expect(await screen.findByText('转派给樊洳西')).toBeTruthy();
    expect(screen.getByText('登记付款')).toBeTruthy();

    await user.type(screen.getByRole('searchbox', { name: '搜索操作审计' }), '转派');

    expect(screen.getByText('转派给樊洳西')).toBeTruthy();
    expect(screen.queryByText('登记付款')).toBeNull();
});

test('narrows the category list by keyword', async () => {
    const categories = [
        { id: 1, name: '差旅费', active: true, createdAt: '2026-11-15T23:07:00' },
        { id: 2, name: '旧类别', active: false, createdAt: '2026-11-15T23:07:00' },
    ];
    vi.mocked(api).mockImplementation(async path => {
        if (path === '/expenses/categories') return categories as never;
        if (path === '/approval/templates/LEAVE') return { nodes: [] } as never;
        if (path === '/approval/assignees') return [] as never;
        throw new Error('Unexpected request: ' + path);
    });
    const user = userEvent.setup();

    render(<App><AdminWorkspace user={{ id: 1, username: '1', roles: ['ADMIN'] }} /></App>);
    await user.click(await screen.findByRole('tab', { name: '费用类别' }));
    expect(await screen.findByText('差旅费')).toBeTruthy();
    expect(screen.getByText('旧类别')).toBeTruthy();

    await user.type(screen.getByRole('searchbox', { name: '搜索费用类别' }), '差旅');

    expect(screen.getByText('差旅费')).toBeTruthy();
    expect(screen.queryByText('旧类别')).toBeNull();
});
