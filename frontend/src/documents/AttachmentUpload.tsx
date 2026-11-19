import { FolderOutlined } from '@ant-design/icons';
import { App, Button, Select, Tag, Upload } from 'antd';
import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useState } from 'react';
import { api, showError } from '../api';
import type { Model } from '../api';
import { fileCategoryColor, fileCategoryLabel } from '../format';
import { AttachmentPreview } from './AttachmentPreview';

type Attachment = Model<'Attachment'>;
type Category = NonNullable<Attachment['category']>;
const MAX_ATTACHMENT_MB = 50;
const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024;

export function AttachmentUpload({ files, onChange, kind, category, disabled, onBusyChange, showHint = true }: {
    files: Attachment[];
    onChange: Dispatch<SetStateAction<Attachment[]>>;
    kind?: 'EXPENSE' | 'PURCHASE';
    category?: Category;
    disabled?: boolean;
    onBusyChange: (busy: boolean) => void;
    showHint?: boolean;
}) {
    const { message } = App.useApp();
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [saving, setSaving] = useState<Record<number, boolean>>({});
    const [preview, setPreview] = useState<Attachment>();
    const uploading = progress.total > 0;
    const busy = uploading || Object.keys(saving).length > 0;
    const options: { value: Category; label: string }[] = kind === 'EXPENSE'
        ? [{ value: 'INVOICE', label: '发票' }, { value: 'PAYMENT', label: '付款记录' }, { value: 'OTHER', label: '其他材料' }]
        : [{ value: 'OTHER', label: '其他材料' }];

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
                    const attachment = await api<Attachment>(category ? `/attachments?category=${category}` : '/attachments',
                        { method: 'POST', body });
                    onChange(current => [...current, attachment]);
                } catch (error) { message.error(file.name + '：' + showError(error)); }
            }
        } finally { setProgress({ done: 0, total: 0 }); }
    }

    async function categorize(file: Attachment, category: Category) {
        const id = file.id;
        if (id === undefined || file.category === category) return;
        setSaving(current => ({ ...current, [id]: true }));
        try {
            const updated = await api<Attachment>(`/attachments/${id}`, { method: 'PATCH', body: { category } });
            onChange(current => current.map(item => item.id === id ? updated : item));
        } catch (error) { message.error(file.originalName + '：' + showError(error)); }
        finally {
            setSaving(current => {
                const next = { ...current };
                delete next[id];
                return next;
            });
        }
    }

    function remove(file: Attachment) {
        onChange(current => current.filter(item => item.id !== file.id));
    }

    return <div className="attachment-upload">
        {showHint && <p className="attachment-hint">{category ? `附件将按${fileCategoryLabel[category]}保存。`
            : `${kind === 'EXPENSE' ? '发票、付款记录为必需。' : ''}每个附件需要单独选择类型。`}</p>}
        <Upload.Dragger className="attachment-dropzone" multiple showUploadList={false} disabled={disabled || uploading}
            beforeUpload={(file, batch) => {
                if (batch[0] === file) {
                    const accepted = batch.filter(item => {
                        if (item.size <= MAX_ATTACHMENT_BYTES) return true;
                        message.error(`${item.name} 超过 ${MAX_ATTACHMENT_MB}MB，无法上传`);
                        return false;
                    });
                    if (accepted.length) void upload(accepted);
                }
                return Upload.LIST_IGNORE;
            }}>
            <div className="upload-zone">
                <span className="upload-zone-icon" aria-hidden><FolderOutlined /></span>
                <span className="upload-zone-title">点击或拖拽文件到此区域上传</span>
                <span className="upload-zone-hint" aria-live="polite">
                    {uploading ? '正在上传 ' + progress.done + '/' + progress.total + '…' : `支持一次选择多个文件，单个不超过 ${MAX_ATTACHMENT_MB}MB`}
                </span>
            </div>
        </Upload.Dragger>
        {files.map((file, index) => {
            const id = file.id;
            const filing = id !== undefined && saving[id] === true;
            return <div className="file-row attachment-row" key={id ?? index}>
                <span className="attachment-name">{file.originalName}</span>
                {category ? <Tag color={fileCategoryColor[category]}>{fileCategoryLabel[category]}</Tag>
                    : <span className="attachment-category">
                        <span className="required-mark" aria-hidden>*</span>
                        <Select<Category> size="small" className="attachment-category-select" value={file.category ?? undefined}
                            aria-label={`${file.originalName}的类型`} placeholder="请选择类型" options={options} loading={filing}
                            disabled={disabled || uploading || id === undefined || filing}
                            onChange={value => void categorize(file, value)} />
                    </span>}
                <span className="attachment-actions">
                    <Button type="link" className="table-link" disabled={id === undefined} onClick={() => setPreview(file)}>预览</Button>
                    <Button type="text" disabled={disabled || uploading || filing} onClick={() => remove(file)}>移除</Button>
                </span>
            </div>;
        })}
        <AttachmentPreview file={preview} close={() => setPreview(undefined)} />
    </div>;
}