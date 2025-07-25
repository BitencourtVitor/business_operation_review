import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Cookies from 'js-cookie';
import { supabase } from '../supabaseClient';
import logoWhite from '../assets/logo_white.png';
import logoBlack from '../assets/logo_black.png';
import TimesheetAnalysis from './TimesheetAnalysis';
import AccountingIndicators from './AccountingIndicators';
import PermitControl from './PermitControl';
import Projects from './Projects';
import TakeoffWorks from './TakeoffWorks';
import type { Theme } from '../types/common';
import type { User } from '@supabase/supabase-js';

interface Tela {
  id: string;
  descricao: string;
  type?: 'brazil' | 'eua';
}

interface Permissao {
  [telaId: string]: boolean;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState<Theme>(Cookies.get('theme') === 'dark' ? 'dark' : 'light');
  const [telaId, setTelaId] = useState<string>('');
  const [user, setUser] = useState<User | null>(null);
  const [nomeCompleto, setNomeCompleto] = useState('');
  const [role, setRole] = useState('');
  const [telas, setTelas] = useState<Tela[]>([]);
  const [permissoes, setPermissoes] = useState<Permissao>({});
  const [usuarioId, setUsuarioId] = useState<string>('');

  // Buscar dados do usuário e telas
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        // Verificar se há uma sessão válida
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('Erro ao verificar sessão:', sessionError);
          navigate('/login');
          return;
        }
        
        if (!session) {
          console.log('Nenhuma sessão encontrada, redirecionando para login');
          navigate('/login');
          return;
        }
        
        // Verificar se o token ainda é válido
        const now = Math.floor(Date.now() / 1000);
        if (session.expires_at && session.expires_at < now) {
          console.log('Sessão expirada, redirecionando para login');
          await supabase.auth.signOut();
          navigate('/login');
          return;
        }
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.log('Usuário não encontrado, redirecionando para login');
          navigate('/login');
          return;
        }
        
        setUser(user);

        // Buscar dados do usuário
        const { data: usuario } = await supabase
          .from('usuarios')
          .select('id, nome_completo')
          .eq('email', user.email)
          .single();

        if (usuario) {
          setUsuarioId(usuario.id);
          setNomeCompleto(usuario.nome_completo);

          // Buscar perfil do usuário
          const { data: perfil } = await supabase
            .from('perfis')
            .select('tipo')
            .eq('usuario_id', usuario.id)
            .single();

          if (perfil) {
            setRole(perfil.tipo);
          }

          // Buscar telas
          const { data: telasData } = await supabase
            .from('telas')
            .select('id, descricao, type');
          setTelas(telasData || []);

          // Buscar permissões
          const { data: usuariosTelas } = await supabase
            .from('usuarios_telas')
            .select('tela_id')
            .eq('usuario_id', usuario.id);
          
          const permissoesObj: Permissao = {};
          (usuariosTelas || []).forEach(rel => {
            permissoesObj[rel.tela_id] = true;
          });
          setPermissoes(permissoesObj);

          // Definir tela inicial como Timesheet Analysis
          if (telasData && telasData.length > 0) {
            const timesheetTela = telasData.find(t => t.descricao === 'Timesheet Analysis');
            if (timesheetTela) {
              setTelaId(timesheetTela.id);
            } else {
              setTelaId(telasData[0].id);
            }
          }
        }
      } catch (error) {
        console.error('Erro ao buscar dados do usuário:', error);
        navigate('/login');
      }
    };

    fetchUserData();
  }, [navigate]);

  // Persistir tema no cookie e aplicar classe
  useEffect(() => {
    Cookies.set('theme', theme, { expires: 365 });
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const handleThemeToggle = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    sessionStorage.clear();
    navigate('/login');
  };

  const handleSetMainContent = (telaId: string) => {
    setTelaId(telaId);
  };

  // Mapeamento de ícones por descrição de tela
  const telaIcones: { [descricao: string]: string } = {
    'Timesheet Analysis': 'bi bi-watch',
    'Outstanding Indicators': 'bi bi-cash',
    'Permit Control': 'bi bi-file-earmark-check',
    'Takeoff Works': 'bi bi-houses',
    'IT Projects': 'bi bi-braces-asterisk',
    'Bill Payments': 'bi bi-credit-card',
    'Service Requests': 'bi bi-telephone-inbound',
  };

  // Separar telas por tipo
  const telasBrasil = telas.filter(t => t.type === 'brazil' || !t.type);
  const telasEUA = telas.filter(t => t.type === 'eua');

  // Descobrir todas as telas em que o usuário é admin_setor
  const adminTelasDescricoes = telas
    .filter(t => permissoes[t.id])
    .map(t => t.descricao)
    .sort();

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

  // Renderizar conteúdo principal baseado na tela selecionada
  const renderMainContent = () => {
    const tela = telas.find(t => t.id === telaId);
    
    // Verificar se o usuário é responsável pela tela selecionada
    const isResponsavelPelaTela = tela ? (permissoes[telaId] || role === 'dev') : false;

    if (telaId === 'projects') {
      return <Projects />;
    }

    if (!tela) return null;

    switch (tela.descricao) {
      case 'Timesheet Analysis':
        return <TimesheetAnalysis telaId={telaId} usuarioId={usuarioId} role={role} isResponsavelPelaTela={isResponsavelPelaTela} />;
      case 'Outstanding Indicators':
        return <AccountingIndicators telaId={telaId} usuarioId={usuarioId} role={role} isResponsavelPelaTela={isResponsavelPelaTela} />;
      case 'Permit Control':
        return <PermitControl telaId={telaId} usuarioId={usuarioId} role={role} isResponsavelPelaTela={isResponsavelPelaTela} />;
      case 'Takeoff Works':
        return <TakeoffWorks telaId={telaId} usuarioId={usuarioId} role={role} isResponsavelPelaTela={isResponsavelPelaTela} />;
      case 'IT Projects':
        return (
          <div className="container-fluid">
            <div className="row">
              <div className="col-12">
                <div className="card" style={{ 
                  background: 'var(--color-background-primary)',
                  border: '1.5px solid var(--color-border-divider)',
                  borderRadius: 10
                }}>
                  <div className="card-body">
                    <h5 className="card-title" style={{ color: 'var(--color-text-primary)' }}>
                      {tela.descricao}
                    </h5>
                    <p style={{ color: 'var(--color-text-secondary)' }}>
                      Conteúdo da página {tela.descricao} será implementado em breve.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      default:
        return (
          <div className="container-fluid">
            <div className="row">
              <div className="col-12">
                <div className="card" style={{ 
                  background: 'var(--color-background-primary)',
                  border: '1.5px solid var(--color-border-divider)',
                  borderRadius: 10
                }}>
                  <div className="card-body">
                    <h5 className="card-title" style={{ color: 'var(--color-text-primary)' }}>
                      {tela.descricao}
                    </h5>
                    <p style={{ color: 'var(--color-text-secondary)' }}>
                      Conteúdo da página {tela.descricao} será implementado em breve.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
    }
  };

  if (!user || !telaId) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--color-background-primary)',
        color: 'var(--color-text-secondary)'
      }}>
        <div className="spinner-border" role="status" style={{ 
          width: 40, 
          height: 40, 
          color: 'var(--color-accent-primary)',
          marginBottom: '16px'
        }}>
          <span className="visually-hidden">Carregando...</span>
        </div>
        <p style={{ 
          margin: 0, 
          fontSize: '14px',
          fontWeight: 500,
          color: 'var(--color-text-secondary)'
        }}>
          Carregando...
        </p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, var(--color-background-secondary) 0%, var(--color-background-primary) 100%)' }}>
      {/* Header */}
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
          zIndex: 1,
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span className="fw-light" style={{ color: 'var(--color-accent-primary)', fontWeight: 400, fontSize: 22, letterSpacing: 0.5 }}>
            Business Operations Review
          </span>
          <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500, fontSize: 10 }}>
            What matters isn't the company's mistakes, but how it responds to them.
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500, fontSize: 16 }}>
            {nomeCompleto || user.email}
          </span>
          {renderRoleBadge()}
          <button
            type="button"
            onClick={handleThemeToggle}
            className="btn-secondary-custom d-flex align-items-center justify-content-center"
            style={{ width: 42, height: 38, fontSize: 16, marginBottom: 0, marginTop: 0 }}
          >
            <i className={`bi ${theme === 'dark' ? 'bi-moon-stars' : 'bi-sun'}`}/>
          </button>
          <button
            onClick={handleLogout}
            className="btn-secondary-custom d-flex align-items-center justify-content-center"
            style={{ width: 42, height: 38, fontSize: 16, marginLeft: 4 }}
            title="Sair"
          >
            <i className="bi bi-door-open" />
          </button>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        id="sidebar"
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
          zIndex: 1,
        }}
      >
        <div style={{ 
          width: '100%', 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          borderBottom: '1px solid var(--color-border-divider)',
          flex: 1,
          overflowY: 'hidden'
        }}>
          {/* Office Brasil */}
          {telasBrasil.length > 0 && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 10px'}}>
              <div style={{ width: '100%', textAlign: 'center', marginBottom: 5}}>
                <span className="fw-light" style={{ color: 'var(--color-text-secondary)', fontSize: 14, letterSpacing: 0.5 }}>
                  Office Brasil
                </span>
              </div>
              {telasBrasil.map(tela => (
                <button
                  key={tela.id}
                  className={`btn-sidebar d-flex align-items-center justify-content-start w-100 mb-2${telaId === tela.id ? ' btn-sidebar-ativo' : ''}`}
                  style={{ gap: 10, padding: '8px 12px', borderRadius: 8, fontSize: 14 }}
                  onClick={() => handleSetMainContent(tela.id)}
                >
                  <i className={telaIcones[tela.descricao] || 'bi bi-window'} style={{ fontSize: 14 }} />
                  {tela.descricao}
                </button>
              ))}
            </div>
          )}
          
          {/* Office EUA */}
          {telasEUA.length > 0 && (
            <>
              {telasBrasil.length > 0 && <div style={{ width: '100%', height: 1, background: 'var(--color-border-divider)' }}></div>}
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 10px'}}>
                <div style={{ width: '100%', textAlign: 'center', marginBottom: 5}}>
                  <span className="fw-light" style={{ color: 'var(--color-text-secondary)', fontSize: 14, letterSpacing: 0.5 }}>
                    Office EUA
                  </span>
                </div>
                {telasEUA.map(tela => (
                  <button
                    key={tela.id}
                    className={`btn-sidebar d-flex align-items-center justify-content-start w-100 mb-2${telaId === tela.id ? ' btn-sidebar-ativo' : ''}`}
                    style={{ gap: 10, padding: '8px 12px', borderRadius: 8, fontSize: 14 }}
                    onClick={() => handleSetMainContent(tela.id)}
                  >
                    <i className={telaIcones[tela.descricao] || 'bi bi-window'} style={{ fontSize: 14 }} />
                    {tela.descricao}
                  </button>
                ))}
              </div>
            </>
          )}
          
          <div style={{ width: '100%', height: 1, background: 'var(--color-border-divider)' }}></div>
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 10px'}}>
            <div style={{ width: '100%', textAlign: 'center', marginBottom: 5}}>
              <span className="fw-light" style={{ color: 'var(--color-text-secondary)', fontSize: 14, letterSpacing: 0.5 }}>
                Quickbooks
              </span>
            </div>
            <button
              className={`btn-sidebar d-flex align-items-center justify-content-start w-100 mb-2${telaId === 'projects' ? ' btn-sidebar-ativo' : ''}`}
              style={{ gap: 10, padding: '8px 12px', borderRadius: 8, fontSize: 14 }}
              onClick={() => handleSetMainContent('projects')}
            >
              <i className="bi bi-graph-up-arrow" style={{ fontSize: 14 }} />
              Accounting Indicators
            </button>
          </div>
        </div>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 10px', borderTop: '1px solid var(--color-border-divider)' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <button
              className="btn-sidebar d-flex align-items-center justify-content-start w-100"
              style={{ gap: 10, padding: '8px 12px', borderRadius: 8, fontSize: 14 }}
              onMouseEnter={(e) => {
                const tooltip = e.currentTarget.nextElementSibling as HTMLElement;
                if (tooltip) tooltip.style.display = 'block';
              }}
              onMouseLeave={(e) => {
                const tooltip = e.currentTarget.nextElementSibling as HTMLElement;
                if (tooltip) tooltip.style.display = 'none';
              }}
            >
              <i className="bi bi-gear" style={{ fontSize: 14 }} />
              Settings
            </button>
            <div style={{
              position: 'absolute',
              left: '100%',
              top: '50%',
              transform: 'translateY(-50%)',
              marginLeft: 8,
              background: 'var(--color-background-primary)',
              border: '1px solid var(--color-border-divider)',
              borderRadius: 6,
              padding: '6px 10px',
              fontSize: 11,
              color: 'var(--color-text-secondary)',
              whiteSpace: 'nowrap',
              zIndex: 1000,
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              display: 'none'
            }}>
              Melhoria implementada em breve
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main
        style={{
          position: 'fixed',
          top: 64,
          left: 215,
          width: 'calc(100vw - 215px)',
          height: 'calc(100vh - 64px)',
          overflow: 'auto',
          background: 'transparent',
          zIndex: 10,
        }}
      >
        {renderMainContent()}
      </main>
    </div>
  );
} 