-- O dicionário do Takeoff (ATL-103).
--
-- O agente que lê a prancha enxerga forma, e forma sozinha não diz o que é: o
-- hexágono que numa obra é tipo de janela, noutra é nota de folha. O que cada
-- símbolo, abreviação e código significa vem em três níveis, e o mais
-- específico manda:
--
--   base     o padrão geral dos EUA (US National CAD Standard), uma vez só
--   set      a legenda do set (folhas A0.x), que o escritório de arquitetura
--            adapta e às vezes contradiz a base
--   project  as tabelas do projeto (janelas, portas), onde A3T vira "três
--            janelas single hung com acabamento de pedra"
--
-- Set e project pertencem ao documento, e não à versão: a revisão nova do set
-- reextrai o que veio do arquivo e mantém o que alguém corrigiu à mão.
CREATE TABLE IF NOT EXISTS atlas_takeoff_term (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    level       TEXT NOT NULL CHECK (level IN ('base','set','project')),
    document_id TEXT REFERENCES atlas_document(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL CHECK (kind IN ('abbreviation','symbol','tag')),
    code        TEXT NOT NULL,
    meaning     TEXT NOT NULL DEFAULT '',
    -- O que o nível sabe além do nome: forma do símbolo, categoria da tag,
    -- tamanho e tipo da janela, caixa do exemplo na folha da legenda.
    attrs       JSONB NOT NULL DEFAULT '{}'::jsonb,
    source      TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('seed','extracted','manual')),
    sheet_id    TEXT REFERENCES atlas_sheet(id) ON DELETE SET NULL,
    version_id  TEXT REFERENCES atlas_document_version(id) ON DELETE SET NULL,
    created_by  TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((level = 'base') = (document_id IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS atlas_takeoff_term_code
    ON atlas_takeoff_term (level, COALESCE(document_id, ''), kind, upper(code));

CREATE INDEX IF NOT EXISTS atlas_takeoff_term_document
    ON atlas_takeoff_term (document_id);

-- A base. Só o que o Takeoff de wood framing encontra na prancha: abreviações de
-- estrutura, abertura e acabamento, e os símbolos de referência mais comuns.
-- Símbolo de legenda muda de escritório para escritório, então a base diz o
-- convencional e a legenda do set corrige.
INSERT INTO atlas_takeoff_term (level, kind, code, meaning, attrs, source) VALUES
  ('base','abbreviation','AFF','Above finished floor','{}','seed'),
  ('base','abbreviation','AFG','Above finished grade','{}','seed'),
  ('base','abbreviation','ALT','Alternate','{}','seed'),
  ('base','abbreviation','BLDG','Building','{}','seed'),
  ('base','abbreviation','BLKG','Blocking','{}','seed'),
  ('base','abbreviation','BM','Beam','{}','seed'),
  ('base','abbreviation','BO','Bottom of','{}','seed'),
  ('base','abbreviation','BRG','Bearing','{}','seed'),
  ('base','abbreviation','CJ','Control joint','{}','seed'),
  ('base','abbreviation','CL','Center line','{}','seed'),
  ('base','abbreviation','CLG','Ceiling','{}','seed'),
  ('base','abbreviation','CLR','Clear','{}','seed'),
  ('base','abbreviation','CMU','Concrete masonry unit','{}','seed'),
  ('base','abbreviation','COL','Column','{}','seed'),
  ('base','abbreviation','CONC','Concrete','{}','seed'),
  ('base','abbreviation','DBL','Double','{}','seed'),
  ('base','abbreviation','DH','Double hung','{"group":"window type"}','seed'),
  ('base','abbreviation','DIA','Diameter','{}','seed'),
  ('base','abbreviation','DIM','Dimension','{}','seed'),
  ('base','abbreviation','DN','Down','{}','seed'),
  ('base','abbreviation','DR','Door','{}','seed'),
  ('base','abbreviation','DWG','Drawing','{}','seed'),
  ('base','abbreviation','EA','Each','{}','seed'),
  ('base','abbreviation','EL','Elevation','{}','seed'),
  ('base','abbreviation','EQ','Equal','{}','seed'),
  ('base','abbreviation','EXT','Exterior','{}','seed'),
  ('base','abbreviation','FDN','Foundation','{}','seed'),
  ('base','abbreviation','FF','Finished floor','{}','seed'),
  ('base','abbreviation','FIN','Finish','{}','seed'),
  ('base','abbreviation','FLR','Floor','{}','seed'),
  ('base','abbreviation','FOS','Face of stud','{}','seed'),
  ('base','abbreviation','FTG','Footing','{}','seed'),
  ('base','abbreviation','GWB','Gypsum wall board','{}','seed'),
  ('base','abbreviation','HDR','Header','{}','seed'),
  ('base','abbreviation','HT','Height','{}','seed'),
  ('base','abbreviation','HORIZ','Horizontal','{}','seed'),
  ('base','abbreviation','INT','Interior','{}','seed'),
  ('base','abbreviation','JST','Joist','{}','seed'),
  ('base','abbreviation','LVL','Laminated veneer lumber','{}','seed'),
  ('base','abbreviation','MAX','Maximum','{}','seed'),
  ('base','abbreviation','MIN','Minimum','{}','seed'),
  ('base','abbreviation','MTL','Metal','{}','seed'),
  ('base','abbreviation','NTS','Not to scale','{}','seed'),
  ('base','abbreviation','OC','On center','{}','seed'),
  ('base','abbreviation','OPNG','Opening','{}','seed'),
  ('base','abbreviation','OSB','Oriented strand board','{}','seed'),
  ('base','abbreviation','PL','Plate','{}','seed'),
  ('base','abbreviation','PLYWD','Plywood','{}','seed'),
  ('base','abbreviation','PT','Pressure treated','{}','seed'),
  ('base','abbreviation','REF','Reference','{}','seed'),
  ('base','abbreviation','REQD','Required','{}','seed'),
  ('base','abbreviation','RO','Rough opening','{}','seed'),
  ('base','abbreviation','SH','Single hung','{"group":"window type"}','seed'),
  ('base','abbreviation','SHTHG','Sheathing','{}','seed'),
  ('base','abbreviation','SIM','Similar','{}','seed'),
  ('base','abbreviation','SL','Slider','{"group":"window type"}','seed'),
  ('base','abbreviation','SPEC','Specification','{}','seed'),
  ('base','abbreviation','STL','Steel','{}','seed'),
  ('base','abbreviation','STRUCT','Structural','{}','seed'),
  ('base','abbreviation','TO','Top of','{}','seed'),
  ('base','abbreviation','TYP','Typical','{}','seed'),
  ('base','abbreviation','UON','Unless otherwise noted','{}','seed'),
  ('base','abbreviation','VERT','Vertical','{}','seed'),
  ('base','abbreviation','WD','Wood','{}','seed'),
  ('base','abbreviation','WDW','Window','{}','seed'),
  ('base','abbreviation','W/','With','{}','seed'),
  ('base','abbreviation','W/O','Without','{}','seed'),
  ('base','symbol','HEXAGON','Sheet keynote (NCS). Offices often use it as window type tag: check the set legend.','{"shape":"hexagon","target":"keynote"}','seed'),
  ('base','symbol','ELLIPSE','Door tag','{"shape":"ellipse","target":"door"}','seed'),
  ('base','symbol','RECTANGLE','Room tag','{"shape":"rectangle","target":"room"}','seed'),
  ('base','symbol','CIRCLE','Grid line or detail reference','{"shape":"circle","target":"grid"}','seed'),
  ('base','symbol','DIAMOND','Wall type tag','{"shape":"diamond","target":"wall"}','seed'),
  ('base','symbol','TRIANGLE','Revision tag','{"shape":"triangle","target":"revision"}','seed')
ON CONFLICT DO NOTHING;
