import type { components } from './schema';

export type Model<K extends keyof components['schemas']> = components['schemas'][K];
export class ApiError extends Error {
    constructor(public readonly status: number, message: string, public readonly details?: Record<string, unknown>) { super(message); }
}

async function request(path: string, options: RequestInit = {}, reportExpired = true) {
    const response = await fetch(`/api${path}`, options);
    if (!response.ok) {
        if (reportExpired && response.status === 401) window.dispatchEvent(new Event('session-expired'));
        const payload = await response.json().catch(() => null) as ({ message?: string } & Record<string, unknown>) | null;
        const serverMessage = typeof payload?.message === 'string' ? payload.message.trim() : '';
        const fallback = response.status === 401 ? '登录已失效，请重新登录'
            : response.status === 403 ? '你没有权限执行此操作'
            : response.status === 404 ? '请求的内容不存在或已被删除'
            : response.status === 413 ? '文件超过大小限制，请压缩后重试'
            : response.status === 429 ? '操作过于频繁，请稍后重试'
            : response.status >= 500 ? '服务器处理失败，请稍后重试'
            : response.status >= 400 ? '请求未能完成，请刷新后重试'
            : '请求未能完成，请稍后重试';
        throw new ApiError(response.status, serverMessage || fallback, payload ?? undefined);
    }
    return response;
}

async function csrfHeaders() {
    const token = await (await request('/session/csrf')).json() as Model<'Csrf'>;
    if (!token.headerName || !token.token) throw new Error('无法初始化登录会话');
    return { [token.headerName]: token.token };
}

export async function api<T = void>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
    const method = options.method ?? 'GET';
    const headers = new Headers(method === 'GET' ? undefined : await csrfHeaders());
    let body: BodyInit | undefined;
    if (options.body instanceof FormData) body = options.body;
    else if (options.body !== undefined) {
        headers.set('Content-Type', 'application/json');
        body = JSON.stringify(options.body);
    }
    const response = await request(path, { method, headers, body });
    const content = await response.text();
    return (content ? JSON.parse(content) : undefined) as T;
}

export async function signIn(username: string, password: string) {
    await request('/session/login', { method: 'POST', headers: await csrfHeaders(), body: new URLSearchParams({ username, password }) }, false);
}

/** 登录页忘记密码：向「账号 + 档案邮箱」匹配的员工发送验证码。 */
export async function checkPasswordIdentity(mis: string, email: string) {
    await api('/session/password/check', { method: 'POST', body: { mis, email } });
}

export async function sendResetCode(mis: string, email: string) {
    return api<Model<'CodeIssued'>>('/session/password/code', { method: 'POST', body: { mis, email } });
}

export async function verifyResetCode(mis: string, email: string, code: string) {
    await api('/session/password/verify', { method: 'POST', body: { mis, email, code } });
}

export async function resetPassword(mis: string, email: string, code: string, newPassword: string) {
    await api('/session/password/reset', { method: 'POST', body: { mis, email, code, newPassword } });
}

/** 登录后改密：验证码发到本人档案邮箱。 */
export async function accountEmail() {
    return api<{ email?: string }>('/account/password/email');
}

export async function sendPasswordCode() {
    return api<Model<'CodeIssued'>>('/account/password/code', { method: 'POST' });
}

export async function verifyPasswordCode(code: string) {
    await api('/account/password/verify', { method: 'POST', body: { code } });
}

export async function changePassword(code: string, newPassword: string) {
    await api('/account/password', { method: 'PUT', body: { code, newPassword } });
}

export function showError(error: unknown) {
    return error instanceof Error && !(error instanceof TypeError) ? error.message : '无法连接服务器，请检查网络后重试';
}

export async function download(path: string, name: string) {
    const response = await request(path);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(await response.blob());
    link.download = name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
