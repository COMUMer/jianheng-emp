import { App } from 'antd';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { api, upload } from '../api';
import MailSettingsPage from './MailSettingsPage';

vi.mock('../api', async importOriginal => ({
    ...await importOriginal<typeof import('../api')>(),
    api: vi.fn(),
    upload: vi.fn(),
}));

const settings = {
    sender: '见衡科技 <no-reply@notify.jianheng.comum.cn>',
    subject: '见衡企业管理 验证码',
    html: '<img src="cid:jianheng-header" alt="见衡科技"><p>你的验证码是 {{code}}</p>',
    resendConfigured: true,
};

test('edits one visual body, previews uploads, and saves the referenced image with the template', async () => {
    let saved: FormData | undefined;
    vi.mocked(upload).mockImplementation(async (path, body) => {
        if (path !== '/mail-settings') throw new Error('Unexpected request: ' + path);
        saved = body;
        return settings as never;
    });
    vi.mocked(api).mockImplementation(async path => {
        if (path !== '/mail-settings') throw new Error('Unexpected request: ' + path);
        return settings as never;
    });
    const user = userEvent.setup();
    render(<App><MemoryRouter><MailSettingsPage /></MemoryRouter></App>);

    expect(await screen.findByDisplayValue(settings.sender)).toBeTruthy();
    expect(screen.queryByText('HTML 正文（源码）')).toBeNull();
    const composer = within(screen.getByRole('region', { name: '编辑邮件' }));
    const saveSettings = composer.getByRole('button', { name: '保存邮件设置' });
    expect(saveSettings.closest('header')).toBe(composer.getByRole('heading', { name: '编辑邮件' }).closest('header'));
    const sender = composer.getByRole('textbox', { name: '发件人' });
    const domainHint = composer.getByText(/notify\.jianheng\.comum\.cn.*Resend.*验证/);
    expect(sender.getAttribute('aria-describedby')).toBe(domainHint.id);
    expect(composer.getByRole('textbox', { name: '主题' })).toBeTruthy();
    expect(composer.getByRole('textbox', { name: '邮件正文' })).toBeTruthy();
    const previewPanel = within(screen.getByRole('complementary', { name: '实时预览' }));
    const preview = previewPanel.getByTitle('邮件预览') as HTMLIFrameElement;
    expect(preview.getAttribute('srcdoc')).toContain('ABC123');
    expect(preview.getAttribute('srcdoc')).toContain('/api/mail-settings/images/jianheng-header');

    await user.click(screen.getByRole('button', { name: '插入变量' }));
    await user.click(await screen.findByRole('menuitem', { name: '有效分钟数' }));
    expect(screen.getByRole('textbox', { name: '邮件正文' }).textContent).toContain('{{minutes}}');

    const image = new File(['test'], '邮件插图.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('选择正文图片'), image);
    await waitFor(() => expect(preview.getAttribute('srcdoc')).toContain('blob:'));

    const insertedImage = composer.getByAltText('邮件插图');
    const wrapper = insertedImage.parentElement!;
    expect(wrapper.style.width).toBe('100%');
    Object.defineProperties(insertedImage, {
        offsetWidth: { get: () => wrapper.style.width.endsWith('px') ? Number.parseFloat(wrapper.style.width) : 360 },
        offsetHeight: { value: 120 },
    });
    const handles = insertedImage.parentElement?.querySelectorAll<HTMLElement>('[data-resize-handle]');
    expect(Array.from(handles ?? [], handle => handle.dataset.resizeHandle)).toEqual(
        ['top-left', 'top-right', 'bottom-left', 'bottom-right']);
    const handle = handles![3];
    Object.defineProperty(handle, 'setPointerCapture', { value: vi.fn() });
    Object.defineProperty(insertedImage.closest('[data-resize-container]'), 'clientWidth', { value: 480 });
    fireEvent.pointerDown(handle, { pointerId: 1, isPrimary: true, pointerType: 'touch', clientX: 360, clientY: 120 });
    fireEvent.pointerMove(handle, { pointerId: 1, pointerType: 'touch', clientX: 240, clientY: 80 });
    fireEvent.pointerUp(handle, { pointerId: 1, pointerType: 'touch' });
    await waitFor(() => expect(preview.getAttribute('srcdoc')).toContain('width="240"'));

    const editor = composer.getByRole('textbox', { name: '邮件正文' });
    fireEvent.keyDown(editor, { key: 'z', ctrlKey: true });
    expect(composer.getByAltText('邮件插图').hasAttribute('width')).toBe(false);
    fireEvent.keyDown(editor, { key: 'y', ctrlKey: true });
    expect(composer.getByAltText('邮件插图').getAttribute('width')).toBe('240');

    await user.clear(screen.getByLabelText('主题'));
    await user.type(screen.getByLabelText('主题'), '新的验证码主题');
    await user.click(saveSettings);

    expect(await screen.findByText('邮件设置已保存')).toBeTruthy();
    const file = saved?.get('images') as File;
    const input = saved?.get('settings') as Blob;
    expect(file.type).toBe('image/png');
    expect(file.name).toMatch(/^[\da-f-]{36}$/);
    const raw = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsText(input);
    });
    const json = JSON.parse(raw);
    expect(json).toEqual({ sender: settings.sender, subject: '新的验证码主题',
        html: expect.stringContaining('cid:' + file.name) });
    expect(json.html).toContain('width="240"');
});
test('saves the draft and sends a test email to the entered recipient', async () => {
    let testedTo: string | undefined;
    vi.mocked(upload).mockImplementation(async () => settings as never);
    vi.mocked(api).mockImplementation(async (path, options) => {
        if (path === '/mail-settings') return settings as never;
        if (path === '/mail-settings/test') {
            testedTo = (options?.body as { recipient: string }).recipient;
            return undefined as never;
        }
        throw new Error('Unexpected request: ' + path);
    });
    const user = userEvent.setup();
    render(<App><MemoryRouter><MailSettingsPage /></MemoryRouter></App>);

    await screen.findByDisplayValue(settings.sender);
    await user.type(screen.getByLabelText('收件人'), 'test@example.com');
    await user.click(screen.getByRole('button', { name: /^发送邮件$/ }));

    expect(await screen.findByText('测试邮件已发送至 test@example.com')).toBeTruthy();
    expect(testedTo).toBe('test@example.com');
});
test('prompts before leaving with unsaved changes', async () => {
    vi.mocked(api).mockImplementation(async path => {
        if (path !== '/mail-settings') throw new Error('Unexpected request: ' + path);
        return settings as never;
    });
    const user = userEvent.setup();
    render(<App><MemoryRouter><a href="/elsewhere">其他页面</a><MailSettingsPage /></MemoryRouter></App>);

    await screen.findByDisplayValue(settings.sender);
    const subject = screen.getByLabelText('主题');
    await user.clear(subject);
    await user.type(subject, '被修改的主题');
    await user.click(screen.getByRole('link', { name: '其他页面' }));

    expect(await screen.findByText('有未保存的修改')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /取\s*消/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')?.className).toContain('ant-zoom-leave'));
});
