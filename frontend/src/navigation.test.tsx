import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import type { Model } from './api';
import { navigationFor, Sidebar } from './navigation';
import type { NavEntry, Section } from './navigation';

const employee: Model<'CurrentUser'> = { id: 2, username: 'xianghongrui', employeeId: 1, mis: 'xianghongrui', roles: ['EMPLOYEE'] };
const hr: Model<'CurrentUser'> = { id: 3, username: 'hr', employeeId: 9, mis: 'hr', roles: ['HR'] };
const finance: Model<'CurrentUser'> = { id: 4, username: 'finance', employeeId: 10, mis: 'finance', roles: ['FINANCE'] };
const payer: Model<'CurrentUser'> = { id: 5, username: 'payer', employeeId: 11, mis: 'payer', roles: ['PAYER'] };

function renderSidebar(entries: NavEntry[], active: Section = 'home') {
    const onSelect = vi.fn();
    const view = render(<Sidebar entries={entries} active={active} onSelect={onSelect} />);
    return { onSelect, ...view };
}

test('hides the HRM group from people without HR access', () => {
    renderSidebar(navigationFor(employee));

    expect(screen.queryByRole('button', { name: '人事管理 HRM' })).toBeNull();
    expect(screen.queryByRole('button', { name: '人员管理' })).toBeNull();
});

test('keeps people management behind the HRM group', () => {
    const { onSelect } = renderSidebar(navigationFor(hr));
    const group = screen.getByRole('button', { name: '人事管理 HRM' });

    expect(group.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: '人员管理' })).toBeNull();

    fireEvent.click(group);
    expect(group.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: '人员管理' }));
    expect(onSelect).toHaveBeenCalledWith('people');
});

test('expands the group of the active section and marks the active item', () => {
    renderSidebar(navigationFor(hr), 'people');

    expect(screen.getByRole('button', { name: '人事管理 HRM' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: '人员管理' }).getAttribute('aria-current')).toBe('page');
});

test('keeps several groups open and remembers them when the section changes', () => {
    const entries: NavEntry[] = [
        { key: 'hrm', label: '人事管理', icon: null, items: [{ key: 'people', label: '人员管理' }] },
        { key: 'oa', label: '流程审批', icon: null, items: [{ key: 'inbox', label: '审批待办' }] },
    ];
    const { onSelect, rerender } = renderSidebar(entries);

    fireEvent.click(screen.getByRole('button', { name: '人事管理' }));
    fireEvent.click(screen.getByRole('button', { name: '流程审批' }));
    expect(screen.getByRole('button', { name: '人员管理' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '审批待办' })).toBeTruthy();

    rerender(<Sidebar entries={entries} active="inbox" onSelect={onSelect} />);
    expect(screen.getByRole('button', { name: '人员管理' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '审批待办' }).getAttribute('aria-current')).toBe('page');
});

test('shows settings and ledger to finance but not to payers', () => {
    renderSidebar(navigationFor(finance));
    expect(screen.getByRole('button', { name: '系统设置' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '费用台账' })).toBeTruthy();
});

test('shows the ledger to payers without settings', () => {
    renderSidebar(navigationFor(payer));
    expect(screen.getByRole('button', { name: '费用台账' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '系统设置' })).toBeNull();
});
