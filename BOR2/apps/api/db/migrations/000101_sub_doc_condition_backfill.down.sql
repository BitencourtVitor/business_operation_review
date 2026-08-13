-- Back to the document vocabulary, so a rollback to a build that only knows
-- missing/requested/received/not_applicable still renders.
UPDATE sub_doc_records
   SET status = CASE status
                    WHEN 'regular' THEN 'received'
                    ELSE 'missing'
                END,
       updated_at = now()
 WHERE doc_type = 'business_corporation_register'
   AND status IN ('pending', 'regular', 'irregular');
