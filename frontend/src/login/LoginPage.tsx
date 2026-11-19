import { Button, Form, Input, Spin, notification } from 'antd';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { CodeVerification } from '../CodeVerification';
import { api, ApiError, checkPasswordIdentity, resetPassword, sendResetCode, signIn, showError, verifyResetCode } from '../api';
import type { Model } from '../api';
import { BrandLockup } from '../brand/Brand';
import { successNotice } from '../notice';
import sloganTechnology from './slogan-technology.png';
import sloganFuture from './slogan-future.png';
import './login.css';

type LoginValues = { username: string; password: string };
type IdentityValues = { mis: string; email: string };
type PasswordValues = { newPassword: string; confirm: string };

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
    const [notify, notifyContext] = notification.useNotification();
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [resetOpen, setResetOpen] = useState(false);
    const [stage, setStage] = useState<'identity' | 'code' | 'password'>('identity');
    const [identity, setIdentity] = useState({ mis: '', email: '' });
    const [verifiedCode, setVerifiedCode] = useState('');
    const [identityForm] = Form.useForm<IdentityValues>();
    const [passwordForm] = Form.useForm<PasswordValues>();

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

    function leaveReset() {
        setResetOpen(false);
        setStage('identity');
        setIdentity({ mis: '', email: '' });
        setVerifiedCode('');
        setError('');
        identityForm.resetFields();
        passwordForm.resetFields();
    }

    async function submitIdentity(values: IdentityValues) {
        setSubmitting(true);
        setError('');
        try {
            await checkPasswordIdentity(values.mis.trim(), values.email.trim());
            setIdentity({ mis: values.mis.trim(), email: values.email.trim() });
            setStage('code');
        } catch (caught) {
            setError(showError(caught));
        } finally {
            setSubmitting(false);
        }
    }

    async function submitPassword(values: PasswordValues) {
        setSubmitting(true);
        setError('');
        try {
            await resetPassword(identity.mis, identity.email, verifiedCode, values.newPassword);
            notify.success(successNotice('密码已修改，请使用新密码登录。'));
            leaveReset();
        } catch (caught) {
            setError(showError(caught));
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

            <section className={`login-card${resetOpen && stage === 'code' ? ' login-card-code' : ''}`}
                aria-labelledby={!resetOpen ? 'login-title' : stage === 'code' ? undefined : 'reset-title'}
                aria-label={resetOpen && stage === 'code' ? '校验身份' : undefined}>
                {!resetOpen ? <>
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
                    <p className="login-note login-note-right">
                        <button type="button" className="login-link" onClick={() => {
                            setError('');
                            setResetOpen(true);
                        }}>忘记密码？</button>
                    </p>
                </> : <>
                    {stage !== 'code' && <h1 id="reset-title">修改密码</h1>}
                    {stage === 'identity' && <>
                        <p className="login-lead">填写账号和档案邮箱，校验身份。</p>
                        <Form<IdentityValues> form={identityForm} className="login-form" layout="vertical" requiredMark={false}
                            onFinish={submitIdentity} onValuesChange={() => { if (error) setError(''); }}>
                            <Form.Item name="mis" rules={[{ required: true, whitespace: true, message: '请输入 mis' }]}>
                                <Input aria-label="mis" autoComplete="username" placeholder="请输入 mis" disabled={submitting} />
                            </Form.Item>
                            <Form.Item name="email" rules={[
                                { required: true, whitespace: true, message: '请输入档案邮箱' },
                                { type: 'email', transform: (value?: string) => value?.trim(), message: '请输入有效的邮箱' },
                            ]}>
                                <Input aria-label="档案邮箱" autoComplete="email" placeholder="入职时填写的邮箱" disabled={submitting} />
                            </Form.Item>
                            {error && <p className="login-alert" role="alert">{error}</p>}
                            <Button className="login-submit" type="primary" htmlType="submit" block loading={submitting}>下一步</Button>
                        </Form>
                    </>}
                    {stage === 'code' && <CodeVerification email={identity.email}
                        onSend={() => sendResetCode(identity.mis, identity.email)}
                        onVerify={value => verifyResetCode(identity.mis, identity.email, value)}
                        onVerified={value => { setVerifiedCode(value); setStage('password'); }} />}
                    {stage === 'password' && <>
                        <Form<PasswordValues> form={passwordForm} className="login-form" layout="vertical" requiredMark={false}
                            onFinish={submitPassword} onValuesChange={() => { if (error) setError(''); }}>
                            <Form.Item name="newPassword" rules={[
                                { required: true, message: '请输入新密码' },
                                { min: 6, message: '密码至少 6 个字符' },
                            ]}>
                                <Input.Password aria-label="新密码" autoComplete="new-password" placeholder="新密码（至少 6 个字符）"
                                    disabled={submitting} />
                            </Form.Item>
                            <Form.Item name="confirm" dependencies={['newPassword']} rules={[
                                { required: true, message: '请再次输入新密码' },
                                ({ getFieldValue }) => ({
                                    validator: (_, value) => !value || value === getFieldValue('newPassword')
                                        ? Promise.resolve() : Promise.reject(new Error('两次输入的密码不一致')),
                                }),
                            ]}>
                                <Input.Password aria-label="确认新密码" autoComplete="new-password" placeholder="再次输入新密码"
                                    disabled={submitting} />
                            </Form.Item>
                            {error && <p className="login-alert" role="alert">{error}</p>}
                            <Button className="login-submit" type="primary" htmlType="submit" block loading={submitting}>修改密码</Button>
                        </Form>
                    </>}
                    <div className="password-reset-links">
                        {stage !== 'identity' && <button type="button" className="login-link" onClick={() => {
                            setStage('identity'); setVerifiedCode(''); setError('');
                        }}>上一步</button>}
                        <button type="button" className="login-link" onClick={leaveReset}>返回登录</button>
                    </div>
                </>}
            </section>
        </main>
        {notifyContext}
    </LoginShell>;
}
