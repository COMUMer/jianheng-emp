ALTER TABLE document_file
    ADD category VARCHAR(16) NOT NULL DEFAULT 'INVOICE' AFTER digest,
    ADD content_type VARCHAR(120) NOT NULL DEFAULT 'application/octet-stream' AFTER category;

UPDATE document_file SET content_type = CASE
    WHEN LOWER(original_name) LIKE '%.pdf' THEN 'application/pdf'
    WHEN LOWER(original_name) LIKE '%.png' THEN 'image/png'
    WHEN LOWER(original_name) LIKE '%.jpg' OR LOWER(original_name) LIKE '%.jpeg' THEN 'image/jpeg'
    WHEN LOWER(original_name) LIKE '%.webp' THEN 'image/webp'
    WHEN LOWER(original_name) LIKE '%.gif' THEN 'image/gif'
    ELSE 'application/octet-stream'
END;

ALTER TABLE document_file DROP COLUMN invoice_key;
DROP TABLE invoice_reservation;
