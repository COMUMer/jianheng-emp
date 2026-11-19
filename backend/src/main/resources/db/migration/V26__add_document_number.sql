CREATE TABLE document_number (
    kind VARCHAR(20) NOT NULL,
    period CHAR(6) NOT NULL,
    seq INT NOT NULL,
    PRIMARY KEY (kind, period)
);

ALTER TABLE work_document ADD COLUMN document_no VARCHAR(24) NULL;

UPDATE work_document d
JOIN (
    SELECT id, CONCAT(
        CASE kind
            WHEN 'LEAVE' THEN 'QJ'
            WHEN 'TRIP' THEN 'CC'
            WHEN 'PURCHASE' THEN 'CG'
            WHEN 'EXPENSE' THEN 'BX'
        END,
        DATE_FORMAT(created_at, '%Y%m'),
        LPAD(ROW_NUMBER() OVER (PARTITION BY kind, DATE_FORMAT(created_at, '%Y%m') ORDER BY id), 4, '0')
    ) AS no
    FROM work_document
) numbered ON numbered.id = d.id
SET d.document_no = numbered.no;

INSERT INTO document_number(kind, period, seq)
SELECT kind, DATE_FORMAT(created_at, '%Y%m'), COUNT(*)
FROM work_document
GROUP BY kind, DATE_FORMAT(created_at, '%Y%m');

ALTER TABLE work_document
    MODIFY document_no VARCHAR(24) NOT NULL,
    ADD UNIQUE KEY uk_work_document_no (document_no);