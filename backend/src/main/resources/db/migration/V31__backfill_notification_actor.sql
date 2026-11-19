-- 历史消息回填：付款通知取付款人，其余取消息产生前该单据最近一条审批事件的操作人，最后回退申请人。
UPDATE notification n
JOIN work_document d ON d.id = n.document_id
LEFT JOIN expense_payment p ON p.document_id = d.id
SET n.actor_id = COALESCE(
    CASE WHEN n.message LIKE '%已登记付款%' THEN p.paid_by END,
    (SELECT e.actor_id FROM approval_event e
     JOIN document_revision r ON r.id = e.revision_id
     WHERE r.document_id = d.id AND e.occurred_at <= n.created_at
     ORDER BY e.occurred_at DESC, e.id DESC LIMIT 1),
    d.owner_id)
WHERE n.actor_id IS NULL OR n.actor_id <> COALESCE(
    CASE WHEN n.message LIKE '%已登记付款%' THEN p.paid_by END,
    (SELECT e.actor_id FROM approval_event e
     JOIN document_revision r ON r.id = e.revision_id
     WHERE r.document_id = d.id AND e.occurred_at <= n.created_at
     ORDER BY e.occurred_at DESC, e.id DESC LIMIT 1),
    d.owner_id);
