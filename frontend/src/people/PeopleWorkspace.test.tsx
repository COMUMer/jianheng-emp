import { App } from 'antd';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import { api } from '../api';
import type { Model } from '../api';
import { PeopleWorkspace } from './PeopleWorkspace';

vi.mock('../api', async importOriginal => ({ ...await importOriginal<typeof import('../api')>(), api: vi.fn() }));
vi.mock('../charts/EChart', () => ({ EChart: () => null }));

const employees: Model<'Employee'>[] = Array.from({ length: 25 }, (_, index) => ({
    id: index + 1,
    name: `验证员工${String(index + 1).padStart(2, '0')}`,
    mis: `employee${index + 1}`,
    departmentId: 1,
    departmentName: '财务部',
    positionId: 1,
    positionName: '会计',
    joinedOn: '2026-01-01',
    phone: '13800000000',
    email: 'employee@example.com',
    address: '测试地址',
    emergencyContact: '联系人',
    emergencyPhone: '13900000000',
    idCard: '11010519491231002X',
    bankCard: '6222020200112233445',
    bankName: '测试银行',
    cnapsCode: '123456789012',
}));

function renderWorkspace(roles: Model<'CurrentUser'>['roles'], employee = employees[10],
    employments: Model<'EmployeeDetail'>['employments'] = []) {
    const responses: Record<string, unknown> = {
        '/people/employees': [...employees.map(row => row.id === employee.id ? employee : row),
            { id: 26, name: '验证员工26', mis: 'employee26', departmentId: 2 }],
        '/people/departments': [{ id: 1, name: '财务部' }, { id: 2, name: '研发部', parentId: 1 }, { id: 3, name: '人事部' }],
        '/people/positions': [{ id: 1, name: '会计' }, { id: 2, name: '工程师' }],
        '/people/employment-flow': [
            { month: '2026-06', hired: 1, departed: 0 }, { month: '2026-07', hired: 0, departed: 1 },
            { month: '2026-08', hired: 2, departed: 0 }, { month: '2026-09', hired: 1, departed: 1 },
            { month: '2026-10', hired: 3, departed: 0 }, { month: '2026-11', hired: 0, departed: 0 },
        ],
        [`/people/employees/${employee.id}`]: { employee, employments, history: [] } satisfies Model<'EmployeeDetail'>,
    };
    vi.mocked(api).mockImplementation(async (path, options) => {
        if (options?.method === 'PUT' && path.startsWith('/people/employees/')) return employee as never;
        if (!(path in responses)) throw new Error(`Unexpected request: ${path}`);
        return responses[path] as never;
    });
    render(<MemoryRouter><App><PeopleWorkspace user={{ roles }} /></App></MemoryRouter>);
    return userEvent.setup();
}

test('shows the HR charts above the list', async () => {
    renderWorkspace(['HR']);

    expect(await screen.findByRole('heading', { name: '部门人员占比' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '近 6 个月人员流动' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '司龄结构' })).toBeTruthy();
    expect(screen.getByText('在职 26 人')).toBeTruthy();
});

test('opens the employee profile in the workspace and restores the filtered table page', async () => {
    const user = renderWorkspace(['ADMIN'], employees[20]);
    const search = screen.getByRole('searchbox', { name: '搜索姓名、mis 或联系电话' });
    await user.type(search, '验证员工');
    await screen.findByRole('button', { name: '验证员工01' });
    await user.click(screen.getByRole('button', { name: '筛选部门' }));
    const picker = await screen.findByRole('dialog');
    await user.click(within(picker).getByRole('button', { name: '财务部' }));
    await user.click(within(picker).getByRole('button', { name: /确\s*定/ }));
    await user.click(within(screen.getByTitle('2')).getByRole('button'));
    await user.click(await screen.findByRole('button', { name: '验证员工21' }));

    expect(await screen.findByRole('heading', { level: 1, name: '验证员工21' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('heading', { name: '账号与权限' })).toBeTruthy();
    expect((screen.getByRole('button', { name: '保存档案' }) as HTMLButtonElement).form).not.toBeNull();
    const accountCard = screen.getByRole('heading', { name: '账号与权限' }).closest('.ant-card') as HTMLElement;
    expect((within(accountCard).getByRole('button', { name: '开通账号' }) as HTMLButtonElement).form).not.toBeNull();

    await user.click(screen.getByRole('button', { name: '返回员工列表' }));

    expect((screen.getByRole('searchbox', { name: '搜索姓名、mis 或联系电话' }) as HTMLInputElement).value).toBe('验证员工');
    expect(await screen.findByRole('button', { name: '验证员工21' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '验证员工01' })).toBeNull();
    expect(screen.queryByRole('button', { name: '验证员工26' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '验证员工21' }));
});

test('asks before leaving a profile with unsaved changes', async () => {
    const user = renderWorkspace(['ADMIN'], employees[20]);
    await user.type(screen.getByRole('searchbox', { name: '搜索姓名、mis 或联系电话' }), '验证员工21');
    await user.click(await screen.findByRole('button', { name: '验证员工21' }));
    await screen.findByRole('heading', { level: 1, name: '验证员工21' });

    const name = screen.getByLabelText('姓名');
    await user.clear(name);
    await user.type(name, '验证员工21改');
    await user.click(screen.getByRole('button', { name: '返回员工列表' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/还有未保存的修改/)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: '保存并离开' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: '验证员工21' })).toBeTruthy();

    await user.click(within(dialog).getByRole('button', { name: '不保存' }));
    expect(await screen.findByRole('button', { name: '验证员工21' })).toBeTruthy();
});

test('saves the dirty profile before leaving', async () => {
    const user = renderWorkspace(['ADMIN'], employees[20]);
    await user.type(screen.getByRole('searchbox', { name: '搜索姓名、mis 或联系电话' }), '验证员工21');
    await user.click(await screen.findByRole('button', { name: '验证员工21' }));
    await screen.findByRole('heading', { level: 1, name: '验证员工21' });

    const name = screen.getByLabelText('姓名');
    await user.clear(name);
    await user.type(name, '验证员工21改');
    await user.click(screen.getByRole('button', { name: '返回员工列表' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: '保存并离开' }));

    await waitFor(() => expect(vi.mocked(api)).toHaveBeenCalledWith('/people/employees/21', {
        method: 'PUT', body: expect.objectContaining({ name: '验证员工21改' }),
    }));
    expect(await screen.findByRole('button', { name: '验证员工21' })).toBeTruthy();
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
    expect(screen.getByRole('heading', { name: '账号与权限' })).toBeTruthy();
    expect(screen.getByText('尚未开通账号')).toBeTruthy();
});

test('lets HR open an account from the employee profile', async () => {
    const user = renderWorkspace(['HR']);
    await user.type(screen.getByRole('searchbox', { name: '搜索姓名、mis 或联系电话' }), '验证员工11');
    await user.click(await screen.findByRole('button', { name: '验证员工11' }));

    expect(await screen.findByRole('heading', { name: '账号与权限' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '开通账号' })).toBeTruthy();
});

test('rehires a departed employee from the profile and keeps the employment history', async () => {
    const employee = { ...employees[0], departedOn: '2026-02-01' };
    const user = renderWorkspace(['HR'], employee, [{
        id: 11, departmentId: 2, departmentName: '研发部', positionId: 2, positionName: '工程师',
        joinedOn: '2020-01-01', departedOn: '2026-02-01',
    }]);
    await user.click(await screen.findByRole('button', { name: '验证员工01' }));

    expect(await screen.findByRole('heading', { name: '任职经历' })).toBeTruthy();
    const historyCard = screen.getByRole('heading', { name: '任职经历' }).closest('.ant-card') as HTMLElement;
    expect(within(historyCard).getByText('部门')).toBeTruthy();
    expect(within(historyCard).getByText('财务部/研发部')).toBeTruthy();
    expect(within(historyCard).getByText('岗位')).toBeTruthy();
    expect(within(historyCard).getByText('工程师')).toBeTruthy();
    expect(within(historyCard).getByText('2020-01-01 至 2026-02-01')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '重新入职' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/上次离职日期 2026-02-01/)).toBeTruthy();
    expect(within(dialog).queryByLabelText('新密码')).toBeNull();
    await user.click(within(dialog).getByRole('radio', { name: '启用' }));
    expect(within(dialog).queryByLabelText('新密码')).toBeNull();
    expect(within(dialog).getByText(/默认密码为身份证后 6 位/)).toBeTruthy();
});
