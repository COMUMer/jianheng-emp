import { App } from 'antd';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { api } from '../api';
import type { Model } from '../api';
import { MessagesPage } from './MessagesPage';

vi.mock('../api', async importOriginal => ({ ...await importOriginal<typeof import('../api')>(), api: vi.fn() }));
const viewer = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('../documents/useDocumentViewer', () => ({
    useDocumentViewer: () => ({ open: viewer.open, create: vi.fn(), viewer: null }),
}));

const notices: Model<'Notice'>[] = [
    { id: 1, documentId: 11, message: '待你登记付款', createdAt: '2026-11-18T09:00:00', actor: '吕沁函', actorAvatarKey: 'avatar-a.jpg' },
    { id: 2, documentId: 12, message: '申请已通过', readAt: '2026-11-18T09:01:00', createdAt: '2026-11-18T08:00:00' },
];
const employee: Model<'CurrentUser'> = { id: 2, username: 'lvqinhan', roles: ['EMPLOYEE'] };

function LocationProbe() {
    const { search } = useLocation();
    return <output data-testid="search">{search}</output>;
}

function renderPage({ path = '/messages', unread = 1 } = {}) {
    const onRead = vi.fn();
    const view = render(<MemoryRouter initialEntries={[path]}><App><MessagesPage user={employee} unread={unread} onRead={onRead} liveTick={0} />
        <LocationProbe /></App></MemoryRouter>);
    return { onRead, container: view.container };
}

beforeEach(() => {
    vi.mocked(api).mockReset();
    viewer.open.mockReset();
});

test('marks a message read before opening its document', async () => {
    vi.mocked(api).mockImplementation(async path => {
        if (path === '/notifications') return notices as never;
        if (path === '/notifications/1/read') return undefined as never;
        throw new Error('Unexpected request: ' + path);
    });
    const { onRead } = renderPage();

    await userEvent.setup().click(await screen.findByText('待你登记付款'));

    await waitFor(() => expect(api).toHaveBeenCalledWith('/notifications/1/read', { method: 'POST' }));
    expect(viewer.open).toHaveBeenCalledWith(11);
    expect(onRead).toHaveBeenCalled();
});

test('shows the actor avatar for each message', async () => {
    vi.mocked(api).mockImplementation(async path => {
        if (path === '/notifications') return notices as never;
        throw new Error('Unexpected request: ' + path);
    });
    renderPage();

    expect(await screen.findByAltText('吕沁函')).toHaveProperty('src', 'http://localhost:3000/api/people/avatars/avatar-a.jpg');
});

test('filters the list down to unread messages', async () => {
    vi.mocked(api).mockImplementation(async path => {
        if (path === '/notifications') return notices as never;
        throw new Error('Unexpected request: ' + path);
    });
    renderPage();
    const user = userEvent.setup();

    expect(await screen.findByText('申请已通过')).toBeTruthy();
    await user.click(screen.getByRole('switch', { name: '只看未读' }));

    expect(screen.getByText('待你登记付款')).toBeTruthy();
    expect(screen.queryByText('申请已通过')).toBeNull();
});

test('searches message content', async () => {
    vi.mocked(api).mockImplementation(async path => {
        if (path === '/notifications') return notices as never;
        throw new Error('Unexpected request: ' + path);
    });
    renderPage();
    const user = userEvent.setup();

    await screen.findByText('待你登记付款');
    await user.type(screen.getByRole('searchbox', { name: '搜索我的消息' }), '通过');

    expect(screen.queryByText('待你登记付款')).toBeNull();
    expect(screen.getByText('申请已通过')).toBeTruthy();
});

test('opens the message referenced by a bell deep link and clears it', async () => {
    vi.mocked(api).mockImplementation(async path => {
        if (path === '/notifications') return notices as never;
        throw new Error('Unexpected request: ' + path);
    });
    renderPage({ path: '/messages?notice=2', unread: 0 });

    await waitFor(() => expect(viewer.open).toHaveBeenCalledWith(12));
    await waitFor(() => expect(screen.getByTestId('search').textContent).toBe(''));
});

const manyNotices: Model<'Notice'>[] = Array.from({ length: 25 }, (_, index) => ({
    id: index + 1, documentId: 100 + index, message: `消息 ${index + 1}`, createdAt: '2026-11-18T09:00:00',
}));

test('paginates the list and returns to the first page when searching', async () => {
    vi.mocked(api).mockImplementation(async path => {
        if (path === '/notifications') return manyNotices as never;
        throw new Error('Unexpected request: ' + path);
    });
    const { container } = renderPage();
    const user = userEvent.setup();

    await screen.findByText('消息 1');
    expect(container.querySelectorAll('.notice-item')).toHaveLength(20);
    expect(screen.getByText('共 25 条')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Page 2' }));
    expect(container.querySelectorAll('.notice-item')).toHaveLength(5);
    expect(screen.getByText('消息 21')).toBeTruthy();

    await user.type(screen.getByRole('searchbox', { name: '搜索我的消息' }), '消息 25');
    expect(container.querySelectorAll('.notice-item')).toHaveLength(1);
    expect(screen.getByText('共 1 条')).toBeTruthy();
});