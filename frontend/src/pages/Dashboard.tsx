import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Cookies from 'js-cookie';
import { supabase } from '../supabaseClient';
import logoWhite from '../assets/logo_white.png';
import logoBlack from '../assets/logo_black.png';
import sublogoHvac from '../assets/submenu/sublogo_hvac.png';
import sublogoFraming from '../assets/submenu/sublogo_framing.png';
import sublogoPcg from '../assets/submenu/sublogo_pcg.png';
import TimesheetAnalysis from './TimesheetAnalysis';
import PermitControl from './PermitControl';
import Projects from './Projects';
import TakeoffWorks from './TakeoffWorks';
import ServiceRequests from './ServiceRequests';
import AccountingIndicators from './AccountingIndicators';
import ProjectMonitoring from './ProjectMonitoring';
import type { Theme } from '../types/common';
import type { User } from '@supabase/supabase-js';

interface Tela {
  id: string;
  descricao: string;
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
  const [showAccountingContent, setShowAccountingContent] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<string>('HVAC');
  const [showCompanySubmenu, setShowCompanySubmenu] = useState(false);
  const [isCollapsingSubmenu, setIsCollapsingSubmenu] = useState(false);
  const [showProjectMonitoringSubmenu, setShowProjectMonitoringSubmenu] = useState(false);
  const [isCollapsingProjectMonitoringSubmenu, setIsCollapsingProjectMonitoringSubmenu] = useState(false);
  const [selectedProjectMonitoringType, setSelectedProjectMonitoringType] = useState<string>('HVAC');

  // Buscar dados do usuário e telas
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.log('Usuário não encontrado');
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

          let userRole = '';
          if (perfil) {
            userRole = perfil.tipo;
            setRole(userRole);
          }

          // Buscar telas
          const { data: telasData } = await supabase
            .from('telas')
            .select('id, descricao');
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

          // Definir tela inicial baseada no role do usuário
          if (telasData && telasData.length > 0) {
            const rolesComPermissaoAccounting = ['owner', 'gestor', 'dev'];
            const temPermissaoAccounting = rolesComPermissaoAccounting.includes(userRole);
            
            // Verificar se é admin_setor com permissão específica para Accounting
            const isAdminSetorComPermissao = userRole === 'admin_setor' && permissoesObj['46781412-07a6-431a-bd24-ae9f7292b755'];
            
            if (temPermissaoAccounting || isAdminSetorComPermissao) {
              // Usuários com permissão: Accounting Indicators como inicial
              const accountingTela = telasData.find(t => t.descricao === 'Accounting Indicators');
              if (accountingTela) {
                setTelaId(accountingTela.id);
                setShowCompanySubmenu(true);
              } else {
                setTelaId(telasData[0].id);
              }
            } else {
              // Usuários sem permissão: Timesheet Analysis como inicial
              const timesheetTela = telasData.find(t => t.descricao === 'Timesheet Analysis');
              if (timesheetTela) {
                setTelaId(timesheetTela.id);
              } else {
                setTelaId(telasData[0].id);
              }
            }
          }
        }
      } catch (error) {
        console.error('Erro ao buscar dados do usuário:', error);
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

  const handleSetMainContent = (newTelaId: string) => {
    const tela = telas.find(t => t.id === newTelaId);
    const currentTela = telas.find(t => t.id === telaId);
    
    // Verificar permissão para Accounting Indicators
    const rolesComPermissaoAccounting = ['owner', 'gestor', 'dev'];
    const temPermissaoAccounting = rolesComPermissaoAccounting.includes(role);
    
    // Verificar se é admin_setor com permissão específica para Accounting
    const isAdminSetorComPermissao = role === 'admin_setor' && permissoes['46781412-07a6-431a-bd24-ae9f7292b755'];
    
    if (tela?.descricao === 'Accounting Indicators' && !temPermissaoAccounting && !isAdminSetorComPermissao) {
      // Usuário sem permissão tentando acessar Accounting Indicators
      // Redirecionar para Timesheet Analysis
      const timesheetTela = telas.find(t => t.descricao === 'Timesheet Analysis');
      if (timesheetTela) {
        setTelaId(timesheetTela.id);
        setShowCompanySubmenu(false);
        setIsCollapsingSubmenu(false);
        setShowAccountingContent(false);
      }
      return;
    }
    
    // Se for Accounting Indicators, mostrar submenu de empresas
    if (tela?.descricao === 'Accounting Indicators') {
      setSelectedCompany('HVAC'); // Sempre resetar para HVAC
      setShowCompanySubmenu(true);
      setIsCollapsingSubmenu(false);
      setTelaId(newTelaId);
      setShowAccountingContent(false);
      // Fechar submenu de Project Monitoring se estiver aberto
      setShowProjectMonitoringSubmenu(false);
      setIsCollapsingProjectMonitoringSubmenu(false);
    } else if (tela?.descricao?.startsWith('Project Monitoring')) {
      // Se for Project Monitoring, mostrar submenu de tipos
      setSelectedProjectMonitoringType('HVAC'); // Sempre resetar para HVAC
      setShowProjectMonitoringSubmenu(true);
      setIsCollapsingProjectMonitoringSubmenu(false);
      setTelaId(newTelaId);
      // Fechar submenu de Accounting se estiver aberto
      setShowCompanySubmenu(false);
      setIsCollapsingSubmenu(false);
      setShowAccountingContent(false);
    } else {
      // Se estamos saindo do Accounting Indicators, fazer animação de saída
      if (currentTela?.descricao === 'Accounting Indicators' && showCompanySubmenu) {
        setIsCollapsingSubmenu(true);
        // Aguardar a animação terminar antes de mudar a tela
        setTimeout(() => {
          setShowCompanySubmenu(false);
          setIsCollapsingSubmenu(false);
          setTelaId(newTelaId);
          setShowAccountingContent(false);
        }, 300); // Duração da animação
      } else if (currentTela?.descricao?.startsWith('Project Monitoring') && showProjectMonitoringSubmenu) {
        // Se estamos saindo do Project Monitoring, fazer animação de saída
        setIsCollapsingProjectMonitoringSubmenu(true);
        setTimeout(() => {
          setShowProjectMonitoringSubmenu(false);
          setIsCollapsingProjectMonitoringSubmenu(false);
          setTelaId(newTelaId);
        }, 300);
      } else {
        setShowCompanySubmenu(false);
        setIsCollapsingSubmenu(false);
        setShowProjectMonitoringSubmenu(false);
        setIsCollapsingProjectMonitoringSubmenu(false);
        setTelaId(newTelaId);
        setShowAccountingContent(false);
      }
    }
  };

  const handleShowAccountingContent = () => {
    setShowAccountingContent(true);
  };

  const handleBackToProjects = () => {
    setShowAccountingContent(false);
    setShowCompanySubmenu(true);
  };

  const handleSelectCompany = (company: string) => {
    setSelectedCompany(company);
    // Manter o submenu visível quando selecionar uma empresa
    // Não mostrar AccountingIndicators diretamente, apenas definir a empresa
    // O renderMainContent vai mostrar Projects com a empresa selecionada
  };

  const handleSelectProjectMonitoringType = (type: string) => {
    setSelectedProjectMonitoringType(type);
    // Manter o submenu visível quando selecionar um tipo
    // O renderMainContent vai mostrar ProjectMonitoring com o tipo selecionado
  };


  // Mapeamento de ícones por descrição de tela
  const telaIcones: { [descricao: string]: string } = {
    'Timesheet Analysis': 'bi bi-watch',
    'Accounting Indicators': 'bi bi-cash',
    'Permit Control': 'bi bi-file-earmark-check',
    'Takeoff Works': 'bi bi-houses',
    'IT Projects': 'bi bi-braces-asterisk',
    'Bill Payments': 'bi bi-credit-card',
    'Service Requests': 'bi bi-telephone-inbound',
  };

  // Função para obter ícone da tela
  const getTelaIcone = (descricao: string) => {
    if (descricao?.startsWith('Project Monitoring')) {
      return 'bi bi-collection';
    }
    return telaIcones[descricao] || 'bi bi-window';
  };

  // Mapeamento de ícones das empresas
  const empresaIcones: { [empresa: string]: string } = {
    'HVAC': sublogoHvac,
    'Framing': sublogoFraming,
    'PCG': sublogoPcg,
  };

  // Função para filtrar telas baseado no role do usuário
  const filtrarTelasPorPermissao = (telas: Tela[]): Tela[] => {
    const rolesComPermissaoAccounting = ['owner', 'gestor', 'dev'];
    const temPermissaoAccounting = rolesComPermissaoAccounting.includes(role);
    
    // Verificar se é admin_setor com permissão específica para Accounting
    const isAdminSetorComPermissao = role === 'admin_setor' && permissoes['46781412-07a6-431a-bd24-ae9f7292b755'];
    
    // Se o usuário tem permissão para Accounting, mostrar todas as telas
    if (temPermissaoAccounting || isAdminSetorComPermissao) {
      return telas;
    }
    
    // Se não tem permissão, filtrar Accounting Indicators
    return telas.filter(tela => tela.descricao !== 'Accounting Indicators');
  };

  // Função para ordenar telas de acordo com a ordem específica
  const ordenarTelas = (telas: Tela[]): Tela[] => {
    const ordemEspecifica = [
      'Accounting Indicators',
      'Timesheet Analysis', 
      'Permit Control',
      'Takeoff Works',
      'Service Requests',
      'Project Monitoring',
      'IT Projects'
    ];

    return telas.sort((a, b) => {
      // Normalizar descrições para comparação
      const descricaoA = a.descricao?.startsWith('Project Monitoring') ? 'Project Monitoring' : a.descricao;
      const descricaoB = b.descricao?.startsWith('Project Monitoring') ? 'Project Monitoring' : b.descricao;
      
      const indexA = ordemEspecifica.indexOf(descricaoA);
      const indexB = ordemEspecifica.indexOf(descricaoB);
      
      // Se ambas as telas estão na ordem específica, ordenar por índice
      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      }
      
      // Se apenas uma está na ordem específica, ela vem primeiro
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      
      // Se nenhuma está na ordem específica, manter ordem alfabética
      return descricaoA.localeCompare(descricaoB);
    });
  };

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
    } else if (role === 'owner') {
      label = 'Owner';
      const isDark = document.documentElement.classList.contains('dark');
      style = {
        ...style,
        borderColor: isDark ? '#10B981' : '#059669',
        background: isDark ? 'rgba(16, 185, 129, 0.12)' : 'rgba(5, 150, 105, 0.12)',
        color: isDark ? '#10B981' : '#059669',
      };
      icon = <i className="bi bi-compass" style={{ marginRight: 6, fontSize: 14, verticalAlign: 'middle' }} />;
    } else if (role === 'user') {
      label = 'User';
      style = {
        ...style,
        borderColor: 'var(--color-border-divider)',
        background: 'var(--color-background-secondary)',
        color: 'var(--color-text-primary)',
      };
      icon = <i className="bi bi-person" style={{ marginRight: 6, fontSize: 14, verticalAlign: 'middle' }} />;
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
    
    // Verificar permissão para Accounting Indicators
    const rolesComPermissaoAccounting = ['owner', 'gestor', 'dev'];
    const temPermissaoAccounting = rolesComPermissaoAccounting.includes(role);
    
    // Verificar se é admin_setor com permissão específica para Accounting
    const isAdminSetorComPermissao = role === 'admin_setor' && permissoes['46781412-07a6-431a-bd24-ae9f7292b755'];
    
    // Se o usuário não tem permissão para Accounting e está tentando acessar, redirecionar
    if (tela?.descricao === 'Accounting Indicators' && !temPermissaoAccounting && !isAdminSetorComPermissao) {
      const timesheetTela = telas.find(t => t.descricao === 'Timesheet Analysis');
      if (timesheetTela) {
        setTelaId(timesheetTela.id);
        setShowCompanySubmenu(false);
        setIsCollapsingSubmenu(false);
        setShowAccountingContent(false);
      }
      return null;
    }
    
    // Verificar se o usuário é responsável pela tela selecionada
    const isResponsavelPelaTela = tela ? (permissoes[telaId] || role === 'dev' || role === 'manager' || role === 'gestor') : false;

    // Se showAccountingContent for true, mostrar AccountingIndicators independente da tela
    if (showAccountingContent) {
      // Verificar permissão antes de mostrar AccountingIndicators
      if (!temPermissaoAccounting && !isAdminSetorComPermissao) {
        return null;
      }
      
      return <AccountingIndicators 
        telaId={telaId}
        usuarioId={usuarioId}
        role={role}
        isResponsavelPelaTela={isResponsavelPelaTela}
        onBackToProjects={handleBackToProjects}
        selectedCompany={selectedCompany}
      />;
    }

    if (!tela) return null;

    switch (tela.descricao) {
      case 'Timesheet Analysis':
        return <TimesheetAnalysis telaId={telaId} usuarioId={usuarioId} role={role} isResponsavelPelaTela={isResponsavelPelaTela} />;
      case 'Accounting Indicators':
        return <Projects 
          selectedCompany={selectedCompany}
          onShowAccountingContent={handleShowAccountingContent} 
        />;
      case 'Permit Control':
        return <PermitControl telaId={telaId} usuarioId={usuarioId} role={role} isResponsavelPelaTela={isResponsavelPelaTela} />;
      case 'Takeoff Works':
        return <TakeoffWorks telaId={telaId} usuarioId={usuarioId} role={role} isResponsavelPelaTela={isResponsavelPelaTela} />;
      case 'Service Requests':
        return <ServiceRequests telaId={telaId} usuarioId={usuarioId} role={role} isResponsavelPelaTela={isResponsavelPelaTela} />;
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
        // Verificar se é Project Monitoring
        if (tela.descricao?.startsWith('Project Monitoring')) {
          return <ProjectMonitoring 
            telaId={telaId} 
            usuarioId={usuarioId} 
            role={role} 
            isResponsavelPelaTela={isResponsavelPelaTela}
            selectedType={selectedProjectMonitoringType} 
          />;
        }
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
          {/* All screens in a single list */}
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 10px 0'}}>
            {ordenarTelas(filtrarTelasPorPermissao(telas)).map(tela => (
              <div key={tela.id} style={{ width: '100%' }}>
                                 <button
                  className={`btn-sidebar d-flex align-items-center justify-content-start w-100${(tela.descricao === 'Accounting Indicators' || tela.descricao?.startsWith('Project Monitoring')) ? '' : ' mb-2'}${telaId === tela.id ? ' btn-sidebar-ativo' : ''}`}
                  style={{ 
                    gap: 10, 
                    padding: '8px 12px', 
                    borderRadius: 8, 
                    fontSize: 14,
                    cursor: telaId === tela.id ? 'default' : 'pointer',
                    marginBottom: (tela.descricao === 'Accounting Indicators' || tela.descricao?.startsWith('Project Monitoring')) && telaId === tela.id ? 0 : '0.5rem'
                  }}
                  onClick={() => {
                    if (telaId !== tela.id) {
                      handleSetMainContent(tela.id);
                    }
                  }}
                >
                  <i className={getTelaIcone(tela.descricao)} style={{ fontSize: 14 }} />
                  {tela.descricao?.startsWith('Project Monitoring') ? 'Project Monitoring' : tela.descricao}
                </button>
                
                {/* Submenu de empresas para Accounting Indicators */}
                {tela.descricao === 'Accounting Indicators' && (showCompanySubmenu || isCollapsingSubmenu) && telaId === tela.id && (
                  <div style={{ 
                    padding: '2px 0',
                    marginLeft: '10px',
                    borderLeft: '1px solid var(--color-border-divider)',
                    marginBottom: '.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    animation: isCollapsingSubmenu ? 'collapseSubmenu 0.3s ease-out' : 'expandSubmenu 0.3s ease-out',
                    overflow: 'hidden'
                  }}>
                    {['HVAC', 'Framing', 'PCG'].map(company => {
                      const isDisabled = company === 'PCG';
                      return (
                        <button
                          key={company}
                          className={`btn-sidebar d-flex align-items-center justify-content-start w-100`}
                          style={{ 
                            gap: 8, 
                            padding: '6px 10px', 
                            borderRadius: 0, 
                            fontSize: 12,
                            // ===== ESTADO ATIVO (SELECIONADO) =====
                            borderLeft: selectedCompany === company ? '3px solid var(--color-brand-blue)' : 'none',
                            color: isDisabled ? 'var(--color-text-secondary)' : (selectedCompany === company ? 'var(--color-text-primary)' : 'var(--color-text-secondary)'),
                            fontWeight: selectedCompany === company ? 700 : 400,
                            transition: 'all 0.2s ease',
                            cursor: isDisabled ? 'not-allowed' : (selectedCompany === company ? 'default' : 'pointer'),
                            outline: 'none',
                            opacity: isDisabled ? 0.5 : 1
                          }}
                          onClick={() => {
                            if (!isDisabled && selectedCompany !== company) {
                              handleSelectCompany(company);
                            }
                          }}
                          
                          // ===== HOVER EFFECT (MOUSE POR CIMA) =====
                          onMouseOver={e => {
                            if (!isDisabled) {
                              e.currentTarget.style.background = 'transparent';
                              if (selectedCompany !== company) {
                                 e.currentTarget.style.color = 'var(--color-text-primary)';
                                 e.currentTarget.style.background = 'linear-gradient(90deg, var(--color-background-secondary) 0%, var(--color-background-secondary) 50%, transparent 100%)';
                                 e.currentTarget.style.backdropFilter = 'blur(4px)';
                                 e.currentTarget.style.borderRight = 'none';
                               }
                            }
                          }}
                          
                          // ===== MOUSE OUT (SAINDO DO BOTÃO) =====
                          onMouseOut={e => {
                            if (!isDisabled) {
                              if (selectedCompany !== company) {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.color = 'var(--color-text-secondary)';
                                e.currentTarget.style.backdropFilter = 'none';
                                e.currentTarget.style.borderRight = 'none';
                              }
                            }
                          }}
                          
                          // ===== MOUSE DOWN (CLICANDO) =====
                          onMouseDown={e => {
                            if (!isDisabled && selectedCompany !== company) {
                              e.currentTarget.style.color = 'white';
                            }
                          }}
                          
                          // ===== MOUSE UP (SOLTANDO O CLIQUE) =====
                          onMouseUp={e => {
                            if (!isDisabled && selectedCompany !== company) {
                              e.currentTarget.style.background = 'transparent';
                              e.currentTarget.style.color = 'var(--color-text-primary)';
                            }
                          }}
                        >
                           <img 
                             src={empresaIcones[company] || ''} 
                             alt={company} 
                             style={{ 
                               width: 16, 
                               height: 16, 
                               objectFit: 'contain',
                               marginRight: 8,
                               opacity: isDisabled ? 0.5 : 1
                             }} 
                           />
                          {company}{isDisabled ? ' (Em breve)' : ''}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Submenu de tipos para Project Monitoring */}
                {tela.descricao?.startsWith('Project Monitoring') && (showProjectMonitoringSubmenu || isCollapsingProjectMonitoringSubmenu) && telaId === tela.id && (
                  <div style={{ 
                    padding: '2px 0',
                    marginLeft: '10px',
                    borderLeft: '1px solid var(--color-border-divider)',
                    marginBottom: '.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    animation: isCollapsingProjectMonitoringSubmenu ? 'collapseSubmenu 0.3s ease-out' : 'expandSubmenu 0.3s ease-out',
                    overflow: 'hidden'
                  }}>
                    {['HVAC'].map(type => {
                      const isDisabled = false; // Por enquanto apenas HVAC está disponível
                      return (
                        <button
                          key={type}
                          className={`btn-sidebar d-flex align-items-center justify-content-start w-100`}
                          style={{ 
                            gap: 8, 
                            padding: '6px 10px', 
                            borderRadius: 0, 
                            fontSize: 12,
                            // ===== ESTADO ATIVO (SELECIONADO) =====
                            borderLeft: selectedProjectMonitoringType === type ? '3px solid var(--color-brand-blue)' : 'none',
                            color: isDisabled ? 'var(--color-text-secondary)' : (selectedProjectMonitoringType === type ? 'var(--color-text-primary)' : 'var(--color-text-secondary)'),
                            fontWeight: selectedProjectMonitoringType === type ? 700 : 400,
                            transition: 'all 0.2s ease',
                            cursor: isDisabled ? 'not-allowed' : (selectedProjectMonitoringType === type ? 'default' : 'pointer'),
                            outline: 'none',
                            opacity: isDisabled ? 0.5 : 1
                          }}
                          onClick={() => {
                            if (!isDisabled && selectedProjectMonitoringType !== type) {
                              handleSelectProjectMonitoringType(type);
                            }
                          }}
                          
                          // ===== HOVER EFFECT (MOUSE POR CIMA) =====
                          onMouseOver={e => {
                            if (!isDisabled) {
                              e.currentTarget.style.background = 'transparent';
                              if (selectedProjectMonitoringType !== type) {
                                 e.currentTarget.style.color = 'var(--color-text-primary)';
                                 e.currentTarget.style.background = 'linear-gradient(90deg, var(--color-background-secondary) 0%, var(--color-background-secondary) 50%, transparent 100%)';
                                 e.currentTarget.style.backdropFilter = 'blur(4px)';
                                 e.currentTarget.style.borderRight = 'none';
                               }
                            }
                          }}
                          
                          // ===== MOUSE OUT (SAINDO DO BOTÃO) =====
                          onMouseOut={e => {
                            if (!isDisabled) {
                              if (selectedProjectMonitoringType !== type) {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.color = 'var(--color-text-secondary)';
                                e.currentTarget.style.backdropFilter = 'none';
                                e.currentTarget.style.borderRight = 'none';
                              }
                            }
                          }}
                          
                          // ===== MOUSE DOWN (CLICANDO) =====
                          onMouseDown={e => {
                            if (!isDisabled && selectedProjectMonitoringType !== type) {
                              e.currentTarget.style.color = 'white';
                            }
                          }}
                          
                          // ===== MOUSE UP (SOLTANDO O CLIQUE) =====
                          onMouseUp={e => {
                            if (!isDisabled && selectedProjectMonitoringType !== type) {
                              e.currentTarget.style.background = 'transparent';
                              e.currentTarget.style.color = 'var(--color-text-primary)';
                            }
                          }}
                        >
                           <img 
                             src={empresaIcones[type] || ''} 
                             alt={type} 
                             style={{ 
                               width: 16, 
                               height: 16, 
                               objectFit: 'contain',
                               marginRight: 8,
                               opacity: isDisabled ? 0.5 : 1
                             }} 
                           />
                          {type}{isDisabled ? ' (Em breve)' : ''}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
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