import {
    AccountBookOutlined, AuditOutlined, DashboardOutlined, DownOutlined, FileTextOutlined,
    IdcardOutlined, SettingOutlined, TeamOutlined,
} from '@ant-design/icons';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Model } from './api';

export type Section = 'home' | 'requests' | 'inbox' | 'profile' | 'people' | 'ledger' | 'settings';
export type NavItem = { key: Section; label: string; icon?: ReactNode };
export type NavGroup = { key: string; label: string; icon: ReactNode; items: NavItem[] };
export type NavEntry = NavItem | NavGroup;

const isGroup = (entry: NavEntry): entry is NavGroup => 'items' in entry;
const link = (key: Section, label: string, icon?: ReactNode): NavItem => ({ key, label, icon });
const group = (key: string, label: string, icon: ReactNode, items: NavItem[]): NavGroup => ({ key, label, icon, items });

export function navigationFor(user: Model<'CurrentUser'>): NavEntry[] {
    const roles = user.roles ?? [];
    const admin = roles.includes('ADMIN');
    const hr = admin || roles.includes('HR');
    const finance = admin || roles.includes('FINANCE');
    return [
        link('home', '工作台', <DashboardOutlined />),
        link('requests', '我的申请', <FileTextOutlined />),
        link('inbox', '审批待办', <AuditOutlined />),
        ...(user.employeeId ? [link('profile', '我的档案', <IdcardOutlined />)] : []),
        ...(hr ? [group('hrm', '人事管理 HRM', <TeamOutlined />, [link('people', '人员管理')])] : []),
        ...(finance || roles.includes('PAYER') ? [link('ledger', '费用台账', <AccountBookOutlined />)] : []),
        ...(finance ? [link('settings', '系统设置', <SettingOutlined />)] : []),
    ];
}

export function Sidebar({ entries, active, onSelect }: { entries: NavEntry[]; active: Section; onSelect: (section: Section) => void }) {
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
                            <button type="button" className="nav-entry nav-child" onClick={() => onSelect(item.key)}
                                aria-current={active === item.key ? 'page' : undefined}>
                                <span className="nav-label">{item.label}</span>
                            </button>
                        </li>)}
                    </ul>}
                </li>
                : <li key={entry.key}>
                    <button type="button" className="nav-entry" onClick={() => onSelect(entry.key)}
                        aria-current={active === entry.key ? 'page' : undefined}>
                        <span className="nav-icon" aria-hidden>{entry.icon}</span>
                        <span className="nav-label">{entry.label}</span>
                    </button>
                </li>)}
        </ul>
    </nav>;
}
