import type { components } from './schema';

export type Model<K extends keyof components['schemas']> = components['schemas'][K];
export class ApiError extends Error {
    constructor(public readonly status: number, message: string) { super(message); }
}

async function request(path: string, options: RequestInit = {}, reportExpired = true) {
    const response = await fetch(`/api${path}`, options);
    if (!response.ok) {
        if (reportExpired && response.status === 401) window.dispatchEvent(new Event('session-expired'));
        const payload = await response.json().catch(() => null) as { message?: string } | null;
        const fallback = response.status === 403 ? '你没有权限执行此操作' : `操作失败（${response.status}）`;
        throw new ApiError(response.status, payload?.message ?? fallback);
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
