import { useCallback, useState } from 'react';
import type { Model } from '../api';
import type { Kind } from '../format';
import { DocumentDetail } from './DocumentDetail';
import { DraftEditor } from './DraftEditor';

/** 打开单据详情与新建/编辑申请的唯一入口：列表、消息等任何位置都通过它挂载弹窗。 */
export function useDocumentViewer(user: Model<'CurrentUser'>, refresh: () => void) {
    const [selected, setSelected] = useState<number>();
    const [editor, setEditor] = useState<{ kind: Kind; existing?: Model<'Detail'> }>();
    const open = useCallback((id?: number) => { if (id !== undefined) setSelected(id); }, []);
    const create = useCallback((kind: Kind) => setEditor({ kind }), []);
    const viewer = <>
        {selected !== undefined && <DocumentDetail key={selected} id={selected} user={user} close={() => setSelected(undefined)}
            refresh={refresh} edit={detail => {
                if (!detail.summary?.kind) return;
                setEditor({ kind: detail.summary.kind, existing: detail });
                setSelected(undefined);
            }} />}
        {editor && <DraftEditor {...editor} close={() => setEditor(undefined)}
            saved={id => { setEditor(undefined); refresh(); setSelected(id); }} />}
    </>;
    return { open, create, viewer };
}
