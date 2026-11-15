import { App, Button, Form, Input, InputNumber, Modal, Select } from 'antd';
import { useState } from 'react';
import { api, showError } from '../api';
import type { Model } from '../api';
import { DateField, DateTimeField } from '../dates';
import { kindLabel } from '../format';
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

    async function save(submit: boolean) {
        let values: Model<'Draft'>;
        try { values = await form.validateFields(); } catch { return; }
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

    return <Modal open title={`${existing ? '编辑' : '新建'}${kindLabel[kind]}申请`} onCancel={close} width={740} mask={{ closable: false }}
        footer={<><Button onClick={close}>取消</Button><Button loading={busy} disabled={attachmentsBusy} onClick={() => void save(false)}>保存草稿</Button>
            <Button type="primary" loading={busy} disabled={attachmentsBusy} onClick={() => void save(true)}>提交审批</Button></>}>
        <Form form={form} layout="vertical" initialValues={{ ...revision?.revision, lines: revision?.lines ?? [] }} requiredMark={false}>
            <Form.Item label="申请标题" name="title" rules={[{ required: true }]}><Input maxLength={160} placeholder={`填写${kindLabel[kind]}标题`} /></Form.Item>
            {kind === 'LEAVE' && <Form.Item label="请假类型" name="leaveType"><Select options={['年假', '事假', '病假', '其他'].map(value => ({ value }))} /></Form.Item>}
            {kind === 'TRIP' && <Form.Item label="出差地点" name="destination"><Input maxLength={160} /></Form.Item>}
            {dateFields && <div className="form-grid"><Form.Item label="开始时间" name="startsAt"><DateTimeField className="wide-input" /></Form.Item>
                <Form.Item label="结束时间" name="endsAt"><DateTimeField className="wide-input" notBefore={startsAt} /></Form.Item></div>}
            {kind === 'PURCHASE' && <Form.Item label="预计金额（元）" name="amount"><InputNumber min={0.01} precision={2} className="wide-input" /></Form.Item>}
            <Form.Item label="申请事由" name="reason"><Input.TextArea rows={3} maxLength={2000} /></Form.Item>
            {kind === 'EXPENSE' && <Form.List name="lines">{(fields, { add, remove }) => <div className="form-section">
                <div className="section-heading"><h3>费用明细</h3><Button onClick={() => add()}>添加明细</Button></div>
                {fields.map(({ key, name }) => <div className="line-editor" key={key}>
                    <Form.Item label="费用类别" name={[name, 'categoryId']} rules={[{ required: true }]}><Select loading={categories.loading} options={categories.data?.map(item => ({ value: item.id, label: item.name }))} /></Form.Item>
                    <Form.Item label="发生日期" name={[name, 'occurredOn']} rules={[{ required: true }]}><DateField className="wide-input" /></Form.Item>
                    <Form.Item label="金额（元）" name={[name, 'amount']} rules={[{ required: true }]}><InputNumber min={0.01} precision={2} className="wide-input" /></Form.Item>
                    <Form.Item label="费用说明" name={[name, 'description']} rules={[{ required: true }]}><Input maxLength={200} /></Form.Item>
                    <Button type="text" danger onClick={() => remove(name)} aria-label="删除费用明细">删除</Button>
                </div>)}
            </div>}</Form.List>}
        </Form>
        {(kind === 'PURCHASE' || kind === 'EXPENSE') && <div className="form-section">
            <h3>{kind === 'EXPENSE' ? '原始票据' : '采购附件'}</h3>
            <AttachmentUpload files={files} onChange={setFiles} invoice={kind === 'EXPENSE'} disabled={busy} onBusyChange={setAttachmentsBusy} />
        </div>}
    </Modal>;
}
