/** 测试用 EventSource：jsdom 没有它，这里记录连接并允许手动触发事件。 */
export class FakeEventSource {
    static instances: FakeEventSource[] = [];
    readonly listeners = new Map<string, Set<() => void>>();
    closed = false;

    constructor(readonly url: string) {
        FakeEventSource.instances.push(this);
    }

    addEventListener(type: string, listener: () => void) {
        if (!this.listeners.has(type)) this.listeners.set(type, new Set());
        this.listeners.get(type)?.add(listener);
    }

    close() {
        this.closed = true;
    }

    emit(type: string) {
        this.listeners.get(type)?.forEach(listener => listener());
    }

    static latest() {
        return FakeEventSource.instances.at(-1);
    }

    static reset() {
        FakeEventSource.instances = [];
    }
}
