import React, { useState, useEffect } from 'react';
import Cookies from 'js-cookie';
import logoWhite from '../assets/logo_white.png';
import logoBlack from '../assets/logo_black.png';
import type { Theme } from '../types/common';

export default function Maintenance() {
  const [theme, setTheme] = useState<Theme>(Cookies.get('theme') === 'dark' ? 'dark' : 'light');

  useEffect(() => {
    Cookies.set('theme', theme, { expires: 365 });
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const containerStyle: React.CSSProperties = {
    maxWidth: 500,
    width: '100%',
    background: 'var(--color-background-primary)',
    color: 'var(--color-text-primary)',
    border: '1.5px solid var(--color-border-divider)',
    boxShadow: '0 2px 24px 0 rgba(0,0,0,0.08)',
    borderRadius: 10,
    padding: '32px 24px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    transition: 'background 0.3s, color 0.3s, border 0.3s',
  };

  return (
    <div
      className="d-flex flex-column align-items-center justify-content-center min-vh-100"
      style={{
        background: 'linear-gradient(135deg, var(--color-background-secondary) 0%, var(--color-background-primary) 100%)',
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
          display: 'block',
        }}
      />
      <h2
        className="h5 fw-light text-center mb-4"
        style={{ color: 'var(--color-accent-primary)', letterSpacing: 0.5 }}
      >
        Business Operations Review
      </h2>

      <div style={containerStyle}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: 'var(--color-background-secondary)',
            border: '1.5px solid var(--color-border-divider)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 24,
          }}
        >
          <i className="bi bi-wrench-adjustable" style={{ fontSize: 28, color: 'var(--color-accent-primary)' }} />
        </div>

        <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12, color: 'var(--color-text-primary)' }}>
          Sistema em manutenção
        </h3>

        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: '0 0 20px' }}>
          Estamos realizando melhorias no sistema.<br />
          Voltamos em breve.
        </p>

        <div
          style={{
            border: '1.5px dashed var(--color-border-divider)',
            borderRadius: 8,
            padding: '12px 16px',
            background: 'var(--color-background-secondary)',
            fontSize: 13,
            color: 'var(--color-text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
          }}
        >
          <i className="bi bi-info-circle" style={{ color: 'var(--color-accent-primary)', fontSize: 15, flexShrink: 0 }} />
          <span>Dúvidas? Fale com o Vitor.</span>
        </div>

        <button
          type="button"
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          className="btn-secondary-custom d-flex align-items-center justify-content-center"
          style={{ width: 42, height: 38, fontSize: 16, marginTop: 20 }}
          aria-label="Alternar tema"
        >
          <i className={`bi ${theme === 'dark' ? 'bi-moon-stars' : 'bi-sun'}`} />
        </button>
      </div>
    </div>
  );
}
