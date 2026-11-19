import { MailOutlined } from '@ant-design/icons';
import { App, Button, Form, Input } from 'antd';
import { useState } from 'react';
import { showError } from './api';
import { maskEmail, useVerificationCode } from './password';
import type { VerificationCodeIssued } from './password';
import './verification-code.css';

type Props = {
    email: string;
    onSend: () => Promise<VerificationCodeIssued>;
    onVerify: (code: string) => Promise<void>;
    onVerified: (code: string) => void;
    verified?: string;
};

/** 邮箱验证码：发送入口 + 6 位输入 + 校验通过回调，登录页重置密码与档案内改密共用。 */
export function CodeVerification({ email, onSend, onVerify, onVerified, verified }: Props) {
    const { message } = App.useApp();
    const [form] = Form.useForm<{ code: string }>();
    const [verifying, setVerifying] = useState(false);
    const code = useVerificationCode(onSend);
    const value = Form.useWatch('code', form) ?? '';

    async function send() {
        try {
            await code.request();
            form.resetFields();
            message.success('验证码已发送，10 分钟内有效');
        } catch (error) {
            message.error(showError(error));
        }
    }

    async function verify() {
        let entered: { code?: string };
        try { entered = await form.validateFields(['code']); } catch { return; }
        const input = (entered.code ?? '').trim().toUpperCase();
        setVerifying(true);
        try {
            await onVerify(input);
            onVerified(input);
        } catch (error) {
            message.error(showError(error));
        } finally {
            setVerifying(false);
        }
    }

    return <>
        <div className="password-email">
            <MailOutlined className="password-email-icon" aria-hidden />
            <p className="password-email-to">验证码发送至 <strong>{email ? maskEmail(email) : '档案邮箱'}</strong></p>
            <Button className="password-email-send" type="link" size="small" loading={code.sending}
                disabled={code.countdown > 0} onClick={() => void send()}>{code.label}</Button>
            <p className="password-email-hint">10 分钟内有效，请勿泄露他人</p>
        </div>
        {!verified && <Form form={form} layout="vertical">
                <Form.Item name="code" label="验证码" rules={[
                    { required: true, message: '请输入验证码' },
                    { len: 6, message: '验证码为 6 位字母或数字' },
                ]}>
                    <Input.OTP className="password-code-otp" length={6} size="large" autoComplete="one-time-code"
                        formatter={input => input.toUpperCase()} />
                </Form.Item>
                <Button className="password-verify-button" type="primary" block loading={verifying}
                    disabled={value.trim().length !== 6} onClick={() => void verify()}>确认</Button>
            </Form>}
    </>;
}