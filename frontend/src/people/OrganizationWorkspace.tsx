import { DeleteOutlined, EditOutlined, MinusOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Form, Input, Modal, Radio, Select, Space, Table, Tag, Tabs, Tooltip } from 'antd';
import { useState } from 'react';
import { api, showError } from '../api';
import type { Model } from '../api';
import { SearchBox } from '../SearchBox';
import { EllipsisText, PageHeading, ResourceState, listPagination } from '../common';
import { formatDate } from '../format';
import { useResource } from '../useResource';
import { DepartmentPicker } from './DepartmentPicker';
import { departmentPath } from './departments';

type Department = Model<'Department'>;
type Position = Model<'Position'>;
type Mode = { type: 'department'; value?: Department } | { type: 'position'; value?: Position };

export function OrganizationWorkspace() {
    const { message, modal } = App.useApp();
    const departments = useResource<Department[]>('/people/departments');
    const positions = useResource<Position[]>('/people/positions');
    const employees = useResource<Model<'Employee'>[]>('/people/employees');
    const [tab, setTab] = useState('departments');
    const [mode, setMode] = useState<Mode>();
    const [busy, setBusy] = useState(false);
    const [departmentSearch, setDepartmentSearch] = useState('');
    const [positionSearch, setPositionSearch] = useState('');
    const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(() => new Set());
    const departmentLabel = (id?: number) => departments.data?.find(item => item.id === id)?.name ?? '—';
    const employeeLabel = (id?: number) => employees.data?.find(item => item.id === id)?.name ?? '—';
    const orderedDepartments = [...(departments.data ?? [])].sort((left, right) =>
        departmentPath(departments.data, left.id).localeCompare(departmentPath(departments.data, right.id), 'zh-CN'));
    const departmentDepth = (id?: number) => Math.max(0, departmentPath(departments.data, id).split('/').length - 1);
    const departmentParents = new Set((departments.data ?? []).map(item => item.parentId)
        .filter((id): id is number => id !== undefined));
    const departmentById = new Map((departments.data ?? []).map(item => [item.id, item]));
    const hiddenByCollapse = (department: Department) => {
        let parentId = department.parentId;
        while (parentId !== undefined) {
            if (collapsed.has(parentId)) return true;
            parentId = departmentById.get(parentId)?.parentId;
        }
        return false;
    };
    const toggleDepartment = (id: number) => {
        setCollapsed(current => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };
    const auditColumns = [
        { title: '创建时间', dataIndex: 'createdAt', width: 150, ellipsis: { showTitle: false }, render: formatDate },
        { title: '编辑时间', dataIndex: 'updatedAt', width: 150, ellipsis: { showTitle: false }, render: formatDate },
        { title: '最近操作人', dataIndex: 'operator', width: 110, ellipsis: true, render: (value?: string) => <EllipsisText text={value} /> },
    ];

    async function persist(path: string, method: string, body: unknown, statusPath?: string) {
        const { active, ...input } = body as { active?: boolean } & Record<string, unknown>;
        setBusy(true);
        try {
            await api(path, { method, body: input });
            if (statusPath && typeof active === 'boolean' && mode?.value && active !== (mode.value.active !== false)) {
                await api(statusPath, { method: 'PUT', body: { active } });
            }
            setMode(undefined);
            departments.reload(); positions.reload(); employees.reload();
            message.success('已保存');
        } catch (error) { message.error(showError(error)); }
        finally { setBusy(false); }
    }

    function confirmDelete(kind: 'department' | 'position', row: Department | Position) {
        modal.confirm({
            title: kind === 'department' ? '删除部门' : '删除岗位',
            content: `确定删除「${row.name}」？仅未被使用的已停用数据可删除。`,
            centered: true,
            okText: '删除',
            okButtonProps: { danger: true },
            onOk: async () => {
                try {
                    await api(`/people/${kind === 'department' ? 'departments' : 'positions'}/${row.id}`, { method: 'DELETE' });
                    departments.reload(); positions.reload(); employees.reload();
                    message.success(kind === 'department' ? '已删除部门' : '已删除岗位');
                } catch (error) {
                    message.error(showError(error));
                    throw error;
                }
            },
        });
    }

    return <>
        <PageHeading title="组织架构" description="维护部门层级、负责人和岗位。" />
        <section className="surface">
            <Tabs activeKey={tab} onChange={setTab} items={[{ key: 'departments', label: '部门' }, { key: 'positions', label: '岗位' }]} />
            {tab === 'departments' && <>
                <div className="toolbar filter-bar"><SearchBox value={departmentSearch} placeholder="搜索部门名称" ariaLabel="搜索部门名称"
                    onChange={setDepartmentSearch} onSearch={() => { departments.reload(); positions.reload(); }} />
                    <Button type="primary" className="surface-action" onClick={() => setMode({ type: 'department' })}>新增部门</Button></div>
                <ResourceState {...departments} retry={departments.reload}><Table className="organization-table" rowKey="id" pagination={false}
                    dataSource={orderedDepartments.filter(item => (!!departmentSearch || !hiddenByCollapse(item)) && (!departmentSearch
                        || item.name?.toLowerCase().includes(departmentSearch.trim().toLowerCase())))} columns={[
                        { title: '部门', dataIndex: 'name', ellipsis: true, render: (name, row) => <span className="department-tree-cell"
                            style={{ paddingLeft: departmentDepth(row.id) * 14 }}>
                            {departmentParents.has(row.id!) ? <button type="button" className="department-toggle"
                                aria-label={`${collapsed.has(row.id!) ? '展开' : '收起'}${name}`} aria-expanded={!collapsed.has(row.id!)}
                                onClick={() => toggleDepartment(row.id!)}>{collapsed.has(row.id!) ? <PlusOutlined /> : <MinusOutlined />}</button>
                                : <span className="department-toggle is-empty" aria-hidden />}
                            {name}
                        </span> },
                        { title: '上级部门', dataIndex: 'parentId', ellipsis: true, render: (value) => <EllipsisText text={departmentLabel(value)} /> },
                        { title: '负责人', dataIndex: 'managerId', width: 100, ellipsis: true, render: (value) => <EllipsisText text={employeeLabel(value)} /> },
                        { title: '状态', dataIndex: 'active', width: 80, render: (value?: boolean) => <Tag color={value === false ? 'default' : 'green'}>{value === false ? '停用' : '启用'}</Tag> },
                        ...auditColumns,
                        { title: '操作', width: 110, render: (_, row) => <Space size={8}>
                            <Tooltip title="编辑"><Button type="text" icon={<EditOutlined />} aria-label="编辑"
                                onClick={() => setMode({ type: 'department', value: row })} /></Tooltip>
                            {row.active === false && <Tooltip title="删除"><Button type="text" danger icon={<DeleteOutlined />}
                                aria-label="删除" onClick={() => confirmDelete('department', row)} /></Tooltip>}
                        </Space> },
                    ]} /></ResourceState>
            </>}
            {tab === 'positions' && <>
                <div className="toolbar filter-bar"><SearchBox value={positionSearch} placeholder="搜索岗位名称或描述" ariaLabel="搜索岗位名称或描述"
                    onChange={setPositionSearch} onSearch={() => { departments.reload(); positions.reload(); }} />
                    <Button type="primary" className="surface-action" onClick={() => setMode({ type: 'position' })}>新增岗位</Button></div>
                <ResourceState {...positions} retry={positions.reload}><Table className="organization-table" rowKey="id" pagination={listPagination}
                    dataSource={positions.data?.filter(item => !positionSearch || [item.name, item.description]
                        .some(value => value?.toLowerCase().includes(positionSearch.trim().toLowerCase())))} columns={[
                        { title: '岗位名称', dataIndex: 'name', ellipsis: true, render: (value?: string) => <EllipsisText text={value} /> },
                        { title: '岗位描述', dataIndex: 'description', ellipsis: true, render: (value?: string) => <EllipsisText text={value} /> },
                        { title: '状态', dataIndex: 'active', width: 80, render: (value?: boolean) => <Tag color={value === false ? 'default' : 'green'}>{value === false ? '停用' : '启用'}</Tag> },
                        ...auditColumns,
                        { title: '操作', width: 110, render: (_, row) => <Space size={8}>
                            <Tooltip title="编辑"><Button type="text" icon={<EditOutlined />} aria-label="编辑"
                                onClick={() => setMode({ type: 'position', value: row })} /></Tooltip>
                            {row.active === false && <Tooltip title="删除"><Button type="text" danger icon={<DeleteOutlined />}
                                aria-label="删除" onClick={() => confirmDelete('position', row)} /></Tooltip>}
                        </Space> },
                    ]} /></ResourceState>
            </>}
        </section>
        {mode && <Modal open onCancel={() => setMode(undefined)} centered
            className={`people-editor-modal${mode.type === 'position' ? ' position-editor-modal' : ''}`} width={460}
            title={mode.type === 'department' ? (mode.value ? '编辑部门' : '新增部门') : (mode.value ? '编辑岗位' : '新增岗位')}
            okButtonProps={{ form: 'organization-editor', htmlType: 'submit', loading: busy }} okText="保存">
            {mode.type === 'department' && <Form id="organization-editor" layout="vertical"
                initialValues={{ ...mode.value, active: mode.value ? mode.value.active !== false : true }}
                onFinish={(value: Model<'DepartmentInput'> & { active?: boolean }) => persist(
                    `/people/departments${mode.value ? `/${mode.value.id}` : ''}`, mode.value ? 'PUT' : 'POST', value,
                    mode.value ? `/people/departments/${mode.value.id}/active` : undefined)}>
                <Form.Item name="name" label="部门名称" rules={[{ required: true }]}><Input maxLength={100} /></Form.Item>
                {mode.value && <Form.Item name="active" label="状态" className="status-field" required>
                    <Radio.Group className="status-radio">
                        <Radio value={true}>启用</Radio>
                        <Radio value={false}>停用</Radio>
                    </Radio.Group>
                </Form.Item>}
                <Form.Item name="parentId" label="上级部门">
                    <DepartmentPicker allowClear clearLabel="无上级部门" placeholder="无上级部门" ariaLabel="上级部门"
                        title="选择上级部门" departments={departments.data?.filter(item => item.active !== false)} excludeId={mode.value?.id} />
                </Form.Item>
                <Form.Item name="managerId" label="负责人">
                    <Select allowClear options={employees.data?.filter(item => !item.departedOn).map(item => ({ value: item.id, label: item.name }))} />
                </Form.Item>
            </Form>}
            {mode.type === 'position' && <Form id="organization-editor" layout="vertical"
                initialValues={{ ...mode.value, active: mode.value ? mode.value.active !== false : true }}
                onFinish={(value: Model<'PositionInput'> & { active?: boolean }) => persist(
                    `/people/positions${mode.value ? `/${mode.value.id}` : ''}`, mode.value ? 'PUT' : 'POST', value,
                    mode.value ? `/people/positions/${mode.value.id}/active` : undefined)}>
                <Form.Item name="name" label="岗位名称" rules={[{ required: true }]}><Input maxLength={100} /></Form.Item>
                {mode.value && <Form.Item name="active" label="状态" className="status-field" required>
                    <Radio.Group className="status-radio">
                        <Radio value={true}>启用</Radio>
                        <Radio value={false}>停用</Radio>
                    </Radio.Group>
                </Form.Item>}
                <Form.Item name="description" label="岗位描述"><Input.TextArea rows={9} maxLength={500} showCount
                    style={{ resize: 'none' }} placeholder="填写岗位职责、任职要求等" /></Form.Item>
            </Form>}
        </Modal>}
    </>;
}