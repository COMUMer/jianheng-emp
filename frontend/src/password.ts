import { useEffect, useState } from 'react';
import { ApiError } from './api';

/** 服务端返回的重发间隔；倒计时只认它，不在前端另写一套节流规则。 */
export type VerificationCodeIssued = { retryAfterSeconds?: number };

/** 验证码发送按钮的倒计时逻辑，登录页重置密码与档案内改密共用。 */
export function useVerificationCode<Args extends unknown[]>(
    send: (...args: Args) => Promise<VerificationCodeIssued>,
) {
    const [sending, setSending] = useState(false);
    const [countdown, setCountdown] = useState(0);

    useEffect(() => {
        if (countdown <= 0) return;
        const timer = setInterval(() => setCountdown(value => value - 1), 1000);
        return () => clearInterval(timer);
    }, [countdown]);

    async function request(...args: Args) {
        setSending(true);
        try {
            const issued = await send(...args);
            setCountdown(seconds(issued?.retryAfterSeconds));
        } catch (error) {
            if (error instanceof ApiError && error.status === 429) {
                setCountdown(seconds(error.details?.retryAfterSeconds));
            }
            throw error;
        } finally {
            setSending(false);
        }
    }

    return { sending, countdown, request, label: countdown > 0 ? `${countdown} 秒后可重发` : '发送验证码' };
}

export function maskEmail(email?: string) {
    if (!email) return '—';
    const [name, domain] = email.split('@');
    if (!domain) return email;
    return `${name.slice(0, 2)}***@${domain}`;
}

function seconds(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : 0;
}
