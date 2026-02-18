import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Cookies from 'js-cookie';
import { supabase } from '../supabaseClient';
import logoWhite from '../assets/logo_white.png';
import logoBlack from '../assets/logo_black.png';
import { loadFuelControlSchema } from '../utils/fuelControlSchemaLoader';
import type { Theme } from '../types/common';

interface LoadingItem {
  id: string;
  title: string;
  status: 'pending' | 'loading' | 'completed' | 'error';
  progress: number;
  error?: string;
}

const INITIAL_LOADING_ITEMS: LoadingItem[] = [
  { id: 'jobcosting_timesheet', title: 'New Timesheet Analysis', status: 'pending', progress: 0 },
  // { id: 'workforce', title: 'Forecast', status: 'pending', progress: 0 }, // Desativado a pedido
  { id: 'timesheet', title: 'Timesheet Analysis', status: 'pending', progress: 0 },
  { id: 'permit', title: 'Permit Control', status: 'pending', progress: 0 },
  { id: 'receivables', title: 'Receivables Accounting', status: 'pending', progress: 0 },
  { id: 'payables', title: 'Payables Accounting', status: 'pending', progress: 0 },
  { id: 'takeoff', title: 'Takeoff Works', status: 'pending', progress: 0 },
  { id: 'service', title: 'Service Requests', status: 'pending', progress: 0 },
  { id: 'monitoring_hvac', title: 'Project Monitoring', status: 'pending', progress: 0 },
  { id: 'subcontractor_performance', title: 'Subcontractor Performance', status: 'pending', progress: 0 },
  { id: 'fuel_control_schema', title: 'Fuel Control Schema', status: 'pending', progress: 0 },
  { id: 'fuel_control_data', title: 'Fuel Control Data', status: 'pending', progress: 0 }
];

const EDGE_FUNCTIONS = [
  { id: 'jobcosting_timesheet', name: 'jobcosting_timesheet' },
  // { id: 'workforce', name: 'forecast' }, // Desativado a pedido
  { id: 'timesheet', name: 'timesheet_gsheet' },
  { id: 'permit', name: 'permit_gsheet' },
  { id: 'receivables', name: 'receivable_gsheet' },
  { id: 'payables', name: 'payable_gsheet' },
  { id: 'takeoff', name: 'takeoff_gsheet' },
  { id: 'service', name: 'service_gsheet' },
  { id: 'monitoring_hvac', name: 'monitoring_hvac_gsheet' },
  { id: 'subcontractor_performance', name: 'subcontractor_performance' }
];

export default function InitialLoading() {
  const navigate = useNavigate();
  const [theme] = useState<Theme>(Cookies.get('theme') === 'dark' ? 'dark' : 'light');
  const [loadingItems, setLoadingItems] = useState<LoadingItem[]>(INITIAL_LOADING_ITEMS);
  const [hasValidSession, setHasValidSession] = useState(false);
  const hasProcessed = useRef(false);

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
      // Evitar execuções múltiplas com useRef (mais imediato)
      if (hasProcessed.current) {
        console.log('⚠️ InitialLoading: Já foi processado, ignorando chamada duplicada...');
        return;
      }
      
      hasProcessed.current = true;
      console.log('🚀 InitialLoading: Iniciando processamento das edge functions...');
      
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
      const progressIntervals = EDGE_FUNCTIONS.map(func => {
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
        const promises = EDGE_FUNCTIONS.map(async (func, index) => {
          try {
            if (func.name === 'forecast') {
              console.log('📊 InitialLoading: Chamando forecast...');
            }
            const { data, error } = await supabase.functions.invoke(func.name, {
              body: { userId: 'loading-process' }
            });
            
            // Limpar o intervalo de progresso
            clearInterval(progressIntervals[index]);
            
            if (error) {
              console.error(`❌ Erro ao invocar ${func.name}:`, error);
              setLoadingItems(prev => prev.map(item => 
                item.id === func.id 
                  ? { ...item, status: 'error', progress: 100, error: error.message }
                  : item
              ));
            } else if (data && data.error) {
              console.error(`❌ Erro no retorno da function ${func.name}:`, data.error);
              setLoadingItems(prev => prev.map(item => 
                item.id === func.id 
                  ? { ...item, status: 'error', progress: 100, error: typeof data.error === 'string' ? data.error : JSON.stringify(data.error) }
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
            console.error(`❌ Exceção ao invocar ${func.name}:`, error);
            clearInterval(progressIntervals[index]);
            setLoadingItems(prev => prev.map(item => 
              item.id === func.id 
                ? { ...item, status: 'error', progress: 100, error: error instanceof Error ? error.message : 'Unknown error' }
                : item
            ));
          }
        });

        // Carregar esquema de Fuel Control
        const fuelSchemaPromise = (async () => {
          try {
            const fuelSchemaIndex = INITIAL_LOADING_ITEMS.findIndex(item => item.id === 'fuel_control_schema');
            if (fuelSchemaIndex !== -1) {
              const success = await loadFuelControlSchema();
              
              if (!success) {
                setLoadingItems(prev => prev.map(item => 
                  item.id === 'fuel_control_schema'
                    ? { ...item, status: 'error', progress: 100, error: 'Erro ao carregar esquema' }
                    : item
                ));
              } else {
                setLoadingItems(prev => prev.map(item => 
                  item.id === 'fuel_control_schema'
                    ? { ...item, status: 'completed', progress: 100 }
                    : item
                ));
              }
            }
          } catch {
            setLoadingItems(prev => prev.map(item => 
              item.id === 'fuel_control_schema'
                ? { ...item, status: 'error', progress: 100, error: 'Erro ao carregar esquema' }
                : item
            ));
          }
        })();

        // Carregar dados de combustível (Samsara + WEX)
        const fuelDataPromise = (async () => {
          try {
            const fuelDataIndex = INITIAL_LOADING_ITEMS.findIndex(item => item.id === 'fuel_control_data');
            if (fuelDataIndex !== -1) {
              // Atualizar status para loading
              setLoadingItems(prev => prev.map(item => 
                item.id === 'fuel_control_data'
                  ? { ...item, status: 'loading', progress: 0 }
                  : item
              ));

              // Simular progresso durante carregamento
              const progressInterval = setInterval(() => {
                setLoadingItems(prev => prev.map(item => 
                  item.id === 'fuel_control_data' && item.progress < 90
                    ? { ...item, progress: item.progress + Math.random() * 15 }
                    : item
                ));
              }, 200);

              // Aguardar um tempo para simular carregamento dos dados
              await new Promise(resolve => setTimeout(resolve, 3000));

              // Limpar intervalo e marcar como completo
              clearInterval(progressInterval);
              setLoadingItems(prev => prev.map(item => 
                item.id === 'fuel_control_data'
                  ? { ...item, status: 'completed', progress: 100 }
                  : item
              ));
            }
          } catch {
            setLoadingItems(prev => prev.map(item => 
              item.id === 'fuel_control_data'
                ? { ...item, status: 'error', progress: 100, error: 'Erro ao carregar dados' }
                : item
            ));
          }
        })();

        // Aguardar todas as promises incluindo o esquema de Fuel Control e dados de combustível
        await Promise.allSettled([...promises, fuelSchemaPromise, fuelDataPromise]);
        
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      style={{
        width: '100vw',
        height: '100vh',
        background: `linear-gradient(135deg, var(--color-background-secondary) 0%, var(--color-background-primary) 100%)`,
        transition: 'all 0.3s ease',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
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
          width: '100%',
          maxWidth: 'min(800px, 95vw)',
          maxHeight: 'min(700px, 95vh)',
          background: 'var(--color-background-primary)',
          color: 'var(--color-text-primary)',
          border: theme === 'dark' 
            ? '1px solid rgba(255, 255, 255, 0.1)'
            : '1px solid rgba(0, 0, 0, 0.1)',
          boxShadow: theme === 'dark' 
            ? '0 8px 32px 0 rgba(0, 0, 0, 0.3), 0 4px 16px 0 rgba(0, 0, 0, 0.2)'
            : '0 8px 32px 0 rgba(0, 0, 0, 0.1), 0 4px 16px 0 rgba(0, 0, 0, 0.05)',
          borderRadius: 'clamp(12px, 2vw, 16px)',
          padding: 'clamp(20px, 4vw, 40px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.3s ease',
          position: 'relative',
          backdropFilter: 'blur(10px)',
          overflow: 'auto'
        }}
      >
        <img
          src={theme === 'dark' ? logoWhite : logoBlack}
          alt="Logo"
          style={{
            width: 'clamp(80px, 15vw, 180px)',
            height: 'auto',
            marginBottom: 'clamp(16px, 3vw, 24px)',
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
            fontSize: 'clamp(1.25rem, 4vw, 1.75rem)',
            margin: '0 0 clamp(12px, 2vw, 20px) 0',
            lineHeight: 1.2
          }}
        >
          {hasValidSession ? 'Updating system data' : 'Loading system data'}
        </h3>
        
        <p 
          className="text-center mb-4"
          style={{ 
            color: 'var(--color-text-secondary)',
            fontSize: 'clamp(0.85rem, 2.5vw, 0.95rem)',
            fontWeight: 400,
            maxWidth: 'min(400px, 80vw)',
            lineHeight: 1.5,
            margin: '0 0 clamp(16px, 3vw, 24px) 0'
          }}
        >
          
        </p>

        <div 
          style={{ 
            width: '100%', 
            maxWidth: 'min(600px, 90vw)',
            flex: '1',
            overflow: 'auto',
            paddingRight: '8px',
            // Custom scrollbar
            scrollbarWidth: 'thin',
            scrollbarColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.3) rgba(0, 0, 0, 0.1)'
          }}
          className="custom-scrollbar"
        >
          {loadingItems.map((item) => (
            <div key={item.id} style={{ marginBottom: 'clamp(16px, 3vw, 24px)' }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                marginBottom: 'clamp(8px, 1.5vw, 12px)',
                flexWrap: 'wrap',
                gap: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', flex: '1', minWidth: '200px' }}>
                  <span style={{ 
                    fontSize: 'clamp(1rem, 3vw, 1.1rem)',
                    marginRight: 'clamp(8px, 1.5vw, 12px)'
                  }}>
                    {getStatusIcon(item.status)}
                  </span>
                  <span 
                    className="fw-medium"
                    style={{ 
                      fontSize: 'clamp(0.85rem, 2.5vw, 0.95rem)',
                      ...getStatusColor(item.status),
                      wordBreak: 'break-word'
                    }}
                  >
                    {item.title}
                  </span>
                </div>
                <span 
                  className="small fw-medium"
                  style={{ 
                    fontSize: 'clamp(0.75rem, 2vw, 0.8rem)',
                    ...getStatusColor(item.status),
                    whiteSpace: 'nowrap'
                  }}
                >
                  {item.status === 'loading' ? `${Math.round(item.progress)}%` : getStatusText(item.status)}
                </span>
              </div>
              
              <div 
                className="progress" 
                style={{ 
                  height: 'clamp(6px, 1.5vw, 8px)',
                  borderRadius: 'clamp(3px, 1vw, 4px)',
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
                    borderRadius: 'clamp(3px, 1vw, 4px)',
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
                    fontSize: 'clamp(0.75rem, 2vw, 0.8rem)',
                    fontWeight: 500,
                    padding: 'clamp(6px, 1.5vw, 8px) clamp(8px, 2vw, 12px)',
                    background: 'rgba(239, 68, 68, 0.1)',
                    borderRadius: 'clamp(4px, 1vw, 6px)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    marginTop: 'clamp(8px, 1.5vw, 12px)',
                    display: 'block'
                  }}
                >
                  <i className="bi bi-exclamation-triangle me-1" />
                  {item.error}
                </small>
              )}
            </div>
          ))}
        </div>

        <div style={{ 
          marginTop: 'clamp(20px, 4vw, 32px)', 
          textAlign: 'center',
          flexShrink: 0
        }}>
          <div 
            className="spinner-border" 
            role="status" 
            style={{ 
              width: 'clamp(1.25rem, 3vw, 1.5rem)', 
              height: 'clamp(1.25rem, 3vw, 1.5rem)',
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
              fontSize: 'clamp(0.8rem, 2.5vw, 0.9rem)',
              fontWeight: 400,
              margin: 'clamp(12px, 2vw, 16px) 0 0 0'
            }}
          >
            {hasValidSession ? 'Refreshing your workspace...' : 'Preparing your workspace...'}
          </p>
        </div>
      </div>

      {/* Custom scrollbar styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-track {
          background: ${theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'};
          border-radius: 4px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: ${theme === 'dark' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)'};
          border-radius: 4px;
          transition: background 0.2s ease;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: ${theme === 'dark' ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)'};
        }
        
        .custom-scrollbar::-webkit-scrollbar-corner {
          background: transparent;
        }
      `}</style>
    </div>
  );
} 