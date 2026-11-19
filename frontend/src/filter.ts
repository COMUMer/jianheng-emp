/** 列表筛选的公共判断：关键词为空时视为不过滤。 */
export function matchesKeyword(values: (string | number | null | undefined)[], keyword: string) {
    const needle = keyword.trim().toLowerCase();
    return !needle || values.some(value => value != null && String(value).toLowerCase().includes(needle));
}

/** 按日期区间筛选：只比较到天，任一端为空表示不限。 */
export function inDateRange(value: string | undefined, from?: string, to?: string) {
    if (!from && !to) return true;
    if (!value) return false;
    const day = value.slice(0, 10);
    return (!from || day >= from) && (!to || day <= to);
}
