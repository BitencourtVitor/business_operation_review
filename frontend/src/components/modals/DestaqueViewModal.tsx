import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

// Interface para Destaque do timesheet (diferente do accounting)
interface Destaque {
  id: string;
  usuario_id: string;
  tela_id: string;
  mes: string;
  ano: string;
  criado_em: string;
  positivos: string[];
  negativos: string[];
}

interface DestaqueViewModalProps {
  show: boolean;
  onClose: () => void;
  data: Destaque | null;
  responsavelNome?: string;
}

const DestaqueViewModal: React.FC<DestaqueViewModalProps> = ({ show, onClose, data, responsavelNome }) => {
  const [visible, setVisible] = useState(show);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (show) {
      setVisible(true);
      setIsClosing(false);
    } else if (visible) {
      setIsClosing(true);
      setTimeout(() => {
        setVisible(false);
        setIsClosing(false);
      }, 250);
    }
  }, [show, visible]);

  const formatMonthYear = (mes: string, ano: string) => {
    const mesNum = Number(mes);
    const anoNum = Number(ano);
    return `${mesNum.toString().padStart(2, '0')}/${anoNum}`;
  };

  // Função para formatar texto com asteriscos (igual à partição)
  const parseAsterisksFormatting = (text: string): React.ReactNode => {
    if (!text) return text;
    // Regex para ***...***, **...**, *...*
    // Ordem importa: 3, depois 2, depois 1
    const regex = /(\*\*\*[^*]+\*\*\*)|(\*\*[^*]+\*\*)|(\*[^*]+\*)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    let idx = 0;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      const matched = match[0];
      if (matched.startsWith('***') && matched.endsWith('***')) {
        parts.push(<b key={idx}><i>{matched.slice(3, -3)}</i></b>);
      } else if (matched.startsWith('**') && matched.endsWith('**')) {
        parts.push(<b key={idx}>{matched.slice(2, -2)}</b>);
      } else if (matched.startsWith('*') && matched.endsWith('*')) {
        parts.push(<i key={idx}>{matched.slice(1, -1)}</i>);
      } else {
        parts.push(matched);
      }
      lastIndex = match.index + matched.length;
      idx++;
    }
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }
    return parts.length === 1 ? parts[0] : parts;
  };

  // Função utilitária para detectar se o texto é negrito
  const isBold = (parsed: React.ReactNode) => {
    if (typeof parsed === 'object' && parsed !== null) {
      // Se for array, verifica o primeiro elemento
      if (Array.isArray(parsed)) {
        return parsed.some(isBold);
      }
      // Se for React element <b>
      // @ts-expect-error: accessing .type to detect <b> element in ReactNode
      if (parsed.type === 'b') return true;
    }
    return false;
  };

  if (!visible || !data) return null;

  return createPortal(
    <>
      <div className={`modal fade show custom-modal-anim${isClosing ? ' closing' : ''}`} tabIndex={-1} style={{ display: 'block', zIndex: 2400 }}>
        <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 800 }}>
          <div className="modal-content" style={{ background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', border: '1.5px solid var(--color-border-divider)', zIndex: 2400, position: 'relative' }}>
            <div className="modal-header px-4 py-3 d-flex flex-row gap-2 align-items-center" style={{ borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
              <h5 className="modal-title d-flex flex-row gap-2" style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, flex: '0 0 auto', marginBottom: 0 }}>
                <p style={{ color: 'var(--color-text-secondary)', marginBottom: 0 }}>Visualizar</p>
                <p style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, flex: '0 0 auto', marginBottom: 0 }}>Destaque</p>
              </h5>
              <button type="button" className="btn-close" aria-label="Close" onClick={onClose} style={{ filter: 'invert(1)' }} />
            </div>
            {/* Sub-header */}
            <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-secondary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                  <i className="bi bi-calendar-range" style={{ color: 'var(--color-accent-primary)', fontSize: 15 }} />
                  <span>Período: {formatMonthYear(data.mes, data.ano)}</span>
                </div>
                {responsavelNome && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                    <i className="bi bi-person" style={{ color: 'var(--color-accent-primary)', fontSize: 15 }} />
                    <span style={{ fontWeight: 500 }}>Responsável: {responsavelNome}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-body" style={{ padding: '0 24px 24px', background: 'var(--color-background-primary)' }}>
              <div style={{ padding: '20px 0' }}>
                {/* Positivos */}
                <div style={{ marginBottom: 20 }}>
                  <h6 style={{ color: '#1bbf5c', fontWeight: 600, fontSize: 16, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className="bi bi-hand-thumbs-up" /> Positivos
                  </h6>
                  <div style={{ background: 'rgba(0,200,100,0.04)', borderRadius: 8, padding: 16, minHeight: 60 }}>
                    {data.positivos && data.positivos.length > 0 ? (
                      data.positivos.map((item, index) => {
                        const parsed = parseAsterisksFormatting(item);
                        const bold = isBold(parsed);
                        return (
                          <div key={index} style={{ color: '#1bbf5c', fontSize: 15, marginBottom: 8, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            {bold ? (
                              <i className="bi bi-star-fill" style={{ fontSize: 8, color: '#1bbf5c', marginRight: 4, display: 'inline-block', lineHeight: 1, paddingTop: 7 }} />
                            ) : (
                              <span style={{ fontSize: 18, lineHeight: 1, marginTop: 2 }}>•</span>
                            )}
                            <span style={{ flex: 1, lineHeight: 1.4, textAlign: 'start' }}>{parsed}</span>
                          </div>
                        );
                      })
                    ) : (
                      <span style={{ color: '#1bbf5c', fontSize: 14, fontStyle: 'italic', textAlign: 'start' }}>Nenhum destaque positivo registrado.</span>
                    )}
                  </div>
                </div>
                {/* Negativos */}
                <div>
                  <h6 style={{ color: '#dc3545', fontWeight: 600, fontSize: 16, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className="bi bi-hand-thumbs-down" /> Negativos
                  </h6>
                  <div style={{ background: 'rgba(220,53,69,0.04)', borderRadius: 8, padding: 16, minHeight: 60 }}>
                    {data.negativos && data.negativos.length > 0 ? (
                      data.negativos.map((item, index) => {
                        const parsed = parseAsterisksFormatting(item);
                        const bold = isBold(parsed);
                        return (
                          <div key={index} style={{ color: '#dc3545', fontSize: 15, marginBottom: 8, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            {bold ? (
                              <i className="bi bi-star-fill" style={{ fontSize: 8, color: '#dc3545', marginRight: 4, display: 'inline-block', lineHeight: 1, paddingTop: 7 }} />
                            ) : (
                              <span style={{ fontSize: 18, lineHeight: 1, marginTop: 2 }}>•</span>
                            )}
                            <span style={{ flex: 1, lineHeight: 1.4, textAlign: 'start' }}>{parsed}</span>
                          </div>
                        );
                      })
                    ) : (
                      <span style={{ color: '#dc3545', fontSize: 14, fontStyle: 'italic', textAlign: 'start' }}>Nenhum destaque negativo registrado.</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer" style={{ borderTop: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
              <button type="button" className="btn btn-secondary" onClick={onClose} style={{ borderRadius: 6, fontWeight: 500, minWidth: 90 }}>Fechar</button>
            </div>
          </div>
        </div>
        <div className="modal-backdrop fade show" style={{ zIndex: 2300 }}></div>
      </div>
    </>,
    document.body
  );
};

export default DestaqueViewModal; 