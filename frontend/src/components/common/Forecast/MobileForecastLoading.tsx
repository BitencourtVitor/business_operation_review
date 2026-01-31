import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../supabaseClient';
import logoWhite from '../../../assets/logo_white.png';
import logoBlack from '../../../assets/logo_black.png';
import type { Theme } from '../../../types/common';

interface LoadingItem {
  id: string;
  title: string;
  status: 'pending' | 'loading' | 'completed' | 'error';
  progress: number;
  error?: string;
}

interface MobileForecastLoadingProps {
  onComplete: () => void;
  theme?: 'light' | 'dark';
}

export default function MobileForecastLoading({ onComplete, theme = 'light' }: MobileForecastLoadingProps) {
  const [loadingItems, setLoadingItems] = useState<LoadingItem[]>([
    { id: 'workforce', title: 'Forecast Data', status: 'pending', progress: 0 }
  ]);
  const [isProcessing, setIsProcessing] = useState(false);
  const hasProcessed = useRef(false);

  useEffect(() => {
    const processForecastData = async () => {
      // Evitar execuções múltiplas
      if (hasProcessed.current) {
        console.log('⚠️ MobileForecastLoading: Já foi processado, ignorando chamada duplicada...');
        return;
      }
      
      hasProcessed.current = true;
      setIsProcessing(true);
      console.log('🚀 MobileForecastLoading: Iniciando carregamento dos dados do Forecast...');
      
      // Atualizar item para loading
      setLoadingItems(prev => prev.map(item => ({
        ...item,
        status: 'loading',
        progress: 0
      })));

      // Criar intervalo de progresso
      const progressInterval = setInterval(() => {
        setLoadingItems(prev => prev.map(item => 
          item.id === 'workforce' && item.progress < 90 
            ? { ...item, progress: item.progress + Math.random() * 20 }
            : item
        ));
      }, 200);

      try {
        // Chamar a edge function do forecast (novo modelo)
        console.log('📊 MobileForecastLoading: Chamando forecast...');
        const { error } = await supabase.functions.invoke('forecast', {
          method: 'POST',
          body: {}
        });
        
        // Limpar o intervalo de progresso
        clearInterval(progressInterval);
        
        if (error) {
          console.error('❌ Erro na edge function forecast:', error);
          setLoadingItems(prev => prev.map(item => 
            item.id === 'workforce' 
              ? { ...item, status: 'error', progress: 100, error: error.message }
              : item
          ));
          
          // Aguardar um pouco antes de continuar mesmo com erro
          setTimeout(() => {
            onComplete();
          }, 2000);
        } else {
          console.log('✅ MobileForecastLoading: Dados do Forecast carregados com sucesso');
          setLoadingItems(prev => prev.map(item => 
            item.id === 'workforce' 
              ? { ...item, status: 'completed', progress: 100 }
              : item
          ));
          
          // Aguardar um pouco antes de continuar
          setTimeout(() => {
            onComplete();
          }, 1000);
        }
      } catch (error) {
        console.error('❌ Erro geral no carregamento:', error);
        clearInterval(progressInterval);
        setLoadingItems(prev => prev.map(item => 
          item.id === 'workforce' 
            ? { ...item, status: 'error', progress: 100, error: error instanceof Error ? error.message : 'Unknown error' }
            : item
        ));
        
        // Aguardar um pouco antes de continuar mesmo com erro
        setTimeout(() => {
          onComplete();
        }, 2000);
      } finally {
        setIsProcessing(false);
      }
    };

    processForecastData();
  }, [onComplete]);

  const getStatusIcon = (status: LoadingItem['status']) => {
    const iconStyle = { fontSize: '1.5rem' };
    
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
        return 'Loading...';
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
          maxWidth: 'min(400px, 95vw)',
          maxHeight: 'min(600px, 95vh)',
          background: 'var(--color-background-primary)',
          color: 'var(--color-text-primary)',
          border: theme === 'dark' 
            ? '1px solid rgba(255, 255, 255, 0.1)'
            : '1px solid rgba(0, 0, 0, 0.1)',
          boxShadow: theme === 'dark' 
            ? '0 8px 32px 0 rgba(0, 0, 0, 0.3), 0 4px 16px 0 rgba(0, 0, 0, 0.2)'
            : '0 8px 32px 0 rgba(0, 0, 0, 0.1), 0 4px 16px 0 rgba(0, 0, 0, 0.05)',
          borderRadius: 'clamp(12px, 2vw, 16px)',
          padding: 'clamp(20px, 4vw, 32px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.3s ease',
          position: 'relative',
          backdropFilter: 'blur(10px)',
          overflowY: 'auto',
          overflowX: 'hidden'
        }}
      >
        {/* Logo */}
        <img
          src={theme === 'dark' ? logoWhite : logoBlack}
          alt="Logo"
          style={{
            width: 'clamp(200px, 50vw, 350px)',
            height: 'auto',
            marginBottom: 'clamp(16px, 3vw, 24px)',
            background: 'transparent',
            display: 'block',
            filter: theme === 'dark' ? 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3))' : 'none'
          }}
        />
        
        {/* Título */}
        <h3
          style={{
            color: 'var(--color-accent-primary)', 
            letterSpacing: 0.5,
            fontWeight: 300,
            fontSize: 'clamp(1.25rem, 4vw, 1.5rem)',
            margin: '0 0 clamp(8px, 2vw, 16px) 0',
            lineHeight: 1.2,
            textAlign: 'center'
          }}
        >
          Loading Forecast Data
        </h3>
        
        <p
          style={{
            color: 'var(--color-text-secondary)',
            fontSize: 'clamp(0.85rem, 2.5vw, 0.95rem)',
            fontWeight: 400,
            maxWidth: 'min(300px, 80vw)',
            lineHeight: 1.5,
            margin: '0 0 clamp(16px, 3vw, 24px) 0',
            textAlign: 'center'
          }}
        >
          Preparing your mobile forecast workspace...
        </p>

        {/* Loading Items */}
        <div 
          style={{ 
            width: '100%', 
            maxWidth: 'min(300px, 90vw)',
            flex: '1',
            overflow: 'auto',
            paddingRight: '8px',
            scrollbarWidth: 'thin',
            scrollbarColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.3) rgba(0, 0, 0, 0.1)'
          }}
          className="custom-scrollbar"
        >
          {loadingItems.map((item) => (
            <div key={item.id} style={{ marginBottom: 'clamp(12px, 2vw, 16px)' }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                marginBottom: 'clamp(6px, 1vw, 8px)',
                flexWrap: 'wrap',
                gap: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', flex: '1', minWidth: '150px' }}>
                  <span style={{ 
                    fontSize: 'clamp(1rem, 2.5vw, 1.2rem)',
                    marginRight: 'clamp(8px, 1.5vw, 12px)'
                  }}>
                    {getStatusIcon(item.status)}
                  </span>
                  <span 
                    style={{ 
                      fontSize: 'clamp(0.85rem, 2.5vw, 0.95rem)',
                      fontWeight: 500,
                      ...getStatusColor(item.status),
                      wordBreak: 'break-word'
                    }}
                  >
                    {item.title}
                  </span>
                </div>
                <span 
                  style={{ 
                    fontSize: 'clamp(0.75rem, 2vw, 0.8rem)',
                    fontWeight: 500,
                    ...getStatusColor(item.status),
                    whiteSpace: 'nowrap'
                  }}
                >
                  {item.status === 'loading' ? `${Math.round(item.progress)}%` : getStatusText(item.status)}
                </span>
              </div>
              
              <div 
                style={{ 
                  height: 'clamp(6px, 1.5vw, 8px)',
                  borderRadius: 'clamp(3px, 1vw, 4px)',
                  background: theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
                  overflow: 'hidden'
                }}
              >
                <div
                  style={{
                    width: `${item.progress}%`,
                    background: getProgressBarColor(item.status),
                    transition: 'width 0.3s ease, background-color 0.3s ease',
                    borderRadius: 'clamp(3px, 1vw, 4px)',
                    boxShadow: item.status === 'loading' 
                      ? `0 0 8px ${getProgressBarColor(item.status)}40`
                      : 'none',
                    height: '100%'
                  }}
                />
              </div>
              
              {item.error && (
                <div 
                  style={{ 
                    color: '#EF4444',
                    fontSize: 'clamp(0.75rem, 2vw, 0.8rem)',
                    fontWeight: 500,
                    padding: 'clamp(6px, 1.5vw, 8px) clamp(8px, 2vw, 12px)',
                    background: 'rgba(239, 68, 68, 0.1)',
                    borderRadius: 'clamp(4px, 1vw, 6px)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    marginTop: 'clamp(6px, 1vw, 8px)',
                    display: 'block'
                  }}
                >
                  <i className="bi bi-exclamation-triangle me-1" />
                  {item.error}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Spinner */}
        <div style={{ 
          marginTop: 'clamp(16px, 3vw, 24px)', 
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
            style={{ 
              color: 'var(--color-text-secondary)',
              fontSize: 'clamp(0.8rem, 2.5vw, 0.9rem)',
              fontWeight: 400,
              margin: 'clamp(8px, 2vw, 12px) 0 0 0'
            }}
          >
            Refreshing your workspace...
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
