import {
    CalendarOutlined, CheckCircleOutlined, ClockCircleOutlined, FileTextOutlined, MoneyCollectOutlined,
    RollbackOutlined, SendOutlined, ShoppingOutlined,
} from '@ant-design/icons';
import { App, Button, Dropdown, Select, Switch, Table, Tag, Tooltip } from 'antd';
import type { TableColumnsType } from 'antd';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { download, showError } from '../api';
import type { Model } from '../api';
import { SearchBox } from '../SearchBox';
import { DocumentTag, EllipsisText, EmptyState, PageHeading, ResourceState, listPagination, useClippedText } from '../common';
import { inDateRange, matchesKeyword } from '../filter';
import { DateField } from '../dates';
import { formatDate, formatMoney, kindLabel, kinds, statusLabel } from '../format';
import type { DocumentStatus, Kind } from '../format';
import type { Section } from '../navigation';
import { DepartmentPicker } from '../people/DepartmentPicker';
import { EmployeeCardAvatar } from '../people/EmployeeCard';
import { useResource } from '../useResource';
import { NoticeItem } from '../notifications/NoticeItem';
import { useNoticeOpener } from '../notifications/useNoticeOpener';
import { useDocumentViewer } from './useDocumentViewer';
import { LedgerDashboard } from './LedgerDashboard';

type Summary = Model<'Summary'>;

/** 申请标题链接：内容被截断时悬停出气泡，否则悬停无气泡。 */
function TitleLink({ title, onOpen }: { title?: string; onOpen: () => void }) {
    const { ref, clipped } = useClippedText<HTMLButtonElement | HTMLAnchorElement>();
    return <Tooltip title={clipped ? title : undefined} placement="topLeft">
        <Button ref={ref} type="link" className="table-link table-title" onClick={onOpen}>{title ?? '—'}</Button>
    </Tooltip>;
}

const quickActionMeta: Record<Kind, { description: string; icon: ReactNode }> = {
    LEAVE: { description: '休假与调休', icon: <CalendarOutlined /> },
    TRIP: { description: '出差行程', icon: <SendOutlined /> },
    PURCHASE: { description: '采购需求', icon: <ShoppingOutlined /> },
    EXPENSE: { description: '费用与发票', icon: <FileTextOutlined /> },
};
type InboxRow = {
    key: string;
    documentId: number;
    documentNo?: string;
    title?: string;
    kind?: Kind;
    status?: DocumentStatus;
    applicant?: string;
    applicantEmployeeId?: number;
    applicantAvatarKey?: string;
    pending: boolean;
    assignee?: string;
    assigneeEmployeeId?: number;
    assigneeAvatarKey?: string;
    alternate?: string;
    alternateEmployeeId?: number;
    alternateAvatarKey?: string;
    dueAt?: string;
    createdAt?: string;
    updatedAt?: string;
    operator?: string;
    operatorEmployeeId?: number;
    operatorAvatarKey?: string;
    action?: string;
    comment?: string;
    handledAt?: string;
};

function PersonCell({ people }: { people: { name?: string; employeeId?: number; avatarKey?: string }[] }) {
    const visible = people.filter(person => person.name);
    if (!visible.length) return '—';
    return <span className="list-people">{visible.map((person, index) =>
        <span className="list-person" key={`${person.name}-${index}`}>
            {index > 0 && <span className="list-person-sep">/</span>}
            <EmployeeCardAvatar name={person.name} employeeId={person.employeeId} avatarKey={person.avatarKey} size={32} />
            <span className="list-person-name" title={person.name}>{person.name}</span>
        </span>)}</span>;
}

export function DocumentWorkspace({ user, section, navigate, liveTick, onNoticeRead }: {
    user: Model<'CurrentUser'>; section: Section; navigate: (section: Section) => void;
    liveTick: number; onNoticeRead?: () => void;
}) {
    const { message } = App.useApp();
    const [allInbox, setAllInbox] = useState(false);
    const [kind, setKind] = useState<Kind>();
    const [status, setStatus] = useState<DocumentStatus>();
    const [department, setDepartment] = useState<number>();
    const [from, setFrom] = useState<string>();
    const [to, setTo] = useState<string>();
    const [exporting, setExporting] = useState(false);
    const [ledgerSearch, setLedgerSearch] = useState('');
    const [ownSearch, setOwnSearch] = useState('');
    const [ownFrom, setOwnFrom] = useState<string>();
    const [ownTo, setOwnTo] = useState<string>();
    const [inboxKind, setInboxKind] = useState<Kind>();
    const [inboxStatus, setInboxStatus] = useState<DocumentStatus>();
    const [inboxSearch, setInboxSearch] = useState('');
    const [overdueOnly, setOverdueOnly] = useState(false);
    const own = useResource<Summary[]>(section === 'home' || section === 'requests' ? '/documents' : null, section, liveTick);
    const inbox = useResource<Summary[]>(section === 'home' || section === 'inbox' ? `/inbox?all=${section === 'inbox' && allInbox}` : null, section, liveTick);
    const handled = useResource<Model<'Handled'>[]>(section === 'inbox' ? '/inbox/handled' : null, section, liveTick);
    const notices = useResource<Model<'Notice'>[]>(section === 'home' ? '/notifications' : null, liveTick);
    const unreadNotices = notices.data?.filter(notice => !notice.readAt).slice(0, 5);
    const departments = useResource<Model<'Department'>[]>(section === 'ledger' ? '/people/departments' : null);
    const filter = new URLSearchParams();
    if (section === 'ledger' && status) filter.set('status', status);
    if (department) filter.set('departmentId', String(department));
    if (from) filter.set('from', from);
    if (to) filter.set('to', to);
    const ledger = useResource<Summary[]>(section === 'ledger' ? `/expenses/ledger?${filter}` : null, liveTick);
    const ledgerRows = ledger.data?.filter(row => matchesKeyword([row.title, row.applicant, row.departmentName, row.documentNo], ledgerSearch));
    const ledgerList = ledgerRows ?? [];
    const ledgerSum = (rows: Summary[]) => rows.reduce((total, row) => total + Number(row.amount ?? 0), 0);
    const inReview = ledgerList.filter(row => row.status === 'IN_REVIEW');
    const awaitingPayment = ledgerList.filter(row => row.status === 'AWAITING_PAYMENT');
    const paid = ledgerList.filter(row => row.status === 'PAID');
    const returned = ledgerList.filter(row => row.status === 'RETURNED');
    const overdue = (row: { dueAt?: string }) => !!row.dueAt && new Date(row.dueAt).getTime() < Date.now();
    const ownRows = own.data?.filter(row => (!kind || row.kind === kind) && (!status || row.status === status)
        && inDateRange(row.createdAt, ownFrom, ownTo) && matchesKeyword([row.title, row.applicant, row.documentNo], ownSearch));
    const inboxRows = inbox.data?.filter(row => (!inboxKind || row.kind === inboxKind) && (!inboxStatus || row.status === inboxStatus)
        && (!overdueOnly || overdue(row)) && matchesKeyword([row.title, row.applicant, row.documentNo], inboxSearch));
    const handledRows = handled.data?.filter(row => (!inboxKind || row.kind === inboxKind)
        && (!inboxStatus || row.status === inboxStatus) && !overdueOnly
        && matchesKeyword([row.title, row.applicant, row.documentNo], inboxSearch));
    const inboxList: InboxRow[] = (inboxRows ?? []).map(row => ({
        key: `pending-${row.id}`, documentId: row.id ?? 0, documentNo: row.documentNo, title: row.title, kind: row.kind,
        status: row.status, applicant: row.applicant, applicantEmployeeId: row.applicantEmployeeId,
        applicantAvatarKey: row.applicantAvatarKey, pending: true,
        assignee: row.assignee, assigneeEmployeeId: row.assigneeEmployeeId, assigneeAvatarKey: row.assigneeAvatarKey,
        alternate: row.alternate, alternateEmployeeId: row.alternateEmployeeId, alternateAvatarKey: row.alternateAvatarKey,
        dueAt: row.dueAt, createdAt: row.createdAt, updatedAt: row.updatedAt,
        operator: row.operator, operatorEmployeeId: row.operatorEmployeeId, operatorAvatarKey: row.operatorAvatarKey,
    }));
    const handledList: InboxRow[] = (handledRows ?? []).map(row => ({
        key: `handled-${row.id}`, documentId: row.documentId ?? 0, documentNo: row.documentNo, title: row.title,
        kind: row.kind, status: row.status, applicant: row.applicant, applicantEmployeeId: row.applicantEmployeeId,
        applicantAvatarKey: row.applicantAvatarKey,
        pending: false, action: row.action, comment: row.comment, handledAt: row.handledAt,
        createdAt: row.createdAt, updatedAt: row.updatedAt, operator: row.operator, operatorEmployeeId: row.operatorEmployeeId,
        operatorAvatarKey: row.operatorAvatarKey,
    }));
    const inboxListRows = [...inboxList, ...handledList];

    function reload() { own.reload(); inbox.reload(); handled.reload(); notices.reload(); ledger.reload(); }
    const { open, create, viewer } = useDocumentViewer(user, reload);
    const openNotice = useNoticeOpener({ reload: notices.reload, onRead: onNoticeRead, open });

    const titleColumn: TableColumnsType<Summary>[number] = { title: '申请标题', dataIndex: 'title',
        ellipsis: { showTitle: false }, render: (title: string, row) =>
        <TitleLink title={title} onOpen={() => open(row.id)} /> };
    const kindColumn: TableColumnsType<Summary>[number] = { title: '类型', dataIndex: 'kind', width: 76, render: (value: Kind) => kindLabel[value] };
    const documentNoColumn: TableColumnsType<Summary>[number] = { title: '单号', dataIndex: 'documentNo', width: 130 };
    const statusColumn: TableColumnsType<Summary>[number] = { title: '状态', dataIndex: 'status', width: 88, render: (value: DocumentStatus) => <DocumentTag status={value} /> };
    const auditColumns: TableColumnsType<Summary> = [
        { title: '创建时间', dataIndex: 'createdAt', width: 150, ellipsis: { showTitle: false }, render: formatDate },
        { title: '编辑时间', dataIndex: 'updatedAt', width: 150, ellipsis: { showTitle: false }, render: formatDate },
        { title: '最近操作人', dataIndex: 'operator', width: 120, ellipsis: true, render: (_, row) =>
            <PersonCell people={[{ name: row.operator, employeeId: row.operatorEmployeeId, avatarKey: row.operatorAvatarKey }]} /> }];
    const handler = (row: Summary) => {
        if (row.status === 'AWAITING_PAYMENT') return '待登记付款';
        return <PersonCell people={[
            { name: row.assignee, employeeId: row.assigneeEmployeeId, avatarKey: row.assigneeAvatarKey },
            { name: row.alternate, employeeId: row.alternateEmployeeId, avatarKey: row.alternateAvatarKey },
        ]} />;
    };
    const ownColumns: TableColumnsType<Summary> = [documentNoColumn, titleColumn, kindColumn, statusColumn,
        { title: '当前处理人', dataIndex: 'assignee', width: 130, render: (_, row) => handler(row) }, ...auditColumns];
    const inboxColumns: TableColumnsType<InboxRow> = [
        { title: '单号', dataIndex: 'documentNo', width: 130 },
        { title: '申请标题', dataIndex: 'title', ellipsis: { showTitle: false },
            render: (title: string | undefined, row) => <TitleLink title={title} onOpen={() => open(row.documentId)} /> },
        { title: '类型', dataIndex: 'kind', width: 76, render: (value?: Kind) => value ? kindLabel[value] : '—' },
        { title: '申请人', dataIndex: 'applicant', width: 110, render: (_, row) =>
            <PersonCell people={[{ name: row.applicant, employeeId: row.applicantEmployeeId, avatarKey: row.applicantAvatarKey }]} /> },
        { title: '状态', dataIndex: 'status', width: 88, render: (value?: DocumentStatus) => <DocumentTag status={value} /> },
        { title: '处理结果', width: 88, render: (_, row) => row.pending ? <Tag color="processing">待处理</Tag>
            : row.action === 'APPROVE' ? <Tag color="success">通过</Tag> : <Tag color="error">驳回</Tag> },
        { title: '处理人', width: 128, render: (_, row) => row.pending
            ? (row.status === 'AWAITING_PAYMENT' ? '待登记付款' : <PersonCell people={[
                { name: row.assignee, employeeId: row.assigneeEmployeeId, avatarKey: row.assigneeAvatarKey },
                { name: row.alternate, employeeId: row.alternateEmployeeId, avatarKey: row.alternateAvatarKey }]} />)
            : <PersonCell people={[{ name: user.name, employeeId: user.employeeId, avatarKey: user.avatarKey }]} /> },
        { title: '截止 / 处理时间', width: 175, ellipsis: { showTitle: false }, render: (_, row) => row.pending
            ? (row.dueAt ? <>{formatDate(row.dueAt)} {overdue(row) && <Tag color="error">超期</Tag>}</> : '—')
            : (row.handledAt ? formatDate(row.handledAt) : '—') },
        { title: '审批意见', dataIndex: 'comment', ellipsis: true, render: (value?: string) => <EllipsisText text={value} /> },
        { title: '最近操作人', dataIndex: 'operator', width: 116, render: (_, row) =>
            <PersonCell people={[{ name: row.operator, employeeId: row.operatorEmployeeId, avatarKey: row.operatorAvatarKey }]} /> },
    ];
    const ledgerColumns: TableColumnsType<Summary> = [documentNoColumn, titleColumn, { title: '申请人', dataIndex: 'applicant', width: 96 },
        { title: '提交部门', dataIndex: 'departmentName', ellipsis: true, render: (value?: string) => <EllipsisText text={value} /> }, { title: '报销金额', dataIndex: 'amount', width: 104, align: 'right', render: formatMoney }, statusColumn,
        { title: '提交日期', dataIndex: 'submittedAt', width: 150, ellipsis: { showTitle: false }, render: formatDate },
        { title: '付款日期', dataIndex: 'paidOn', width: 150, ellipsis: { showTitle: false }, render: formatDate },
        ...auditColumns];

    return <>
        {section === 'home' && <>
            <PageHeading title="工作台" description="查看待办、申请进度和站内消息。" />
            {!!user.employeeId && <div className="quick-actions" aria-label="发起申请">{kinds.map(item => {
                const meta = quickActionMeta[item.value];
                return <button key={item.value} onClick={() => create(item.value)}>
                    <span className="quick-action-icon" aria-hidden>{meta.icon}</span>
                    <span className="quick-action-copy"><strong>{item.label}申请</strong><small>{meta.description}</small></span>
                </button>;
            })}</div>}
            <div className="home-grid">
                <section className="surface">
                    <div className="section-heading"><h2>我的待办</h2><Button type="link" onClick={() => navigate('inbox')}>查看待办</Button></div>
                    <ResourceState {...inbox} retry={inbox.reload}>
                        {inbox.data?.length ? <ul className="work-list">{inbox.data.slice(0, 5).map(item => <li key={item.id}>
                            <EmployeeCardAvatar name={item.applicant} employeeId={item.applicantEmployeeId}
                                avatarKey={item.applicantAvatarKey} size={30} />
                            <button className="work-open" onClick={() => open(item.id)}>
                                <span className="work-copy"><strong>{item.title}</strong><small>{item.applicant}　
                                    {item.status === 'AWAITING_PAYMENT' ? '待付款' : formatDate(item.dueAt)}</small></span>
                            </button>
                            {overdue(item) && <Tag color="error">超期</Tag>}</li>)}</ul> : <EmptyState text="当前没有待办事项" />}
                    </ResourceState>
                </section>
                <section className="surface">
                    <div className="section-heading"><h2>未读消息</h2>
                        <Button type="link" onClick={() => navigate('messages')}>查看全部</Button></div>
                    <ResourceState {...notices} retry={notices.reload}>
                        {unreadNotices?.length
                            ? <ul className="notice-list">{unreadNotices.map(notice =>
                                <NoticeItem key={notice.id} notice={notice} onOpen={openNotice} />)}</ul>
                            : <EmptyState text="暂无未读消息" />}
                    </ResourceState>
                </section>
            </div>
            <section className="surface recent"><div className="section-heading"><h2>最近申请</h2><Button type="link" onClick={() => navigate('requests')}>查看我的申请</Button></div>
                <ResourceState {...own} retry={own.reload}><Table rowKey="id" columns={ownColumns} dataSource={own.data?.slice(0, 5)} pagination={false} /></ResourceState>
            </section>
        </>}
        {section === 'requests' && <>
            <PageHeading title="我的申请" />
            <section className="surface"><div className="toolbar filter-bar">
                <Select allowClear value={kind} placeholder="全部类型" onChange={setKind} options={kinds} aria-label="申请类型" />
                <Select allowClear value={status} placeholder="全部状态" onChange={setStatus} options={Object.entries(statusLabel).map(([value, label]) => ({ value, label }))} aria-label="申请状态" />
                <label className="inline-date">从 <DateField value={ownFrom} onChange={setOwnFrom}
                    disabledDate={date => !!ownTo && date.isAfter(ownTo, 'day')} /></label>
                <label className="inline-date">至 <DateField value={ownTo} onChange={setOwnTo}
                    disabledDate={date => !!ownFrom && date.isBefore(ownFrom, 'day')} /></label>
                <SearchBox value={ownSearch} onChange={setOwnSearch} onSearch={() => own.reload()}
                    placeholder="搜索标题、申请人或单号" ariaLabel="搜索我的申请" />
                {!!user.employeeId && <Dropdown menu={{ items: kinds.map(item => ({ key: item.value, label: `${item.label}申请`,
                    onClick: () => create(item.value) })) }} trigger={['click']}>
                    <Button type="primary" className="filter-bar-action">新建申请</Button>
                </Dropdown>}
            </div><ResourceState {...own} retry={own.reload}><Table rowKey="id" columns={ownColumns} pagination={listPagination}
                dataSource={ownRows} /></ResourceState></section>
        </>}
        {section === 'inbox' && <>
            <PageHeading title="我的待办" description="处理待审批、待付款的申请，并查看已处理记录。" />
            <section className="surface"><div className="toolbar filter-bar">
                <Select allowClear value={inboxKind} onChange={setInboxKind} placeholder="全部类型" options={kinds} aria-label="待办类型" />
                <Select allowClear value={inboxStatus} onChange={setInboxStatus} placeholder="全部状态" aria-label="待办状态"
                    options={Object.entries(statusLabel).map(([value, label]) => ({ value, label }))} />
                <label className="filter-switch"><Switch checked={overdueOnly} onChange={setOverdueOnly} aria-label="只看超期" />只看超期</label>
                {user.roles?.includes('ADMIN') && <label className="filter-switch">
                    <Switch checked={allInbox} onChange={setAllInbox} aria-label="查看全部待办" />查看全部待办</label>}
                <SearchBox value={inboxSearch} onChange={setInboxSearch} onSearch={() => { inbox.reload(); handled.reload(); }}
                    placeholder="搜索标题、申请人或单号" ariaLabel="搜索我的待办" />
            </div><ResourceState loading={inbox.loading || handled.loading} error={inbox.error || handled.error}
                retry={() => { inbox.reload(); handled.reload(); }}>
                <Table rowKey="key" columns={inboxColumns} dataSource={inboxListRows} pagination={listPagination} />
            </ResourceState></section>
        </>}
        {section === 'ledger' && <>
            <PageHeading title="费用台账" description="按提交日期和部门核对报销申请及付款记录。" />
            {!!ledger.data && <section className="ledger-stats" aria-label="台账汇总">
                <article className="ledger-stat">
                    <span className="ledger-stat-icon" aria-hidden><FileTextOutlined /></span>
                    <span className="ledger-stat-body">
                        <span className="ledger-stat-label">单据总数</span>
                        <strong className="ledger-stat-value">{ledgerList.length} 笔</strong>
                        <span className="ledger-stat-note">审批中 {inReview.length} 笔</span>
                    </span>
                </article>
                <article className="ledger-stat">
                    <span className="ledger-stat-icon" aria-hidden><MoneyCollectOutlined /></span>
                    <span className="ledger-stat-body">
                        <span className="ledger-stat-label">报销总额</span>
                        <strong className="ledger-stat-value">{formatMoney(ledgerSum(ledgerList))}</strong>
                        <span className="ledger-stat-note">{ledgerList.length} 笔已提交</span>
                    </span>
                </article>
                <article className="ledger-stat ledger-stat-pending">
                    <span className="ledger-stat-icon" aria-hidden><ClockCircleOutlined /></span>
                    <span className="ledger-stat-body">
                        <span className="ledger-stat-label">待付款</span>
                        <strong className="ledger-stat-value">{formatMoney(ledgerSum(awaitingPayment))}</strong>
                        <span className="ledger-stat-note">{awaitingPayment.length} 笔待登记</span>
                    </span>
                </article>
                <article className="ledger-stat">
                    <span className="ledger-stat-icon" aria-hidden><CheckCircleOutlined /></span>
                    <span className="ledger-stat-body">
                        <span className="ledger-stat-label">已付款</span>
                        <strong className="ledger-stat-value">{formatMoney(ledgerSum(paid))}</strong>
                        <span className="ledger-stat-note">{paid.length} 笔已结清</span>
                    </span>
                </article>
                <article className="ledger-stat ledger-stat-rejected">
                    <span className="ledger-stat-icon" aria-hidden><RollbackOutlined /></span>
                    <span className="ledger-stat-body">
                        <span className="ledger-stat-label">已驳回金额</span>
                        <strong className="ledger-stat-value">{formatMoney(ledgerSum(returned))}</strong>
                        <span className="ledger-stat-note">{returned.length} 笔已驳回</span>
                    </span>
                </article>
            </section>}
            {!!ledger.data && <LedgerDashboard rows={ledgerList} />}
            <section className="surface"><div className="toolbar filter-bar">
                <DepartmentPicker allowClear value={department} onChange={setDepartment} placeholder="全部部门" ariaLabel="提交部门"
                    departments={departments.data} />
                <Select allowClear value={status} onChange={setStatus} placeholder="全部状态" aria-label="报销状态"
                    options={Object.entries(statusLabel).filter(([value]) => !['DRAFT', 'APPROVED'].includes(value)).map(([value, label]) => ({ value, label }))} />
                <label className="inline-date">从 <DateField value={from} onChange={setFrom}
                    disabledDate={date => !!to && date.isAfter(to, 'day')} /></label>
                <label className="inline-date">至 <DateField value={to} onChange={setTo}
                    disabledDate={date => !!from && date.isBefore(from, 'day')} /></label>
                <SearchBox value={ledgerSearch} onChange={setLedgerSearch} onSearch={() => ledger.reload()}
                    placeholder="搜索标题、申请人或单号" ariaLabel="搜索报销单" />
                <Button className="filter-bar-action" loading={exporting} onClick={async () => {
                    setExporting(true);
                    try { await download(`/expenses/export?${filter}`, '报销台账.xlsx'); }
                    catch (error) { message.error(showError(error)); }
                    finally { setExporting(false); }
                }}>导出 Excel</Button>
            </div><ResourceState {...ledger} retry={ledger.reload}><Table rowKey="id" columns={ledgerColumns} dataSource={ledgerRows} pagination={listPagination} /></ResourceState></section>
        </>}
        {viewer}
    </>;
}