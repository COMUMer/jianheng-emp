import { App, Button, Modal } from 'antd';
import { useEffect, useState } from 'react';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';
import { showError } from '../api';
import { cropAvatar } from './avatar';
import './avatar-crop.css';

export function AvatarCropModal({ image, busy, onCancel, onSave }: {
    image?: string;
    busy: boolean;
    onCancel: () => void;
    onSave: (file: File) => void;
}) {
    const { message } = App.useApp();
    const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [area, setArea] = useState<Area>();
    const [working, setWorking] = useState(false);

    useEffect(() => {
        setCrop({ x: 0, y: 0 });
        setZoom(1);
        setArea(undefined);
    }, [image]);

    async function save() {
        if (!image || !area) return;
        setWorking(true);
        try {
            onSave(await cropAvatar(image, area));
        } catch (error) {
            message.error(showError(error));
        } finally {
            setWorking(false);
        }
    }

    return <Modal open={!!image} title="设置头像" width={560} destroyOnHidden
        onCancel={busy ? undefined : onCancel} maskClosable={!busy} closable={!busy}
        footer={[
            <Button key="cancel" disabled={busy} onClick={onCancel}>取消</Button>,
            <Button key="save" type="primary" loading={busy || working} disabled={!area} onClick={save}>保存头像</Button>,
        ]}>
        <div className="avatar-crop">
            <div className="avatar-crop-stage">
                {image && <Cropper image={image} crop={crop} zoom={zoom} aspect={1} cropShape="round" showGrid={false}
                    minZoom={1} maxZoom={3} zoomWithScroll onCropChange={setCrop} onZoomChange={setZoom}
                    onCropComplete={(_, pixels) => setArea(pixels)} />}
            </div>
            <p className="avatar-crop-hint">拖动图片调整位置，滚动鼠标滚轮缩放，圆圈内的区域将作为头像。</p>
        </div>
    </Modal>;
}