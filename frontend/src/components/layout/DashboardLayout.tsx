import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import logoWhite from '../../assets/logo_white.png';
import logoBlack from '../../assets/logo_black.png';
import type { Tela, Permissao } from '../../types/common';
import { ROLES } from '../../utils/constants';
import { useGlobalFeedback } from '../../contexts/GlobalFeedbackContext';

interface DashboardLayoutProps {
  user: { email: string };
  onLogout: () => void;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  nomeCompleto: string;
  role: string;
  telas: Tela[];
  mainContent: string;
  onSetMainContent: (telaId: string) => void;
  permissoes: Permissao;
  isRefreshing: boolean;
  onRefresh: () => void;
  children: React.ReactNode;
}

export default function DashboardLayout({
  user,
  onLogout,
  theme,
  setTheme,
  nomeCompleto,
  role,
  telas,
  mainContent,
  onSetMainContent,
  permissoes,
  isRefreshing,
  onRefresh,
  children
}: DashboardLayoutProps) {
  const { isLoading: globalLoading, isSuccess: globalSuccess } = useGlobalFeedback();

  // Mapeamento de ícones por descrição de tela
  const telaIcones: { [descricao: string]: string } = {
    'Timesheet Analysis': 'bi bi-watch',
    'New Timesheet Analysis': 'bi bi-stopwatch',
    'Accounting Indicators': 'bi bi-cash',
    'Permit Control': 'bi bi-file-earmark-check',
  };

  // Separar telas por tipo
  const telasBrasil = telas.filter(t => t.tipo === 'brazil' || !t.tipo);
  const telasEUA = telas.filter(t => t.tipo === 'eua');

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
    
    if (role === ROLES.DEV) {
      label = 'Developer';
      const isDark = document.documentElement.classList.contains('dark');
      style = {
        ...style,
        borderColor: isDark ? '#BFA100' : '#FFD700',
        background: isDark ? 'rgba(255, 215, 0, 0.12)' : 'rgba(191, 161, 0, 0.12)',
        color: isDark ? '#BFA100' : '#FFD700',
      };
      icon = <i className="bi bi-gem" style={{ marginRight: 6, fontSize: 12, verticalAlign: 'middle' }} />;
    } else if (role === ROLES.MANAGER || role === ROLES.GESTOR) {
      label = 'Manager';
      style = {
        ...style,
        borderColor: 'var(--color-accent-primary)',
        background: 'rgba(46, 107, 230, 0.10)',
        color: 'var(--color-accent-primary)',
      };
      icon = <i className="bi bi-award" style={{ marginRight: 6, fontSize: 14, verticalAlign: 'middle' }} />;
    } else if (role === ROLES.ADMIN_SETOR) {
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span className="fw-light" style={{ color: 'var(--color-accent-primary)', fontWeight: 400, fontSize: 22, letterSpacing: 0.5 }}>
            Business Operations Review
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            type="button"
            onClick={onRefresh}
            className="btn-secondary-custom d-flex align-items-center justify-content-center"
            style={{ 
              width: 36, 
              height: 32, 
              fontSize: 14, 
              marginBottom: 0, 
              marginTop: 0,
              transition: 'all 0.2s ease'
            }}
            title="Atualizar dados"
            disabled={isRefreshing}
          >
            <i 
              className={`bi bi-arrow-repeat ${isRefreshing ? 'spinning' : ''}`} 
              style={{
                animation: isRefreshing ? 'spin 1s linear infinite' : 'none'
              }}
            />
          </button>
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
          zIndex: 1,
        }}
      >
        {/* Office Brasil */}
        {telasBrasil.length > 0 && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 10px', borderBottom: '1px solid var(--color-border-divider)'}}>
            <div style={{ width: '100%', textAlign: 'center', marginBottom: 5}}>
              <span className="fw-light" style={{ color: 'var(--color-text-secondary)', fontSize: 14, letterSpacing: 0.5 }}>
                Office Brasil
              </span>
            </div>
            {telasBrasil.map(tela => (
              <button
                key={tela.id}
                className={`btn-sidebar d-flex align-items-center justify-content-start w-100 mb-2${mainContent === tela.id ? ' btn-sidebar-ativo' : ''}`}
                style={{ gap: 10, padding: '8px 12px', borderRadius: 8, fontSize: tela.descricao === 'New Timesheet Analysis' ? 12 : 14 }}
                onClick={() => onSetMainContent(tela.id)}
              >
                <i className={telaIcones[tela.descricao] || 'bi bi-window'} style={{ fontSize: 14 }} />
                {tela.descricao}
              </button>
            ))}
          </div>
        )}
        
        {/* Office EUA */}
        {telasEUA.length > 0 && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 10px', borderBottom: '1px solid var(--color-border-divider)'}}>
            <div style={{ width: '100%', textAlign: 'center', marginBottom: 5}}>
              <span className="fw-light" style={{ color: 'var(--color-text-secondary)', fontSize: 14, letterSpacing: 0.5 }}>
                Office EUA
              </span>
            </div>
            {telasEUA.map(tela => (
              <button
                key={tela.id}
                className={`btn-sidebar d-flex align-items-center justify-content-start w-100 mb-2${mainContent === tela.id ? ' btn-sidebar-ativo' : ''}`}
                style={{ gap: 10, padding: '8px 12px', borderRadius: 8, fontSize: tela.descricao === 'New Timesheet Analysis' ? 12 : 14 }}
                onClick={() => onSetMainContent(tela.id)}
              >
                <i className={telaIcones[tela.descricao] || 'bi bi-window'} style={{ fontSize: 14 }} />
                {tela.descricao}
              </button>
            ))}
          </div>
        )}
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
          zIndex: 1,
        }}
      >
        {/* Global Loading/Success Indicator */}
        <div 
          style={{ 
            position: 'absolute', 
            top: 10, 
            left: 10, 
            zIndex: 9999,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '24px',
            height: '24px'
          }}
        >
          {globalLoading && (
            <div className="spinner-border text-primary" role="status" style={{ width: '1.2rem', height: '1.2rem', borderWidth: '0.2em' }}>
              <span className="visually-hidden">Loading...</span>
            </div>
          )}
          {!globalLoading && globalSuccess && (
            <i className="bi bi-check-circle-fill text-success" style={{ fontSize: '1.2rem' }}></i>
          )}
        </div>
        {children}
      </main>
    </div>
  );
} 