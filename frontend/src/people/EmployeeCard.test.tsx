import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { api } from '../api';
import { EmployeeCardAvatar } from './EmployeeCard';

vi.mock('../api', () => ({ api: vi.fn() }));

test('loads the employee card when the list avatar is clicked', async () => {
    vi.mocked(api).mockResolvedValue({
        id: 7, name: '张三', mis: 'zhangsan', departmentName: '财务部', positionName: '财务',
        joinedOn: '2026-01-01',
    } as never);
    const user = userEvent.setup();
    render(<EmployeeCardAvatar employeeId={7} name="张三" size={32} />);

    await user.click(screen.getByRole('button', { name: '查看张三的信息' }));

    expect(await screen.findByText('mis zhangsan')).toBeTruthy();
    expect(screen.getByText('财务部')).toBeTruthy();
    expect(screen.getByText('财务')).toBeTruthy();
    expect(api).toHaveBeenCalledWith('/people/directory/7');
});