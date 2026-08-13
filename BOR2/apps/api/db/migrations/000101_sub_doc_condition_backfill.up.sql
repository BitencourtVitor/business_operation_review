-- Splits the data half of 000100 out of the schema half.
--
-- 000100 translated the Business Corporation Register rows to the condition
-- vocabulary in the same step that added the column. Applied ahead of the
-- deploy, that broke the page: the frontend then in production looked the
-- status up in a fixed map and dereferenced the result, so an unknown value
-- rendered as undefined.icon and took the whole route down. The row was put
-- back to 'received' by hand to restore the page.
--
-- Schema can lead the code; data the old code has to read cannot. So the
-- translation lives here, to run only once the deploy is out.
UPDATE sub_doc_records
   SET status = CASE status
                    WHEN 'received' THEN 'regular'
                    ELSE 'pending'
                END,
       updated_at = now()
 WHERE doc_type = 'business_corporation_register'
   AND status IN ('missing', 'requested', 'received', 'not_applicable');
