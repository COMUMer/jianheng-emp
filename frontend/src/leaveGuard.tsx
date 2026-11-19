import { Button, Modal } from 'antd';
import { useCallback, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export const reloadTarget = '__reload__';

/** 未保存修改的离开守卫：拦截站内链接、F5 与页面卸载；去留由调用方决定。 */
export function useLeaveGuard(dirty: boolean, request: (target: string) => void) {
    const dirtyRef = useRef(dirty);
    const requestRef = useRef(request);
    const allowUnload = useRef(false);
    useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
    useEffect(() => { requestRef.current = request; }, [request]);

    useEffect(() => {
        if (!dirty) return;
        const warn = (event: BeforeUnloadEvent) => {
            if (!dirtyRef.current || allowUnload.current) return;
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    useEffect(() => {
        if (!dirty) return;
        const intercept = (event: MouseEvent) => {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            const element = event.target;
            if (!(element instanceof Element)) return;
            const anchor = element.closest('a[href]');
            if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
            const url = new URL(anchor.href, window.location.href);
            if (url.origin !== window.location.origin) return;
            const current = window.location.pathname + window.location.search;
            const next = url.pathname + url.search;
            if (next === current) return;
            event.preventDefault();
            event.stopPropagation();
            requestRef.current(next + url.hash);
        };
        document.addEventListener('click', intercept, true);
        return () => document.removeEventListener('click', intercept, true);
    }, [dirty]);

    useEffect(() => {
        if (!dirty) return;
        const intercept = (event: KeyboardEvent) => {
            if (event.key === 'F5' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r')) {
                event.preventDefault();
                event.stopPropagation();
                requestRef.current(reloadTarget);
            }
        };
        document.addEventListener('keydown', intercept, true);
        return () => document.removeEventListener('keydown', intercept, true);
    }, [dirty]);

    useEffect(() => {
        const hot = import.meta.hot;
        if (!dirty || !hot) return;
        const block = () => new Promise<void>(() => { requestRef.current(reloadTarget); });
        hot.on('vite:beforeFullReload', block);
        return () => hot.off('vite:beforeFullReload', block);
    }, [dirty]);

    const reloadPage = useCallback(() => {
        allowUnload.current = true;
        window.location.reload();
    }, []);
    return { reloadPage };
}

export function LeaveConfirmModal({ open, saving, description, onDiscard, onCancel, onSave }: {
    open: boolean;
    saving?: boolean;
    description: ReactNode;
    onDiscard: () => void;
    onCancel: () => void;
    onSave: () => void;
}) {
    return <Modal open={open} centered title="有未保存的修改" destroyOnHidden onCancel={onCancel}
        footer={[
            <Button key="discard" onClick={onDiscard}>不保存</Button>,
            <Button key="cancel" onClick={onCancel}>取消</Button>,
            <Button key="save" type="primary" loading={saving} onClick={onSave}>保存并离开</Button>,
        ]}>
        <p>{description}</p>
    </Modal>;
}