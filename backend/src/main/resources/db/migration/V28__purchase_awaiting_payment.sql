UPDATE work_document
SET status = 'AWAITING_PAYMENT'
WHERE kind = 'PURCHASE' AND status = 'APPROVED';