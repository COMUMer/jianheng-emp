import { App } from 'antd';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, expect, test, vi } from 'vitest';
import type { Mock } from 'vitest';
import { api } from '../api';
import type { Model } from '../api';
import { AttachmentUpload } from './AttachmentUpload';

vi.mock('../api', () => ({
    api: vi.fn(),
    showError: (error: unknown) => error instanceof Error ? error.message : '操作失败',
}));

const mockedApi = api as unknown as Mock;
type Attachment = Model<'Attachment'>;

function Harness({ initial, invoice, disabled, onBusyChange = vi.fn() }: {
    initial?: Attachment[]; invoice?: boolean; disabled?: boolean; onBusyChange?: (busy: boolean) => void;
}) {
    const [files, setFiles] = useState<Attachment[]>(initial ?? []);
    return <App>
        <AttachmentUpload files={files} onChange={setFiles} invoice={invoice} disabled={disabled} onBusyChange={onBusyChange} />
        <output data-testid="count">{files.length}</output>
    </App>;
}

function uploadInput(container: HTMLElement) {
    return container.querySelector('input[type="file"]') as HTMLInputElement;
}

function selectedFile(options: { body?: unknown }) {
    return options.body instanceof FormData ? options.body.get('file') as File : undefined;
}

beforeEach(() => { mockedApi.mockReset(); });

test('uploads each selected file in order and lists it', async () => {
    let sequence = 0;
    mockedApi.mockImplementation(async (_path: string, options: { body?: unknown }) => ({ id: ++sequence, originalName: selectedFile(options)?.name }));
    const onBusyChange = vi.fn();
    const { container } = render(<Harness onBusyChange={onBusyChange} />);

    fireEvent.change(uploadInput(container), { target: { files: [new File(['a'], 'a.png'), new File(['b'], 'b.pdf')] } });

    await screen.findByText('a.png');
    await screen.findByText('b.pdf');
    expect(mockedApi.mock.calls.map(([path]) => path)).toEqual(['/attachments', '/attachments']);
    expect(mockedApi.mock.calls.map(([, options]) => selectedFile(options)?.name)).toEqual(['a.png', 'b.pdf']);
    expect(screen.getByTestId('count').textContent).toBe('2');
    expect(onBusyChange).toHaveBeenCalledWith(true);
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
});

test('keeps successful uploads and reports a failed file', async () => {
    mockedApi.mockImplementation(async (_path: string, options: { body?: unknown }) => {
        const file = selectedFile(options)!;
        if (file.name === 'b.pdf') throw new Error('上传失败');
        return { id: 1, originalName: file.name };
    });
    const onBusyChange = vi.fn();
    const { container } = render(<Harness onBusyChange={onBusyChange} />);

    fireEvent.change(uploadInput(container), { target: { files: [new File(['a'], 'a.png'), new File(['b'], 'b.pdf')] } });

    await screen.findByText('a.png');
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));
    expect(screen.queryByText('b.pdf')).toBeNull();
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
});

test('saves a file invoice number when the field loses focus', async () => {
    mockedApi.mockResolvedValue({ id: 12, originalName: 'a.png', invoiceKey: 'ABC123' });
    render(<Harness initial={[{ id: 12, originalName: 'a.png' }]} invoice />);

    const field = screen.getByLabelText('票号');
    fireEvent.change(field, { target: { value: ' abc123 ' } });
    fireEvent.blur(field);

    await waitFor(() => expect(mockedApi).toHaveBeenCalledWith('/attachments/12', { method: 'PATCH', body: { invoice: ' abc123 ' } }));
    await waitFor(() => expect((screen.getByLabelText('票号') as HTMLInputElement).value).toBe('ABC123'));
});

test('blocks the draft while an invoice update is pending', async () => {
    let finish: ((value: Attachment) => void) | undefined;
    mockedApi.mockImplementation(() => new Promise<Attachment>(resolve => { finish = resolve; }));
    const onBusyChange = vi.fn();
    render(<Harness initial={[{ id: 12, originalName: 'a.png' }]} invoice onBusyChange={onBusyChange} />);

    const field = screen.getByLabelText('票号');
    fireEvent.change(field, { target: { value: 'A1' } });
    fireEvent.blur(field);

    await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(true));
    expect((screen.getByLabelText('票号') as HTMLInputElement).disabled).toBe(true);
    await act(async () => { finish?.({ id: 12, originalName: 'a.png', invoiceKey: 'A1' }); });
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
});

test('does not offer an invoice field for purchase attachments', () => {
    render(<Harness initial={[{ id: 12, originalName: 'a.png', invoiceKey: 'ABC123' }]} />);
    expect(screen.queryByLabelText('票号')).toBeNull();
});

test('removes an attachment from the draft', () => {
    render(<Harness initial={[{ id: 12, originalName: 'a.png' }]} />);
    fireEvent.click(screen.getByRole('button', { name: '移除' }));
    expect(screen.getByTestId('count').textContent).toBe('0');
    expect(screen.queryByText('a.png')).toBeNull();
});