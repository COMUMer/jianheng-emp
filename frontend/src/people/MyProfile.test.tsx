import { App } from 'antd';
import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { api } from '../api';
import type { Model } from '../api';
import { MyProfile } from './MyProfile';

vi.mock('../api', async importOriginal => ({ ...(await importOriginal<typeof import('../api')>()), api: vi.fn() }));

const detail: Model<'EmployeeDetail'> = {
    employee: {
        id: 1, mis: 'xianghongrui', name: '向鸿锐', departmentId: 3, positionId: 1, phone: '13800138000',
        email: 'xiang.hongrui@example.com', idCard: '110105199001011232', address: '深圳市南山区',
        emergencyContact: '张三', emergencyPhone: '13900139000', bankCard: '6222020200112233445',
        bankName: '招商银行', cnapsCode: '308584000013', joinedOn: '2026-11-15', departmentName: '人力资源部', positionName: '董事',
    },
    history: [],
};

const departments: Model<'Department'>[] = [
    { id: 1, name: '见衡' },
    { id: 2, name: '总办', parentId: 1 },
    { id: 3, name: '人力资源部', parentId: 2 },
];

const user: Model<'CurrentUser'> = { id: 2, username: 'xianghongrui', employeeId: 1, mis: 'xianghongrui', roles: ['EMPLOYEE'] };

function renderMyProfile(current: Model<'EmployeeDetail'>) {
    vi.mocked(api).mockImplementation(async path => {
        if (path === '/people/departments') return departments as never;
        if (path === '/people/employees/1') return current as never;
        throw new Error(`Unexpected request: ${path}`);
    });
    render(<App><MyProfile user={user} /></App>);
}

test('shows my own profile directly instead of an employee list', async () => {
    renderMyProfile(detail);

    expect(await screen.findByRole('heading', { level: 1, name: '向鸿锐' })).toBeTruthy();
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByRole('button', { name: '新增员工' })).toBeNull();
    expect(screen.getByText('xianghongrui')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: '登录账号' })).toBeNull();
    expect(await screen.findByText('见衡/总办/人力资源部')).toBeTruthy();
    expect(screen.getByText(/入职 \d+ 天/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '更换头像' })).toBeTruthy();
    expect(vi.mocked(api)).toHaveBeenCalledWith('/people/employees/1');
});

test('shows the avatar hover cover for a saved avatar', async () => {
    renderMyProfile({ ...detail, employee: { ...detail.employee, avatarKey: 'avatar.jpg' } });

    expect(await screen.findByRole('button', { name: '向鸿锐的头像' })).toBeTruthy();
    expect(document.querySelector('.ant-image-img')?.getAttribute('src')).toBe('/api/people/avatars/avatar.jpg');
    expect(screen.getByText('查看头像')).toBeTruthy();
});