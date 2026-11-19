import {
    AccountBookOutlined, AuditOutlined, DashboardOutlined, DownOutlined, FileTextOutlined,
    IdcardOutlined, MailOutlined, MessageOutlined, SettingOutlined, TeamOutlined,
} from '@ant-design/icons';
import { Badge } from 'antd';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Model } from './api';

export type Section = 'home' | 'requests' | 'inbox' | 'messages' | 'profile' | 'people' | 'organization'
    | 'ledger' | 'settings' | 'mail';
export type NavItem = { key: Section; label: string; icon?: ReactNode; badge?: number };
export type NavGroup = { key: string; label: string; icon: ReactNode; items: NavItem[] };
export type NavEntry = NavItem | NavGroup;

export const sectionPaths: Record<Section, string> = {
    home: '/', requests: '/requests', inbox: '/inbox', messages: '/messages', profile: '/profile',
    people: '/people', organization: '/organization', ledger: '/ledger', settings: '/settings', mail: '/mail-settings',
};

export function sectionFromPath(pathname: string) {
    const normalized = pathname.replace(/\/+$/, '') || '/';
    return (Object.keys(sectionPaths) as Section[]).find(section => sectionPaths[section] === normalized);
}

const isGroup = (entry: NavEntry): entry is NavGroup => 'items' in entry;
const link = (key: Section, label: string, icon?: ReactNode, badge?: number): NavItem => ({ key, label, icon, badge });
const group = (key: string, label: string, icon: ReactNode, items: NavItem[]): NavGroup => ({ key, label, icon, items });

export function navigationFor(user: Model<'CurrentUser'>, unread = 0, inbox = 0): NavEntry[] {
    const roles = user.roles ?? [];
    const admin = roles.includes('ADMIN');
    const hr = admin || roles.includes('HR');
    const finance = admin || roles.includes('FINANCE');
    return [
        link('home', '工作台', <DashboardOutlined />),
        link('requests', '我的申请', <FileTextOutlined />),
        link('inbox', '我的待办', <AuditOutlined />, inbox),
        { ...link('messages', '我的消息', <MessageOutlined />), badge: unread },
        ...(hr ? [group('hrm', '人事管理 HRM', <TeamOutlined />, [link('people', '人员管理'), link('organization', '组织架构')])] : []),
        ...(finance || roles.includes('PAYER') ? [link('ledger', '费用台账', <AccountBookOutlined />)] : []),
        ...(admin ? [link('mail', '邮件设置', <MailOutlined />)] : []),
        ...(user.employeeId ? [link('profile', '我的档案', <IdcardOutlined />)] : []),
        ...(finance ? [link('settings', '系统设置', <SettingOutlined />)] : []),
    ];
}

function NavLink({ item, active, child = false, onNavigate }: {
    item: NavItem; active: Section; child?: boolean; onNavigate?: () => void;
}) {
    const badge = item.badge ?? 0;
    const badgeText = item.key === 'inbox' ? `${badge} 条待办` : `${badge} 条未读`;
    return <Link className={child ? 'nav-entry nav-child' : 'nav-entry'} to={sectionPaths[item.key]}
        replace={active === item.key} onClick={onNavigate} aria-current={active === item.key ? 'page' : undefined}
        aria-label={badge > 0 ? `${item.label}，${badgeText}` : undefined}>
        {!child && item.icon && <span className="nav-icon" aria-hidden>{item.icon}</span>}
        <span className="nav-label">{item.label}</span>
        {badge > 0 && <Badge count={badge} size="small" color="#ff0000" className="nav-badge" />}
    </Link>;
}

export function Sidebar({ entries, active, onNavigate }: { entries: NavEntry[]; active: Section; onNavigate?: () => void }) {
    const [expanded, setExpanded] = useState<string[]>(() => entries
        .filter(entry => isGroup(entry) && entry.items.some(item => item.key === active))
        .map(entry => entry.key));
    useEffect(() => {
        const owner = entries.find(entry => isGroup(entry) && entry.items.some(item => item.key === active));
        if (owner) setExpanded(current => current.includes(owner.key) ? current : [...current, owner.key]);
    }, [active, entries]);
    const toggle = (key: string) => setExpanded(current => current.includes(key)
        ? current.filter(item => item !== key) : [...current, key]);

    return <nav className="sidebar" aria-label="主导航">
        <ul className="nav-list">
            {entries.map(entry => isGroup(entry)
                ? <li key={entry.key} className="nav-group">
                    <button type="button" className="nav-entry nav-group-toggle" aria-expanded={expanded.includes(entry.key)}
                        onClick={() => toggle(entry.key)}>
                        <span className="nav-icon" aria-hidden>{entry.icon}</span>
                        <span className="nav-label">{entry.label}</span>
                        <span className="nav-chevron" aria-hidden><DownOutlined /></span>
                    </button>
                    {expanded.includes(entry.key) && <ul className="nav-children">
                        {entry.items.map(item => <li key={item.key}>
                            <NavLink item={item} active={active} child onNavigate={onNavigate} />
                        </li>)}
                    </ul>}
                </li>
                : <li key={entry.key}><NavLink item={entry} active={active} onNavigate={onNavigate} /></li>)}
        </ul>
    </nav>;
}