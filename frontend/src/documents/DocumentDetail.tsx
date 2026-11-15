import { App, Button, Descriptions, Drawer, Form, Input, Modal, Select, Table } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { api, download, showError } from '../api';
import type { Model } from '../api';
import { DocumentTag, ResourceState } from '../common';
import { DateField } from '../dates';
import { formatDate, formatMoney, kindLabel } from '../format';
import { ApprovalProcess } from './ApprovalProcess';
import { useResource } from '../useResource';

export function DocumentDetail({ id, user, close, edit, refresh }: { id: number; user: Model<'CurrentUser'>; close: () => void;
    edit: (detail: Model<'Detail'>) => void; refresh: () => void }) {
    const { message } = App.useApp();
    const detail = useResource<Model<'Detail'>>(`/documents/${id}`);
    const [action, setAction] = useState<Model<'TaskInput'>['action'] | 'PAY'>();
    const [busy, setBusy] = useState(false);
    const summary = detail.data?.summary;
    const active = detail.data?.revisions?.[0]?.tasks?.find(task => task.status === 'ACTIVE');
    const canApprove = !!active && active.assigneeId === user.id;
    const canTransfer = !!active && user.roles?.includes('ADMIN');
    const canPay = summary?.status === 'AWAITING_PAYMENT' && user.roles?.includes('PAYER');
    const canEdit = detail.data?.ownerId === user.id && (summary?.status === 'DRAFT' || summary?.status === 'RETURNED');
    const assignees = useResource<Model<'AccountOption'>[]>(action === 'TRANSFER' ? '/approval/assignees' : null);
    const actionTitles = { APPROVE: '通过审批', RETURN: '退回申请', TRANSFER: '转派审批', PAY: '登记付款' };

    return <><Drawer title={summary?.title ?? '申请详情'} open onClose={close} size="min(100vw, 740px)">
        <div className="toolbar detail-actions">
        {canEdit && <Button onClick={() => detail.data && edit(detail.data)}>编辑申请</Button>}
        {canApprove && <><Button onClick={() => setAction('RETURN')}>退回</Button><Button type="primary" onClick={() => setAction('APPROVE')}>通过</Button></>}
        {canTransfer && <Button onClick={() => setAction('TRANSFER')}>转派</Button>}
        {canPay && <Button type="primary" onClick={() => setAction('PAY')}>登记付款</Button>}
        </div>
        <ResourceState {...detail} retry={detail.reload}>
            {summary && <Descriptions column={{ xs: 1, sm: 2 }} size="small" items={[
                { key: 'status', label: '状态', children: <DocumentTag status={summary.status} /> },
                { key: 'kind', label: '类型', children: summary.kind && kindLabel[summary.kind] },
                { key: 'author', label: '申请人', children: summary.applicant },
                { key: 'dept', label: '提交部门', children: summary.departmentName ?? '—' },
                { key: 'assignee', label: '当前处理人', children: summary.assignee ?? '—' },
                { key: 'due', label: '处理截止', children: formatDate(summary.dueAt) },
                { key: 'amount', label: '金额', children: formatMoney(summary.amount) },
                { key: 'payment', label: '付款记录', children: detail.data?.payment ? `${detail.data.payment.paidOn} · ${detail.data.payment.reference}` : '—' },
            ]} />}
            {detail.data?.revisions?.map((round, index, revisions) => <section className="detail-section" key={round.revision?.id}>
                <div className="section-heading"><h3>{round.revision?.submittedAt ? `第 ${revisions.length - index} 轮审批` : '当前草稿'}</h3>
                    <span className="muted">{formatDate(round.revision?.submittedAt)}</span></div>
                <p className="prose">{round.revision?.reason || '未填写事由'}</p>
                {round.revision?.leaveType && <p>请假类型　{round.revision.leaveType}</p>}
                {round.revision?.destination && <p>出差地点　{round.revision.destination}</p>}
                {round.revision?.startsAt && <p>{formatDate(round.revision.startsAt)} 至 {formatDate(round.revision.endsAt)}</p>}
                {!!round.lines?.length && <Table size="small" rowKey="id" pagination={false} scroll={{ x: 400 }} dataSource={round.lines} columns={[
                    { title: '类别', dataIndex: 'category' }, { title: '说明', dataIndex: 'description' }, { title: '日期', dataIndex: 'occurredOn' },
                    { title: '金额', dataIndex: 'amount', render: formatMoney },
                ]} />}
                {round.files?.map(file => <div className="file-row" key={file.id}><span>{file.originalName}{file.invoiceKey && <small>票号 {file.invoiceKey}</small>}
                    {file.digest && <small title={file.digest}>SHA-256 {file.digest.slice(0, 12)}</small>}</span><Button type="link" onClick={() =>
                        download(`/attachments/${file.id}`, file.originalName ?? '附件').catch(error => message.error(showError(error)))}>下载原件</Button></div>)}
                {round.revision?.submittedAt && <section className="process-block">
                    <h4 className="process-heading">进程</h4>
                    <ApprovalProcess summary={summary} round={round} latest={index === 0}
                        payment={index === 0 ? detail.data?.payment : undefined} />
                </section>}
            </section>)}
        </ResourceState>
    </Drawer>
    {action && <Modal open title={actionTitles[action]} onCancel={() => setAction(undefined)} okText={actionTitles[action]}
        okButtonProps={{ form: 'document-action', htmlType: 'submit', loading: busy }}>
        <Form id="document-action" layout="vertical" onFinish={async (values: Model<'TaskInput'> & Model<'PaymentInput'>) => {
            setBusy(true);
            try {
                if (action === 'PAY') await api(`/documents/${id}/payment`, { method: 'POST', body: values });
                else await api(`/documents/${id}/tasks/${active?.id}`, { method: 'POST', body: { ...values, action } });
                message.success(actionTitles[action] + '成功');
                setAction(undefined);
                detail.reload();
                refresh();
            } catch (error) { message.error(showError(error)); }
            finally { setBusy(false); }
        }}>
            {action === 'PAY' ? <><Form.Item name="paidOn" label="实际付款日期" rules={[{ required: true }]}>
                    <DateField className="wide-input" disabledDate={date => date.isAfter(dayjs(), 'day')} />
                </Form.Item>
                <Form.Item name="reference" label="付款凭证或流水号" rules={[{ required: true }]}><Input maxLength={160} /></Form.Item>
            </> : <>{action === 'TRANSFER' && <Form.Item name="assigneeId" label="新审批人" rules={[{ required: true }]}><Select options={assignees.data?.filter(item => item.id !== active?.assigneeId)
                .map(item => ({ value: item.id, label: item.name ?? item.username }))} /></Form.Item>}
                <Form.Item name="comment" label={action === 'APPROVE' ? '审批意见' : '原因'} rules={[{ required: action !== 'APPROVE' }]}><Input.TextArea rows={3} maxLength={800} /></Form.Item></>}
        </Form>
    </Modal>}</>;
}
