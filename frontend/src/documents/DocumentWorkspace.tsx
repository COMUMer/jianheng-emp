import { App, Button, Dropdown, Select, Switch, Table, Tag } from 'antd';
import type { TableColumnsType } from 'antd';
import { useState } from 'react';
import { api, download, showError } from '../api';
import type { Model } from '../api';
import { DocumentTag, EmptyState, PageHeading, ResourceState } from '../common';
import { DateField } from '../dates';
import { formatDate, formatMoney, kindLabel, kinds, statusLabel } from '../format';
import type { DocumentStatus, Kind } from '../format';
import { useResource } from '../useResource';
import { DocumentDetail } from './DocumentDetail';
import { DraftEditor } from './DraftEditor';

type Summary = Model<'Summary'>;
type Section = 'home' | 'requests' | 'inbox' | 'ledger';

export function DocumentWorkspace({ user, section, navigate }: { user: Model<'CurrentUser'>; section: Section; navigate: (section: Section) => void }) {
    const { message } = App.useApp();
    const [selected, setSelected] = useState<number>();
    const [editor, setEditor] = useState<{ kind: Kind; existing?: Model<'Detail'> }>();
    const [allInbox, setAllInbox] = useState(false);
    const [kind, setKind] = useState<Kind>();
    const [status, setStatus] = useState<DocumentStatus>();
    const [department, setDepartment] = useState<number>();
    const [from, setFrom] = useState<string>();
    const [to, setTo] = useState<string>();
    const [exporting, setExporting] = useState(false);
    const own = useResource<Summary[]>(section === 'home' || section === 'requests' ? '/documents' : null);
    const inbox = useResource<Summary[]>(section === 'home' || section === 'inbox' ? `/inbox?all=${section === 'inbox' && allInbox}` : null);
    const notices = useResource<Model<'Notice'>[]>(section === 'home' ? '/notifications' : null);
    const departments = useResource<Model<'Department'>[]>(section === 'ledger' ? '/people/departments' : null);
    const filter = new URLSearchParams();
    if (section === 'ledger' && status) filter.set('status', status);
    if (department) filter.set('departmentId', String(department));
    if (from) filter.set('from', from);
    if (to) filter.set('to', to);
    const ledger = useResource<Summary[]>(section === 'ledger' ? `/expenses/ledger?${filter}` : null);
    const overdue = (row: Summary) => !!row.dueAt && new Date(row.dueAt).getTime() < Date.now();

    function reload() { own.reload(); inbox.reload(); notices.reload(); ledger.reload(); }

    const titleColumn: TableColumnsType<Summary>[number] = { title: '申请标题', dataIndex: 'title', render: (title: string, row) =>
        <Button type="link" className="table-link" onClick={() => setSelected(row.id)}>{title}</Button> };
    const kindColumn: TableColumnsType<Summary>[number] = { title: '类型', dataIndex: 'kind', render: (value: Kind) => kindLabel[value] };
    const statusColumn: TableColumnsType<Summary>[number] = { title: '状态', dataIndex: 'status', render: (value: DocumentStatus) => <DocumentTag status={value} /> };
    const auditColumns: TableColumnsType<Summary> = [
        { title: '创建时间', dataIndex: 'createdAt', render: formatDate },
        { title: '编辑时间', dataIndex: 'updatedAt', render: formatDate },
        { title: '操作人', dataIndex: 'operator', render: value => value ?? '—' }];
    const ownColumns: TableColumnsType<Summary> = [titleColumn, kindColumn, statusColumn,
        { title: '当前处理人', dataIndex: 'assignee', render: value => value ?? '—' }, ...auditColumns];
    const inboxColumns: TableColumnsType<Summary> = [titleColumn, kindColumn, { title: '申请人', dataIndex: 'applicant' },
        { title: '处理人', dataIndex: 'assignee' }, { title: '截止时间', dataIndex: 'dueAt', render: (value: string, row) =>
            <>{formatDate(value)} {overdue(row) && <Tag color="error">超期</Tag>}</> }, ...auditColumns];
    const ledgerColumns: TableColumnsType<Summary> = [titleColumn, { title: '单号', dataIndex: 'id' }, { title: '申请人', dataIndex: 'applicant' },
        { title: '提交部门', dataIndex: 'departmentName' }, { title: '报销金额', dataIndex: 'amount', align: 'right', render: formatMoney }, statusColumn,
        { title: '提交日期', dataIndex: 'submittedAt', render: formatDate }, { title: '付款日期', dataIndex: 'paidOn', render: formatDate },
        ...auditColumns];

    return <>
        {section === 'home' && <>
            <PageHeading title="工作台" description="查看待办、申请进度和站内消息。" />
            {!!user.employeeId && <div className="quick-actions" aria-label="发起申请">{kinds.map(item => <button key={item.value} onClick={() => setEditor({ kind: item.value })}>
                <span className="quick-icon" aria-hidden>＋</span><span>{item.label}申请</span></button>)}</div>}
            <div className="home-grid">
                <section className="surface">
                    <div className="section-heading"><h2>待我审批</h2><Button type="link" onClick={() => navigate('inbox')}>查看待办</Button></div>
                    <ResourceState {...inbox} retry={inbox.reload}>
                        {inbox.data?.length ? <ul className="work-list">{inbox.data.slice(0, 6).map(item => <li key={item.id}>
                            <button onClick={() => setSelected(item.id)}><strong>{item.title}</strong><small>{item.applicant}　{formatDate(item.dueAt)}</small></button>
                            {overdue(item) && <Tag color="error">超期</Tag>}</li>)}</ul> : <EmptyState text="当前没有待审批的申请" />}
                    </ResourceState>
                </section>
                <section className="surface">
                    <div className="section-heading"><h2>站内消息</h2>{!!notices.data?.filter(item => !item.readAt).length && <Tag color="processing">{notices.data.filter(item => !item.readAt).length} 条未读</Tag>}</div>
                    <ResourceState {...notices} retry={notices.reload}>
                        {notices.data?.length ? <ul className="work-list notice-list">{notices.data.map(item => <li key={item.id}>
                            <button onClick={async () => {
                                setSelected(item.documentId);
                                if (!item.readAt) try { await api(`/notifications/${item.id}/read`, { method: 'POST' }); notices.reload(); }
                                catch (error) { message.error(showError(error)); }
                            }}><strong>{!item.readAt && <i aria-label="未读" />}{item.message}</strong><small>{formatDate(item.createdAt)}</small></button>
                        </li>)}</ul> : <EmptyState text="暂无站内消息" />}
                    </ResourceState>
                </section>
            </div>
            <section className="surface recent"><div className="section-heading"><h2>最近申请</h2><Button type="link" onClick={() => navigate('requests')}>查看我的申请</Button></div>
                <ResourceState {...own} retry={own.reload}><Table rowKey="id" columns={ownColumns} dataSource={own.data?.slice(0, 5)} pagination={false} scroll={{ x: 900 }} /></ResourceState>
            </section>
        </>}
        {section === 'requests' && <>
            <PageHeading title="我的申请" action={!!user.employeeId && <Dropdown menu={{ items: kinds.map(item => ({ key: item.value, label: `${item.label}申请`,
                onClick: () => setEditor({ kind: item.value }) })) }} trigger={['click']}><Button type="primary">新建申请</Button></Dropdown>} />
            <section className="surface"><div className="toolbar filter-bar">
                <Select allowClear value={kind} placeholder="全部类型" onChange={setKind} options={kinds} aria-label="申请类型" />
                <Select allowClear value={status} placeholder="全部状态" onChange={setStatus} options={Object.entries(statusLabel).map(([value, label]) => ({ value, label }))} aria-label="申请状态" />
            </div><ResourceState {...own} retry={own.reload}><Table rowKey="id" columns={ownColumns} scroll={{ x: 900 }}
                dataSource={own.data?.filter(row => (!kind || row.kind === kind) && (!status || row.status === status))} /></ResourceState></section>
        </>}
        {section === 'inbox' && <>
            <PageHeading title="审批待办" description="按截止时间查看当前待处理的申请。" />
            <section className="surface">{user.roles?.includes('ADMIN') && <div className="toolbar filter-bar">
                <Switch id="all-inbox" checked={allInbox} onChange={setAllInbox} /><label htmlFor="all-inbox">查看全部待办</label>
            </div>}<ResourceState {...inbox} retry={inbox.reload}><Table rowKey="id" columns={inboxColumns} dataSource={inbox.data} scroll={{ x: 980 }} /></ResourceState></section>
        </>}
        {section === 'ledger' && <>
            <PageHeading title="费用台账" description="按提交日期和部门核对报销申请及付款记录。" action={<Button loading={exporting} onClick={async () => {
                setExporting(true);
                try { await download(`/expenses/export?${filter}`, '报销台账.xlsx'); }
                catch (error) { message.error(showError(error)); }
                finally { setExporting(false); }
            }}>导出 Excel</Button>} />
            <section className="surface"><div className="toolbar filter-bar">
                <Select allowClear value={department} onChange={setDepartment} placeholder="全部部门" aria-label="提交部门"
                    options={departments.data?.map(item => ({ value: item.id, label: item.name }))} />
                <Select allowClear value={status} onChange={setStatus} placeholder="全部状态" aria-label="报销状态"
                    options={Object.entries(statusLabel).filter(([value]) => !['DRAFT', 'APPROVED'].includes(value)).map(([value, label]) => ({ value, label }))} />
                <label className="inline-date">从 <DateField value={from} onChange={setFrom}
                    disabledDate={date => !!to && date.isAfter(to, 'day')} /></label>
                <label className="inline-date">至 <DateField value={to} onChange={setTo}
                    disabledDate={date => !!from && date.isBefore(from, 'day')} /></label>
            </div><ResourceState {...ledger} retry={ledger.reload}><Table rowKey="id" columns={ledgerColumns} dataSource={ledger.data} scroll={{ x: 850 }} /></ResourceState></section>
        </>}
        {selected !== undefined && <DocumentDetail key={selected} id={selected} user={user} close={() => setSelected(undefined)} refresh={reload}
            edit={detail => { if (detail.summary?.kind) { setEditor({ kind: detail.summary.kind, existing: detail }); setSelected(undefined); } }} />}
        {editor && <DraftEditor {...editor} close={() => setEditor(undefined)} saved={id => { setEditor(undefined); reload(); setSelected(id); }} />}
    </>;
}
