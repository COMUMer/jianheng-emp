import { BoldOutlined, DeleteOutlined, DownOutlined, ItalicOutlined, PictureOutlined, SendOutlined, SwapOutlined } from '@ant-design/icons';
import { NodeSelection, Selection } from '@tiptap/pm/state';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Alert, App, Button, Dropdown, Form, Input, Tag } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, showError, upload } from '../api';
import type { Model } from '../api';
import { PageHeading, ResourceState } from '../common';
import { UploadProgress } from '../UploadProgress';
import { formatDate } from '../format';
import { LeaveConfirmModal, reloadTarget, useLeaveGuard } from '../leaveGuard';
import { useResource } from '../useResource';
import { MailImage } from './MailImage';
import './mail-message-body.css';
import messageBodyStyles from './mail-message-body.css?inline';
import './mail-settings.css';

type Settings = Model<'MailSettingsView'>;
type Envelope = Pick<Settings, 'sender' | 'subject'>;
type Values = Envelope & { recipient?: string };
type DraftImage = { id: string; file: File };

const cidPrefix = 'cid:';
const imagePath = '/api/mail-settings/images/';
const imageTypes = ['image/png', 'image/jpeg'];
const imageUrl = (id: string) => window.location.origin + imagePath + id;
const verificationCode = '{{code}}';
const mailVariables = [
    { key: verificationCode, label: '验证码', example: 'ABC123' },
    { key: '{{minutes}}', label: '有效分钟数', example: '10' },
];
const sample = (value: string) => mailVariables.reduce((text, { key, example }) => text.replaceAll(key, example), value);
const extensions = [
    StarterKit.configure({ link: false, horizontalRule: false, code: false, codeBlock: false }),
    MailImage,
];

function bodyFragment(html: string) {
    const template = document.createElement('template');
    template.innerHTML = html;
    return template;
}

function mapImages(html: string, sourceFor: (source: string) => string | undefined) {
    const template = bodyFragment(html);
    for (const image of template.content.querySelectorAll('img')) {
        const source = sourceFor(image.getAttribute('src') ?? '');
        if (source) image.setAttribute('src', source);
        else image.remove();
    }
    return template.innerHTML;
}

/** 空段落（含只有 <br> 或空格的）在邮件客户端会塌陷，预览与发送统一补一个不换行空格。 */
function fillBlankBlocks(content: DocumentFragment) {
    content.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, li, blockquote').forEach(node => {
        const block = node as HTMLElement;
        const onlyBreaks = [...block.children].every(child => child.tagName === 'BR');
        if (!block.querySelector('img, p, div, ul, ol') && onlyBreaks && !block.textContent?.trim()) {
            block.textContent = '\u00a0';
        }
    });
}
/** 行首缩进与连续空格在 HTML 里会被折叠，转成不换行空格，保证预览与收到的一致。 */
function preserveSpaces(content: DocumentFragment) {
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        node.nodeValue = (node.nodeValue ?? '').replace(/^ +| {2,}/g, spaces => '\u00a0'.repeat(spaces.length));
    }
}
function MailPreview({ sender, subject, html }: Envelope & { html: string }) {
    const stopFitting = useRef<() => void>(undefined);
    useEffect(() => () => stopFitting.current?.(), []);

    const contents = bodyFragment(html);
    const text = document.createTreeWalker(contents.content, NodeFilter.SHOW_TEXT);
    for (let node = text.nextNode(); node; node = text.nextNode()) {
        node.nodeValue = sample(node.nodeValue ?? '');
    }
    preserveSpaces(contents.content);
    fillBlankBlocks(contents.content);
    const srcDoc = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' blob:; style-src 'unsafe-inline'">
        <style>html{overflow:hidden}body{margin:0}${messageBodyStyles}</style>
        </head><body><article class="mail-message-body">${contents.innerHTML}</article></body></html>`;

    return <aside className="surface mail-panel" aria-labelledby="mail-preview-title">
        <header className="mail-panel-heading">
            <h2 id="mail-preview-title">实时预览</h2>
            <span className="muted">使用示例验证码</span>
        </header>
        <div className="mail-panel-bar mail-preview-envelope">
            <p className="mail-preview-subject">{sample(subject) || '邮件主题'}</p>
            <p className="mail-preview-meta">发件人 {sender || '—'}</p>
        </div>
        <div className="mail-panel-content">
            <iframe title="邮件预览" className="mail-preview-frame" sandbox="allow-same-origin" srcDoc={srcDoc}
                onLoad={event => {
                    stopFitting.current?.();
                    const frame = event.currentTarget;
                    const content = frame.contentDocument?.querySelector('article');
                    if (!content) return;
                    const fit = () => {
                        const height = `${Math.ceil(content.getBoundingClientRect().height)}px`;
                        if (frame.style.height !== height) frame.style.height = height;
                    };
                    fit();
                    let pendingFit = 0;
                    const observer = new ResizeObserver(() => {
                        cancelAnimationFrame(pendingFit);
                        pendingFit = requestAnimationFrame(fit);
                    });
                    observer.observe(content);
                    stopFitting.current = () => {
                        observer.disconnect();
                        cancelAnimationFrame(pendingFit);
                    };
                }} />
        </div>
    </aside>;
}

function MailSettingsEditor({ settings, reload }: { settings: Settings; reload: () => void }) {
    const { message } = App.useApp();
    const [form] = Form.useForm<Values>();
    const [saving, setSaving] = useState(false);
    const [sending, setSending] = useState(false);
    const [uploadPercent, setUploadPercent] = useState(0);
    const [dirty, setDirty] = useState(false);
    const [leaveTo, setLeaveTo] = useState<string | null>(null);
    const navigate = useNavigate();
    const [bodyError, setBodyError] = useState('');
    const [body, setBody] = useState(() => mapImages(settings.html, source =>
        source.startsWith(cidPrefix) ? imageUrl(source.slice(cidPrefix.length)) : undefined));
    const drafts = useRef(new Map<string, DraftImage>());
    const filePicker = useRef<HTMLInputElement>(null);
    const replacing = useRef(false);
    const sender = Form.useWatch('sender', form) ?? settings.sender;
    const subject = Form.useWatch('subject', form) ?? settings.subject;

    const editor = useEditor({
        extensions,
        content: body,
        editorProps: {
            attributes: { class: 'mail-message-body', role: 'textbox', 'aria-label': '邮件正文',
                'aria-multiline': 'true', spellcheck: 'false' },
            transformPastedHTML: html => mapImages(html, () => undefined),
        },
        onCreate: ({ editor: current }) => {
            const start = Selection.findFrom(current.state.doc.resolve(0), 1, true);
            if (start) current.commands.setTextSelection(start.from);
            setBody(current.getHTML());
        },
        onUpdate: ({ editor: current }) => {
            setBody(current.getHTML());
            setBodyError('');
            setDirty(true);
        },
    });
    const marks = useEditorState({
        editor,
        selector: ({ editor: current }) => ({
            bold: current?.isActive('bold') ?? false,
            italic: current?.isActive('italic') ?? false,
            imageSelected: current?.state.selection instanceof NodeSelection && current.isActive('image'),
        }),
    });

    useEffect(() => {
        const images = drafts.current;
        return () => { images.forEach((_, url) => URL.revokeObjectURL(url)); };
    }, []);
    useEffect(() => { editor?.setEditable(!saving && !sending, false); }, [editor, saving, sending]);
    const { reloadPage } = useLeaveGuard(dirty, setLeaveTo);

    function selectImage(replace: boolean) {
        replacing.current = replace;
        filePicker.current?.click();
    }

    function addImage(file: File) {
        if (!editor) return;
        if (!imageTypes.includes(file.type)) {
            message.error('请选择 PNG 或 JPEG 图片');
            return;
        }
        if (file.size > 3 * 1024 * 1024) {
            message.error('请选择不超过 3 MB 的图片');
            return;
        }

        const src = URL.createObjectURL(file);
        drafts.current.set(src, { id: crypto.randomUUID(), file });
        const image = { src, alt: file.name.replace(/\.[^.]+$/, '') };
        const selection = editor.state.selection;
        const command = editor.chain().focus(undefined, { scrollIntoView: false });
        if (selection instanceof NodeSelection && selection.node.type.name === 'image') {
            if (replacing.current) command.updateAttributes('image', image).run();
            else command.insertContentAt(selection.to, { type: 'image', attrs: image }).run();
        } else {
            command.setImage(image).run();
        }
    }

    async function persist(values: Values): Promise<boolean> {
        if (!editor) return false;
        if (!editor.getText({ blockSeparator: '\n' }).includes(verificationCode)) {
            setBodyError('请在正文中插入验证码');
            editor.commands.focus();
            return false;
        }

        const data = new FormData();
        const used = new Set<string>();
        const html = mapImages(editor.getHTML(), source => {
            const draft = drafts.current.get(source);
            if (draft) {
                if (!used.has(draft.id)) data.append('images', draft.file, draft.id);
                used.add(draft.id);
                return cidPrefix + draft.id;
            }
            const savedImageRoot = imageUrl('');
            return source.startsWith(savedImageRoot) ? cidPrefix + source.slice(savedImageRoot.length) : undefined;
        });
        data.append('settings', new Blob([JSON.stringify({ sender: values.sender, subject: values.subject, html })],
            { type: 'application/json' }));
        await upload('/mail-settings', data, { method: 'PUT', onProgress: setUploadPercent });
        return true;
    }

    async function save(values: Values) {
        setSaving(true);
        setUploadPercent(0);
        try {
            if (!await persist(values)) return;
            setDirty(false);
            message.success('邮件设置已保存');
            reload();
        } catch (error) {
            message.error(showError(error));
        } finally {
            setSaving(false);
            setUploadPercent(0);
        }
    }

    async function sendTest() {
        let values: Values;
        try { values = await form.validateFields(['recipient', 'sender', 'subject']); }
        catch { return; }
        const recipient = values.recipient?.trim();
        if (!recipient) {
            form.setFields([{ name: 'recipient', errors: ['请输入收件人邮箱'] }]);
            return;
        }
        setSending(true);
        try {
            if (!await persist(values)) return;
            setDirty(false);
            await api('/mail-settings/test', { method: 'POST', body: { recipient } });
            message.success('测试邮件已发送至 ' + recipient);
            reload();
        } catch (error) {
            message.error(showError(error));
        } finally {
            setSending(false);
        }
    }

    async function saveAndLeave() {
        let values: Values;
        try { values = await form.validateFields(['sender', 'subject']); }
        catch { return; }
        setSaving(true);
        try {
            if (!await persist(values)) return;
            setDirty(false);
            const target = leaveTo;
            setLeaveTo(null);
            message.success('邮件设置已保存');
            if (target) goTo(target);
        } catch (error) {
            message.error(showError(error));
        } finally {
            setSaving(false);
        }
    }

    function goTo(target: string) {
        if (target === reloadTarget) reloadPage();
        else navigate(target);
    }

    function leaveWithoutSaving() {
        const target = leaveTo;
        setLeaveTo(null);
        setDirty(false);
        if (target) goTo(target);
    }

    return <>
        <PageHeading title="邮件设置" />
        {(saving || sending) && uploadPercent > 0 && <UploadProgress percent={uploadPercent} label="正在保存并上传图片" />}
        <div className="mail-settings-status">
            <Tag color={settings.resendConfigured ? 'green' : 'orange'}>
                Resend {settings.resendConfigured ? '已配置' : '未配置'}
            </Tag>
            {dirty && <Tag color="gold">有未保存修改</Tag>}
            {settings.updatedAt && <span className="muted">
                最近更新 {formatDate(settings.updatedAt)}{settings.updatedBy ? ` · ${settings.updatedBy}` : ''}
            </span>}
        </div>
        {!settings.resendConfigured && <Alert type="warning" showIcon className="mail-settings-alert"
            message="请为后端配置 RESEND_API_KEY，以启用验证码邮件发送。" />}
        <input type="file" hidden ref={filePicker} aria-label="选择正文图片" accept={imageTypes.join(',')}
            disabled={saving || sending} onChange={event => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (file) addImage(file);
            }} />
        <Form form={form} layout="vertical" initialValues={{ sender: settings.sender, subject: settings.subject }}
            onFinish={save} disabled={saving || sending}
            onValuesChange={changed => { if ('sender' in changed || 'subject' in changed) setDirty(true); }}>
            <div className="mail-settings-grid">
                <section className="surface mail-panel" aria-labelledby="mail-compose-title">
                    <header className="mail-panel-heading">
                        <h2 id="mail-compose-title">编辑邮件</h2>
                        <Button type="primary" loading={saving} disabled={!editor || sending} onClick={() => form.submit()}>保存邮件设置</Button>
                    </header>
                    <div>
                        <div className="mail-compose-envelope">
                            <Form.Item name="sender" label="发件人" rules={[{ required: true, whitespace: true, message: '请输入发件人' }]}>
                                <Input maxLength={200} placeholder="见衡科技 <邮箱>" aria-describedby="mail-sender-domain-hint" />
                            </Form.Item>
                            <p id="mail-sender-domain-hint" className="mail-sender-domain-hint">
                                使用 notify.jianheng.comum.cn 发信前，须先在 Resend 完成域名验证。
                            </p>
                            <Form.Item name="subject" label="主题" rules={[{ required: true, whitespace: true, message: '请输入邮件主题' }]}>
                                <Input maxLength={200} />
                            </Form.Item>
                            <div className="mail-test-row">
                                <Form.Item name="recipient" label="收件人" rules={[
                                    { type: 'email', message: '请输入有效的收件人邮箱' },
                                ]}>
                                    <Input maxLength={200} placeholder="name@example.com" />
                                </Form.Item>
                                <Button className="mail-test-send" aria-label="发送邮件" icon={<SendOutlined />}
                                    loading={sending} disabled={saving || !settings.resendConfigured}
                                    onClick={() => void sendTest()}>
                                    发送邮件
                                </Button>
                            </div>
                            <p className="mail-test-hint">收件人仅用于本次测试，不会保存；发送前会先保存当前模板，测试验证码为 ABC123。</p>
                        </div>
                        <div className="mail-panel-bar mail-compose-toolbar" role="group" aria-label="正文工具">
                            <div className="mail-compose-tools">
                                <Button type="text" icon={<BoldOutlined />} title="加粗" aria-label="加粗" aria-pressed={marks?.bold}
                                    onClick={() => editor?.chain().focus().toggleBold().run()} />
                                <Button type="text" icon={<ItalicOutlined />} title="斜体" aria-label="斜体" aria-pressed={marks?.italic}
                                    onClick={() => editor?.chain().focus().toggleItalic().run()} />
                                <Button type="text" icon={<PictureOutlined />} onClick={() => selectImage(false)}>插入图片</Button>
                                {marks?.imageSelected && <>
                                    <Button type="text" icon={<SwapOutlined />} onClick={() => selectImage(true)}>替换图片</Button>
                                    <Button type="text" icon={<DeleteOutlined />} onClick={() => editor?.chain().focus().deleteSelection().run()}>
                                        删除图片
                                    </Button>
                                </>}
                            </div>
                            <Dropdown trigger={['click']} menu={{
                                items: mailVariables.map(({ key, label }) => ({ key, label })),
                                onClick: ({ key }) => editor?.chain().focus(undefined, { scrollIntoView: false }).insertContent(key).run(),
                            }}>
                                <Button type="text" aria-haspopup="menu">插入变量 <DownOutlined aria-hidden /></Button>
                            </Dropdown>
                        </div>
                    </div>
                    <div className="mail-panel-content mail-compose-content">
                        <EditorContent editor={editor} className="mail-body-editor" />
                        {bodyError && <p className="mail-body-error" role="alert">{bodyError}</p>}
                    </div>
                </section>
                <MailPreview sender={sender} subject={subject} html={body} />
            </div>
        </Form>
        <LeaveConfirmModal open={leaveTo !== null} saving={saving} onDiscard={leaveWithoutSaving}
            onCancel={() => setLeaveTo(null)} onSave={() => void saveAndLeave()}
            description="当前邮件设置还有未保存的修改，是否先保存再离开？" />
    </>;
}

export default function MailSettingsPage() {
    const resource = useResource<Settings>('/mail-settings');
    return <>
        {!resource.data && <PageHeading title="邮件设置" />}
        <ResourceState {...resource} retry={resource.reload}>
            {resource.data && <MailSettingsEditor settings={resource.data} reload={resource.reload} />}
        </ResourceState>
    </>;
}