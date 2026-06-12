-- Resource guards for the Aria read-only role so a model-written query (e.g. an
-- accidental cartesian join) can't exhaust DB time or temp disk. Idempotent.
-- Parallelism is disabled so temp_file_limit applies to a single process rather
-- than being multiplied per parallel worker (which previously filled temp disk).
ALTER ROLE aria_ro SET statement_timeout             = '5s';
ALTER ROLE aria_ro SET temp_file_limit               = '65536'; -- 64 MB (kB units)
ALTER ROLE aria_ro SET work_mem                      = '64MB';
ALTER ROLE aria_ro SET max_parallel_workers_per_gather = '0';
