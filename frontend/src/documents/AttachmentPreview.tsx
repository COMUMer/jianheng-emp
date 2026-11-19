import { DownloadOutlined } from '@ant-design/icons';
import { App, Button, Modal, Tag } from 'antd';
import { download, showError } from '../api';
import type { Model } from '../api';
import { fileCategoryColor, fileCategoryLabel } from '../format';

export function AttachmentPreview({ file, close }: { file?: Model<'Attachment'>; close: () => void }) {
    const { message } = App.useApp();
    if (!file) return null;
    const id = file.id;
    const name = file.originalName;
    const image = !!file.contentType?.startsWith('image/');
    const pdf = file.contentType === 'application/pdf';

    function save() {
        if (id === undefined) return;
        download(`/attachments/${id}`, name ?? '附件').catch(error => message.error(showError(error)));
    }

    return <Modal open centered destroyOnHidden width={860} onCancel={close}
        title={<span className="attachment-preview-title">{file.originalName}
            {file.category && <Tag color={fileCategoryColor[file.category]}>{fileCategoryLabel[file.category]}</Tag>}
        </span>}
        footer={[
            <Button key="download" icon={<DownloadOutlined />} disabled={id === undefined} onClick={save}>下载原件</Button>,
            <Button key="close" type="primary" onClick={close}>关闭</Button>,
        ]}>
        <div className="attachment-preview">
            {id === undefined ? <p className="attachment-preview-empty">附件还在上传，请稍候。</p>
                : pdf ? <iframe src={`/api/attachments/${id}/preview`} title={file.originalName} />
                : image ? <img src={`/api/attachments/${id}/preview`} alt={file.originalName} />
                : <p className="attachment-preview-empty">该文件不支持在线预览，请下载查看。</p>}
        </div>
    </Modal>;
}
