import { renderHook, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { api } from './api';
import { useResource } from './useResource';

vi.mock('./api', async importOriginal => ({ ...(await importOriginal<typeof import('./api')>()), api: vi.fn() }));

test('refetches when a refresh key changes', async () => {
    vi.mocked(api).mockResolvedValue(['a'] as never);
    const { result, rerender } = renderHook(({ scope }) => useResource<string[]>('/inbox', scope),
        { initialProps: { scope: 'home' } });

    await waitFor(() => expect(result.current.data).toEqual(['a']));
    expect(vi.mocked(api)).toHaveBeenCalledTimes(1);

    rerender({ scope: 'inbox' });

    await waitFor(() => expect(vi.mocked(api)).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api)).toHaveBeenLastCalledWith('/inbox');
});

test('keeps the previous data while a path is not in use', async () => {
    vi.mocked(api).mockResolvedValue([] as never);
    const { result } = renderHook(() => useResource<string[]>(null));

    expect(result.current.data).toBeUndefined();
    expect(vi.mocked(api)).not.toHaveBeenCalled();
});
