import { Watermark } from 'antd';
import type { Model } from '../api';
import './watermark.css';

export function EmployeeWatermark({ user }: { user: Model<'CurrentUser'> }) {
    const mark = user.mis ?? user.username;
    if (!mark) return null;
    return <div className="watermark-layer" aria-hidden="true">
        <Watermark content={`mis ${mark}`} rotate={-20} gap={[150, 130]}
            font={{ color: 'rgba(24, 34, 29, 0.12)', fontSize: 15, fontWeight: 500 }}
            style={{ height: '100%' }} />
    </div>;
}
