import { Avatar } from 'antd';

export function avatarText(name?: string) {
    const clean = (name ?? '').trim();
    const chars = Array.from(clean);
    if (!chars.length) return '?';
    if (chars.length <= 2) return clean;
    return /[\u3400-\u9fff]/.test(clean) ? chars.slice(-2).join('') : chars[0].toUpperCase();
}

export function avatarUrl(avatarKey?: string) {
    return avatarKey ? `/api/people/avatars/${encodeURIComponent(avatarKey)}` : undefined;
}

export function PersonAvatar({ name, avatarKey, size = 32, className }: {
    name?: string;
    avatarKey?: string;
    size?: number;
    className?: string;
}) {
    const src = avatarUrl(avatarKey);
    return <Avatar size={size} src={src} alt={name} className={['person-avatar', className].filter(Boolean).join(' ')}
        style={src ? undefined : { fontSize: Math.max(12, Math.round(size * 0.36)) }}>
        {src ? undefined : avatarText(name)}
    </Avatar>;
}

export type CropArea = { x: number; y: number; width: number; height: number };

export async function cropAvatar(imageSrc: string, area: CropArea, size = 256): Promise<File> {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('无法读取图片'));
        element.src = imageSrc;
    });
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法处理图片');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, size, size);
    context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, size, size);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) throw new Error('无法处理图片');
    return new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
}
