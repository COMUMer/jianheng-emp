import { SearchOutlined } from '@ant-design/icons';
import { Button, Input } from 'antd';

/** 列表筛选统一使用：输入框与“搜索”按钮始终成对出现。 */
export function SearchBox({ value, onChange, onSearch, placeholder, ariaLabel }: {
    value: string;
    onChange: (value: string) => void;
    onSearch: () => void;
    placeholder: string;
    ariaLabel?: string;
}) {
    return <div className="search-box">
        <Input type="search" allowClear value={value} onChange={event => onChange(event.target.value)} onPressEnter={onSearch}
            placeholder={placeholder} aria-label={ariaLabel ?? placeholder} />
        <Button icon={<SearchOutlined />} onClick={onSearch}>搜索</Button>
    </div>;
}
