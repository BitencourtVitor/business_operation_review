import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Cookies from 'js-cookie';
import { supabase } from '../supabaseClient';
import logoWhite from '../assets/logo_white.png';
import logoBlack from '../assets/logo_black.png';
import type { Theme } from '../types/common';

interface LoadingItem {
  id: string;
  title: string;
  status: 'pending' | 'loading' | 'completed' | 'error';
  progress: number;
  error?: string;
}

export default function InitialLoading() {
  const navigate = useNavigate();
  const [theme] = useState<Theme>(Cookies.get('theme') === 'dark' ? 'dark' : 'light');
  const [loadingItems, setLoadingItems] = useState<LoadingItem[]>([
    { id: 'timesheet', title: 'Timesheet Analysis', status: 'pending', progress: 0 },
    { id: 'permit', title: 'Permit Control', status: 'pending', progress: 0 },
    { id: 'receivables', title: 'Receivables Accounting', status: 'pending', progress: 0 },
    { id: 'payables', title: 'Payables Accounting', status: 'pending', progress: 0 },
    { id: 'takeoff', title: 'Takeoff Works', status: 'pending', progress: 0 },
    { id: 'service', title: 'Service Requests', status: 'pending', progress: 0 },
    { id: 'monitoring_hvac', title: 'Project Monitoring', status: 'pending', progress: 0 }
  ]);
  const [hasValidSession, setHasValidSession] = useState(false);

  const edgeFunctions = [
    { id: 'timesheet', name: 'timesheet_gsheet' },
    { id: 'permit', name: 'permit_gsheet' },
    { id: 'receivables', name: 'receivable_gsheet' },
    { id: 'payables', name: 'payable_gsheet' },
    { id: 'takeoff', name: 'takeoff_gsheet' },
    { id: 'service', name: 'service_gsheet' },
    { id: 'monitoring_hvac', name: 'monitoring_hvac_gsheet' }
  ];

  // Aplicar tema ao documento
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    const processAllFunctions = async () => {
      
      // Verificar se o usuário já tem uma sessão válida
      const { data: { session } } = await supabase.auth.getSession();
      const loginTimestamp = sessionStorage.getItem('loginTimestamp');
      const hasValidSession = !!(session && loginTimestamp);
      setHasValidSession(hasValidSession);
      
      // Se tem sessão válida, fazer loading mais rápido
      const progressSpeed = hasValidSession ? 25 : 15;
      const progressInterval = hasValidSession ? 150 : 200;
      
      // Atualizar todos os itens para loading
      setLoadingItems(prev => prev.map(item => ({
        ...item,
        status: 'loading',
        progress: 0
      })));

      // Criar intervalos de progresso para todos os itens
      const progressIntervals = edgeFunctions.map(func => {
        return setInterval(() => {
          setLoadingItems(prev => prev.map(item => 
            item.id === func.id && item.progress < 90 
              ? { ...item, progress: item.progress + Math.random() * progressSpeed }
              : item
          ));
        }, progressInterval);
      });

      try {
        // Executar todas as edge functions em paralelo
        const promises = edgeFunctions.map(async (func, index) => {
          try {
            const { error } = await supabase.functions.invoke(func.name, {
              body: { userId: 'loading-process' }
            });
            
            // Limpar o intervalo de progresso
            clearInterval(progressIntervals[index]);
            
            if (error) {
              setLoadingItems(prev => prev.map(item => 
                item.id === func.id 
                  ? { ...item, status: 'error', progress: 100, error: error.message }
                  : item
              ));
            } else {
              setLoadingItems(prev => prev.map(item => 
                item.id === func.id 
                  ? { ...item, status: 'completed', progress: 100 }
                  : item
              ));
            }
          } catch (error) {
            clearInterval(progressIntervals[index]);
            setLoadingItems(prev => prev.map(item => 
              item.id === func.id 
                ? { ...item, status: 'error', progress: 100, error: error instanceof Error ? error.message : 'Unknown error' }
                : item
            ));
          }
        });

        // Aguardar todas as promises
        await Promise.allSettled(promises);
        
        // Limpar todos os intervalos restantes
        progressIntervals.forEach(interval => clearInterval(interval));
        
        // Aguardar um pouco antes de navegar para o dashboard
        setTimeout(() => {
          navigate('/dashboard');
        }, 1000);
        
      } catch (error) {
        console.error('Erro geral no processamento:', error);
        // Limpar todos os intervalos em caso de erro
        progressIntervals.forEach(interval => clearInterval(interval));
      }
    };

    processAllFunctions();
  }, []);

  const getStatusIcon = (status: LoadingItem['status']) => {
    const iconStyle = { fontSize: '1.2rem' };
    
    switch (status) {
      case 'pending':
        return <i className="bi bi-clock" style={{ ...iconStyle, color: 'var(--color-text-secondary)' }} />;
      case 'loading':
        return <i className="bi bi-arrow-clockwise" style={{ ...iconStyle, color: 'var(--color-accent-primary)', animation: 'spin 1s linear infinite' }} />;
      case 'completed':
        return <i className="bi bi-check-circle" style={{ ...iconStyle, color: '#10B981' }} />;
      case 'error':
        return <i className="bi bi-x-circle" style={{ ...iconStyle, color: '#EF4444' }} />;
      default:
        return <i className="bi bi-clock" style={{ ...iconStyle, color: 'var(--color-text-secondary)' }} />;
    }
  };

  const getStatusColor = (status: LoadingItem['status']) => {
    switch (status) {
      case 'pending':
        return { color: 'var(--color-text-secondary)' };
      case 'loading':
        return { color: 'var(--color-accent-primary)' };
      case 'completed':
        return { color: '#10B981' };
      case 'error':
        return { color: '#EF4444' };
      default:
        return { color: 'var(--color-text-secondary)' };
    }
  };

  const getProgressBarColor = (status: LoadingItem['status']) => {
    switch (status) {
      case 'completed':
        return '#10B981';
      case 'error':
        return '#EF4444';
      default:
        return 'var(--color-accent-primary)';
    }
  };

  const getStatusText = (status: LoadingItem['status']) => {
    switch (status) {
      case 'loading':
        return 'Processing...';
      case 'completed':
        return 'Completed';
      case 'error':
        return 'Error';
      default:
        return 'Pending';
    }
  };

  return (
    <div
      className="min-vh-100 d-flex flex-column align-items-center justify-content-center"
      style={{
        background: `linear-gradient(135deg, var(--color-background-secondary) 0%, var(--color-background-primary) 100%)`,
        transition: 'all 0.3s ease',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Background pattern */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: theme === 'dark' 
            ? 'radial-gradient(circle at 20% 80%, rgba(120, 119, 198, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255, 119, 198, 0.1) 0%, transparent 50%)'
            : 'radial-gradient(circle at 20% 80%, rgba(120, 119, 198, 0.05) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255, 119, 198, 0.05) 0%, transparent 50%)',
          pointerEvents: 'none'
        }}
      />

      <div
        style={{
          maxWidth: 700,
          width: '100%',
          background: 'var(--color-background-primary)',
          color: 'var(--color-text-primary)',
          border: theme === 'dark' 
            ? '1px solid rgba(255, 255, 255, 0.1)'
            : '1px solid rgba(0, 0, 0, 0.1)',
          boxShadow: theme === 'dark' 
            ? '0 8px 32px 0 rgba(0, 0, 0, 0.3), 0 4px 16px 0 rgba(0, 0, 0, 0.2)'
            : '0 8px 32px 0 rgba(0, 0, 0, 0.1), 0 4px 16px 0 rgba(0, 0, 0, 0.05)',
          borderRadius: 16,
          padding: 40,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.3s ease',
          position: 'relative',
          backdropFilter: 'blur(10px)'
        }}
      >
        <img
          src={theme === 'dark' ? logoWhite : logoBlack}
          alt="Logo"
          style={{
            width: '25%',
            minWidth: 100,
            maxWidth: 180,
            height: 'auto',
            marginBottom: 24,
            background: 'transparent',
            display: 'block',
            filter: theme === 'dark' ? 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3))' : 'none'
          }}
        />
        
                     <h3
               className="h3 fw-light text-center mb-3"
               style={{ 
                 color: 'var(--color-accent-primary)', 
                 letterSpacing: 0.5,
                 fontWeight: 300,
                 fontSize: '1.75rem'
               }}
             >
               {hasValidSession ? 'Updating system data' : 'Loading system data'}
             </h3>
             
             <p 
               className="text-center mb-4"
               style={{ 
                 color: 'var(--color-text-secondary)',
                 fontSize: '0.95rem',
                 fontWeight: 400,
                 maxWidth: 400,
                 lineHeight: 1.5
               }}
             >
               
             </p>

        <div className="w-100" style={{ maxWidth: 500 }}>
          {loadingItems.map((item) => (
            <div key={item.id} className="mb-4">
              <div className="d-flex align-items-center justify-content-between mb-3">
                <div className="d-flex align-items-center">
                  <span className="me-3" style={{ fontSize: '1.1rem' }}>
                    {getStatusIcon(item.status)}
                  </span>
                  <span 
                    className="fw-medium"
                    style={{ 
                      fontSize: '0.95rem',
                      ...getStatusColor(item.status)
                    }}
                  >
                    {item.title}
                  </span>
                </div>
                <span 
                  className="small fw-medium"
                  style={{ 
                    fontSize: '0.8rem',
                    ...getStatusColor(item.status)
                  }}
                >
                  {item.status === 'loading' ? `${Math.round(item.progress)}%` : getStatusText(item.status)}
                </span>
              </div>
              
              <div 
                className="progress" 
                style={{ 
                  height: '8px',
                  borderRadius: '4px',
                  background: theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
                  overflow: 'hidden'
                }}
              >
                <div
                  className="progress-bar"
                  style={{
                    width: `${item.progress}%`,
                    background: getProgressBarColor(item.status),
                    transition: 'width 0.3s ease, background-color 0.3s ease',
                    borderRadius: '4px',
                    boxShadow: item.status === 'loading' 
                      ? `0 0 8px ${getProgressBarColor(item.status)}40`
                      : 'none'
                  }}
                />
              </div>
              
              {item.error && (
                <small 
                  className="mt-2 d-block"
                  style={{ 
                    color: '#EF4444',
                    fontSize: '0.8rem',
                    fontWeight: 500,
                    padding: '8px 12px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    borderRadius: '6px',
                    border: '1px solid rgba(239, 68, 68, 0.2)'
                  }}
                >
                  <i className="bi bi-exclamation-triangle me-1" />
                  {item.error}
                </small>
              )}
            </div>
          ))}
        </div>

        <div className="mt-5 text-center">
          <div 
            className="spinner-border" 
            role="status" 
            style={{ 
              width: '1.5rem', 
              height: '1.5rem',
              color: 'var(--color-accent-primary)',
              borderWidth: '2px'
            }}
          >
                           <span className="visually-hidden">Loading...</span>
          </div>
                         <p 
                 className="mt-3 mb-0"
                 style={{ 
                   color: 'var(--color-text-secondary)',
                   fontSize: '0.9rem',
                   fontWeight: 400
                 }}
               >
                 {hasValidSession ? 'Refreshing your workspace...' : 'Preparing your workspace...'}
               </p>
        </div>
      </div>
    </div>
  );
} 