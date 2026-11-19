import { afterEach, expect, test, vi } from 'vitest';
import { ApiError, api } from './api';

function errorResponse(status: number, body?: unknown) {
    return {
        ok: false,
        status,
        json: async () => body,
    } as Response;
}

afterEach(() => vi.unstubAllGlobals());

test('explains a server error instead of showing only the status code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorResponse(500)));

    let error: ApiError | undefined;
    try { await api('/attachments'); } catch (caught) { error = caught as ApiError; }

    expect(error).toBeInstanceOf(ApiError);
    expect(error?.message).toBe('服务器处理失败，请稍后重试');
    expect(error?.status).toBe(500);
});

test('prefers the explanation returned by the server', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorResponse(500, { message: '附件保存失败，请稍后重试' })));

    await expect(api('/attachments')).rejects.toThrow('附件保存失败，请稍后重试');
});

test('does not show an empty explanation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorResponse(500, { message: '  ' })));

    await expect(api('/attachments')).rejects.toThrow('服务器处理失败，请稍后重试');
});

test('explains a rejected request without a server message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorResponse(400)));

    await expect(api('/documents')).rejects.toThrow('请求未能完成，请刷新后重试');
});