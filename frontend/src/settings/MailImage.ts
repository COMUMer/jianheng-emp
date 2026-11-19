import Image from '@tiptap/extension-image';
import { closeHistory } from '@tiptap/pm/history';

const corners = [
    { name: 'top-left', label: '左上角', x: -1, y: -1 },
    { name: 'top-right', label: '右上角', x: 1, y: -1 },
    { name: 'bottom-left', label: '左下角', x: -1, y: 1 },
    { name: 'bottom-right', label: '右下角', x: 1, y: 1 },
];
const resizeKeys: Partial<Record<string, number>> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 };

export const MailImage = Image.extend({
    addAttributes() {
        return { ...this.parent?.(), height: { default: null, rendered: false } };
    },
    addNodeView() {
        return ({ editor, getPos, HTMLAttributes }) => {
            const container = document.createElement('div');
            container.dataset.resizeContainer = '';
            const wrapper = document.createElement('div');
            wrapper.dataset.resizeWrapper = '';
            const savedWidth = HTMLAttributes.width == null ? '100%' : `${HTMLAttributes.width}px`;
            wrapper.style.width = savedWidth;
            const image = document.createElement('img');
            for (const [name, value] of Object.entries(HTMLAttributes)) {
                if (value != null) image.setAttribute(name, String(value));
            }
            image.draggable = false;
            wrapper.append(image);
            container.append(wrapper);

            function commitWidth(width: number) {
                const position = getPos();
                if (position === undefined) return;
                editor.chain().command(({ tr }) => { closeHistory(tr); return true; })
                    .setNodeSelection(position).updateAttributes('image', { width }).run();
                return position;
            }

            const fitWidth = (width: number) => Math.min(container.clientWidth, Math.max(32, Math.round(width)));

            for (const corner of corners) {
                const handle = document.createElement('button');
                handle.type = 'button';
                handle.dataset.resizeHandle = corner.name;
                handle.setAttribute('aria-label', `通过${corner.label}调整图片尺寸`);
                wrapper.append(handle);

                let drag: { id: number; x: number; y: number; width: number; slope: number } | undefined;
                handle.addEventListener('pointerdown', event => {
                    if (!editor.isEditable || !event.isPrimary || event.button !== 0 || image.offsetWidth === 0) return;
                    event.preventDefault();
                    handle.setPointerCapture(event.pointerId);
                    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, width: image.offsetWidth,
                        slope: image.offsetHeight / image.offsetWidth };
                });
                handle.addEventListener('pointermove', event => {
                    if (drag?.id !== event.pointerId) return;
                    const dx = corner.x * (event.clientX - drag.x);
                    const dy = corner.y * (event.clientY - drag.y);
                    const projectedWidth = drag.width + (dx + dy * drag.slope) / (1 + drag.slope ** 2);
                    wrapper.style.width = `${fitWidth(projectedWidth)}px`;
                });
                handle.addEventListener('pointerup', event => {
                    if (drag?.id !== event.pointerId) return;
                    const width = image.offsetWidth;
                    const changed = drag.width !== width;
                    drag = undefined;
                    wrapper.style.width = savedWidth;
                    if (changed) commitWidth(width);
                });
                // Also fires after pointer cancellation, so a cancelled drag restores the saved width.
                handle.addEventListener('lostpointercapture', () => {
                    drag = undefined;
                    wrapper.style.width = savedWidth;
                });
                handle.addEventListener('keydown', event => {
                    const direction = resizeKeys[event.key];
                    if (!direction || !editor.isEditable) return;
                    event.preventDefault();
                    event.stopPropagation();
                    const width = fitWidth(image.offsetWidth + direction * 8);
                    if (width === image.offsetWidth) return;
                    const selector = `[data-resize-handle="${corner.name}"]`;
                    const position = commitWidth(width);
                    if (position !== undefined) {
                        const node = editor.view.nodeDOM(position);
                        if (node instanceof HTMLElement) node.querySelector<HTMLButtonElement>(selector)?.focus();
                    }
                });
            }
            return { dom: container, stopEvent: event => event.target instanceof HTMLButtonElement };
        };
    },
});
