import { App as AntApp } from 'antd';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { api } from './api';
import type { Model } from './api';
import App from './App';
import { FakeEventSource } from './test/fakeEventSource';

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

afterEach(() => {
    window.matchMedia = nativeMatchMedia;
    vi.unstubAllGlobals();
});

function LocationProbe() {
    const { pathname } = useLocation();
    return <output data-testid="location">{pathname}</output>;
}

function renderApp(user: Model<'CurrentUser'>, path = '/') {
    vi.mocked(api).mockImplementation(async request => (request === '/session/me' ? user : []) as never);
    render(<MemoryRouter initialEntries={[path]}><AntApp><App /></AntApp><LocationProbe /></MemoryRouter>);
}

test('shows compact application shortcuts with descriptions', async () => {
    renderApp({ id: 2, username: 'xianghongrui', employeeId: 1, mis: 'xianghongrui', roles: ['EMPLOYEE'] });

    const leave = await screen.findByRole('button', { name: /请假申请/ });
    expect(within(leave).getByText('休假与调休')).toBeTruthy();
    expect(document.querySelectorAll('.quick-actions > button')).toHaveLength(4);
    expect(document.querySelectorAll('.quick-action-icon')).toHaveLength(4);
    expect(screen.getByText('出差行程')).toBeTruthy();
    expect(screen.getByText('采购需求')).toBeTruthy();
    expect(screen.getByText('费用与发票')).toBeTruthy();
});

test('shows my profile and hides people management from employees', async () => {
    renderApp({ id: 2, username: 'xianghongrui', employeeId: 1, mis: 'xianghongrui', roles: ['EMPLOYEE'] });

    expect(await screen.findByRole('link', { name: '我的档案' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '人事管理 HRM' })).toBeNull();
    expect(screen.queryByRole('link', { name: '人员管理' })).toBeNull();
});

test('shows people management to HR', async () => {
    renderApp({ id: 3, username: 'hr', employeeId: 9, mis: 'hr', roles: ['HR'] });

    fireEvent.click(await screen.findByRole('button', { name: '人事管理 HRM' }));
    expect(await screen.findByRole('link', { name: '人员管理' })).toBeTruthy();
});

test('opens people management from the HRM group', async () => {
    renderApp({ id: 3, username: 'hr', employeeId: 9, mis: 'hr', roles: ['HR'] });

    fireEvent.click(await screen.findByRole('button', { name: '人事管理 HRM' }));
    fireEvent.click(await screen.findByRole('link', { name: '人员管理' }));

    expect(await screen.findByRole('heading', { name: '人员管理' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '人员管理' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByTestId('location').textContent).toBe('/people');
});

test('hides my profile from accounts without an employee record', async () => {
    renderApp({ id: 1, username: '1', roles: ['ADMIN'] });

    fireEvent.click(await screen.findByRole('button', { name: '人事管理 HRM' }));
    expect(await screen.findByRole('link', { name: '人员管理' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: '我的档案' })).toBeNull();
});

test('navigates through the drawer on narrow screens', async () => {
    setCompact(true);
    renderApp({ id: 3, username: 'hr', employeeId: 9, mis: 'hr', roles: ['HR'] });

    fireEvent.click(await screen.findByRole('button', { name: '打开导航' }));
    fireEvent.click(await screen.findByRole('button', { name: '人事管理 HRM' }));
    fireEvent.click(await screen.findByRole('link', { name: '人员管理' }));

    expect(await screen.findByRole('heading', { name: '人员管理' })).toBeTruthy();
    expect(screen.getByTestId('location').textContent).toBe('/people');
});

test('opens the page from the URL', async () => {
    renderApp({ id: 1, username: '1', roles: ['ADMIN'] }, '/people');

    expect(await screen.findByRole('heading', { name: '人员管理' })).toBeTruthy();
    expect(screen.getByTestId('location').textContent).toBe('/people');
});

test('redirects an unauthorized URL to home', async () => {
    renderApp({ id: 2, username: 'xianghongrui', employeeId: 1, mis: 'xianghongrui', roles: ['EMPLOYEE'] }, '/people');

    expect(await screen.findByRole('heading', { name: '工作台' })).toBeTruthy();
    expect(screen.getByTestId('location').textContent).toBe('/');
});

test('shows the server counted unread on the notification bell and refreshes on a live signal', async () => {
    FakeEventSource.reset();
    vi.stubGlobal('EventSource', FakeEventSource);
    const user: Model<'CurrentUser'> = { id: 2, username: 'xianghongrui', employeeId: 1, mis: 'xianghongrui', roles: ['EMPLOYEE'] };
    vi.mocked(api).mockImplementation(async request => (request === '/session/me' ? user
        : request === '/notifications/unread' ? { unread: 2 } : []) as never);

    render(<MemoryRouter initialEntries={['/']}><AntApp><App /></AntApp></MemoryRouter>);

    expect(await screen.findByRole('button', { name: '消息通知，2 条未读' })).toBeTruthy();

    vi.mocked(api).mockClear();
    act(() => FakeEventSource.latest()?.emit('workflow'));

    await waitFor(() => expect(vi.mocked(api)).toHaveBeenCalledWith('/notifications/unread'));
});

test('refreshes the inbox badge when a workflow action completes', async () => {
    const user: Model<'CurrentUser'> = { id: 2, username: 'xianghongrui', employeeId: 1, mis: 'xianghongrui', roles: ['EMPLOYEE'] };
    let pending = 1;
    vi.mocked(api).mockImplementation(async request => (request === '/session/me' ? user
        : request === '/inbox/count' ? { pending } as never
        : request === '/notifications/unread' ? { unread: 0 } as never : []) as never);
    render(<MemoryRouter initialEntries={['/']}><AntApp><App /></AntApp></MemoryRouter>);

    expect(await screen.findByRole('link', { name: '我的待办，1 条待办' })).toBeTruthy();

    pending = 0;
    act(() => { window.dispatchEvent(new Event('workflow-changed')); });

    expect(await screen.findByRole('link', { name: '我的待办' })).toBeTruthy();
});

test('refreshes the inbox badge when opening my inbox', async () => {
    const user: Model<'CurrentUser'> = { id: 2, username: 'xianghongrui', employeeId: 1, mis: 'xianghongrui', roles: ['EMPLOYEE'] };
    let pending = 1;
    vi.mocked(api).mockImplementation(async request => (request === '/session/me' ? user
        : request === '/inbox/count' ? { pending } as never
        : request === '/notifications/unread' ? { unread: 0 } as never : []) as never);
    render(<MemoryRouter initialEntries={['/']}><AntApp><App /></AntApp></MemoryRouter>);

    const link = await screen.findByRole('link', { name: '我的待办，1 条待办' });
    pending = 0;
    fireEvent.click(link);

    expect(await screen.findByRole('link', { name: '我的待办' })).toBeTruthy();
});

test('opens the account menu and logs out', async () => {
    renderApp({ id: 2, username: 'xianghongrui', employeeId: 1, mis: 'xianghongrui', name: '向鸿锐',
        positionName: '董事', roles: ['EMPLOYEE'] });

    const trigger = await screen.findByRole('button', { name: '账号菜单：向鸿锐' });
    expect(screen.getByText('董事')).toBeTruthy();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(trigger);
    const menu = await screen.findByRole('menu');
    await waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('true'));
    expect(within(menu).getByRole('menuitem', { name: '我的档案' })).toBeTruthy();

    fireEvent.click(within(menu).getByRole('menuitem', { name: '退出登录' }));
    await waitFor(() => expect(vi.mocked(api)).toHaveBeenCalledWith('/session/logout', { method: 'POST' }));
    expect(await screen.findByRole('heading', { name: '登录工作台' })).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/'));
});
test('keeps the admin label instead of showing a position', async () => {
    renderApp({ id: 1, username: 'admin', name: '管理员账号', positionName: '董事', roles: ['ADMIN'] });

    await screen.findByRole('button', { name: '账号菜单：管理员账号' });
    expect(screen.getByText('系统管理员')).toBeTruthy();
    expect(screen.queryByText('董事')).toBeNull();
});
