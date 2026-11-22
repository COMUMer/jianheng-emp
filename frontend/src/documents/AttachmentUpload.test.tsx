import { App } from 'antd';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, expect, test, vi } from 'vitest';
import type { Mock } from 'vitest';
import { api, upload } from '../api';
import type { Model } from '../api';
import { AttachmentUpload } from './AttachmentUpload';

vi.mock('../api', () => ({
    api: vi.fn(),
    upload: vi.fn(),
    showError: (error: unknown) => error instanceof Error ? error.message : '操作失败',
    download: vi.fn(),
}));

const mockedApi = api as unknown as Mock;
const mockedUpload = upload as unknown as Mock;
type Attachment = Model<'Attachment'>;
type ApiOptions = { method?: string; body?: unknown };

function Harness({ initial, kind = 'EXPENSE', category, disabled, onBusyChange = vi.fn() }: {
    initial?: Attachment[];
    kind?: 'EXPENSE' | 'PURCHASE';
    category?: NonNullable<Attachment['category']>;
    disabled?: boolean;
    onBusyChange?: (busy: boolean) => void;
}) {
    const [files, setFiles] = useState<Attachment[]>(initial ?? []);
    return <App>
        <AttachmentUpload files={files} onChange={setFiles} kind={kind} category={category} disabled={disabled} onBusyChange={onBusyChange} />
        <output data-testid="count">{files.length}</output>
    </App>;
}

function uploadInput(container: HTMLElement) {
    return container.querySelector('input[type="file"]') as HTMLInputElement;
}

function selectedFile(body: FormData) {
    return body.get('file') as File;
}

function uploadsAndCategorization() {
    let sequence = 0;
    const names = new Map<number, string>();
    mockedUpload.mockImplementation(async (_path: string, body: FormData) => {
        const file = selectedFile(body);
        const id = ++sequence;
        names.set(id, file.name);
        return { id, originalName: file.name, contentType: 'application/pdf' };
    });
    mockedApi.mockImplementation(async (path: string, options: ApiOptions = {}) => {
        const match = path.match(/^\/attachments\/(\d+)$/);
        if (match) {
            const id = Number(match[1]);
            return { id, originalName: names.get(id), contentType: 'application/pdf',
                category: (options.body as { category: string }).category };
        }
        throw new Error(`Unexpected request: ${path}`);
    });
}

beforeEach(() => { mockedApi.mockReset(); mockedUpload.mockReset(); });

test('uploads files without a category and requires a choice per file', async () => {
    uploadsAndCategorization();
    const { container } = render(<Harness />);

    fireEvent.change(uploadInput(container), { target: { files: [new File(['a'], 'a.pdf', { type: 'application/pdf' }), new File(['b'], 'b.pdf', { type: 'application/pdf' })] } });

    await screen.findByText('a.pdf');
    await screen.findByText('b.pdf');
    expect(mockedUpload.mock.calls.map(([path]) => path)).toEqual(['/attachments', '/attachments']);
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
    expect(screen.getAllByText('请选择类型')).toHaveLength(2);
    expect(screen.getByTestId('count').textContent).toBe('2');
});

test('assigns a category to a single file', async () => {
    uploadsAndCategorization();
    const user = userEvent.setup();
    const { container } = render(<Harness />);

    fireEvent.change(uploadInput(container), { target: { files: [new File(['a'], 'a.pdf', { type: 'application/pdf' })] } });
    await screen.findByText('a.pdf');

    await user.click(screen.getByRole('combobox', { name: 'a.pdf的类型' }));
    await user.click(await screen.findByTitle('付款记录'));

    await waitFor(() => expect(mockedApi).toHaveBeenCalledWith('/attachments/1', { method: 'PATCH', body: { category: 'PAYMENT' } }));
    await waitFor(() => expect(document.querySelector('.attachment-category-select .ant-select-content')
        ?.getAttribute('title')).toBe('付款记录'));
});

test('saves a fixed category upload without asking for a type', async () => {
    mockedUpload.mockImplementation(async (path: string, body: FormData) => {
        const file = selectedFile(body);
        if (path !== '/attachments?category=PAYMENT') throw new Error(`Unexpected request: ${path}`);
        return { id: 1, originalName: file.name, contentType: 'application/pdf', category: 'PAYMENT' };
    });
    const { container } = render(<Harness category="PAYMENT" />);

    fireEvent.change(uploadInput(container), { target: { files: [new File(['a'], 'proof.pdf', { type: 'application/pdf' })] } });

    expect(await screen.findByText('proof.pdf')).toBeTruthy();
    expect(mockedUpload).toHaveBeenCalledWith('/attachments?category=PAYMENT', expect.any(FormData), expect.any(Object));
    expect(screen.getByText('附件将按付款记录保存。')).toBeTruthy();
    expect(screen.getByText('付款记录')).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
});

test('keeps successful uploads and reports a failed file', async () => {
    mockedUpload.mockImplementation(async (_path: string, body: FormData) => {
        const file = selectedFile(body);
        if (file.name === 'b.pdf') throw new Error('上传失败');
        return { id: 1, originalName: file.name, contentType: 'application/pdf' };
    });
    const { container } = render(<Harness />);

    fireEvent.change(uploadInput(container), { target: { files: [new File(['a'], 'a.pdf'), new File(['b'], 'b.pdf')] } });

    await screen.findByText('a.pdf');
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));
    expect(screen.queryByText('b.pdf')).toBeNull();
});

test('rejects files over the size limit before uploading', async () => {
    const file = new File(['a'], 'big.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: 50 * 1024 * 1024 + 1 });
    const { container } = render(<Harness />);

    fireEvent.change(uploadInput(container), { target: { files: [file] } });

    expect(await screen.findByText('big.pdf 超过 50MB，无法上传')).toBeTruthy();
    expect(mockedUpload).not.toHaveBeenCalled();
});

test('previews a PDF attachment', async () => {
    render(<Harness initial={[{ id: 12, originalName: 'a.pdf', contentType: 'application/pdf', category: 'INVOICE' }]} />);

    fireEvent.click(screen.getByRole('button', { name: '预览' }));

    await waitFor(() => expect(document.querySelector('iframe')).toBeTruthy());
    expect(document.querySelector('iframe')?.getAttribute('src')).toBe('/api/attachments/12/preview');
});

test('offers only other materials for purchase attachments', async () => {
    const user = userEvent.setup();
    render(<Harness kind="PURCHASE" initial={[{ id: 12, originalName: 'a.pdf', contentType: 'application/pdf' }]} />);

    await user.click(screen.getByRole('combobox', { name: 'a.pdf的类型' }));

    expect(await screen.findByTitle('其他材料')).toBeTruthy();
    expect(screen.queryByTitle('发票')).toBeNull();
    expect(screen.queryByTitle('付款记录')).toBeNull();
});

test('removes an attachment from the draft', () => {
    render(<Harness initial={[{ id: 12, originalName: 'a.png' }]} />);
    fireEvent.click(screen.getByRole('button', { name: '移除' }));
    expect(screen.getByTestId('count').textContent).toBe('0');
    expect(screen.queryByText('a.png')).toBeNull();
});