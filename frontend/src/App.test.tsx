import { App as AntApp } from 'antd';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { api } from './api';
import type { Model } from './api';
import App from './App';

vi.mock('antd', async importOriginal => ({ ...(await importOriginal<typeof import('antd')>()), Watermark: () => null }));
vi.mock('./api', async importOriginal => ({ ...(await importOriginal<typeof import('./api')>()), api: vi.fn() }));

const nativeMatchMedia = window.matchMedia;

function setCompact(compact: boolean) {
    window.matchMedia = ((query: string) => ({
        matches: compact && query === '(max-width: 780px)',
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
}

afterEach(() => { window.matchMedia = nativeMatchMedia; });

function renderApp(user: Model<'CurrentUser'>) {
    vi.mocked(api).mockImplementation(async path => (path === '/session/me' ? user : []) as never);
    render(<AntApp><App /></AntApp>);
}

test('shows my profile and hides people management from employees', async () => {
    renderApp({ id: 2, username: 'xianghongrui', employeeId: 1, mis: 'xianghongrui', roles: ['EMPLOYEE'] });

    expect(await screen.findByRole('button', { name: '我的档案' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '人事管理 HRM' })).toBeNull();
    expect(screen.queryByRole('button', { name: '人员管理' })).toBeNull();
});

test('shows people management to HR', async () => {
    renderApp({ id: 3, username: 'hr', employeeId: 9, mis: 'hr', roles: ['HR'] });

    fireEvent.click(await screen.findByRole('button', { name: '人事管理 HRM' }));
    expect(await screen.findByRole('button', { name: '人员管理' })).toBeTruthy();
});

test('opens people management from the HRM group', async () => {
    renderApp({ id: 3, username: 'hr', employeeId: 9, mis: 'hr', roles: ['HR'] });

    fireEvent.click(await screen.findByRole('button', { name: '人事管理 HRM' }));
    fireEvent.click(await screen.findByRole('button', { name: '人员管理' }));

    expect(await screen.findByRole('heading', { name: '人员管理' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '人员管理' }).getAttribute('aria-current')).toBe('page');
});

test('hides my profile from accounts without an employee record', async () => {
    renderApp({ id: 1, username: '1', roles: ['ADMIN'] });

    fireEvent.click(await screen.findByRole('button', { name: '人事管理 HRM' }));
    expect(await screen.findByRole('button', { name: '人员管理' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '我的档案' })).toBeNull();
});

test('navigates through the drawer on narrow screens', async () => {
    setCompact(true);
    renderApp({ id: 3, username: 'hr', employeeId: 9, mis: 'hr', roles: ['HR'] });

    fireEvent.click(await screen.findByRole('button', { name: '打开导航' }));
    fireEvent.click(await screen.findByRole('button', { name: '人事管理 HRM' }));
    fireEvent.click(await screen.findByRole('button', { name: '人员管理' }));

    expect(await screen.findByRole('heading', { name: '人员管理' })).toBeTruthy();
});

test('opens the account menu and logs out', async () => {
    renderApp({ id: 2, username: 'xianghongrui', employeeId: 1, mis: 'xianghongrui', name: '向鸿锐', roles: ['EMPLOYEE'] });

    const trigger = await screen.findByRole('button', { name: '账号菜单：向鸿锐' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(trigger);
    const menu = await screen.findByRole('menu');
    await waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('true'));
    expect(within(menu).getByRole('menuitem', { name: '我的档案' })).toBeTruthy();

    fireEvent.click(within(menu).getByRole('menuitem', { name: '退出登录' }));
    await waitFor(() => expect(vi.mocked(api)).toHaveBeenCalledWith('/session/logout', { method: 'POST' }));
    expect(await screen.findByRole('heading', { name: '登录工作台' })).toBeTruthy();
});
