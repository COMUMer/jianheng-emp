import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import type { Model } from './api';
import { navigationFor, Sidebar } from './navigation';
import type { NavEntry, Section } from './navigation';

const employee: Model<'CurrentUser'> = { id: 2, username: 'xianghongrui', employeeId: 1, mis: 'xianghongrui', roles: ['EMPLOYEE'] };
const hr: Model<'CurrentUser'> = { id: 3, username: 'hr', employeeId: 9, mis: 'hr', roles: ['HR'] };
const finance: Model<'CurrentUser'> = { id: 4, username: 'finance', employeeId: 10, mis: 'finance', roles: ['FINANCE'] };
const payer: Model<'CurrentUser'> = { id: 5, username: 'payer', employeeId: 11, mis: 'payer', roles: ['PAYER'] };
const admin: Model<'CurrentUser'> = { id: 1, username: 'admin', mis: 'admin', roles: ['ADMIN'] };

function renderSidebar(entries: NavEntry[], active: Section = 'home') {
    const onNavigate = vi.fn();
    const sidebar = (entries: NavEntry[], active: Section, onNavigate: () => void) =>
        <MemoryRouter><Sidebar entries={entries} active={active} onNavigate={onNavigate} /></MemoryRouter>;
    const view = render(sidebar(entries, active, onNavigate));
    return { onNavigate, view, rerender: (nextEntries: NavEntry[], nextActive: Section) =>
        view.rerender(sidebar(nextEntries, nextActive, onNavigate)) };
}

test('shows pending inbox and unread message badges', () => {
    renderSidebar(navigationFor(employee, 2, 3));

    expect(screen.getByRole('link', { name: '我的待办，3 条待办' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '我的消息，2 条未读' })).toBeTruthy();
});

test('hides the HRM group from people without HR access', () => {
    renderSidebar(navigationFor(employee));

    expect(screen.queryByRole('button', { name: '人事管理 HRM' })).toBeNull();
    expect(screen.queryByRole('link', { name: '人员管理' })).toBeNull();
    expect(screen.queryByRole('link', { name: '组织架构' })).toBeNull();
});

test('keeps people management behind the HRM group', () => {
    const { onNavigate } = renderSidebar(navigationFor(hr));
    const group = screen.getByRole('button', { name: '人事管理 HRM' });

    expect(group.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('link', { name: '人员管理' })).toBeNull();

    fireEvent.click(group);
    expect(group.getAttribute('aria-expanded')).toBe('true');

    const people = screen.getByRole('link', { name: '人员管理' });
    expect(people.getAttribute('href')).toBe('/people');
    expect(screen.getByRole('link', { name: '组织架构' }).getAttribute('href')).toBe('/organization');
    fireEvent.click(people);
    expect(onNavigate).toHaveBeenCalled();
});

test('expands the group of the active section and marks the active item', () => {
    renderSidebar(navigationFor(hr), 'people');

    expect(screen.getByRole('button', { name: '人事管理 HRM' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('link', { name: '人员管理' }).getAttribute('aria-current')).toBe('page');
});

test('keeps several groups open and remembers them when the section changes', () => {
    const entries: NavEntry[] = [
        { key: 'hrm', label: '人事管理', icon: null, items: [{ key: 'people', label: '人员管理' }] },
        { key: 'oa', label: '流程审批', icon: null, items: [{ key: 'inbox', label: '我的待办' }] },
    ];
    const { rerender } = renderSidebar(entries);

    fireEvent.click(screen.getByRole('button', { name: '人事管理' }));
    fireEvent.click(screen.getByRole('button', { name: '流程审批' }));
    expect(screen.getByRole('link', { name: '人员管理' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '我的待办' })).toBeTruthy();

    rerender(entries, 'inbox');
    expect(screen.getByRole('link', { name: '人员管理' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '我的待办' }).getAttribute('aria-current')).toBe('page');
});

test('keeps the profile directly above system settings for finance', () => {
    renderSidebar(navigationFor(finance));
    const labels = screen.getAllByRole('link').map(link => link.textContent);
    expect(labels.slice(-2)).toEqual(['我的档案', '系统设置']);
});

test('puts the profile last for employees without settings', () => {
    renderSidebar(navigationFor(employee));
    expect(screen.getAllByRole('link').at(-1)?.textContent).toBe('我的档案');
});

test('shows settings and ledger to finance but not to payers', () => {
    renderSidebar(navigationFor(finance));
    expect(screen.getByRole('link', { name: '系统设置' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '费用台账' })).toBeTruthy();
});

test('shows the ledger to payers without settings', () => {
    renderSidebar(navigationFor(payer));
    expect(screen.getByRole('link', { name: '费用台账' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: '系统设置' })).toBeNull();
    expect(screen.queryByRole('link', { name: '邮件设置' })).toBeNull();
});


test('shows mail settings as a top-level admin-only entry', () => {
    renderSidebar(navigationFor(admin));

    const mail = screen.getByRole('link', { name: '邮件设置' });
    expect(mail.getAttribute('href')).toBe('/mail-settings');
    expect(screen.getByRole('link', { name: '系统设置' })).toBeTruthy();
});

test('links my messages and badges the unread count', () => {
    renderSidebar(navigationFor(employee, 3));

    const messages = screen.getByRole('link', { name: '我的消息，3 条未读' });
    expect(messages.getAttribute('href')).toBe('/messages');
    expect(messages.querySelector('.ant-badge')).toBeTruthy();
});

test('hides the unread badge when every message is read', () => {
    renderSidebar(navigationFor(employee));

    const messages = screen.getByRole('link', { name: '我的消息' });
    expect(messages.querySelector('.ant-badge')).toBeNull();
});