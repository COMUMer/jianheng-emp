import { CheckOutlined, CloseOutlined, EllipsisOutlined, UserOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';
import { formatDate } from './format';
import { PersonAvatar } from './people/avatar';
import './process.css';

export type ProcessNodeState = 'done' | 'current' | 'waiting' | 'failed';

export type ProcessNode = {
    key: number | string;
    title: string;
    state: ProcessNodeState;
    actor?: string;
    avatarKey?: string;
    at?: string;
    timeLabel?: string;
    badge?: string;
    status?: { text: string; color: string };
    meta?: ReactNode;
    note?: ReactNode;
};

function stateIcon(state: ProcessNodeState) {
    if (state === 'done') return <CheckOutlined />;
    if (state === 'failed') return <CloseOutlined />;
    return <EllipsisOutlined />;
}

export function ProcessFeed({ nodes, newestFirst = false, markEnds = false }: {
    nodes: ProcessNode[];
    newestFirst?: boolean;
    markEnds?: boolean;
}) {
    const ordered = newestFirst ? [...nodes].sort((left, right) => (right.at ?? '').localeCompare(left.at ?? '')) : nodes;
    return <ol className="process-feed">{ordered.map((node, index) => {
        const badge = node.badge ?? (node.status && node.status.color !== 'default' ? node.status.color : undefined);
        return <li key={node.key} className={`process-node process-node-${node.state}${node.status ? ` process-tone-${node.status.color}` : ''}`}>
            <span className="process-avatar">
                {node.actor ? <PersonAvatar name={node.actor} avatarKey={node.avatarKey} size={34} /> : <UserOutlined />}
                {badge && <span className={`process-avatar-badge process-badge-${badge}`}>{stateIcon(node.state)}</span>}
            </span>
            <div className="process-node-body">
                <div className="process-node-head">
                    <strong>{node.title}</strong>
                    {node.status && <span className={`process-status process-status-${node.status.color}`}>{node.status.text}</span>}
                    {markEnds && index === 0 && <span className="process-mark">最新</span>}
                    {markEnds && index > 0 && index === ordered.length - 1 && <span className="process-mark process-mark-quiet">起点</span>}
                    {(node.timeLabel || node.at) && <span className="process-node-time">{node.timeLabel ?? formatDate(node.at)}</span>}
                </div>
                {node.meta && <div className="process-node-meta">{node.meta}</div>}
                {node.note && <div className="process-node-note">{node.note}</div>}
            </div>
        </li>;
    })}</ol>;
}