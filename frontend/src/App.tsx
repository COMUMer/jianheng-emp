import { DownOutlined, IdcardOutlined, LogoutOutlined, MenuOutlined } from '@ant-design/icons';
import { App as AntApp, Button, Drawer, Dropdown } from 'antd';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api, showError } from './api';
import type { Model } from './api';
import { BrandLockup } from './brand/Brand';
import { ResourceState } from './common';
import { DocumentWorkspace } from './documents/DocumentWorkspace';
import { roleLabel } from './format';
import { LoginPage, LoginSplash } from './login/LoginPage';
import { NotificationBell } from './notifications/NotificationBell';
import { MessagesPage } from './notifications/MessagesPage';
import { navigationFor, sectionFromPath, sectionPaths, Sidebar } from './navigation';
import type { Section } from './navigation';
import { MyProfile } from './people/MyProfile';
import { OrganizationWorkspace } from './people/OrganizationWorkspace';
import { PersonAvatar } from './people/avatar';
import { PeopleWorkspace } from './people/PeopleWorkspace';
import { AdminWorkspace } from './settings/AdminWorkspace';
import { useLiveEvents } from './useLiveEvents';
import { useMediaQuery } from './useMediaQuery';
import { EmployeeWatermark } from './watermark/EmployeeWatermark';

const MailSettingsPage = lazy(() => import('./settings/MailSettingsPage'));

export default function App() {
    const { message } = AntApp.useApp();
    const [user, setUser] = useState<Model<'CurrentUser'> | null>();
    const [navigationOpen, setNavigationOpen] = useState(false);
    const [accountOpen, setAccountOpen] = useState(false);
    const [unread, setUnread] = useState(0);
    const [inboxCount, setInboxCount] = useState(0);
    const [liveTick, setLiveTick] = useState(0);
    const compact = useMediaQuery('(max-width: 780px)');
    const routerNavigate = useNavigate();
    const { pathname } = useLocation();
    const section = sectionFromPath(pathname);
    const navigation = useMemo(() => user ? navigationFor(user, unread, inboxCount) : [], [user, unread, inboxCount]);
    const allowed = useMemo(() => new Set(navigation.flatMap(entry =>
        'items' in entry ? entry.items.map(item => item.key) : [entry.key])), [navigation]);
    useEffect(() => {
        api<Model<'CurrentUser'>>('/session/me').then(setUser).catch(() => setUser(null));
        const expired = () => setUser(null);
        window.addEventListener('session-expired', expired);
        return () => window.removeEventListener('session-expired', expired);
    }, []);
    useEffect(() => { if (!compact) setNavigationOpen(false); }, [compact]);
    const refreshUnread = useCallback(() => {
        api<Model<'Unread'>>('/notifications/unread')
            .then(count => setUnread(count.unread ?? 0))
            .catch(() => setUnread(0));
    }, []);
    const refreshInboxCount = useCallback(() => {
        api<Model<'InboxCount'>>('/inbox/count')
            .then(count => setInboxCount(count.pending ?? 0))
            .catch(() => setInboxCount(0));
    }, []);
    useEffect(() => { if (user) { refreshUnread(); refreshInboxCount(); } }, [user, refreshUnread, refreshInboxCount]);
    useEffect(() => {
        if (!user) return;
        if (section === 'inbox') refreshInboxCount();
        else if (section === 'messages') refreshUnread();
    }, [user, section, refreshInboxCount, refreshUnread]);
    useEffect(() => {
        const refresh = () => { refreshUnread(); refreshInboxCount(); };
        window.addEventListener('workflow-changed', refresh);
        return () => window.removeEventListener('workflow-changed', refresh);
    }, [refreshUnread, refreshInboxCount]);
    useLiveEvents(() => { refreshUnread(); refreshInboxCount(); setLiveTick(tick => tick + 1); }, !!user);

    if (user === undefined) return <LoginSplash />;
    if (!user) return <LoginPage onAuthenticated={authenticated => {
        setUser(authenticated);
        setNavigationOpen(false);
    }} />;
    if (!section || !allowed.has(section)) return <Navigate to={sectionPaths.home} replace />;

    const roles = user.roles ?? [];
    const displayName = user.name ?? user.username ?? '用户';
    const accountRole = roles.includes('ADMIN')
        ? roleLabel.ADMIN
        : user.positionName?.trim() || roleLabel[roles.find(role => role !== 'EMPLOYEE') ?? 'EMPLOYEE'];
    const navigate = (target: Section) => {
        routerNavigate(sectionPaths[target]);
        setNavigationOpen(false);
    };
    const logout = async () => {
        try {
            await api('/session/logout', { method: 'POST' });
            setUser(null);
            setNavigationOpen(false);
            routerNavigate(sectionPaths.home, { replace: true });
        } catch (error) { message.error(showError(error)); }
    };
    return <>
        <div className={compact ? 'shell shell-compact' : 'shell'}>
            <header className="topbar">
                <div className="topbar-start">
                    {compact && <Button type="text" className="nav-toggle" icon={<MenuOutlined />} aria-label="打开导航"
                        onClick={() => setNavigationOpen(true)} />}
                    <Link className="brand" to={sectionPaths.home} replace={section === 'home'} aria-label="见衡科技，返回工作台首页"><BrandLockup compact /></Link>
                </div>
                <div className="account-bar">
                    <NotificationBell unread={unread} liveTick={liveTick}
                        onOpen={notice => routerNavigate(notice.id === undefined ? '/messages' : `/messages?notice=${notice.id}`)}
                        onOpenAll={() => routerNavigate(sectionPaths.messages)} />
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
                                <PersonAvatar name={displayName} avatarKey={user.avatarKey} size={40} />
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
            {!compact && <Sidebar entries={navigation} active={section} onNavigate={() => setNavigationOpen(false)} />}
            <main className="workspace">
                {section === 'profile' ? <MyProfile user={user} onAvatarChanged={avatarKey => setUser(current => current ? { ...current, avatarKey } : current)} />
                    : section === 'people' ? <PeopleWorkspace user={user} />
                    : section === 'organization' ? <OrganizationWorkspace />
                    : section === 'settings' ? <AdminWorkspace user={user} />
                    : section === 'mail' ? <Suspense fallback={<ResourceState loading>{null}</ResourceState>}>
                        <MailSettingsPage />
                    </Suspense>
                    : section === 'messages' ? <MessagesPage user={user} unread={unread} onRead={refreshUnread} liveTick={liveTick} />
                    : <DocumentWorkspace user={user} section={section} navigate={navigate} liveTick={liveTick}
                        onNoticeRead={refreshUnread} />}
            </main>
        </div>
        {compact && <Drawer open={navigationOpen} onClose={() => setNavigationOpen(false)} placement="left" size={260}
            className="nav-drawer" title={<BrandLockup compact />}>
            <Sidebar entries={navigation} active={section} onNavigate={() => setNavigationOpen(false)} />
        </Drawer>}
        <EmployeeWatermark user={user} />
    </>;
}