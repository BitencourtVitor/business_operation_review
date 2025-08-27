import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Verificar se há uma sessão ativa
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
  
          setIsAuthenticated(false);
          setIsLoading(false);
          return;
        }
        
        if (!session) {
  
          setIsAuthenticated(false);
          setIsLoading(false);
          return;
        }
        
        // Verificar se o token ainda é válido
        const now = Math.floor(Date.now() / 1000);
        if (session.expires_at && session.expires_at < now) {
  
          await supabase.auth.signOut();
          sessionStorage.clear();
          setIsAuthenticated(false);
          setIsLoading(false);
          return;
        }
        
        // Verificar se passou muito tempo desde o login (8 horas)
        const loginTimestamp = sessionStorage.getItem('loginTimestamp');
        if (loginTimestamp) {
          const loginTime = parseInt(loginTimestamp);
          const currentTime = Date.now();
          const sessionDuration = 8 * 60 * 60 * 1000; // 8 horas em millisegundos
          
          if (currentTime - loginTime > sessionDuration) {
    
            await supabase.auth.signOut();
            sessionStorage.clear();
            setIsAuthenticated(false);
            setIsLoading(false);
            return;
          }
        }
        
        setIsAuthenticated(true);
        setIsLoading(false);
      } catch (error) {
        console.error('Erro ao verificar autenticação:', error);
        setIsAuthenticated(false);
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  if (isLoading) {
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
          <span className="visually-hidden">Verificando...</span>
        </div>
        <p style={{ 
          margin: 0, 
          fontSize: '14px',
          fontWeight: 500,
          color: 'var(--color-text-secondary)'
        }}>
          Verificando sessão...
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
} 