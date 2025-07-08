import React, { useEffect, useState } from 'react';

interface Invoice {
  Id: string;
  DocNumber: string;
  TxnDate: string;
  CustomerRef?: { name: string };
  TotalAmt: number;
  Balance: number;
  PrivateNote?: string;
}

const API_URL = 'https://zsqbejfmbyuanetoxewt.supabase.co/functions/v1/quickbooks-public';

const ApiTest: React.FC = () => {
  const [data, setData] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(API_URL)
      .then(async (res) => {
        if (!res.ok) throw new Error('Erro ao buscar dados');
        const json = await res.json();
        console.log('Resposta QuickBooks:', json); // Debug

        // Aceita tanto maiúsculo quanto minúsculo
        const fault = json.Fault || json.fault;
        if (fault) {
          const errorMessage = fault.Error?.[0]?.Message || fault.error?.[0]?.message || 'Erro do QuickBooks';
          throw new Error(errorMessage);
        }
        
        const queryResponse = json.QueryResponse || json.queryResponse;
        const invoices = queryResponse?.Invoice || queryResponse?.invoice || [];
        setData(invoices);
      })
      .catch((err) => {
        console.error('Erro completo:', err);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // Detecta o tema do projeto
    setIsDark(document.documentElement.classList.contains('dark'));
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: 16,
    background: isDark ? 'var(--color-background-secondary)' : '#fff',
    color: isDark ? 'var(--color-text-primary)' : '#222',
    boxShadow: isDark ? '0 2px 8px #0002' : '0 2px 8px #0001',
  };
  const thtd: React.CSSProperties = {
    border: '1px solid var(--color-border-divider)',
    padding: 8,
    background: isDark ? 'var(--color-background-primary)' : '#f8f8f8',
    color: isDark ? 'var(--color-text-primary)' : '#222',
  };

  if (loading) return <div>Carregando...</div>;
  if (error) return <div style={{ color: 'red' }}>Erro: {error}</div>;

  return (
    <div style={{ padding: 24 }}>
      <h2>Faturas do QuickBooks</h2>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thtd}>ID</th>
            <th style={thtd}>Número</th>
            <th style={thtd}>Data</th>
            <th style={thtd}>Cliente</th>
            <th style={thtd}>Total</th>
            <th style={thtd}>Saldo</th>
            <th style={thtd}>Nota</th>
          </tr>
        </thead>
        <tbody>
          {data.map((inv) => (
            <tr key={inv.Id}>
              <td style={thtd}>{inv.Id}</td>
              <td style={thtd}>{inv.DocNumber}</td>
              <td style={thtd}>{inv.TxnDate}</td>
              <td style={thtd}>{inv.CustomerRef?.name || '-'}</td>
              <td style={thtd}>{inv.TotalAmt.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
              <td style={thtd}>{inv.Balance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
              <td style={thtd}>{inv.PrivateNote || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.length === 0 && <div style={{ marginTop: 24, color: isDark ? '#aaa' : '#888' }}>Nenhuma fatura encontrada.</div>}
    </div>
  );
};

export default ApiTest; 