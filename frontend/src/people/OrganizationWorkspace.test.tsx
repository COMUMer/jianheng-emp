import { App } from 'antd';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { api } from '../api';
import { OrganizationWorkspace } from './OrganizationWorkspace';

vi.mock('../api', async importOriginal => ({ ...await importOriginal<typeof import('../api')>(), api: vi.fn() }));

const departments = [
    { id: 1, name: '见衡' },
    { id: 2, name: '总办', parentId: 1 },
    { id: 3, name: '财务部', parentId: 2 },
    { id: 4, name: '人力资源部', parentId: 2 },
];
const positions = [{ id: 1, name: '会计', description: '负责账务核算与报表' }, { id: 2, name: '工程师', description: '负责研发交付' }];

function renderOrganization() {
    vi.mocked(api).mockImplementation(async path => {
        if (path === '/people/departments') return departments as never;
        if (path === '/people/positions') return positions as never;
        if (path === '/people/employees') return [] as never;
        throw new Error(`Unexpected request: ${path}`);
    });
    render(<App><OrganizationWorkspace /></App>);
    return userEvent.setup();
}

test('searches departments while keeping the parent department visible', async () => {
    const user = renderOrganization();

    expect(await screen.findByText('财务部')).toBeTruthy();
    await user.type(screen.getByRole('searchbox', { name: '搜索部门名称' }), '财务');
    expect(await screen.findByText('财务部')).toBeTruthy();
    expect(screen.queryByText('人力资源部')).toBeNull();
    expect(screen.getAllByText('总办').length).toBeGreaterThan(0);
});

test('collapses and expands child departments', async () => {
    const user = renderOrganization();

    expect(await screen.findByText('财务部')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '收起总办' }));
    expect(screen.queryByText('财务部')).toBeNull();
    await user.click(screen.getByRole('button', { name: '展开总办' }));
    expect(await screen.findByText('财务部')).toBeTruthy();
});

test('manages positions in their own tab', async () => {
    const user = renderOrganization();

    await user.click(await screen.findByRole('tab', { name: '岗位' }));
    await user.type(await screen.findByRole('searchbox', { name: '搜索岗位名称或描述' }), '工程');
    expect(await screen.findByText('工程师')).toBeTruthy();
    expect(screen.getByText('负责研发交付')).toBeTruthy();
    expect(screen.queryByText('会计')).toBeNull();

    await user.click(screen.getByRole('button', { name: '新增岗位' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByLabelText('岗位名称')).toBeTruthy();
    expect(screen.getByLabelText('岗位描述')).toBeTruthy();
});

test('prefills the position description when editing', async () => {
    const user = renderOrganization();

    await user.click(await screen.findByRole('tab', { name: '岗位' }));
    expect(await screen.findByText('会计')).toBeTruthy();
    await user.click(screen.getAllByRole('button', { name: '编辑' })[0]);

    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect((screen.getByLabelText('岗位描述') as HTMLTextAreaElement).value).toBe('负责账务核算与报表');
});

test('enables and deletes an inactive department from its row', async () => {
    const user = userEvent.setup();
    const data = [{ id: 1, name: '见衡', active: false }];
    vi.mocked(api).mockImplementation(async (path: string, options?: { method?: string }) => {
        if (!options?.method && path === '/people/departments') return data as never;
        if (!options?.method && path === '/people/positions') return [] as never;
        if (!options?.method && path === '/people/employees') return [] as never;
        return undefined as never;
    });
    render(<App><OrganizationWorkspace /></App>);

    const row = (await screen.findByText('见衡')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: '编辑' }));
    const editor = await screen.findByRole('dialog');
    await user.click(within(editor).getByRole('radio', { name: '启用' }));
    await user.click(within(editor).getByRole('button', { name: /保\s*存/ }));
    await waitFor(() => expect(api).toHaveBeenCalledWith('/people/departments/1/active',
        { method: 'PUT', body: { active: true } }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    const refreshedRow = (await screen.findByText('见衡')).closest('tr')!;
    await user.click(within(refreshedRow).getByRole('button', { name: '删除' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /删\s*除/ }));
    await waitFor(() => expect(api).toHaveBeenCalledWith('/people/departments/1', { method: 'DELETE' }));
});