-- Script para verificar e criar as tabelas necessárias para planos de ação
-- Execute este script no seu banco de dados Supabase

-- Verificar se a tabela planos_de_acao existe
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'planos_de_acao') THEN
        CREATE TABLE public.planos_de_acao (
            id uuid NOT NULL DEFAULT gen_random_uuid(),
            usuario_id uuid NOT NULL,
            titulo text NOT NULL,
            descricao text,
            criado_em timestamp without time zone DEFAULT now(),
            data_inicio date,
            data_fim date,
            CONSTRAINT planos_de_acao_pkey PRIMARY KEY (id),
            CONSTRAINT planos_de_acao_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id)
        );
        RAISE NOTICE 'Tabela planos_de_acao criada com sucesso';
    ELSE
        RAISE NOTICE 'Tabela planos_de_acao já existe';
    END IF;
END $$;

-- Verificar se a tabela acoes existe
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'acoes') THEN
        CREATE TABLE public.acoes (
            id uuid NOT NULL DEFAULT gen_random_uuid(),
            plano_id uuid NOT NULL,
            titulo text NOT NULL,
            responsavel text,
            status text,
            data_limite date,
            CONSTRAINT acoes_pkey PRIMARY KEY (id),
            CONSTRAINT acoes_plano_id_fkey FOREIGN KEY (plano_id) REFERENCES public.planos_de_acao(id) ON DELETE CASCADE
        );
        RAISE NOTICE 'Tabela acoes criada com sucesso';
    ELSE
        RAISE NOTICE 'Tabela acoes já existe';
    END IF;
END $$;

-- Verificar se a tabela usuarios existe (necessária para a foreign key)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'usuarios') THEN
        CREATE TABLE public.usuarios (
            id uuid NOT NULL DEFAULT gen_random_uuid(),
            email text NOT NULL UNIQUE,
            nome text,
            criado_em timestamp without time zone DEFAULT now(),
            CONSTRAINT usuarios_pkey PRIMARY KEY (id)
        );
        RAISE NOTICE 'Tabela usuarios criada com sucesso';
    ELSE
        RAISE NOTICE 'Tabela usuarios já existe';
    END IF;
END $$;

-- Verificar se as RLS (Row Level Security) estão habilitadas
ALTER TABLE public.planos_de_acao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

-- Criar políticas de segurança básicas (ajuste conforme necessário)
-- Política para planos_de_acao
DROP POLICY IF EXISTS "Usuários podem ver seus próprios planos" ON public.planos_de_acao;
CREATE POLICY "Usuários podem ver seus próprios planos" ON public.planos_de_acao
    FOR ALL USING (auth.uid()::text = usuario_id::text);

-- Política para acoes
DROP POLICY IF EXISTS "Usuários podem ver ações de seus planos" ON public.acoes;
CREATE POLICY "Usuários podem ver ações de seus planos" ON public.acoes
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.planos_de_acao 
            WHERE planos_de_acao.id = acoes.plano_id 
            AND planos_de_acao.usuario_id::text = auth.uid()::text
        )
    );

-- Política para usuarios
DROP POLICY IF EXISTS "Usuários podem ver seus próprios dados" ON public.usuarios;
CREATE POLICY "Usuários podem ver seus próprios dados" ON public.usuarios
    FOR ALL USING (auth.uid()::text = id::text);

-- Verificar se as tabelas foram criadas corretamente
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name IN ('planos_de_acao', 'acoes', 'usuarios')
ORDER BY table_name, ordinal_position; 