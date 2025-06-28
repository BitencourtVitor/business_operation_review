import React, { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import logoWhite from '../assets/logo_white.png';
import logoBlack from '../assets/logo_black.png';
import Cookies from 'js-cookie';
import TimesheetAnalysis from './timesheet_analysis';
import AccountingIndicators from './accounting_indicators';

// Interface para PlanoAcao (comum entre os componentes)
interface PlanoAcao {
  id: string;
  usuario_id: string;
  titulo: string;
  descricao: string;
  criado_em: string;
  data_inicio: string;
  data_fim: string;
  acoes: Acao[];
}

interface Acao {
  id: string;
  plano_id: string;
  titulo: string;
  responsavel: string;
  status: string;
  data_limite: string;
}

interface DashboardProps {
  user: User;
  onLogout: () => void;
}

export default function Dashboard({ user, onLogout }: DashboardProps) {
  const [nomeCompleto, setNomeCompleto] = useState('');
  const [role, setRole] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>(Cookies.get('theme') === 'dark' ? 'dark' : 'light');
  const [mainContent, setMainContent] = useState<string>('');
  const [usuarioId, setUsuarioId] = useState('');
  const [telas, setTelas] = useState<{ id: string; descricao: string }[]>([]);
  const [telaId, setTelaId] = useState('');
  const [permissoes, setPermissoes] = useState<{ [telaId: string]: boolean }>({});
  const [usuarioResponsavelTelaId, setUsuarioResponsavelTelaId] = useState<string>('');
  const [planosResponsavel, setPlanosResponsavel] = useState<PlanoAcao[]>([]);

  // Mapeamento de ícones por descrição de tela
  const telaIcones: { [descricao: string]: string } = {
    'Timesheet Analysis': 'bi bi-watch',
    'Accounting Indicators': 'bi bi-cash',
    'Permit Control': 'bi bi-file-earmark-check',
    'IT Projects': 'bi bi-braces-asterisk',
    // Adicione mais conforme necessário
  };

  // Descobrir todas as telas em que o usuário é admin_setor
  const adminTelasDescricoes = telas
    .filter(t => permissoes[t.id])
    .map(t => t.descricao)
    .sort();

  useEffect(() => {
    Cookies.set('theme', theme, { expires: 365 });
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    const fetchAll = async () => {
      const { data: usuario } = await supabase
        .from('usuarios')
        .select('id, nome_completo')
        .eq('email', user.email)
        .single();
      if (!usuario) return;
      setUsuarioId(usuario.id);
      setNomeCompleto(usuario.nome_completo);

      let userRole = '';
      const { data: perfil } = await supabase
        .from('perfis')
        .select('tipo')
        .eq('usuario_id', usuario.id)
        .single();
      if (perfil) {
        userRole = perfil.tipo;
        setRole(userRole);
      }

      const { data: telasDb } = await supabase
        .from('telas')
        .select('id, descricao');
      setTelas(telasDb || []);

      const { data: usuariosTelas } = await supabase
        .from('usuarios_telas')
        .select('tela_id')
        .eq('usuario_id', usuario.id);
      const permissoesObj: { [telaId: string]: boolean } = {};
      (usuariosTelas || []).forEach(rel => {
        permissoesObj[rel.tela_id] = true;
      });
      setPermissoes(permissoesObj);

      if (Array.isArray(telasDb) && telasDb.length > 0) {
        setMainContent(telasDb[0].id);
        setTelaId(telasDb[0].id);
        // Buscar o responsável pela tela (admin_setor)
        const { data: adminPerfil } = await supabase
          .from('perfis')
          .select('usuario_id')
          .eq('setor_id', telasDb[0].id)
          .eq('tipo', 'admin_setor')
          .single();
        if (adminPerfil) {
          setUsuarioResponsavelTelaId(adminPerfil.usuario_id);
          // Buscar planos de ação do responsável
          const { data: planos } = await supabase
            .from('planos_de_acao')
            .select('*')
            .eq('usuario_id', adminPerfil.usuario_id);
          setPlanosResponsavel(planos || []);
        } else {
          setUsuarioResponsavelTelaId('');
          setPlanosResponsavel([]);
        }
      }
    };
    fetchAll();
  }, [user]);

  const handleSetMainContent = async (telaId: string) => {
    setMainContent(telaId);
    setTelaId(telaId);
    // Buscar o responsável pela tela (admin_setor)
    const { data: adminPerfil } = await supabase
      .from('perfis')
      .select('usuario_id')
      .eq('setor_id', telaId)
      .eq('tipo', 'admin_setor')
      .single();
    if (adminPerfil) {
      setUsuarioResponsavelTelaId(adminPerfil.usuario_id);
      // Buscar planos de ação do responsável
      const { data: planos } = await supabase
        .from('planos_de_acao')
        .select('*')
        .eq('usuario_id', adminPerfil.usuario_id);
      setPlanosResponsavel(planos || []);
    } else {
      setUsuarioResponsavelTelaId('');
      setPlanosResponsavel([]);
    }
  };

  function renderRoleBadge() {
    let label = '';
    let style: React.CSSProperties = {
      borderRadius: 20,
      padding: '4px 14px',
      fontWeight: 600,
      fontSize: 12,
      marginLeft: 8,
      display: 'inline-block',
      border: '1px solid',
      background: 'var(--color-background-secondary)',
      color: 'var(--color-text-primary)',
      borderColor: 'var(--color-border-divider)',
      letterSpacing: 0.2,
    };
    let icon = null;
    if (role === 'dev') {
      label = 'Developer';
      const isDark = document.documentElement.classList.contains('dark');
      style = {
        ...style,
        borderColor: isDark ? '#BFA100' : '#FFD700',
        background: isDark ? 'rgba(255, 215, 0, 0.12)' : 'rgba(191, 161, 0, 0.12)',
        color: isDark ? '#BFA100' : '#FFD700',
      };
      icon = <i className="bi bi-gem" style={{ marginRight: 6, fontSize: 12, verticalAlign: 'middle' }} />;
    } else if (role === 'manager' || role === 'gestor') {
      label = 'Manager';
      style = {
        ...style,
        borderColor: 'var(--color-accent-primary)',
        background: 'rgba(46, 107, 230, 0.10)',
        color: 'var(--color-accent-primary)',
      };
      icon = <i className="bi bi-award" style={{ marginRight: 6, fontSize: 14, verticalAlign: 'middle' }} />;
    } else if (role === 'admin_setor') {
      label = 'Admin';
      if (adminTelasDescricoes.length > 0) {
        label += ' • ' + adminTelasDescricoes.join(' | ');
      }
    } else {
      label = role;
    }
    return <span style={style}>{icon}{label}</span>;
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, var(--color-background-secondary) 0%, var(--color-background-primary) 100%)' }}>
      <header
        style={{
          width: '100%',
          height: 64,
          background: 'var(--color-background-primary)',
          borderBottom: '1.5px solid var(--color-border-divider)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px 0 0',
          position: 'fixed',
          top: 0,
          left: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, width: 215, minWidth: 215, height: '100%', justifyContent: 'center', borderRight: '1.5px solid var(--color-border-divider)'}}>
          <img
              src={theme === 'dark' ? logoWhite : logoBlack}
              alt="Logo"
              style={{
                width: '75%',
                height: 'auto',
                objectFit: 'contain',
                background: 'transparent',
                display: 'block',
              }}
            />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span className="fw-light" style={{ color: 'var(--color-accent-primary)', fontWeight: 400, fontSize: 22, letterSpacing: 0.5 }}>
            Business Operations Review
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500, fontSize: 16 }}>
            {nomeCompleto || user.email}
          </span>
          {renderRoleBadge()}
          <button
            type="button"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className="btn-secondary-custom d-flex align-items-center justify-content-center"
            style={{ width: 42, height: 38, fontSize: 16, marginBottom: 0, marginTop: 0 }}
          >
            <i className={`bi ${theme === 'dark' ? 'bi-moon-stars' : 'bi-sun'}`}/>
          </button>
          <button
            onClick={onLogout}
            className="btn-secondary-custom d-flex align-items-center justify-content-center"
            style={{ width: 42, height: 38, fontSize: 16, marginLeft: 4 }}
            title="Sair"
          >
            <i className="bi bi-door-open" />
          </button>
        </div>
      </header>
      <aside
        id="sidebar"
        className="justify-content-between"
        style={{
          position: 'fixed',
          top: 64,
          left: 0,
          width: 215,
          minWidth: 215,
          maxWidth: 215,
          height: 'calc(100vh - 64px)',
          background: 'var(--color-background-primary)',
          borderRight: '1.5px solid var(--color-border-divider)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          zIndex: 100,
        }}
      >
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 10px', borderBottom: '1px solid var(--color-border-divider)'}}>
          <div style={{ width: '100%', textAlign: 'center', marginBottom: 5}}>
            <span className="fw-light" style={{ color: 'var(--color-text-secondary)', fontSize: 14, letterSpacing: 0.5 }}>
              Office Brazil
            </span>
          </div>
          {telas.map(tela => (
            <button
              key={tela.id}
              className={`btn-sidebar d-flex align-items-center justify-content-start w-100 mb-2${mainContent === tela.id ? ' btn-sidebar-ativo' : ''}`}
              style={{ gap: 10, padding: '8px 12px', borderRadius: 8, fontSize: 14 }}
              onClick={() => handleSetMainContent(tela.id)}
            >
              <i className={telaIcones[tela.descricao] || 'bi bi-window'} style={{ fontSize: 14 }} />
              {tela.descricao}
            </button>
          ))}
        </div>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 10px', borderTop: '1px solid var(--color-border-divider)'}}>
          <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500, fontSize: 10 }}>What matters isn't the company's mistakes, but how it responds to them.</span>
        </div>
      </aside>
      <main
        style={{
          position: 'fixed',
          top: 64,
          left: 215,
          width: 'calc(100vw - 215px)',
          height: 'calc(100vh - 64px)',
          overflow: 'hidden',
          background: 'transparent',
          zIndex: 10,
        }}
      >
        {usuarioId && telaId && usuarioResponsavelTelaId && (
          telas.find(t => t.id === telaId)?.descricao === 'Accounting Indicators' ? (
            <AccountingIndicators
              usuario_responsavel_id={usuarioResponsavelTelaId}
              tela_id={telaId}
              user_role={role}
              user_setor_id={''}
              isAdmin={role === 'dev'}
              ofThisScreen={role === 'dev' || (!!permissoes[telaId] && role === 'admin_setor')}
              planos_iniciais={planosResponsavel}
            />
          ) : (
            <TimesheetAnalysis
              usuario_responsavel_id={usuarioResponsavelTelaId}
              tela_id={telaId}
              ofThisScreen={role === 'dev' || (!!permissoes[telaId] && role === 'admin_setor')}
              planos_iniciais={planosResponsavel}
            />
          )
        )}
      </main>
    </div>
  );
} 