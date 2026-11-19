import { App, Button, Descriptions, Drawer, Form, Input, Modal, Select, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api, download, showError } from '../api';
import type { Model } from '../api';
import { DocumentTag, EllipsisText, ResourceState } from '../common';
import { DateField } from '../dates';
import { fileCategoryColor, fileCategoryLabel, formatDate, formatMoney, kindLabel } from '../format';
import { AttachmentPreview } from './AttachmentPreview';
import { AttachmentUpload } from './AttachmentUpload';
import { ApprovalProcess } from './ApprovalProcess';
import { useResource } from '../useResource';

export function DocumentDetail({ id, user, close, edit, refresh }: { id: number; user: Model<'CurrentUser'>; close: () => void;
    edit: (detail: Model<'Detail'>) => void; refresh: () => void }) {
    const { message } = App.useApp();
    const detail = useResource<Model<'Detail'>>(`/documents/${id}`);
    const [action, setAction] = useState<Model<'TaskInput'>['action'] | 'PAY'>();
    const [busy, setBusy] = useState(false);
    const [paymentFiles, setPaymentFiles] = useState<Model<'Attachment'>[]>([]);
    const [paymentFilesBusy, setPaymentFilesBusy] = useState(false);
    const [paymentFileError, setPaymentFileError] = useState('');
    const [previewFile, setPreviewFile] = useState<Model<'Attachment'>>();
    const [claiming, setClaiming] = useState(false);
    const claimRef = useRef(false);
    const summary = detail.data?.summary;
    const payee = detail.data?.payeeAccount;
    const hasBankInfo = !!payee && [payee.bankName, payee.bankCard, payee.cnapsCode].some(Boolean);
    const active = detail.data?.revisions?.[0]?.tasks?.find(task => task.status === 'ACTIVE');
    const canApprove = !!active && (active.assigneeId === user.id || active.alternateId === user.id);
    const canTransfer = !!active && user.roles?.includes('ADMIN');
    const canPay = summary?.status === 'AWAITING_PAYMENT' && user.roles?.includes('PAYER');
    const canEdit = detail.data?.ownerId === user.id && (summary?.status === 'DRAFT' || summary?.status === 'RETURNED');
    const assignees = useResource<Model<'AccountOption'>[]>(action === 'TRANSFER' ? '/approval/assignees' : null);
    const actionTitles = { APPROVE: '通过审批', RETURN: '驳回申请', TRANSFER: '转派审批', PAY: '登记付款' };

    function closeAction() {
        if (claimRef.current) {
            claimRef.current = false;
            api(`/documents/${id}/payment/claim`, { method: 'DELETE' }).catch(() => undefined);
        }
        setAction(undefined);
        setPaymentFiles([]);
        setPaymentFilesBusy(false);
        setPaymentFileError('');
    }

    /** 打开付款登记前先抢占，避免两位付款人同时填写；抢占失败直接提示是谁在处理。 */
    async function openPayment() {
        setClaiming(true);
        try {
            await api(`/documents/${id}/payment/claim`, { method: 'POST' });
            claimRef.current = true;
            setAction('PAY');
        } catch (error) {
            message.error(showError(error));
            detail.reload();
        } finally {
            setClaiming(false);
        }
    }

    useEffect(() => () => {
        if (claimRef.current) api(`/documents/${id}/payment/claim`, { method: 'DELETE' }).catch(() => undefined);
    }, [id]);

    function attachmentRow(file: Model<'Attachment'>) {
        return <div className="file-row attachment-row" key={file.id}>
            <span className="attachment-name">{file.originalName}
                {file.digest && <small title={file.digest}>SHA-256 {file.digest.slice(0, 12)}</small>}</span>
            {file.category && <Tag color={fileCategoryColor[file.category]}>{fileCategoryLabel[file.category]}</Tag>}
            <span className="attachment-actions">
                <Button type="link" className="table-link" onClick={() => setPreviewFile(file)}>预览</Button>
                <Button type="link" className="table-link" onClick={() =>
                    download(`/attachments/${file.id}`, file.originalName ?? '附件').catch(error => message.error(showError(error)))}>下载原件</Button>
            </span>
        </div>;
    }

    const meta: { key: string; label: string; children: ReactNode }[] = [];
    if (summary) {
        meta.push({ key: 'status', label: '状态', children: <DocumentTag status={summary.status} /> });
        if (summary.documentNo) meta.push({ key: 'no', label: '单号', children: summary.documentNo });
    if (summary.kind) meta.push({ key: 'kind', label: '类型', children: kindLabel[summary.kind] });
        meta.push({ key: 'author', label: '申请人', children: summary.applicant });
        if (summary.departmentName) meta.push({ key: 'dept', label: '提交部门', children: summary.departmentName });
        if (summary.assignee || summary.alternate) meta.push({ key: 'assignee', label: '当前处理人',
            children: [summary.assignee, summary.alternate].filter(Boolean).join(' / ') });
        if (summary.dueAt) meta.push({ key: 'due', label: '处理截止', children: formatDate(summary.dueAt) });
        if (summary.kind === 'EXPENSE') meta.push({ key: 'amount', label: '报销金额', children: formatMoney(summary.amount) });
    if (summary.kind === 'PURCHASE') meta.push({ key: 'amount', label: '采购金额', children: formatMoney(summary.amount) });
        if (detail.data?.payment) meta.push({ key: 'payment', label: '付款记录',
            children: detail.data.payment.paidOn });
    }

    return <><Drawer title={summary?.title ?? '申请详情'} open onClose={close} size="min(100vw, 740px)">
        <ResourceState {...detail} retry={detail.reload}>
            {summary && <Descriptions column={{ xs: 1, sm: 2 }} size="small" colon={false} items={meta} />}
            {detail.data?.revisions?.map((round, index, revisions) => {
                const revision = round.revision;
                const facts: { label: string; value: string }[] = [];
                if (revision?.leaveType) facts.push({ label: '请假类型', value: revision.leaveType });
                if (revision?.origin) facts.push({ label: '出发地点', value: revision.origin });
                if (revision?.destination) facts.push({ label: '出差地点', value: revision.destination });
                if (revision?.startsAt && revision.endsAt) facts.push({
                    label: summary?.kind === 'TRIP' ? '出差日期' : '请假日期',
                    value: `${formatDate(revision.startsAt)} 至 ${formatDate(revision.endsAt)}`,
                });
                if (summary?.kind === 'PURCHASE' && revision?.amount != null) facts.push({ label: '预计金额', value: formatMoney(revision.amount) });
                return <section className="detail-section" key={revision?.id}>
                    <div className="section-heading"><h3>{revision?.submittedAt ? `第 ${revisions.length - index} 次审批` : '当前草稿'}</h3>
                        {revision?.submittedAt && <span className="muted">{formatDate(revision.submittedAt)}</span>}</div>
                    <Descriptions className="detail-facts" bordered size="small" column={1} items={[
                        { key: 'reason', label: '申请事由',
                            children: <p className={revision?.reason ? 'detail-reason-text' : 'detail-reason-text muted'}>{revision?.reason || '未填写事由'}</p> },
                        ...facts.map(fact => ({ key: fact.label, label: fact.label, children: fact.value })),
                    ]} />
                    {!!round.lines?.length && <Table size="small" rowKey="id" pagination={false} dataSource={round.lines} columns={[
                        { title: '类别', dataIndex: 'category', width: 110 }, { title: '说明', dataIndex: 'description', ellipsis: true, render: (value?: string) => <EllipsisText text={value} /> }, { title: '日期', dataIndex: 'occurredOn', width: 120 },
                        { title: '金额', dataIndex: 'amount', width: 110, align: 'right', render: formatMoney },
                    ]} />}
                    {round.files?.map(file => attachmentRow(file))}
                    {revision?.submittedAt && <section className="process-block">
                        <h4 className="process-heading">审批记录</h4>
                        <ApprovalProcess summary={summary} round={round} latest={index === 0}
                            payment={index === 0 ? detail.data?.payment : undefined} />
                    </section>}
                    {index === 0 && !!detail.data?.paymentFiles?.length && <section className="process-block">
                        <h4 className="process-heading">付款附件</h4>
                        {detail.data.paymentFiles.map(file => attachmentRow(file))}
                    </section>}
                    {(canEdit || canApprove || canTransfer || canPay) && index === 0 && <div className="detail-round-actions">
                        {canTransfer && <Button color="orange" variant="solid" disabled={busy}
                            onClick={() => setAction('TRANSFER')}>转派</Button>}
                        {canEdit && <Button type="primary" onClick={() => detail.data && edit(detail.data)}>编辑申请</Button>}
                        {canApprove && <>
                            <Button disabled={busy} onClick={() => setAction('RETURN')}>驳回</Button>
                            <Button type="primary" disabled={busy} onClick={() => setAction('APPROVE')}>通过</Button>
                        </>}
                        {canPay && <Button type="primary" disabled={busy || claiming} loading={claiming}
                        onClick={() => void openPayment()}>登记付款</Button>}
                    </div>}
                </section>;
            })}
        </ResourceState>
    </Drawer>
    {action && <Modal open centered title={actionTitles[action]} onCancel={closeAction} okText={actionTitles[action]}
        width={action === 'PAY' ? 560 : undefined}
        okButtonProps={{ form: 'document-action', htmlType: 'submit', loading: busy, disabled: paymentFilesBusy }}>
        <Form id="document-action" layout="vertical" onFinish={async (values: Model<'TaskInput'> & Model<'PaymentInput'>) => {
            if (action === 'PAY' && paymentFiles.length === 0) {
                setPaymentFileError('请上传付款附件');
                return;
            }
            setBusy(true);
            try {
                if (action === 'PAY') await api(`/documents/${id}/payment`, { method: 'POST',
                    body: { ...values, fileIds: paymentFiles.flatMap(file => file.id ?? []) } });
                else await api(`/documents/${id}/tasks/${active?.id}`, { method: 'POST', body: { ...values, action } });
                message.success(actionTitles[action] + '成功');
                closeAction();
                detail.reload();
                refresh();
                window.dispatchEvent(new Event('workflow-changed'));
            } catch (error) { message.error(showError(error)); }
            finally { setBusy(false); }
        }}>
            {action === 'PAY' ? <>
                {summary?.kind === 'EXPENSE' && <section className="payment-account" aria-label="申请人收款账户">
                    {hasBankInfo ? <dl className="payment-account-list">
                        <div className="payment-account-row"><dt>开户行</dt><dd>{payee?.bankName || '—'}</dd></div>
                        <div className="payment-account-row"><dt>银行账号</dt>
                            <dd className="payment-account-number">{payee?.bankCard?.replace(/(.{4})/g, '$1 ').trim() || '—'}</dd></div>
                        <div className="payment-account-row is-paired">
                            <dt>收款人</dt><dd>{payee?.name || summary?.applicant || '—'}</dd>
                            <dt>联行号</dt><dd>{payee?.cnapsCode || '—'}</dd>
                        </div>
                    </dl> : <p className="payment-account-empty">申请人尚未填写银行账户信息</p>}
                </section>}
                <Form.Item name="paidOn" label="实际付款日期" rules={[{ required: true }]}>
                    <DateField className="wide-input" disabledDate={date => date.isAfter(dayjs(), 'day')} />
                </Form.Item>
                <Form.Item className="payment-attachments" required validateStatus={paymentFileError ? 'error' : undefined}
                    label={<span>付款附件 <span className="form-label-note">作为付款凭证</span></span>}
                    help={paymentFileError || undefined}>
                    <AttachmentUpload files={paymentFiles} onChange={next => { setPaymentFiles(next); setPaymentFileError(''); }}
                        category="PAYMENT" showHint={false} disabled={busy} onBusyChange={setPaymentFilesBusy} />
                </Form.Item>
            </> : <>{action === 'TRANSFER' && <Form.Item name="assigneeId" label="新审批人" rules={[{ required: true }]}><Select options={assignees.data?.filter(item => item.id !== active?.assigneeId)
                .map(item => ({ value: item.id, label: item.name ?? item.username }))} /></Form.Item>}
                <Form.Item name="comment" label={action === 'APPROVE' ? '审批意见' : '原因'} rules={[
                    { required: true, whitespace: true, message: action === 'APPROVE' ? '请填写审批意见' : '请填写原因' },
                ]}><Input.TextArea rows={3} maxLength={800} /></Form.Item></>}
        </Form>
    </Modal>}
    <AttachmentPreview file={previewFile} close={() => setPreviewFile(undefined)} />
    </>;
}