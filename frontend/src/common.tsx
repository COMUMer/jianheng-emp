import { Alert, Button, Empty, Spin, Tag } from 'antd';
import type { ReactNode } from 'react';
import type { DocumentStatus } from './format';
import { statusColor, statusLabel } from './format';

export function PageHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
    return <div className="page-heading"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>;
}

export function ResourceState({ loading, error, retry, children }: { loading?: boolean; error?: string; retry?: () => void; children: ReactNode }) {
    if (error) return <Alert type="error" showIcon title={error} action={retry && <Button onClick={retry}>重试</Button>} />;
    if (loading) return <div className="embedded-loading"><Spin /></div>;
    return children;
}

export function EmptyState({ text }: { text: string }) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={text} />;
}

export function DocumentTag({ status }: { status?: DocumentStatus }) {
    return status ? <Tag color={statusColor[status]}>{statusLabel[status]}</Tag> : null;
}
