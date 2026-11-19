import { App } from 'antd';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import { api } from '../api';
import { NotificationBell } from './NotificationBell';

vi.mock('../api', async importOriginal => ({ ...await importOriginal<typeof import('../api')>(), api: vi.fn() }));

const notices = Array.from({ length: 6 }, (_, index) => ({
    id: index + 1, documentId: 20 + index, message: `消息 ${index + 1}`, createdAt: '2026-11-18T09:00:00',
}));

test('previews the latest five messages and opens one from the bell', async () => {
    vi.mocked(api).mockImplementation(async path => {
        if (path === '/notifications') return notices as never;
        throw new Error('Unexpected request: ' + path);
    });
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<App><MemoryRouter><NotificationBell unread={2} liveTick={0} onOpen={onOpen} onOpenAll={vi.fn()} /></MemoryRouter></App>);

    await user.click(await screen.findByRole('button', { name: '消息通知，2 条未读' }));
    expect(await screen.findByText('消息 1')).toBeTruthy();
    expect(screen.getByText('消息 5')).toBeTruthy();
    expect(screen.queryByText('消息 6')).toBeNull();

    await user.click(screen.getByText('消息 1'));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 1, documentId: 20 }));
});

test('opens the full message list from the bell', async () => {
    vi.mocked(api).mockImplementation(async path => {
        if (path === '/notifications') return notices as never;
        throw new Error('Unexpected request: ' + path);
    });
    const onOpenAll = vi.fn();
    const user = userEvent.setup();
    render(<App><MemoryRouter><NotificationBell unread={0} liveTick={0} onOpen={vi.fn()} onOpenAll={onOpenAll} /></MemoryRouter></App>);

    await user.click(await screen.findByRole('button', { name: '消息通知' }));
    await user.click(await screen.findByRole('button', { name: '查看全部消息' }));

    expect(onOpenAll).toHaveBeenCalled();
});