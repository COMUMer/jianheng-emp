import type { Model } from '../api';

export type Department = Pick<Model<'Department'>, 'id' | 'name' | 'parentId'>;

/** 按上级链拼出完整路径，例如 `见衡/总办/人力资源部`。 */
export function departmentPath(departments: readonly Department[] | undefined, id?: number): string {
    if (!departments?.length || id === undefined) return '';
    const byId = new Map<number, Department>();
    for (const department of departments) {
        if (department.id !== undefined) byId.set(department.id, department);
    }
    const names: string[] = [];
    const visited = new Set<number>();
    let current = byId.get(id);
    while (current?.id !== undefined && !visited.has(current.id)) {
        visited.add(current.id);
        names.unshift(current.name ?? '');
        current = current.parentId === undefined ? undefined : byId.get(current.parentId);
    }
    return names.filter(Boolean).join('/');
}