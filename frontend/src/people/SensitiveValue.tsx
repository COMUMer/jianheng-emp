import { EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useState } from 'react';

export function SensitiveValue({ value, mask, label }: {
    value?: string;
    mask: (value: string) => string;
    label: string;
}) {
    const [visible, setVisible] = useState(false);
    if (!value) return <>—</>;
    return <span className="sensitive-value">
        {visible ? value : mask(value)}
        <Button type="text" size="small" className="sensitive-toggle"
            aria-label={visible ? `隐藏${label}` : `显示${label}`}
            icon={visible ? <EyeInvisibleOutlined /> : <EyeOutlined />}
            onClick={() => setVisible(current => !current)} />
    </span>;
}