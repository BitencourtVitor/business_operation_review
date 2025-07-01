import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Cookies from 'js-cookie';
import { supabase } from '../supabaseClient';
import logoWhite from '../assets/logo_white.png';
import logoBlack from '../assets/logo_black.png';
import type { Theme } from '../types/common';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [localError, setLocalError] = useState('');
  const [remember, setRemember] = useState(false);
  const [theme, setTheme] = useState<Theme>(Cookies.get('theme') === 'dark' ? 'dark' : 'light');

  // Preencher senha automaticamente se lembrar senha
  useEffect(() => {
    const remembered = Cookies.get('remember') === 'true';
    const rememberedEmail = Cookies.get('rememberedEmail') || '';
    const rememberedPassword = Cookies.get('rememberedPassword') || '';
    if (remembered && email === rememberedEmail) {
      setPassword(rememberedPassword);
      setRemember(true);
    }
  }, [email]);

  // Persistir tema no cookie e aplicar classe
  useEffect(() => {
    Cookies.set('theme', theme, { expires: 365 });
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Ao montar, carregar email/senha lembrados
  useEffect(() => {
    const remembered = Cookies.get('remember') === 'true';
    if (remembered) {
      setEmail(Cookies.get('rememberedEmail') || '');
      setPassword(Cookies.get('rememberedPassword') || '');
      setRemember(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    setError('');
    
    if (!email || !password) {
      setLocalError('Preencha email e senha.');
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setLocalError('Email inválido.');
      return;
    }

    setLoading(true);
    console.log('Tentando fazer login com:', email);
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      console.log('Resposta do Supabase:', { data, error });

      if (error) {
        console.error('Erro no login:', error);
        setError(error.message);
      } else if (data.user) {
        console.log('Login bem-sucedido:', data.user);
        
        // Chamar edge function para atualizar tabelas do banco
        try {
          const { error: edgeFunctionError } = await supabase.functions.invoke('gsheet_data', {
            body: { 
              userId: data.user.id,
              email: data.user.email 
            }
          });
          
          if (edgeFunctionError) {
            console.error('Erro na edge function:', edgeFunctionError);
          }
        } catch (edgeFunctionError) {
          console.error('Erro ao chamar edge function:', edgeFunctionError);
        }
        
        if (remember) {
          Cookies.set('remember', 'true', { expires: 365 });
          Cookies.set('rememberedEmail', email, { expires: 365 });
          Cookies.set('rememberedPassword', password, { expires: 365 });
        } else {
          Cookies.remove('remember');
          Cookies.remove('rememberedEmail');
          Cookies.remove('rememberedPassword');
        }
        
        // Limpa o sessionStorage para garantir dados atualizados após login
        sessionStorage.clear();
        
        navigate('/dashboard');
      }
    } catch {
      setError('Erro inesperado ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  const handleThemeToggle = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  // Estilos customizados para tema
  const containerStyle: React.CSSProperties = {
    maxWidth: 500,
    width: '100%',
    background: 'var(--color-background-primary)',
    color: 'var(--color-text-primary)',
    border: '1.5px solid var(--color-border-divider)',
    boxShadow: '0 2px 24px 0 rgba(0,0,0,0.08)',
    borderRadius: 10,
    padding: 20,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.3s, color 0.3s, border 0.3s',
  };
  
  const errorStyle: React.CSSProperties = {
    background: 'var(--color-background-secondary)',
    color: 'var(--color-accent-primary)',
    border: '1.5px solid var(--color-border-divider)',
    borderRadius: 8,
    padding: '8px 0',
    textAlign: 'center',
    fontSize: 14,
    marginBottom: 8,
    marginTop: 4,
  };

  return (
    <div
      id="background"
      className="d-flex flex-column align-items-center justify-content-center min-vh-100 bg-body-secondary"
      style={{
        background: `linear-gradient(135deg, var(--color-background-secondary) 0%, var(--color-background-primary) 100%)`,
        transition: 'background 0.3s',
      }}
    >
      <img
        src={theme === 'dark' ? logoWhite : logoBlack}
        alt="Logo"
        style={{
          width: '25%',
          minWidth: 150,
          maxWidth: 300,
          height: 'auto',
          marginBottom: 18,
          background: 'transparent',
          display: 'block',
        }}
      />
      <h2
        className="h5 fw-light text-center mb-4 d-flex flex-row"
        style={{ color: 'var(--color-accent-primary)', letterSpacing: 0.5 }}
      >
       Business Operations Review
      </h2>

      <div style={containerStyle}>
        <form onSubmit={handleSubmit} className="w-100" autoComplete="on">
          <div className="mb-2">
            <div className="input-group mb-3">
              <span
                className="input-group-text"
                id="email-addon"
                style={{
                  background: 'var(--color-background-secondary)',
                  color: 'var(--color-accent-primary)',
                  border: '1.5px solid var(--color-border-divider)',
                  transition: 'background 0.3s, color 0.3s, border 0.3s',
                }}
              >
                <i className="bi bi-person"></i>
              </span>
              <input
                type="email"
                id="email"
                name="email"
                className="form-control"
                style={{
                  background: 'var(--color-background-primary)',
                  color: 'var(--color-text-primary)',
                  border: '1.5px solid var(--color-border-divider)',
                  transition: 'background 0.3s, color 0.3s, border 0.3s',
                }}
                placeholder="E-mail"
                aria-describedby="email-addon"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="username"
              />
            </div>
          </div>
          <div className="mb-2">
            <div className="input-group mb-3">
              <span
                className="input-group-text"
                id="password-addon"
                style={{
                  background: 'var(--color-background-secondary)',
                  color: 'var(--color-accent-primary)',
                  border: '1.5px solid var(--color-border-divider)',
                  transition: 'background 0.3s, color 0.3s, border 0.3s',
                }}
              >
                <i className="bi bi-key"></i>
              </span>
              <input
                type="password"
                id="password"
                name="password"
                className="form-control"
                style={{
                  background: 'var(--color-background-primary)',
                  color: 'var(--color-text-primary)',
                  border: '1.5px solid var(--color-border-divider)',
                  transition: 'background 0.3s, color 0.3s, border 0.3s',
                }}
                placeholder="Senha"
                aria-describedby="password-addon"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
          </div>
          <div className="d-flex align-items-center justify-content-between mb-2">
            <label className="d-flex align-items-center text-secondary small user-select-none" style={{ color: 'var(--color-text-secondary)' }}>
              <input
                type="checkbox"
                className="me-2 form-check-input rounded"
                checked={remember}
                onChange={e => setRemember(e.target.checked)}
              />
              Lembrar senha
            </label>
            <button
              type="button"
              onClick={handleThemeToggle}
              className="btn-secondary-custom d-flex align-items-center justify-content-center"
              style={{ width: 42, height: 38, fontSize: 16, marginBottom: 0, marginTop: 0 }}
            >
              <i className={`bi ${theme === 'dark' ? 'bi-moon-stars' : 'bi-sun'}`}/>
            </button>
          </div>
          {(localError || error) && (
            <div style={errorStyle}>
              {localError || error}
            </div>
          )}
          <button
            type="submit"
            className="btn-primary-custom"
            style={{ height: 42, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner-border" role="status" style={{ width: 20, height: 20, color: '#fff', borderWidth: 2, marginRight: 10 }}>
                  <span className="visually-hidden">Carregando...</span>
                </span>
                <span>Entrando...</span>
              </>
            ) : (
              'Entrar'
            )}
          </button>
        </form>
      </div>
    </div>
  );
} 