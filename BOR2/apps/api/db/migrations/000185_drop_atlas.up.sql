-- O Atlas saiu do BOR: desde 23/09/2026 ele é o BuilderLog, produto à parte, com
-- banco próprio. O dado foi copiado e conferido id por id em 29/10/2026 (tudo o
-- que não está no BuilderLog tem a exclusão registrada lá), e as tabelas foram
-- exportadas em CSV antes desta migração. Aplicar só depois do deploy do código
-- que já não lê nada disto.

ALTER TABLE construction_buildings DROP COLUMN IF EXISTS atlas_jobsite_id;

DROP VIEW IF EXISTS atlas_documento_escopo;

DROP TABLE IF EXISTS
  atlas_annotation, atlas_daily_log, atlas_doc_category, atlas_document,
  atlas_document_tag, atlas_document_version, atlas_event, atlas_event_reply,
  atlas_jobsite, atlas_jobsite_access, atlas_jobsite_category, atlas_media,
  atlas_offline_folder, atlas_page_text, atlas_policy, atlas_punch, atlas_sheet,
  atlas_sync_event, atlas_takeoff_term, atlas_user_company, atlas_version_job,
  atlas_visibility_rule
CASCADE;

DROP FUNCTION IF EXISTS atlas_point_number(), atlas_punch_fecha_limpo(), atlas_version_seq(), atlas_exige_depois() CASCADE;

-- As chaves de permissão do Atlas (atlas, atlas_documents, atlas_users...) saem
-- de quem as tinha.
UPDATE user_permissions
   SET permissions = (SELECT COALESCE(jsonb_object_agg(k, v), '{}'::jsonb)
                        FROM jsonb_each(permissions) e(k, v)
                       WHERE k NOT LIKE 'atlas%')
 WHERE jsonb_typeof(permissions) = 'object'
   AND EXISTS (SELECT 1 FROM jsonb_object_keys(permissions) k WHERE k LIKE 'atlas%');
