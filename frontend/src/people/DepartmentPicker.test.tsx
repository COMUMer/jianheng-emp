import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { DepartmentPicker } from './DepartmentPicker';

const departments = [
    { id: 1, name: '见衡' },
    { id: 2, name: '总办', parentId: 1 },
    { id: 3, name: '人力资源部', parentId: 2 },
    { id: 4, name: '财务部', parentId: 2 },
];

test('shows the full path of the selected department', () => {
    render(<DepartmentPicker departments={departments} value={3} ariaLabel="部门" />);

    expect(screen.getByRole('button', { name: '部门' }).textContent).toContain('见衡/总办/人力资源部');
});

test('selects a nested department from the tree', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DepartmentPicker departments={departments} onChange={onChange} ariaLabel="部门" />);

    await user.click(screen.getByRole('button', { name: '部门' }));
    await user.click(await screen.findByRole('button', { name: '人力资源部' }));
    expect(onChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /确\s*定/ }));
    expect(onChange).toHaveBeenCalledWith(3);
});

test('cancels the pending selection', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DepartmentPicker departments={departments} value={4} onChange={onChange} ariaLabel="部门" />);

    await user.click(screen.getByRole('button', { name: '部门' }));
    await user.click(await screen.findByRole('button', { name: '人力资源部' }));
    await user.click(screen.getByRole('button', { name: /取\s*消/ }));

    expect(onChange).not.toHaveBeenCalled();
});

test('collapses a branch without hiding its parent', async () => {
    const user = userEvent.setup();
    render(<DepartmentPicker departments={departments} ariaLabel="部门" />);

    await user.click(screen.getByRole('button', { name: '部门' }));
    expect(await screen.findByRole('button', { name: '人力资源部' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '收起总办' }));
    expect(screen.queryByRole('button', { name: '人力资源部' })).toBeNull();
    expect(screen.getByRole('button', { name: '总办' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '展开总办' })).toBeTruthy();
});

test('disables the edited department and its subtree as parent', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DepartmentPicker departments={departments} excludeId={2} allowClear clearLabel="无上级部门"
        onChange={onChange} ariaLabel="上级部门" />);

    await user.click(screen.getByRole('button', { name: '上级部门' }));
    expect((await screen.findByRole('button', { name: '总办' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '人力资源部' }) as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole('button', { name: '人力资源部' }));
    expect(onChange).not.toHaveBeenCalled();
});

test('clears the selection through the clear option', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DepartmentPicker departments={departments} value={4} allowClear clearLabel="全部部门"
        onChange={onChange} ariaLabel="筛选部门" />);

    await user.click(screen.getByRole('button', { name: '筛选部门' }));
    await user.click(await screen.findByRole('button', { name: '全部部门' }));
    await user.click(screen.getByRole('button', { name: /确\s*定/ }));

    expect(onChange).toHaveBeenCalledWith(undefined);
});
