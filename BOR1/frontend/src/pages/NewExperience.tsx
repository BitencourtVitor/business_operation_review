import React, { useState, useEffect } from 'react';
import Cookies from 'js-cookie';
import logoWhite from '../assets/logo_white.png';
import logoBlack from '../assets/logo_black.png';
import type { Theme } from '../types/common';

const BOR2_URL = 'https://pg-bor.up.railway.app/';

export default function NewExperience() {
  const [theme, setTheme] = useState<Theme>(Cookies.get('theme') === 'dark' ? 'dark' : 'light');

  useEffect(() => {
    Cookies.set('theme', theme, { expires: 365 });
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  return (
    <div
      className="d-flex flex-column align-items-center justify-content-center min-vh-100"
      style={{
        backgroundImage: 'radial-gradient(circle, var(--color-border-divider) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
        backgroundColor: 'var(--color-background-primary)',
        transition: 'background-color 0.3s',
        padding: '32px 16px',
        position: 'relative',
      }}
    >
      {/* theme toggle — fixo top-right */}
      <button
        type="button"
        onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        className="btn-secondary-custom d-flex align-items-center justify-content-center"
        style={{ position: 'fixed', top: 20, right: 20, width: 42, height: 38, fontSize: 16, zIndex: 10 }}
        aria-label="Alternar tema"
      >
        <i className={`bi ${theme === 'dark' ? 'bi-moon-stars' : 'bi-sun'}`} />
      </button>

      {/* logo */}
      <img
        src={theme === 'dark' ? logoWhite : logoBlack}
        alt="Premium Group"
        style={{ width: '25%', minWidth: 140, maxWidth: 280, height: 'auto', marginBottom: 16, display: 'block' }}
      />

      {/* subtítulo do produto */}
      <p
        style={{
          color: 'var(--color-accent-primary)',
          fontSize: 13,
          fontWeight: 500,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          marginBottom: 28,
        }}
      >
        Business Operations Review
      </p>

      {/* card */}
      <div
        style={{
          maxWidth: 560,
          width: '100%',
          background: 'var(--color-background-primary)',
          border: '1.5px solid var(--color-border-divider)',
          boxShadow: '0 4px 40px 0 rgba(0,0,0,0.08)',
          borderRadius: 14,
          padding: '36px 32px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          transition: 'background 0.3s, border 0.3s',
        }}
        className="new-experience-card"
      >
        {/* ícone */}
        <div
          style={{
            width: 68,
            height: 68,
            borderRadius: '50%',
            background: 'rgba(46, 107, 230, 0.08)',
            border: '1.5px solid rgba(46, 107, 230, 0.20)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
          }}
        >
          <i className="bi bi-stars" style={{ fontSize: 26, color: 'var(--color-accent-primary)' }} />
        </div>

        {/* badge */}
        <span
          style={{
            display: 'inline-block',
            background: 'rgba(46, 107, 230, 0.08)',
            color: 'var(--color-accent-primary)',
            border: '1px solid rgba(46, 107, 230, 0.20)',
            borderRadius: 20,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1,
            padding: '4px 14px',
            marginBottom: 18,
            textTransform: 'uppercase',
          }}
        >
          Nova experiência
        </span>

        {/* título */}
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: 'var(--color-text-primary)',
            marginBottom: 16,
            lineHeight: 1.3,
          }}
        >
          O BOR evoluiu.
        </h1>

        {/* mensagem */}
        <p
          style={{
            fontSize: 15,
            color: 'var(--color-text-secondary)',
            lineHeight: 1.75,
            marginBottom: 10,
            maxWidth: 440,
          }}
        >
          Trabalhamos bastante nos últimos meses construindo uma versão completamente nova do sistema — do zero, com uma arquitetura mais moderna, novas funcionalidades e uma experiência muito melhor pra você.
        </p>
        <p
          style={{
            fontSize: 15,
            color: 'var(--color-text-secondary)',
            lineHeight: 1.75,
            marginBottom: 32,
            maxWidth: 440,
          }}
        >
          A partir de agora, o BOR tem um novo endereço. Clique abaixo e seja bem-vindo à nova experiência.
        </p>

        {/* aviso de nova senha */}
        <div
          style={{
            width: '100%',
            borderRadius: 8,
            padding: '12px 16px',
            background: 'rgba(234, 179, 8, 0.07)',
            border: '1.5px solid rgba(234, 179, 8, 0.28)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            marginBottom: 20,
            textAlign: 'left',
          }}
        >
          <i className="bi bi-exclamation-triangle" style={{ color: '#CA8A04', fontSize: 15, flexShrink: 0, marginTop: 2 }} />
          <span style={{ fontSize: 13.5, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>Nova senha necessária.</strong>{' '}
            O novo sistema utiliza credenciais diferentes do BOR atual. Entre em contato com o Vitor para receber o seu acesso.
          </span>
        </div>

        {/* CTA */}
        <a
          href={BOR2_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary-custom"
          style={{
            width: '100%',
            height: 46,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            fontSize: 15,
            fontWeight: 600,
            textDecoration: 'none',
            borderRadius: 8,
          }}
        >
          Acessar o novo BOR
          <i className="bi bi-arrow-up-right-circle" style={{ fontSize: 17 }} />
        </a>
      </div>

      <style>{`
        @media (max-width: 600px) {
          .new-experience-card {
            padding: 28px 20px !important;
            border-radius: 12px !important;
          }
        }
      `}</style>
    </div>
  );
}
