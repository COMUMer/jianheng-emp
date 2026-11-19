import { Alert, Button, Empty, Spin, Tag, Tooltip } from 'antd';
import type { PaginationProps, TablePaginationConfig } from 'antd';
import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { DocumentStatus } from './format';
import { statusColor, statusLabel } from './format';

const pageSizeOptions = [20, 50, 100];
const showTotal = (total: number) => `共 ${total} 条`;

export const listPagination: TablePaginationConfig = { showSizeChanger: true, pageSize: 20, pageSizeOptions, showTotal };

/** 列表分页的统一配置：Table 用 listPagination，非表格列表用 listPager。 */
export const listPager: PaginationProps = { showSizeChanger: true, pageSizeOptions, showTotal };

export function PageHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
    return <div className="page-heading"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>;
}

export function ResourceState({ loading, error, retry, children }: { loading?: boolean; error?: string; retry?: () => void; children: ReactNode }) {
    if (error) return <Alert type="error" showIcon title={error} action={retry && <Button onClick={retry}>重试</Button>} />;
    if (loading) return <div className="embedded-loading"><Spin /></div>;
    return children;
}

/** 元素内容被裁掉时为 true：用文本实际宽度和可见宽度比较，宽度变化时自动重算。 */
export function useClippedText<T extends HTMLElement>() {
    const ref = useRef<T>(null);
    const [clipped, setClipped] = useState(false);
    useLayoutEffect(() => {
        const node = ref.current;
        if (!node) return;
        const check = () => {
            const range = document.createRange();
            range.selectNodeContents(node);
            setClipped(range.getBoundingClientRect().width > node.clientWidth + 0.5);
        };
        check();
        const observer = new ResizeObserver(check);
        observer.observe(node);
        return () => observer.disconnect();
    }, []);
    return { ref, clipped };
}

/** 单元格文本：超出列宽时省略，只有放不下才用气泡显示完整内容。 */
export function EllipsisText({ text }: { text?: string | number | null }) {
    const value = text === undefined || text === null || text === '' ? '—' : String(text);
    const { ref, clipped } = useClippedText<HTMLSpanElement>();
    return <Tooltip title={clipped ? value : undefined} placement="topLeft">
        <span ref={ref} className="ellipsis-text">{value}</span>
    </Tooltip>;
}

export function EmptyState({ text }: { text: string }) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={text} />;
}

export function DocumentTag({ status }: { status?: DocumentStatus }) {
    return status ? <Tag color={statusColor[status]}>{statusLabel[status]}</Tag> : null;
}