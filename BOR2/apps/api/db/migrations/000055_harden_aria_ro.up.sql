-- Resource guards for the Aria read-only role so a model-written query (e.g. an
-- accidental cartesian join) can't exhaust DB time or temp disk. Idempotent.
ALTER ROLE aria_ro SET statement_timeout = '5s';
ALTER ROLE aria_ro SET temp_file_limit  = '262144'; -- 256 MB (kB units)
ALTER ROLE aria_ro SET work_mem         = '64MB';
