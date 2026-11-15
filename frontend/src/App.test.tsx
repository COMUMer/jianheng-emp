import { App as AntApp } from 'antd';
import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { api } from './api';
import type { Model } from './api';
import App from './App';

vi.mock('antd', async importOriginal => ({ ...(await importOriginal<typeof import('antd')>()), Watermark: () => null }));
vi.mock('./api', async importOriginal => ({ ...(await importOriginal<typeof import('./api')>()), api: vi.fn() }));

function renderApp(user: Model<'CurrentUser'>) {
    vi.mocked(api).mockImplementation(async path => (path === '/session/me' ? user : []) as never);
    render(<AntApp><App /></AntApp>);
}

test('shows my profile and hides people management from employees', async () => {
    renderApp({ id: 2, username: 'xianghongrui', employeeId: 1, mis: 'xianghongrui', roles: ['EMPLOYEE'] });

    expect(await screen.findByRole('button', { name: '我的档案' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '人员管理' })).toBeNull();
});

test('shows people management to HR', async () => {
    renderApp({ id: 3, username: 'hr', employeeId: 9, mis: 'hr', roles: ['HR'] });

    expect(await screen.findByRole('button', { name: '人员管理' })).toBeTruthy();
});

test('hides my profile from accounts without an employee record', async () => {
    renderApp({ id: 1, username: '1', roles: ['ADMIN'] });

    expect(await screen.findByRole('button', { name: '人员管理' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '我的档案' })).toBeNull();
});
