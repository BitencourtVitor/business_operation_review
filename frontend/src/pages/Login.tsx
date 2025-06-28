import React, { useState, useEffect } from 'react';
import Cookies from 'js-cookie';
import logoWhite from '../assets/logo_white.png';
import logoBlack from '../assets/logo_black.png';

interface LoginProps {
  email: string;
  password: string;
  loading: boolean;
  error: string;
  setEmail: (email: string) => void;
  setPassword: (password: string) => void;
  onLogin: (e: React.FormEvent) => void;
}

export default function Login({ email, password, loading, error, setEmail, setPassword, onLogin }: LoginProps) {
  const [localError, setLocalError] = useState('');
  const [remember, setRemember] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(Cookies.get('theme') === 'dark' ? 'dark' : 'light');

  // Preencher senha automaticamente se lembrar senha
  useEffect(() => {
    const remembered = Cookies.get('remember') === 'true';
    const rememberedEmail = Cookies.get('rememberedEmail') || '';
    const rememberedPassword = Cookies.get('rememberedPassword') || '';
    if (remembered && email === rememberedEmail) {
      setPassword(rememberedPassword);
      setRemember(true);
    }
  }, [email, setPassword]);

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
  }, [setEmail, setPassword]);

  const handleSubmit = (e: React.FormEvent) => {
    setLocalError('');
    if (!email || !password) {
      setLocalError('Preencha email e senha.');
      e.preventDefault();
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setLocalError('Email inválido.');
      e.preventDefault();
      return;
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
    onLogin(e);
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
            style={{ height: 42, width: '100%' }}
            disabled={loading}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
} 