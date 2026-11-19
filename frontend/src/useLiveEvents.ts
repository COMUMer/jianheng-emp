import { useEffect, useRef } from 'react';

/** SSE 不可用时的兜底间隔；只在前台页面工作。 */
const POLL_INTERVAL_MS = 30_000;

/**
 * 实时信号：和服务端保持一条 SSE，收到「有更新」就刷新；连接不可用时降级为定时轮询，
 * 回到前台或恢复联网时立即补一次，保证断线期间的变化不会漏掉。
 */
export function useLiveEvents(onSignal: () => void, enabled = true) {
    const handler = useRef(onSignal);
    handler.current = onSignal;

    useEffect(() => {
        if (!enabled) return;
        let live = false;
        let source: EventSource | undefined;
        if (typeof EventSource !== 'undefined') {
            source = new EventSource('/api/events');
            source.addEventListener('open', () => { live = true; handler.current(); });
            source.addEventListener('workflow', () => handler.current());
            source.addEventListener('error', () => { live = false; });
        }
        const refresh = () => { if (!document.hidden) handler.current(); };
        const timer = window.setInterval(() => { if (!live) refresh(); }, POLL_INTERVAL_MS);
        document.addEventListener('visibilitychange', refresh);
        window.addEventListener('online', refresh);
        return () => {
            source?.close();
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', refresh);
            window.removeEventListener('online', refresh);
        };
    }, [enabled]);
}
