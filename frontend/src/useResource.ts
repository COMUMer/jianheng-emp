import { useCallback, useEffect, useState } from 'react';
import { api, showError } from './api';

/** 取一次资源；`keys` 变化时重新取，用于跟随导航与实时信号。 */
export function useResource<T>(path: string | null, ...keys: unknown[]) {
    const [result, setResult] = useState<{ path: string; data?: T; error?: string }>();
    const [refresh, setRefresh] = useState(0);
    const reload = useCallback(() => setRefresh(value => value + 1), []);
    useEffect(() => {
        if (!path) return;
        let active = true;
        setResult(undefined);
        api<T>(path).then(data => { if (active) setResult({ path, data }); })
            .catch(error => { if (active) setResult({ path, error: showError(error) }); });
        return () => { active = false; };
    }, [path, refresh, ...keys]);
    return { data: result?.path === path ? result.data : undefined, error: result?.path === path ? result.error : undefined,
        loading: !!path && result?.path !== path, reload };
}
