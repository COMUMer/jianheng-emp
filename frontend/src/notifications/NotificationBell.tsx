import { Badge, Button, Popover } from 'antd';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { Model } from '../api';
import { ResourceState } from '../common';
import { useResource } from '../useResource';
import { NoticeItem } from './NoticeItem';
import './notification-bell.css';

function BellIcon() {
    return <svg className="notification-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2-3v-3a7 7 0 0 1 4-6" />
        <path d="M9 17v1a3 3 0 0 0 6 0v-1" />
    </svg>;
}

/** 顶栏消息预览：只展示最近几条，完整列表与标读行为归「我的消息」页。 */
export function NotificationBell({ unread, liveTick, onOpen, onOpenAll }: {
    unread: number;
    liveTick: number;
    onOpen: (notice: Model<'Notice'>) => void;
    onOpenAll: () => void;
}) {
    const [open, setOpen] = useState(false);
    const { pathname } = useLocation();
    const notices = useResource<Model<'Notice'>[]>(open ? '/notifications' : null, liveTick);

    useEffect(() => { setOpen(false); }, [pathname]);

    const content = <div className="notification-panel">
        <div className="notification-heading">
            <strong>消息</strong>
            <span>{unread > 0 ? `${unread} 条未读` : '全部已读'}</span>
        </div>
        <ResourceState {...notices} retry={notices.reload}>
            {notices.data?.length
                ? <ul className="notice-list">{notices.data.slice(0, 5).map(notice =>
                    <NoticeItem key={notice.id} notice={notice} onOpen={target => { setOpen(false); onOpen(target); }} />)}</ul>
                : <p className="notification-empty">暂无消息</p>}
        </ResourceState>
        <Button type="link" block className="notification-all" onClick={onOpenAll}>
            查看全部消息
        </Button>
    </div>;

    return <Popover content={content} trigger="click" placement="bottomRight" open={open} onOpenChange={setOpen}>
        <button type="button" className="notification-button" title="消息" aria-label={unread > 0 ? `消息通知，${unread} 条未读` : '消息通知'}
            aria-haspopup="dialog" aria-expanded={open}>
            <Badge count={unread} size="small" color="#ff0000" offset={[2, -1]}>
                <BellIcon />
            </Badge>
        </button>
    </Popover>;
}