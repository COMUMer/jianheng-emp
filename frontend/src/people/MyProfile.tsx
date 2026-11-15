import { App } from 'antd';
import { useEffect, useState } from 'react';
import { api, showError } from '../api';
import type { Model } from '../api';
import { EmptyState, PageHeading, ResourceState } from '../common';
import { useResource } from '../useResource';
import { AvatarCropModal } from './AvatarCropModal';
import { departmentPath } from './departments';
import { EmployeeProfile } from './EmployeeProfile';

export function MyProfile({ user, onAvatarChanged }: {
    user: Model<'CurrentUser'>;
    onAvatarChanged?: (avatarKey: string) => void;
}) {
    const { message } = App.useApp();
    const path = user.employeeId ? `/people/employees/${user.employeeId}` : null;
    const detail = useResource<Model<'EmployeeDetail'>>(path);
    const departments = useResource<Model<'Department'>[]>('/people/departments');
    const [uploading, setUploading] = useState(false);
    const [cropImage, setCropImage] = useState<string>();
    const profile = detail.data?.employee;

    useEffect(() => () => { if (cropImage) URL.revokeObjectURL(cropImage); }, [cropImage]);

    function chooseAvatar(file: File) {
        if (!file.type.startsWith('image/')) { message.error('请选择图片文件'); return; }
        if (file.size > 5 * 1024 * 1024) { message.error('请选择不超过 5MB 的图片'); return; }
        setCropImage(URL.createObjectURL(file));
    }

    async function uploadAvatar(file: File) {
        setUploading(true);
        try {
            const body = new FormData();
            body.append('file', file);
            const saved = await api<Model<'AvatarView'>>('/people/me/avatar', { method: 'POST', body });
            if (saved.avatarKey) onAvatarChanged?.(saved.avatarKey);
            setCropImage(undefined);
            detail.reload();
            message.success('头像已更新');
        } catch (error) { message.error(showError(error)); }
        finally { setUploading(false); }
    }

    return <>
        <PageHeading title="我的档案" description="查看个人资料和人事变动记录。" />
        <ResourceState {...detail} retry={detail.reload}>{profile
            ? <div className="my-profile">
                <EmployeeProfile profile={profile} history={detail.data?.history} admin={false} editable={false} busy={false}
                    avatarBusy={uploading} onChangeAvatar={chooseAvatar}
                    departmentPath={departmentPath(departments.data, profile.departmentId)} />
            </div>
            : <EmptyState text="未找到员工档案" />}</ResourceState>
        <AvatarCropModal image={cropImage} busy={uploading} onCancel={() => setCropImage(undefined)} onSave={uploadAvatar} />
    </>;
}
