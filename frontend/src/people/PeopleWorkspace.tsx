import { ArrowLeftOutlined } from '@ant-design/icons';
import { App, Button, Form, Input, Modal, Select, Table, Tabs } from 'antd';
import dayjs from 'dayjs';
import { useLayoutEffect, useRef, useState } from 'react';
import { api, showError } from '../api';
import type { Model } from '../api';
import { EmptyState, PageHeading, ResourceState } from '../common';
import { DateField } from '../dates';
import { formatDate } from '../format';
import { useResource } from '../useResource';
import { EmployeeFields } from './EmployeeFields';
import { EmployeeProfile, EmployeeStatus } from './EmployeeProfile';
import { PersonAvatar } from './avatar';
import { departmentPath } from './departments';

type Employee = Model<'Employee'>;
type Department = Model<'Department'>;
type Position = Model<'Position'>;
type Mode = { type: 'employee' } | { type: 'department'; value?: Department } | { type: 'position'; value?: Position }
    | { type: 'departure' };

export function PeopleWorkspace({ user }: { user: Model<'CurrentUser'> }) {
    const { message } = App.useApp();
    const admin = !!user.roles?.includes('ADMIN');
    const employees = useResource<Employee[]>('/people/employees');
    const departments = useResource<Department[]>('/people/departments');
    const positions = useResource<Position[]>('/people/positions');
    const [selected, setSelected] = useState<number>();
    const employeePath = selected === undefined ? null : `/people/employees/${selected}`;
    const detail = useResource<Model<'EmployeeDetail'>>(employeePath);
    const [tab, setTab] = useState('employees');
    const [mode, setMode] = useState<Mode>();
    const [busy, setBusy] = useState(false);
    const [search, setSearch] = useState('');
    const [departmentSearch, setDepartmentSearch] = useState('');
    const [positionSearch, setPositionSearch] = useState('');
    const [departmentFilter, setDepartmentFilter] = useState<number>();
    const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
    const list = useRef<HTMLDivElement>(null);
    const returnToEmployee = useRef<number>(undefined);
    const departmentLabel = (id?: number) => departments.data?.find(item => item.id === id)?.name ?? '—';
    const departmentPathOf = (id?: number) => departmentPath(departments.data, id) || '—';
    const employeeLabel = (id?: number) => employees.data?.find(item => item.id === id)?.name ?? '—';
    const departmentOptions = departments.data?.map(item => ({ value: item.id, label: item.name }));
    const departmentFilterOptions = departments.data?.map(item => ({ value: item.id, label: departmentPathOf(item.id) }));
    const auditColumns = [
        { title: '创建时间', dataIndex: 'createdAt', render: formatDate },
        { title: '编辑时间', dataIndex: 'updatedAt', render: formatDate },
        { title: '操作人', dataIndex: 'operator', render: (value?: string) => value || '—' },
    ];
    const positionOptions = positions.data?.map(item => ({ value: item.id, label: item.name }));

    useLayoutEffect(() => {
        if (employeePath || employees.loading || returnToEmployee.current === undefined || !list.current) return;
        const rowButton = list.current.querySelector<HTMLButtonElement>(`[data-employee-id="${returnToEmployee.current}"]`);
        (rowButton ?? list.current).focus();
        returnToEmployee.current = undefined;
    }, [employeePath, employees.loading]);

    async function persist(path: string, method: string, body: unknown, success = '已保存') {
        setBusy(true);
        try {
            await api(path, { method, body });
            message.success(success);
            setMode(undefined);
            employees.reload(); departments.reload(); positions.reload(); detail.reload();
        } catch (error) { message.error(showError(error)); }
        finally { setBusy(false); }
    }

    const profile = detail.data?.employee;
    const account = detail.data?.account;
    return <>
        {employeePath ? <>
            <Button type="text" className="employee-profile-back" icon={<ArrowLeftOutlined aria-hidden />} autoFocus disabled={busy}
                onClick={() => setSelected(undefined)}>返回员工列表</Button>
            <ResourceState {...detail} retry={detail.reload}>{profile
                ? <EmployeeProfile profile={profile} account={account} history={detail.data?.history}
                    departmentPath={departmentPathOf(profile.departmentId)}
                    departments={departmentOptions} positions={positionOptions} admin={admin} editable={!profile.departedOn} busy={busy}
                    onSaveProfile={value => persist(employeePath, 'PUT', value)}
                    onSaveAccount={value => persist(`${employeePath}/account`, 'PUT', value, account ? '已保存账号' : '已开通账号')}
                    onDeparture={() => setMode({ type: 'departure' })} />
                : <EmptyState text="未找到员工档案" />}</ResourceState>
        </> : <div ref={list} tabIndex={-1}>
            <PageHeading title="人员管理" description="维护员工档案、组织部门和岗位。"
                action={<Button type="primary" onClick={() => setMode({ type: tab === 'departments' ? 'department' : tab === 'positions' ? 'position' : 'employee' })}>
                    {tab === 'departments' ? '新增部门' : tab === 'positions' ? '新增岗位' : '新增员工'}</Button>} />
            <section className="surface">
                <Tabs activeKey={tab} onChange={setTab} items={[{ key: 'employees', label: '员工档案' }, { key: 'departments', label: '部门' }, { key: 'positions', label: '岗位' }]} />
                {tab === 'employees' && <>
                    <div className="toolbar filter-bar"><Input.Search placeholder="搜索姓名、mis 或联系电话" aria-label="搜索姓名、mis 或联系电话" allowClear
                        value={search} onChange={event => { setSearch(event.target.value); setPagination({ ...pagination, current: 1 }); }} />
                        <Select allowClear placeholder="全部部门" aria-label="筛选部门" options={departmentFilterOptions} value={departmentFilter}
                            onChange={value => { setDepartmentFilter(value); setPagination({ ...pagination, current: 1 }); }} /></div>
                    <ResourceState {...employees} retry={employees.reload}><Table rowKey="id" scroll={{ x: 1140 }}
                        pagination={{ ...pagination, onChange: (current, pageSize) => setPagination({ current, pageSize }) }} dataSource={employees.data?.filter(item =>
                        (!departmentFilter || item.departmentId === departmentFilter) && (!search || `${item.mis} ${item.name} ${item.phone ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())))} columns={[
                        { title: '姓名', dataIndex: 'name', render: (name, row) => <span className="employee-name-cell">
                            <PersonAvatar name={name} avatarKey={row.avatarKey} size={24} />
                            <Button type="link" className="table-link" data-employee-id={String(row.id)}
                                onClick={() => { returnToEmployee.current = row.id; setSelected(row.id); }}>{name}</Button>
                        </span> },
                        { title: 'mis', dataIndex: 'mis' }, { title: '部门', render: (_, row) => departmentPathOf(row.departmentId) },
                        { title: '岗位', dataIndex: 'positionName' },
                        { title: '联系电话', dataIndex: 'phone', render: phone => phone || '—' },
                        { title: '入职日期', dataIndex: 'joinedOn' }, { title: '状态', render: (_, row) => <EmployeeStatus departedOn={row.departedOn} /> },
                        ...auditColumns,
                    ]} /></ResourceState>
                </>}
                {tab === 'departments' && <>
                    <div className="toolbar filter-bar"><Input.Search placeholder="搜索部门名称" aria-label="搜索部门名称" allowClear
                        value={departmentSearch} onChange={event => setDepartmentSearch(event.target.value)} /></div>
                    <ResourceState {...departments} retry={departments.reload}><Table rowKey="id" scroll={{ x: 880 }}
                        expandable={{ defaultExpandAllRows: true }} dataSource={filterDepartments(departmentTree(departments.data ?? []), departmentSearch)} columns={[
                            { title: '部门', dataIndex: 'name' }, { title: '上级部门', dataIndex: 'parentId', render: departmentLabel },
                            { title: '负责人', dataIndex: 'managerId', render: employeeLabel }, ...auditColumns,
                            { title: '操作', width: 90, render: (_, row) => <Button type="link" className="table-link" onClick={() => setMode({ type: 'department', value: row })}>编辑</Button> },
                        ]} /></ResourceState>
                </>}
                {tab === 'positions' && <>
                    <div className="toolbar filter-bar"><Input.Search placeholder="搜索岗位名称" aria-label="搜索岗位名称" allowClear
                        value={positionSearch} onChange={event => setPositionSearch(event.target.value)} /></div>
                    <ResourceState {...positions} retry={positions.reload}><Table rowKey="id" scroll={{ x: 720 }}
                        dataSource={positions.data?.filter(item => !positionSearch || item.name?.toLowerCase().includes(positionSearch.trim().toLowerCase()))} columns={[
                            { title: '岗位名称', dataIndex: 'name' }, ...auditColumns,
                            { title: '操作', width: 90, render: (_, row) => <Button type="link" className="table-link" onClick={() => setMode({ type: 'position', value: row })}>编辑</Button> },
                        ]} /></ResourceState>
                </>}
            </section>
        </div>}
        {mode && <Modal open onCancel={() => setMode(undefined)} centered className="people-editor-modal"
            width={mode.type === 'employee' ? 900 : 460}
            title={mode.type === 'employee' ? '新增员工'
            : mode.type === 'department' ? (mode.value ? '编辑部门' : '新增部门') : mode.type === 'position' ? (mode.value ? '编辑岗位' : '新增岗位') : '登记离职'}
        okButtonProps={{ form: 'people-editor', htmlType: 'submit', loading: busy }} okText={mode.type === 'employee' ? '创建员工' : '保存'}>
            {mode.type === 'employee' && <Form<Model<'EmployeeInput'>> id="people-editor" layout="vertical" onFinish={value =>
                persist('/people/employees', 'POST', value)}>
                <EmployeeFields departments={departmentOptions} positions={positionOptions} creating />
            </Form>}
            {mode.type === 'department' && <Form id="people-editor" layout="vertical" initialValues={mode.value} onFinish={(value: Model<'DepartmentInput'>) =>
                persist(`/people/departments${mode.value ? `/${mode.value.id}` : ''}`, mode.value ? 'PUT' : 'POST', value)}>
                <Form.Item name="name" label="部门名称" rules={[{ required: true }]}><Input maxLength={100} /></Form.Item>
                <Form.Item name="parentId" label="上级部门"><Select allowClear options={departmentOptions?.filter(item => item.value !== mode.value?.id)} /></Form.Item>
                <Form.Item name="managerId" label="负责人"><Select allowClear options={employees.data?.filter(item => !item.departedOn).map(item => ({ value: item.id, label: item.name }))} /></Form.Item>
            </Form>}
            {mode.type === 'position' && <Form id="people-editor" layout="vertical" initialValues={mode.value} onFinish={(value: Model<'NameInput'>) =>
                persist(`/people/positions${mode.value ? `/${mode.value.id}` : ''}`, mode.value ? 'PUT' : 'POST', value)}>
                <Form.Item name="name" label="岗位名称" rules={[{ required: true }]}><Input maxLength={100} /></Form.Item></Form>}
            {mode.type === 'departure' && employeePath && <Form id="people-editor" layout="vertical" onFinish={(value: Model<'Departure'>) =>
                persist(`${employeePath}/departure`, 'POST', value, '已登记离职并停用账号')}>
                <p>登记后，员工账号和已登录的会话将失效。</p>
                <Form.Item name="date" label="离职日期" rules={[{ required: true }]}>
                    <DateField className="wide-input" disabledDate={date => date.isAfter(dayjs(), 'day')
                        || (!!profile?.joinedOn && date.isBefore(profile.joinedOn, 'day'))} />
                </Form.Item>
            </Form>}
        </Modal>}
    </>;
}

type DepartmentBranch = Department & { children?: DepartmentBranch[] };

function filterDepartments(nodes: DepartmentBranch[], keyword: string): DepartmentBranch[] {
    const search = keyword.trim().toLowerCase();
    if (!search) return nodes;
    return nodes.flatMap(node => {
        if (node.name?.toLowerCase().includes(search)) return [node];
        const children = filterDepartments(node.children ?? [], search);
        return children.length ? [{ ...node, children }] : [];
    });
}

function departmentTree(departments: Department[]): DepartmentBranch[] {
    const nodes = new Map(departments.map(department => [department.id, { ...department } as DepartmentBranch]));
    const roots: DepartmentBranch[] = [];
    for (const node of nodes.values()) {
        const parent = nodes.get(node.parentId);
        if (parent) (parent.children ??= []).push(node);
        else roots.push(node);
    }
    return roots;
}
