
-- Tabela C_workforce
CREATE TABLE IF NOT EXISTS public."C_workforce" (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO public."C_workforce" (name) VALUES
('Abad Construction'),
('BDS Construction'),
('Breno Construction'),
('Brothers Construction Panels Inc'),
('DESA Construction'),
('Erick'),
('JA Carpentry'),
('JCPQ'),
('Juan'),
('Martins Rocha Construction'),
('MMD Services'),
('Neto Construction'),
('Team Rodrigo Romão'),
('Trust Construction Services INC'),
('W Silva Construction'),
('Yes Construction'),
('ES Construction'),
('DMAC Construction Inc'),
('Far Construction Corp')
ON CONFLICT (name) DO NOTHING;

-- Tabela C_fieldwire
CREATE TABLE IF NOT EXISTS public."C_fieldwire" (
    id SERIAL PRIMARY KEY,
    category TEXT NOT NULL,
    document TEXT NOT NULL,
    where_location TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO public."C_fieldwire" (category, document, where_location, notes) VALUES
('Callahan', 'N/A', '-', '-'),
('Private', 'House Plan', '-', 'De acordo com o Thiago, apenas o House Plan é necessário.'),
('Pulte Homes - Building', 'Architecture Plans', '-', 'Cada Lot tem sua planta específica.'),
('Pulte Homes - Building', 'Cabinets Layout Plans', '-', '-'),
('Pulte Homes - Building', 'Island Dimensions Plans', '-', '-'),
('Pulte Homes - Building', 'Structural Plans', '-', 'Cada Lot tem sua planta específica.'),
('Pulte Homes - Building', 'Trusses Plans', '-', '-'),
('Pulte Homes - Building', 'Wall Panels', '-', 'Layout de painel por painel, separados.'),
('Pulte Homes - Building', 'Wall Panels Layout', '-', 'Layout do floor inteiro.'),
('Pulte Homes - House', 'Architecture Plans', '-', ''),
('Pulte Homes - House', 'House Plan', '-', 'A planta não e por Lot e sim por modelo de casa. Riverview/Concord/Walpole'),
('Toll Brothers', 'AOS Diagrams', 'Supply PRO', 'Sempre upload o mais atualizado, pode ter mais de uma versão.'),
('Toll Brothers', 'MiiTek - Landscape Elevation Report', 'Solicitar Justin From TIS', '-'),
('Toll Brothers', 'Panels Layout 1st and 2nd Floor', 'Solicitar Justin From TIS', 'Ambos os andares podem estar na mesma pasta do Fieldwire.'),
('Toll Brothers', 'Plot Plan', 'Supply PRO', 'Cada Lot tem sua planta específica.'),
('Toll Brothers', 'SPF', 'Solicitar Justin From TIS', '-'),
('Toll Brothers', 'Structural Plan', 'Supply PRO', 'Cada Lot tem sua planta específica.'),
('Toll Brothers', 'Trusses Placement Plan', 'Solicitar Justin From TIS', '-')
ON CONFLICT DO NOTHING;

-- Tabela C_machines
CREATE TABLE IF NOT EXISTS public."C_machines" (
    id SERIAL PRIMARY KEY,
    category TEXT NOT NULL,
    subcategory TEXT NOT NULL,
    equipment_category TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO public."C_machines" (category, subcategory, equipment_category, title) VALUES
('Toll Brothers', 'House', 'Machine', 'Forklift'),
('Toll Brothers', 'House', 'Attachment', 'Truss Boom'),
('Toll Brothers', 'House', 'Attachment', 'Fork Extensions'),
('Toll Brothers', 'House', 'Attachment', 'Man Basket'),
('Pulte Homes', 'House', 'Machine', 'Forklift'),
('Pulte Homes', 'House', 'Attachment', 'Truss Boom'),
('Pulte Homes', 'House', 'Attachment', 'Man Basket'),
('Pulte Homes', 'Building', 'Machine', 'Forklift'),
('Pulte Homes', 'Building', 'Machine', 'Boomlift'),
('Pulte Homes', 'Building', 'Attachment', 'Fork Extensions');

-- Tabela C_contracted_steps (Renamed from C_contract_steps)
CREATE TABLE IF NOT EXISTS public."C_contracted_steps" (
    id SERIAL PRIMARY KEY,
    step TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO public."C_contracted_steps" (step) VALUES
('Confirmação de seguros e apólices'),
('Purchase order'),
('Envio do contrato'),
('Aguardando assinatura'),
('Assinado')
ON CONFLICT (step) DO NOTHING;

-- Tabela C_machine_provider
CREATE TABLE IF NOT EXISTS public."C_machine_provider" (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO public."C_machine_provider" (name) VALUES
('Premium Group'),
('ETS Equipment Rental')
ON CONFLICT (name) DO NOTHING;

-- Habilitar RLS e criar políticas
ALTER TABLE public."C_workforce" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to all users" ON public."C_workforce" FOR SELECT USING (true);
CREATE POLICY "Allow insert/update/delete to authenticated users" ON public."C_workforce" FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public."C_fieldwire" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to all users" ON public."C_fieldwire" FOR SELECT USING (true);
CREATE POLICY "Allow insert/update/delete to authenticated users" ON public."C_fieldwire" FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public."C_machines" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to all users" ON public."C_machines" FOR SELECT USING (true);
CREATE POLICY "Allow insert/update/delete to authenticated users" ON public."C_machines" FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public."C_contracted_steps" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to all users" ON public."C_contracted_steps" FOR SELECT USING (true);
CREATE POLICY "Allow insert/update/delete to authenticated users" ON public."C_contracted_steps" FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public."C_machine_provider" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to all users" ON public."C_machine_provider" FOR SELECT USING (true);
CREATE POLICY "Allow insert/update/delete to authenticated users" ON public."C_machine_provider" FOR ALL USING (auth.role() = 'authenticated');
