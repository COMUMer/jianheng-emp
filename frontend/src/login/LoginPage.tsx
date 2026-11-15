import { Button, Form, Input, Spin } from 'antd';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { api, ApiError, signIn, showError } from '../api';
import type { Model } from '../api';
import { BrandLockup } from '../brand/Brand';
import sloganTechnology from './slogan-technology.png';
import sloganFuture from './slogan-future.png';
import './login.css';

type LoginValues = { username: string; password: string };

function LockIcon() {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="10" width="16" height="11" rx="2.4" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>;
}

function LoginTopbar() {
    return <header className="login-topbar">
        <BrandLockup compact />
        <span className="login-access"><LockIcon />仅限授权员工</span>
    </header>;
}

function Copyright() {
    return <footer className="login-footer">
        <p>© {new Date().getFullYear()} 见衡科技 JIANHENG TECHNOLOGY</p>
    </footer>;
}

function LoginShell({ children }: { children: ReactNode }) {
    return <div className="login-page">
        <div className="login-backdrop" aria-hidden="true" />
        <LoginTopbar />
        {children}
        <Copyright />
    </div>;
}

export function LoginSplash() {
    return <LoginShell>
        <main className="login-splash" aria-busy="true">
            <Spin size="large" />
            <p>正在打开工作台</p>
        </main>
    </LoginShell>;
}

export function LoginPage({ onAuthenticated }: { onAuthenticated: (user: Model<'CurrentUser'>) => void }) {
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    async function submit(values: LoginValues) {
        setSubmitting(true);
        setError('');
        try {
            await signIn(values.username, values.password);
            onAuthenticated(await api<Model<'CurrentUser'>>('/session/me'));
        } catch (caught) {
            setError(caught instanceof ApiError && caught.status === 401
                ? 'mis 或密码不正确，或账号已停用。'
                : showError(caught));
        } finally {
            setSubmitting(false);
        }
    }

    return <LoginShell>
        <main className="login-stage">
            <div className="login-motto">
                <div className="login-motto-lines">
                    <img src={sloganTechnology} alt="以技术" width={421} height={132} />
                    <img src={sloganFuture} alt="见未来" width={467} height={149} />
                </div>
                <p className="login-motto-note">见衡（深圳）人工智能科技有限公司</p>
            </div>

            <section className="login-card" aria-labelledby="login-title">
                <h1 id="login-title">登录工作台</h1>
                <p className="login-lead">使用公司分配的 mis 登录。</p>
                <Form<LoginValues> className="login-form" layout="vertical" requiredMark={false}
                    onFinish={submit} onValuesChange={() => { if (error) setError(''); }}>
                    <Form.Item name="username" rules={[{ required: true, message: '请输入 mis' }]}>
                        <Input aria-label="mis" autoComplete="username" placeholder="请输入 mis" disabled={submitting} />
                    </Form.Item>
                    <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
                        <Input.Password aria-label="密码" autoComplete="current-password" placeholder="请输入密码" disabled={submitting} />
                    </Form.Item>
                    {error && <p className="login-alert" role="alert">{error}</p>}
                    <Button className="login-submit" type="primary" htmlType="submit" block loading={submitting}>登录</Button>
                </Form>
                <p className="login-note">mis 由人事部门分配，忘记密码请联系系统管理员。</p>
            </section>
        </main>
    </LoginShell>;
}
