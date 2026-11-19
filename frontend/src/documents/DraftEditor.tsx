import { App, Button, Form, Input, InputNumber, Modal, Select } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { api, showError } from '../api';
import type { Model } from '../api';
import { DateField } from '../dates';
import { formatMoney, kindLabel } from '../format';
import type { Kind } from '../format';
import { useResource } from '../useResource';
import { AttachmentUpload } from './AttachmentUpload';

export function DraftEditor({ kind, existing, close, saved }: { kind: Kind; existing?: Model<'Detail'>; close: () => void; saved: (id: number) => void }) {
    const { message } = App.useApp();
    const [form] = Form.useForm<Model<'Draft'>>();
    const [busy, setBusy] = useState(false);
    const [attachmentsBusy, setAttachmentsBusy] = useState(false);
    const revision = existing?.revisions?.[0];
    const [files, setFiles] = useState<Model<'Attachment'>[]>(revision?.files ?? []);
    const categories = useResource<Model<'Category'>[]>(kind === 'EXPENSE' ? '/expenses/categories' : null);
    const dateFields = kind === 'LEAVE' || kind === 'TRIP';
    const startsAt = Form.useWatch<string | undefined>('startsAt', form);
    const lines = Form.useWatch<Model<'Draft'>['lines']>('lines', form);
    const total = (lines ?? []).reduce((sum, line) => sum + Number(line?.amount ?? 0), 0);

    async function save(submit: boolean) {
        let values: Model<'Draft'>;
        try { values = await form.validateFields(); } catch { return; }
        if (submit) {
            const errors: { name: keyof Model<'Draft'>; errors: string[] }[] = [];
            if (kind === 'LEAVE' && !values.leaveType) errors.push({ name: 'leaveType', errors: ['请选择请假类型'] });
            if (kind === 'TRIP' && !values.origin?.trim()) errors.push({ name: 'origin', errors: ['请填写出发地点'] });
            if (kind === 'TRIP' && !values.destination?.trim()) errors.push({ name: 'destination', errors: ['请填写出差地点'] });
            if (dateFields) {
                if (!values.startsAt) errors.push({ name: 'startsAt', errors: ['请选择开始日期'] });
                if (!values.endsAt) errors.push({ name: 'endsAt', errors: ['请选择结束日期'] });
                if (values.startsAt && values.endsAt && dayjs(values.endsAt).isBefore(dayjs(values.startsAt), 'day')) {
                    errors.push({ name: 'endsAt', errors: ['结束日期不能早于开始日期'] });
                }
            }
            if (kind === 'PURCHASE' && !(values.amount && Number(values.amount) > 0)) errors.push({ name: 'amount', errors: ['请填写预计金额'] });
            if (!values.reason?.trim()) errors.push({ name: 'reason', errors: ['请填写申请事由'] });
            if (errors.length) { form.setFields(errors); return; }
        }
        if (submit && files.some(file => !file.category)) { message.error('请为每个附件选择类型'); return; }
        if (submit && kind === 'PURCHASE' && files.length === 0) { message.error('请上传采购附件'); return; }
        if (submit && kind === 'EXPENSE') {
            if (values.lines?.some(line => categories.data?.some(item => item.id === line.categoryId && item.active === false))) {
                message.error('费用类别已停用，请重新选择');
                return;
            }
            if (!files.some(file => file.category === 'INVOICE')) { message.error('请上传发票'); return; }
            if (!files.some(file => file.category === 'PAYMENT')) { message.error('请上传付款记录'); return; }
        }
        setBusy(true);
        let id = existing?.summary?.id;
        let stored = false;
        try {
            const detail = await api<Model<'Detail'>>(id ? `/documents/${id}` : '/documents', {
                method: id ? 'PUT' : 'POST', body: { ...values, kind, fileIds: files.flatMap(file => file.id ?? []) },
            });
            id = detail.summary?.id;
            if (!id) throw new Error('未收到单据编号');
            stored = true;
            if (submit) await api(`/documents/${id}/submit`, { method: 'POST' });
            message.success(submit ? '已提交审批' : '草稿已保存');
            saved(id);
        } catch (error) {
            message.error(showError(error));
            if (submit && stored && id) saved(id);
        } finally { setBusy(false); }
    }

    return <Modal open centered title={`${existing ? '编辑' : '新建'}${kindLabel[kind]}申请`} onCancel={close} width={740} mask={{ closable: false }}
        className="draft-editor-modal"
        footer={<><Button onClick={close}>取消</Button><Button loading={busy} disabled={attachmentsBusy} onClick={() => void save(false)}>保存草稿</Button>
            <Button type="primary" loading={busy} disabled={attachmentsBusy} onClick={() => void save(true)}>提交审批</Button></>}>
        <Form form={form} layout="vertical" initialValues={{ ...revision?.revision, lines: revision?.lines ?? [] }}>
            <Form.Item label="申请标题" name="title" rules={[{ required: true }]}><Input maxLength={160} placeholder={`填写${kindLabel[kind]}标题`} /></Form.Item>
            {kind === 'LEAVE' && <Form.Item label={<><span className="required-mark" aria-hidden>*</span>请假类型</>} name="leaveType"><Select options={['年假', '事假', '病假', '其他'].map(value => ({ value }))} /></Form.Item>}
            {kind === 'TRIP' && <div className="form-grid">
                <Form.Item label={<><span className="required-mark" aria-hidden>*</span>出发地点</>} name="origin"><Input maxLength={160} /></Form.Item>
                <Form.Item label={<><span className="required-mark" aria-hidden>*</span>出差地点</>} name="destination"><Input maxLength={160} /></Form.Item>
            </div>}
            {dateFields && <div className="form-grid"><Form.Item label={<><span className="required-mark" aria-hidden>*</span>开始日期</>} name="startsAt"><DateField className="wide-input" /></Form.Item>
                <Form.Item label={<><span className="required-mark" aria-hidden>*</span>结束日期</>} name="endsAt"><DateField className="wide-input"
                    disabledDate={date => !!startsAt && date.isBefore(dayjs(startsAt), 'day')} /></Form.Item></div>}
            {kind === 'PURCHASE' && <Form.Item label={<><span className="required-mark" aria-hidden>*</span>预计金额（元）</>} name="amount"><InputNumber min={0.01} precision={2} className="wide-input" /></Form.Item>}
            <Form.Item label={<><span className="required-mark" aria-hidden>*</span>申请事由</>} name="reason"><Input.TextArea rows={3} maxLength={2000} /></Form.Item>
            {kind === 'EXPENSE' && <Form.List name="lines">{(fields, { add, remove }) => <div className="form-section">
                <div className="section-heading"><h3><span className="required-mark" aria-hidden>*</span>费用明细</h3>
                    <div className="expense-detail-actions">
                        <span className="expense-total">合计 <strong>{formatMoney(total)}</strong></span>
                        <Button onClick={() => add()}>添加明细</Button>
                    </div></div>
                {fields.map(({ key, name }) => <div className="line-editor" key={key}>
                    <Form.Item label="费用类别" name={[name, 'categoryId']} rules={[{ required: true }]}><Select loading={categories.loading}
                        options={categories.data?.map(item => ({ value: item.id, label: item.active === false ? `${item.name}（已停用）` : item.name, disabled: item.active === false }))} /></Form.Item>
                    <Form.Item label="发生日期" name={[name, 'occurredOn']} rules={[{ required: true }]}><DateField className="wide-input" /></Form.Item>
                    <Form.Item label="金额（元）" name={[name, 'amount']} rules={[{ required: true }]}><InputNumber min={0.01} precision={2} className="wide-input" /></Form.Item>
                    <Form.Item label="费用说明" name={[name, 'description']} rules={[{ required: true }]}><Input maxLength={200} /></Form.Item>
                    <Button type="text" danger onClick={() => remove(name)} aria-label="删除费用明细">删除</Button>
                </div>)}
            </div>}</Form.List>}
        </Form>
        {(kind === 'PURCHASE' || kind === 'EXPENSE') && <div className="form-section">
            <h3><span className="required-mark" aria-hidden>*</span>{kind === 'EXPENSE' ? '报销附件' : '采购附件'}</h3>
            <AttachmentUpload files={files} onChange={setFiles} kind={kind === 'PURCHASE' ? 'PURCHASE' : 'EXPENSE'}
                disabled={busy} onBusyChange={setAttachmentsBusy} />
        </div>}
    </Modal>;
}
