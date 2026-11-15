import { DatePicker } from 'antd';
import type { DatePickerProps } from 'antd';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';

type DateFieldProps = {
    id?: string;
    value?: string;
    onChange?: (value?: string) => void;
    disabledDate?: (date: Dayjs) => boolean;
    className?: string;
    placeholder?: string;
};

type PickerProps = DateFieldProps & {
    format: string;
    valueFormat: string;
    showTime?: DatePickerProps['showTime'];
    disabledTime?: DatePickerProps['disabledTime'];
};

const DAY = 'YYYY-MM-DD';
const MINUTE = 'YYYY-MM-DD HH:mm';
const MINUTE_VALUE = 'YYYY-MM-DDTHH:mm';

function range(end: number) {
    return Array.from({ length: end }, (_, index) => index);
}

function StringPicker({ value, onChange, format, valueFormat, ...props }: PickerProps) {
    return <DatePicker {...props} classNames={{ popup: { root: 'date-popup' } }} format={format} value={value ? dayjs(value) : null}
        onChange={date => onChange?.(date ? date.format(valueFormat) : undefined)} />;
}

export function DateField(props: DateFieldProps) {
    return <StringPicker {...props} format={DAY} valueFormat={DAY} />;
}

export function DateTimeField({ notBefore, ...props }: DateFieldProps & { notBefore?: string }) {
    const bound = notBefore ? dayjs(notBefore) : null;
    const disabledTime: DatePickerProps['disabledTime'] = bound ? date => date?.isSame(bound, 'day') ? {
        disabledHours: () => range(bound.hour()),
        disabledMinutes: hour => hour === bound.hour() ? range(bound.minute() + 1) : [],
    } : {} : undefined;
    return <StringPicker placeholder="请选择时间" {...props} format={MINUTE} valueFormat={MINUTE_VALUE} showTime={{ format: 'HH:mm' }}
        disabledDate={bound ? date => date.isBefore(bound, 'day') : undefined} disabledTime={disabledTime} />;
}