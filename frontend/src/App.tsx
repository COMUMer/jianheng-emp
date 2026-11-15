import { App as AntApp, Button, Tag } from 'antd';
import { useEffect, useState } from 'react';
import { api, showError } from './api';
import type { Model } from './api';
import { BrandLockup } from './brand/Brand';
import { DocumentWorkspace } from './documents/DocumentWorkspace';
import { MyProfile } from './people/MyProfile';
import { PersonAvatar } from './people/avatar';
import { PeopleWorkspace } from './people/PeopleWorkspace';
import { AdminWorkspace } from './settings/AdminWorkspace';
import { roleLabel } from './format';
import { LoginPage, LoginSplash } from './login/LoginPage';
import { EmployeeWatermark } from './watermark/EmployeeWatermark';

type Section = 'home' | 'requests' | 'inbox' | 'profile' | 'people' | 'ledger' | 'settings';
const sections: { key: Section; label: string; icon: string }[] = [
    { key: 'home', label: '工作台', icon: '▦' },
    { key: 'requests', label: '我的申请', icon: '≡' },
    { key: 'inbox', label: '审批待办', icon: '✓' },
    { key: 'profile', label: '我的档案', icon: '▤' },
    { key: 'people', label: '人员管理', icon: '♙' },
    { key: 'ledger', label: '费用台账', icon: '¥' },
    { key: 'settings', label: '系统设置', icon: '⚙' },
];

export default function App() {
    const { message } = AntApp.useApp();
    const [user, setUser] = useState<Model<'CurrentUser'> | null>();
    const [section, setSection] = useState<Section>('home');
    useEffect(() => {
        api<Model<'CurrentUser'>>('/session/me').then(setUser).catch(() => setUser(null));
        const expired = () => setUser(null);
        window.addEventListener('session-expired', expired);
        return () => window.removeEventListener('session-expired', expired);
    }, []);

    const roles = user?.roles ?? [];
    const admin = roles.includes('ADMIN');
    if (user === undefined) return <LoginSplash />;
    if (!user) return <LoginPage onAuthenticated={authenticated => {
        setUser(authenticated);
        setSection('home');
    }} />;

    const canViewSettings = admin || roles.includes('FINANCE');
    const canViewLedger = canViewSettings || roles.includes('PAYER');
    const canManagePeople = admin || roles.includes('HR');
    const allowed = sections.filter(({ key }) =>
        key === 'profile' ? !!user.employeeId
        : key === 'people' ? canManagePeople
        : key === 'settings' ? canViewSettings
        : key === 'ledger' ? canViewLedger
        : true);
    return <>
        <div className="shell">
            <header className="topbar">
                <button className="brand" aria-label="见衡科技，返回工作台首页" onClick={() => setSection('home')}><BrandLockup compact /></button>
                <div className="account-bar">
                    <PersonAvatar name={user.name ?? user.username} avatarKey={user.avatarKey} size={30} className="user-avatar" />
                    <span className="account-name">{user.username}</span>
                    <Tag className="account-role">{roleLabel[roles.find(role => role !== 'EMPLOYEE') ?? 'EMPLOYEE']}</Tag>
                    <Button type="text" onClick={async () => {
                        try { await api('/session/logout', { method: 'POST' }); setUser(null); }
                        catch (error) { message.error(showError(error)); }
                    }}>退出</Button>
                </div>
            </header>
            <nav className="sidebar" aria-label="主导航">
                {allowed.map(item => <button key={item.key} aria-current={section === item.key ? 'page' : undefined} onClick={() => setSection(item.key)}>
                    <span aria-hidden className="nav-icon">{item.icon}</span>{item.label}</button>)}
            </nav>
            <main className="workspace">
                {section === 'profile' ? <MyProfile user={user} onAvatarChanged={avatarKey => setUser(current => current ? { ...current, avatarKey } : current)} />
                    : section === 'people' ? <PeopleWorkspace user={user} />
                    : section === 'settings' ? <AdminWorkspace user={user} />
                    : <DocumentWorkspace user={user} section={section} navigate={setSection} />}
            </main>
        </div>
        <EmployeeWatermark user={user} />
    </>;
}
