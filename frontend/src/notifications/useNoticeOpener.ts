import { App } from 'antd';
import { useCallback } from 'react';
import { api, showError } from '../api';
import type { Model } from '../api';

/** 打开消息的唯一行为：未读先标读并刷新计数，再打开关联单据；标读失败只提示，不阻断打开。 */
export function useNoticeOpener({ reload, onRead, open }: {
    reload: () => void;
    onRead?: () => void;
    open: (id?: number) => void;
}) {
    const { message } = App.useApp();
    return useCallback(async (notice: Model<'Notice'>) => {
        if (!notice.readAt) {
            try {
                await api(`/notifications/${notice.id}/read`, { method: 'POST' });
                reload();
                onRead?.();
            } catch (error) { message.error(showError(error)); }
        }
        open(notice.documentId);
    }, [message, onRead, open, reload]);
}