import { Pagination, Switch } from 'antd';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Model } from '../api';
import { EmptyState, PageHeading, ResourceState, listPager } from '../common';
import { useDocumentViewer } from '../documents/useDocumentViewer';
import { matchesKeyword } from '../filter';
import { SearchBox } from '../SearchBox';
import { useResource } from '../useResource';
import { NoticeItem } from './NoticeItem';
import { useNoticeOpener } from './useNoticeOpener';
import './messages.css';

/** 站内消息的唯一全量视图；铃铛与工作台只展示各自限量的摘要。 */
export function MessagesPage({ user, unread, onRead, liveTick }: {
    user: Model<'CurrentUser'>;
    unread: number;
    onRead: () => void;
    liveTick: number;
}) {
    const notices = useResource<Model<'Notice'>[]>('/notifications', liveTick);
    const { open, viewer } = useDocumentViewer(user, notices.reload);
    const openNotice = useNoticeOpener({ reload: notices.reload, onRead, open });
    const [unreadOnly, setUnreadOnly] = useState(false);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [searchParams, setSearchParams] = useSearchParams();
    const noticeParam = searchParams.get('notice');
    const rows = (notices.data ?? []).filter(notice => (!unreadOnly || !notice.readAt) && matchesKeyword([notice.message], search));
    const maxPage = Math.max(1, Math.ceil(rows.length / pageSize));
    const current = Math.min(page, maxPage);
    const visible = rows.slice((current - 1) * pageSize, current * pageSize);
    const emptyText = search.trim() ? '没有匹配的消息' : unreadOnly ? '没有未读消息' : '暂无消息';

    useEffect(() => {
        if (!noticeParam || !notices.data) return;
        const target = notices.data.find(notice => String(notice.id) === noticeParam);
        setSearchParams({}, { replace: true });
        if (target) void openNotice(target);
    }, [noticeParam, notices.data, openNotice, setSearchParams]);

    return <>
        <PageHeading title="我的消息" description="查看审批、付款等站内通知。" />
        <section className="surface messages-surface">
            <div className="toolbar filter-bar">
                <SearchBox value={search} onChange={value => { setSearch(value); setPage(1); }} onSearch={() => notices.reload()}
                    placeholder="搜索消息内容" ariaLabel="搜索我的消息" />
                <label className="filter-switch"><Switch checked={unreadOnly} aria-label="只看未读"
                    onChange={value => { setUnreadOnly(value); setPage(1); }} />只看未读</label>
                {unread > 0 && <span className="messages-count">{unread} 条未读</span>}
            </div>
            <ResourceState {...notices} retry={notices.reload}>
                {visible.length
                    ? <ul className="notice-list">{visible.map(notice =>
                        <NoticeItem key={notice.id} notice={notice} onOpen={openNotice} />)}</ul>
                    : <EmptyState text={emptyText} />}
            </ResourceState>
            {rows.length > 0 && <div className="messages-pager">
                <Pagination {...listPager} current={current} pageSize={pageSize} total={rows.length}
                    onChange={(next, size) => { setPage(next); setPageSize(size); }}
                    onShowSizeChange={(_, size) => { setPage(1); setPageSize(size); }} />
            </div>}
        </section>
        {viewer}
    </>;
}