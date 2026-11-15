import { FolderOutlined } from '@ant-design/icons';
import { App, Button, Input, Upload } from 'antd';
import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useState } from 'react';
import { api, showError } from '../api';
import type { Model } from '../api';

type Attachment = Model<'Attachment'>;

export function AttachmentUpload({ files, onChange, invoice, disabled, onBusyChange }: {
    files: Attachment[];
    onChange: Dispatch<SetStateAction<Attachment[]>>;
    invoice?: boolean;
    disabled?: boolean;
    onBusyChange: (busy: boolean) => void;
}) {
    const { message } = App.useApp();
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [syncing, setSyncing] = useState<Record<number, boolean>>({});
    const [drafts, setDrafts] = useState<Record<number, string>>({});
    const uploading = progress.total > 0;
    const busy = uploading || Object.keys(syncing).length > 0;

    useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);

    async function upload(batch: File[]) {
        if (!batch.length) return;
        setProgress({ done: 0, total: batch.length });
        try {
            for (const [index, file] of batch.entries()) {
                const body = new FormData();
                body.append('file', file);
                setProgress({ done: index + 1, total: batch.length });
                try {
                    const attachment = await api<Attachment>('/attachments', { method: 'POST', body });
                    onChange(current => [...current, attachment]);
                } catch (error) { message.error(`${file.name}：${showError(error)}`); }
            }
        } finally { setProgress({ done: 0, total: 0 }); }
    }

    function editInvoice(id: number, value: string) { setDrafts(current => ({ ...current, [id]: value })); }

    function forgetInvoice(id: number) {
        setDrafts(current => {
            if (!(id in current)) return current;
            const next = { ...current };
            delete next[id];
            return next;
        });
    }

    async function saveInvoice(file: Attachment) {
        const id = file.id;
        if (id === undefined || drafts[id] === undefined) return;
        setSyncing(current => ({ ...current, [id]: true }));
        try {
            const updated = await api<Attachment>(`/attachments/${id}`, { method: 'PATCH', body: { invoice: drafts[id] } });
            onChange(current => current.map(item => item.id === id ? updated : item));
            forgetInvoice(id);
        } catch (error) { message.error(showError(error)); }
        finally {
            setSyncing(current => {
                const next = { ...current };
                delete next[id];
                return next;
            });
        }
    }

    function remove(file: Attachment) {
        onChange(current => current.filter(item => item.id !== file.id));
        if (file.id !== undefined) forgetInvoice(file.id);
    }

    return <div className="attachment-upload">
        <Upload.Dragger className="attachment-dropzone" multiple showUploadList={false} disabled={disabled || uploading}
            beforeUpload={(file, batch) => {
                if (batch[0] === file) void upload(batch);
                return Upload.LIST_IGNORE;
            }}>
            <div className="upload-zone">
                <span className="upload-zone-icon" aria-hidden><FolderOutlined /></span>
                <span className="upload-zone-title">点击或拖拽文件到此区域上传</span>
                <span className="upload-zone-hint" aria-live="polite">
                    {uploading ? `正在上传 ${progress.done}/${progress.total}…` : '支持一次选择多个文件，单个不超过 15MB'}
                </span>
            </div>
        </Upload.Dragger>
        {files.map((file, index) => {
            const id = file.id;
            return <div className="file-row attachment-row" key={id ?? index}>
                <span className="attachment-name">{file.originalName}</span>
                {invoice ? <Input className="invoice-input" aria-label="票号" placeholder="票号（可留空）" maxLength={100}
                    value={(id === undefined ? undefined : drafts[id]) ?? file.invoiceKey ?? ''} disabled={disabled || uploading || (id !== undefined && syncing[id])}
                    onChange={event => { if (id !== undefined) editInvoice(id, event.target.value); }}
                    onBlur={() => void saveInvoice(file)} onPressEnter={event => event.currentTarget.blur()} />
                    : file.invoiceKey && <small>票号 {file.invoiceKey}</small>}
                <Button type="text" disabled={disabled || uploading} onClick={() => remove(file)}>移除</Button>
            </div>;
        })}
    </div>;
}