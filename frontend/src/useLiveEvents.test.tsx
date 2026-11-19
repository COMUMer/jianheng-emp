import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { FakeEventSource } from './test/fakeEventSource';
import { useLiveEvents } from './useLiveEvents';

const nativeHidden = Object.getOwnPropertyDescriptor(document, 'hidden');

beforeEach(() => {
    FakeEventSource.reset();
    vi.stubGlobal('EventSource', FakeEventSource);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    if (nativeHidden) Object.defineProperty(document, 'hidden', nativeHidden);
});

test('refreshes when the stream opens and on every change', () => {
    const onSignal = vi.fn();
    renderHook(() => useLiveEvents(onSignal));
    const source = FakeEventSource.instances[0];

    expect(source.url).toBe('/api/events');
    act(() => source.emit('open'));
    expect(onSignal).toHaveBeenCalledTimes(1);

    act(() => source.emit('workflow'));
    expect(onSignal).toHaveBeenCalledTimes(2);
});

test('falls back to polling while the stream is unavailable', () => {
    vi.useFakeTimers();
    const onSignal = vi.fn();
    renderHook(() => useLiveEvents(onSignal));
    const source = FakeEventSource.instances[0];

    act(() => source.emit('open'));
    act(() => source.emit('error'));
    onSignal.mockClear();

    act(() => { vi.advanceTimersByTime(30_000); });
    expect(onSignal).toHaveBeenCalledTimes(1);
});

test('does not poll while the stream is healthy', () => {
    vi.useFakeTimers();
    const onSignal = vi.fn();
    renderHook(() => useLiveEvents(onSignal));

    act(() => FakeEventSource.instances[0].emit('open'));
    onSignal.mockClear();
    act(() => { vi.advanceTimersByTime(90_000); });

    expect(onSignal).not.toHaveBeenCalled();
});

test('skips background refreshes while the page is hidden', () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    const onSignal = vi.fn();
    renderHook(() => useLiveEvents(onSignal));

    act(() => FakeEventSource.instances[0].emit('error'));
    onSignal.mockClear();
    act(() => { vi.advanceTimersByTime(120_000); });

    expect(onSignal).not.toHaveBeenCalled();
});

test('stays idle until the user is signed in', () => {
    renderHook(() => useLiveEvents(vi.fn(), false));

    expect(FakeEventSource.instances).toHaveLength(0);
});
