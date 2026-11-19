import { ArrowLeftOutlined } from '@ant-design/icons';
import { App, Button, Form, Modal, Radio, Select, Table } from 'antd';
import dayjs from 'dayjs';
import { useLayoutEffect, useRef, useState } from 'react';
import { ApiError, api, showError } from '../api';
import type { Model } from '../api';
import { SearchBox } from '../SearchBox';
import { EllipsisText, EmptyState, PageHeading, ResourceState, listPagination } from '../common';
import { matchesKeyword } from '../filter';
import { DateField } from '../dates';
import { formatDate, roleLabel } from '../format';
import type { Role } from '../format';
import { useResource } from '../useResource';
import { EmployeeFields, EmploymentFields } from './EmployeeFields';
import { AccountStatus, EmployeeProfile, EmployeeStatus } from './EmployeeProfile';
import { EmployeeCardAvatar } from './EmployeeCard';
import { DepartmentPicker } from './DepartmentPicker';
import { departmentPath } from './departments';
import { PeopleCharts } from './PeopleCharts';

type Employee = Model<'Employee'>;
type RehireTarget = { id?: number; name?: string; departedOn?: string };
type RehireValues = { joinedOn: string; departmentId?: number; positionId?: number;
    enableAccount?: boolean; roles?: Role[] };
type Mode = { type: 'employee' } | { type: 'departure' } | { type: 'rehire'; employee: RehireTarget };

export function PeopleWorkspace({ user }: { user: Model<'CurrentUser'> }) {
    const { message } = App.useApp();
    const admin = !!user.roles?.includes('ADMIN');
    const manager = admin || !!user.roles?.includes('HR');
    const employees = useResource<Employee[]>('/people/employees');
    const departments = useResource<Model<'Department'>[]>('/people/departments');
    const positions = useResource<Model<'Position'>[]>('/people/positions');
    const flows = useResource<Model<'EmploymentFlow'>[]>('/people/employment-flow');
    const [selected, setSelected] = useState<number>();
    const employeePath = selected === undefined ? null : `/people/employees/${selected}`;
    const detail = useResource<Model<'EmployeeDetail'>>(employeePath);
    const [mode, setMode] = useState<Mode>();
    const [busy, setBusy] = useState(false);
    const [search, setSearch] = useState('');
    const [departmentFilter, setDepartmentFilter] = useState<number>();
    const [employmentFilter, setEmploymentFilter] = useState<'active' | 'departed'>();
    const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
    const list = useRef<HTMLDivElement>(null);
    const returnToEmployee = useRef<number>(undefined);
    const backGuard = useRef<(() => void) | null>(null);
    const departmentPathOf = (id?: number) => departmentPath(departments.data, id) || '—';
    const auditColumns = [
        { title: '创建时间', dataIndex: 'createdAt', width: 150, ellipsis: { showTitle: false }, render: formatDate },
        { title: '编辑时间', dataIndex: 'updatedAt', width: 150, ellipsis: { showTitle: false }, render: formatDate },
        { title: '最近操作人', dataIndex: 'operator', width: 95, ellipsis: true, render: (value?: string) => <EllipsisText text={value} /> },
    ];
    const positionOptions = positions.data?.map(item => ({ value: item.id, label: item.name, active: item.active }));

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
            employees.reload(); departments.reload(); positions.reload(); detail.reload(); flows.reload();
            return true;
        } catch (error) { message.error(showError(error)); return false; }
        finally { setBusy(false); }
    }

    async function createEmployee(value: Model<'EmployeeInput'>) {
        setBusy(true);
        try {
            const created = await api<Employee>('/people/employees', { method: 'POST', body: value });
            message.success('已创建员工');
            setMode(undefined);
            employees.reload();
            flows.reload();
            if (created?.id) setSelected(created.id);
        } catch (error) {
            const details = error instanceof ApiError ? error.details : undefined;
            const employeeId = typeof details?.employeeId === 'number' ? details.employeeId : undefined;
            const departedOn = typeof details?.departedOn === 'string' ? details.departedOn : undefined;
            if (error instanceof ApiError && error.status === 409 && employeeId && departedOn) {
                message.warning(showError(error));
                setMode({ type: 'rehire', employee: { id: employeeId, name: typeof details?.name === 'string' ? details.name : undefined, departedOn } });
            } else message.error(showError(error));
        } finally { setBusy(false); }
    }

    async function rehire(employee: RehireTarget, value: RehireValues) {
        if (!employee.id) return;
        setBusy(true);
        try {
            await api(`/people/employees/${employee.id}/employment`, { method: 'POST', body: {
                joinedOn: value.joinedOn, departmentId: value.departmentId, positionId: value.positionId,
                account: value.enableAccount ? {
                    roles: value.roles?.length ? value.roles : ['EMPLOYEE'], active: true } : undefined,
            } });
            message.success(value.enableAccount ? '已重新入职并启用账号' : '已办理重新入职，账号保持停用');
            setMode(undefined);
            employees.reload();
            detail.reload();
            flows.reload();
        } catch (error) { message.error(showError(error)); }
        finally { setBusy(false); }
    }

    const profile = detail.data?.employee;
    const account = detail.data?.account;
    return <>
        {employeePath ? <>
            <Button type="text" className="employee-profile-back" icon={<ArrowLeftOutlined aria-hidden />} autoFocus disabled={busy}
                onClick={() => backGuard.current ? backGuard.current() : setSelected(undefined)}>返回员工列表</Button>
            <ResourceState {...detail} retry={detail.reload}>{profile
                ? <EmployeeProfile profile={profile} account={account} history={detail.data?.history}
                    employments={detail.data?.employments?.map(item => ({ ...item, departmentPath: departmentPathOf(item.departmentId) }))}
                    departmentPath={departmentPathOf(profile.departmentId)}
                    departments={departments.data} positions={positionOptions} manageAccount={manager} editable={!profile.departedOn} busy={busy}
                    onBack={() => setSelected(undefined)} leaveGuardRef={backGuard}
                    onSaveProfile={value => persist(employeePath, 'PUT', value)}
                    onSaveAccount={value => persist(`${employeePath}/account`, 'PUT', value, account ? '已保存账号' : '已开通账号')}
                    onDeparture={() => setMode({ type: 'departure' })}
                    onRehire={manager && profile.departedOn ? () => setMode({ type: 'rehire',
                        employee: { id: profile.id, name: profile.name, departedOn: profile.departedOn } }) : undefined} />
                : <EmptyState text="未找到员工档案" />}</ResourceState>
        </> : <div ref={list} tabIndex={-1}>
            <PageHeading title="人员管理" description="维护员工档案。" />
            <PeopleCharts employees={employees.data} departments={departments.data} flows={flows.data} />
            <section className="surface">
                <div className="toolbar filter-bar">
                    <DepartmentPicker allowClear placeholder="全部部门" ariaLabel="筛选部门" departments={departments.data}
                        value={departmentFilter}
                        onChange={value => { setDepartmentFilter(value); setPagination({ ...pagination, current: 1 }); }} />
                    <Select allowClear value={employmentFilter} placeholder="全部在职状态" aria-label="筛选在职状态"
                        options={[{ value: 'active', label: '在职' }, { value: 'departed', label: '已离职' }]}
                        onChange={value => { setEmploymentFilter(value); setPagination({ ...pagination, current: 1 }); }} />
                    <SearchBox value={search} placeholder="搜索姓名、mis 或联系电话" ariaLabel="搜索姓名、mis 或联系电话"
                        onChange={value => { setSearch(value); setPagination({ ...pagination, current: 1 }); }}
                        onSearch={() => employees.reload()} />
                    <Button type="primary" className="surface-action" onClick={() => setMode({ type: 'employee' })}>新增员工</Button></div>
                <ResourceState {...employees} retry={employees.reload}><Table rowKey="id"
                    pagination={{ ...listPagination, ...pagination, onChange: (current, pageSize) => setPagination({ current, pageSize }) }} dataSource={employees.data?.filter(item =>
                    (!departmentFilter || item.departmentId === departmentFilter)
                    && (!employmentFilter || (employmentFilter === 'active' ? !item.departedOn : !!item.departedOn))
                    && matchesKeyword([item.mis, item.name, item.phone], search))} columns={[
                    { title: '姓名', dataIndex: 'name', width: 130, ellipsis: true, render: (name, row) => <span className="employee-name-cell">
                        <EmployeeCardAvatar name={name} employeeId={row.id} avatarKey={row.avatarKey} size={24} />
                        <Button type="link" className="table-link" data-employee-id={String(row.id)}
                            onClick={() => { returnToEmployee.current = row.id; setSelected(row.id); }}>{name}</Button>
                    </span> },
                    { title: 'mis', dataIndex: 'mis', width: 115, ellipsis: true, render: (value?: string) => <EllipsisText text={value} /> },
                    { title: '部门', ellipsis: true, render: (_, row) => <EllipsisText text={departmentPathOf(row.departmentId)} /> },
                    { title: '岗位', dataIndex: 'positionName', width: 105, ellipsis: true, render: (value?: string) => <EllipsisText text={value} /> },
                    { title: '联系电话', dataIndex: 'phone', width: 125, render: phone => phone || '—' },
                    { title: '入职日期', dataIndex: 'joinedOn', width: 115, render: value => value || '—' },
                    { title: '状态', width: 80, render: (_, row) => <EmployeeStatus departedOn={row.departedOn} /> },
        { title: '账号', width: 80, render: (_, row) => <AccountStatus accountActive={row.accountActive} /> },
                    ...auditColumns,
                ]} /></ResourceState>
            </section>
        </div>}
        {mode && <Modal open onCancel={() => setMode(undefined)} centered className="people-editor-modal"
            width={mode.type === 'employee' ? 900 : mode.type === 'rehire' ? 620 : 460}
            title={mode.type === 'employee' ? '新增员工' : mode.type === 'rehire' ? `重新入职 · ${mode.employee.name ?? ''}` : '登记离职'}
        okButtonProps={{ form: 'people-editor', htmlType: 'submit', loading: busy }}
        okText={mode.type === 'employee' ? '创建员工' : mode.type === 'rehire' ? '办理重新入职' : '保存'}>
            {mode.type === 'employee' && <Form<Model<'EmployeeInput'>> id="people-editor" layout="vertical" onFinish={createEmployee}>
                <EmployeeFields departments={departments.data} positions={positionOptions} />
            </Form>}
            {mode.type === 'rehire' && <Form<RehireValues> id="people-editor" layout="vertical" onFinish={value => rehire(mode.employee, value)}>
                <p className="form-hint">为 {mode.employee.name ?? '该员工'} 办理重新入职。上次离职日期 {mode.employee.departedOn}，新入职日期需晚于该日期。</p>
                <div className="form-grid"><EmploymentFields departments={departments.data} positions={positionOptions}
                    minDate={mode.employee.departedOn} /></div>
                <div className="form-section">
                    <h3>账号与权限</h3>
                    <div className="account-enable-row">
                        <span className="account-enable-label"><span className="required-mark" aria-hidden>*</span>账号状态</span>
                        <Form.Item name="enableAccount" noStyle initialValue={false}>
                            <Radio.Group className="status-radio">
                                <Radio value={true}>启用</Radio>
                                <Radio value={false}>停用</Radio>
                            </Radio.Group>
                        </Form.Item>
                    </div>
                    <p className="form-hint">不启用则账号保持停用，之后可由管理员在档案中启用。</p>
                    <Form.Item noStyle shouldUpdate={(previous, next) => previous.enableAccount !== next.enableAccount}>
                        {({ getFieldValue }) => getFieldValue('enableAccount') && <>
                            <p className="form-hint">启用后沿用现有密码；未开通过账号的，默认密码为身份证后 6 位。</p>
                            <Form.Item name="roles" label={<><span className="required-mark" aria-hidden>*</span>权限角色</>} initialValue={['EMPLOYEE']} extra="员工基础权限随账号启用授予。">
                                <Select mode="multiple" options={Object.entries(roleLabel).filter(([key]) => key !== 'ADMIN')
                                    .map(([value, label]) => ({ value: value as Role, label }))} />
                            </Form.Item>
                        </>}
                    </Form.Item>
                </div>
            </Form>}
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