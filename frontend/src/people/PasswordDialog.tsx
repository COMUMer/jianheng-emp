import { App, Button, Form, Input, Modal, notification } from 'antd';
import { useEffect, useState } from 'react';
import { CodeVerification } from '../CodeVerification';
import { accountEmail, changePassword, sendPasswordCode, showError, verifyPasswordCode } from '../api';
import { successNotice } from '../notice';

type Values = { newPassword: string; confirm: string };

/** 登录后主动改密：先验证邮箱验证码，再设置新密码。 */
export function PasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { message } = App.useApp();
    const [notify, notifyContext] = notification.useNotification();
    const [email, setEmail] = useState('');
    const [busy, setBusy] = useState(false);
    const [verifiedCode, setVerifiedCode] = useState('');
    const [form] = Form.useForm<Values>();

    useEffect(() => {
        if (!open) return;
        accountEmail().then(result => setEmail(result.email ?? '')).catch(error => message.error(showError(error)));
    }, [open]);

    function reset() {
        form.resetFields();
        setVerifiedCode('');
    }

    async function submit(values: Values) {
        setBusy(true);
        try {
            await changePassword(verifiedCode, values.newPassword);
            message.success('密码已更新，其他设备需重新登录');
            reset();
            onClose();
        } catch (error) {
            message.error(showError(error));
        } finally {
            setBusy(false);
        }
    }

    return <>
        <Modal open={open} title="修改密码" width={480} centered onCancel={onClose} footer={null} destroyOnHidden
        afterOpenChange={value => { if (value) reset(); }}>
        <div className="password-dialog">
            <CodeVerification email={email} onSend={sendPasswordCode} onVerify={verifyPasswordCode}
                verified={verifiedCode} onVerified={value => {
                    setVerifiedCode(value);
                    notify.success(successNotice('邮箱验证通过，请设置新密码。'));
                }} />
            {verifiedCode && <Form<Values> className="password-form" form={form} layout="vertical" onFinish={submit}>
                <Form.Item name="newPassword" label="新密码" rules={[
                    { required: true, message: '请输入新密码' },
                    { min: 6, message: '密码至少 6 个字符' },
                ]}><Input.Password autoComplete="new-password" placeholder="至少 6 个字符" /></Form.Item>
                <Form.Item name="confirm" label="确认新密码" dependencies={['newPassword']} rules={[
                    { required: true, message: '请再次输入新密码' },
                    ({ getFieldValue }) => ({
                        validator: (_, value) => !value || value === getFieldValue('newPassword')
                            ? Promise.resolve() : Promise.reject(new Error('两次输入的密码不一致')),
                    }),
                ]}><Input.Password autoComplete="new-password" placeholder="再次输入新密码" /></Form.Item>
                <Button className="password-save-button" type="primary" htmlType="submit" block loading={busy}>保存新密码</Button>
            </Form>}
        </div>
    </Modal>
    {notifyContext}
    </>;
}