import { App } from 'antd';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { api } from '../api';
import type { Model } from '../api';
import { PeopleWorkspace } from './PeopleWorkspace';

vi.mock('../api', async importOriginal => ({ ...await importOriginal<typeof import('../api')>(), api: vi.fn() }));

const employees: Model<'Employee'>[] = Array.from({ length: 12 }, (_, index) => ({
    id: index + 1,
    name: `验证员工${String(index + 1).padStart(2, '0')}`,
    mis: `employee${index + 1}`,
    departmentId: 1,
    departmentName: '财务部',
    positionId: 1,
    positionName: '会计',
    joinedOn: '2026-01-01',
}));

function renderWorkspace(roles: Model<'CurrentUser'>['roles'], employee = employees[10]) {
    const responses: Record<string, unknown> = {
        '/people/employees': [...employees.map(row => row.id === employee.id ? employee : row),
            { id: 13, name: '验证员工13', mis: 'employee13', departmentId: 2 }],
        '/people/departments': [{ id: 1, name: '财务部' }, { id: 2, name: '研发部', parentId: 1 }, { id: 3, name: '人事部' }],
        '/people/positions': [{ id: 1, name: '会计' }, { id: 2, name: '工程师' }],
        [`/people/employees/${employee.id}`]: { employee, history: [] } satisfies Model<'EmployeeDetail'>,
    };
    vi.mocked(api).mockImplementation(async path => {
        if (!(path in responses)) throw new Error(`Unexpected request: ${path}`);
        return responses[path] as never;
    });
    render(<App><PeopleWorkspace user={{ roles }} /></App>);
    return userEvent.setup();
}

test('opens the employee profile in the workspace and restores the filtered table page', async () => {
    const user = renderWorkspace(['ADMIN']);
    const search = screen.getByRole('searchbox', { name: '搜索姓名、mis 或联系电话' });
    await user.type(search, '验证员工');
    await screen.findByRole('button', { name: '验证员工01' });
    await user.click(screen.getByRole('combobox', { name: '筛选部门' }));
    await user.click(screen.getByTitle('财务部'));
    await user.click(within(screen.getByTitle('2')).getByRole('button'));
    await user.click(await screen.findByRole('button', { name: '验证员工11' }));

    expect(await screen.findByRole('heading', { level: 1, name: '验证员工11' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('heading', { name: '登录账号' })).toBeTruthy();
    expect((screen.getByRole('button', { name: '保存档案' }) as HTMLButtonElement).form).not.toBeNull();

    await user.click(screen.getByRole('button', { name: '返回员工列表' }));

    expect((screen.getByRole('searchbox', { name: '搜索姓名、mis 或联系电话' }) as HTMLInputElement).value).toBe('验证员工');
    expect(await screen.findByRole('button', { name: '验证员工11' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '验证员工01' })).toBeNull();
    expect(screen.queryByRole('button', { name: '验证员工13' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '验证员工11' }));
});

test('searches departments and positions by name', async () => {
    const user = renderWorkspace(['ADMIN']);
    await user.click(await screen.findByRole('tab', { name: '岗位' }));
    await user.type(await screen.findByRole('searchbox', { name: '搜索岗位名称' }), '工程');
    expect(await screen.findByText('工程师')).toBeTruthy();
    expect(screen.queryByText('会计')).toBeNull();

    await user.click(screen.getByRole('tab', { name: '部门' }));
    await user.type(await screen.findByRole('searchbox', { name: '搜索部门名称' }), '研发');
    expect(await screen.findByText('研发部')).toBeTruthy();
    expect(screen.getAllByText('财务部').length).toBeGreaterThan(0);
    expect(screen.queryByText('人事部')).toBeNull();
});

test('shows a read-only profile with masked identity data for a departed employee', async () => {
    const employee = { ...employees[0], departedOn: '2026-02-01', idCard: '11010519491231002X' };
    const user = renderWorkspace(['HR'], employee);
    await user.click(await screen.findByRole('button', { name: '验证员工01' }));

    expect(await screen.findByRole('heading', { level: 1, name: '验证员工01' })).toBeTruthy();
    expect(screen.getByText('已离职')).toBeTruthy();
    expect(screen.getByText('110105********002X')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '保存档案' })).toBeNull();
    expect(screen.queryByRole('button', { name: '登记离职' })).toBeNull();
    expect(screen.queryByRole('heading', { name: '登录账号' })).toBeNull();
});
