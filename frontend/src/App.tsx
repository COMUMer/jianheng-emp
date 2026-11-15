import { DownOutlined, IdcardOutlined, LogoutOutlined, MenuOutlined } from '@ant-design/icons';
import { App as AntApp, Button, Drawer, Dropdown } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { api, showError } from './api';
import type { Model } from './api';
import { BrandLockup } from './brand/Brand';
import { DocumentWorkspace } from './documents/DocumentWorkspace';
import { roleLabel } from './format';
import { LoginPage, LoginSplash } from './login/LoginPage';
import { navigationFor, Sidebar } from './navigation';
import type { Section } from './navigation';
import { MyProfile } from './people/MyProfile';
import { PersonAvatar } from './people/avatar';
import { PeopleWorkspace } from './people/PeopleWorkspace';
import { AdminWorkspace } from './settings/AdminWorkspace';
import { useMediaQuery } from './useMediaQuery';
import { EmployeeWatermark } from './watermark/EmployeeWatermark';

export default function App() {
    const { message } = AntApp.useApp();
    const [user, setUser] = useState<Model<'CurrentUser'> | null>();
    const [section, setSection] = useState<Section>('home');
    const [navigationOpen, setNavigationOpen] = useState(false);
    const [accountOpen, setAccountOpen] = useState(false);
    const compact = useMediaQuery('(max-width: 780px)');
    const navigation = useMemo(() => user ? navigationFor(user) : [], [user]);
    useEffect(() => {
        api<Model<'CurrentUser'>>('/session/me').then(setUser).catch(() => setUser(null));
        const expired = () => setUser(null);
        window.addEventListener('session-expired', expired);
        return () => window.removeEventListener('session-expired', expired);
    }, []);
    useEffect(() => { if (!compact) setNavigationOpen(false); }, [compact]);

    if (user === undefined) return <LoginSplash />;
    if (!user) return <LoginPage onAuthenticated={authenticated => {
        setUser(authenticated);
        setSection('home');
        setNavigationOpen(false);
    }} />;

    const roles = user.roles ?? [];
    const displayName = user.name ?? user.username ?? '用户';
    const accountRole = roleLabel[roles.find(role => role !== 'EMPLOYEE') ?? 'EMPLOYEE'];
    const navigate = (target: Section) => {
        setSection(target);
        setNavigationOpen(false);
    };
    const logout = async () => {
        try { await api('/session/logout', { method: 'POST' }); setUser(null); setNavigationOpen(false); }
        catch (error) { message.error(showError(error)); }
    };
    return <>
        <div className={compact ? 'shell shell-compact' : 'shell'}>
            <header className="topbar">
                <div className="topbar-start">
                    {compact && <Button type="text" className="nav-toggle" icon={<MenuOutlined />} aria-label="打开导航"
                        onClick={() => setNavigationOpen(true)} />}
                    <button className="brand" aria-label="见衡科技，返回工作台首页" onClick={() => navigate('home')}><BrandLockup compact /></button>
                </div>
                <div className="account-bar">
                    <Dropdown open={accountOpen} onOpenChange={setAccountOpen} placement="bottomRight" trigger={['click']} menu={{
                        items: [
                            ...(user.employeeId ? [{ key: 'profile', icon: <IdcardOutlined aria-hidden />, label: '我的档案' }] : []),
                            { key: 'logout', icon: <LogoutOutlined aria-hidden />, label: '退出登录' },
                        ],
                        onClick: ({ key }) => {
                            if (key === 'profile') navigate('profile');
                            else if (key === 'logout') void logout();
                        },
                    }}>
                        <button type="button" className="account-menu" aria-label={`账号菜单：${displayName}`} aria-haspopup="menu"
                            aria-expanded={accountOpen}>
                            <span className="account-avatar" aria-hidden="true">
                                <PersonAvatar name={displayName} avatarKey={user.avatarKey} size={36} />
                            </span>
                            <span className="account-menu-text">
                                <span className="account-name">{displayName}</span>
                                <span className="account-role">{accountRole}</span>
                            </span>
                            <DownOutlined className="account-chevron" aria-hidden />
                        </button>
                    </Dropdown>
                </div>
            </header>
            {!compact && <Sidebar entries={navigation} active={section} onSelect={navigate} />}
            <main className="workspace">
                {section === 'profile' ? <MyProfile user={user} onAvatarChanged={avatarKey => setUser(current => current ? { ...current, avatarKey } : current)} />
                    : section === 'people' ? <PeopleWorkspace user={user} />
                    : section === 'settings' ? <AdminWorkspace user={user} />
                    : <DocumentWorkspace user={user} section={section} navigate={navigate} />}
            </main>
        </div>
        {compact && <Drawer open={navigationOpen} onClose={() => setNavigationOpen(false)} placement="left" size={260}
            className="nav-drawer" title={<BrandLockup compact />}>
            <Sidebar entries={navigation} active={section} onSelect={navigate} />
        </Drawer>}
        <EmployeeWatermark user={user} />
    </>;
}
