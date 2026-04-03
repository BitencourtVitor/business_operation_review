import React from 'react';
import { createPortal } from 'react-dom';
import CloseButton from '../../utils/CloseButton';

// Interface para Destaque do timesheet
interface Destaque {
  id?: string | number;
  mes: string;
  ano: string | number;
  positivos: string[];
  negativos: string[];
}

interface DestaqueViewModalProps {
  visible: boolean;
  onClose: () => void;
  data: Destaque;
}

const DestaqueViewModal: React.FC<DestaqueViewModalProps> = ({ visible, onClose, data }) => {
  const handleClose = () => {
    onClose();
  };

  // Função para formatar texto com asteriscos
  const parseAsterisksFormatting = (text: string): React.ReactNode => {
    if (!text) return text;
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
      if (Array.isArray(parsed)) {
        return parsed.some(isBold);
      }
      // @ts-expect-error: accessing .type to detect <b> element in ReactNode
      if (parsed.type === 'b') return true;
    }
    return false;
  };

  if (!visible) return null;

  const portalContainer = typeof document !== 'undefined' ? document.body : null;
  if (!portalContainer) return null;

  return createPortal(
    <div 
      style={{ 
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(0, 0, 0, 0.5)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onClick={handleClose}
    >
      <div 
        style={{ 
          background: 'var(--color-background-primary)',
          borderRadius: 10,
          maxWidth: 800,
          width: '90%',
          maxHeight: '90vh',
          overflow: 'hidden',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ border: '1px solid var(--color-border-divider)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ color: 'var(--color-text-secondary)', margin: 0, fontSize: 24, fontWeight: 400 }}>Visualizar</span>
              <span style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, margin: 0 }}>Destaque</span>
            </div>
            <CloseButton onClick={handleClose} size="md" />
          </div>
          
          {/* Sub-header */}
          <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-secondary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                <i className="bi bi-calendar-range" style={{ color: 'var(--color-accent-primary)', fontSize: 15 }} />
                <span>Período: {data.mes + ' / ' + data.ano}</span>
              </div>
            </div>
          </div>
          
          <div style={{ padding: '0 24px 24px', background: 'var(--color-background-primary)' }}>
            <div style={{ padding: '20px 0' }}>
              {/* Positivos */}
              <div style={{ marginBottom: 20 }}>
                <h6 style={{ color: 'var(--positive-color)', fontWeight: 600, fontSize: 16, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className="bi bi-hand-thumbs-up" /> Positivos
                </h6>
                <div style={{ background: 'var(--positive-background)', borderRadius: 8, padding: 16, minHeight: 60 }}>
                  {data.positivos && data.positivos.length > 0 ? (
                    data.positivos.map((item, index) => {
                      const parsed = parseAsterisksFormatting(item);
                      const bold = isBold(parsed);
                      return (
                        <div key={index} style={{ color: 'var(--positive-color)', fontSize: 15, marginBottom: 8, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          {bold ? (
                            <i className="bi bi-star-fill" style={{ fontSize: 8, color: 'var(--positive-color)', marginRight: 4, display: 'inline-block', lineHeight: 1, paddingTop: 7 }} />
                          ) : (
                            <span style={{ fontSize: 18, lineHeight: 1, marginTop: 2 }}>•</span>
                          )}
                          <span style={{ flex: 1, lineHeight: 1.4, textAlign: 'start' }}>{parsed}</span>
                        </div>
                      );
                    })
                  ) : (
                    <span style={{ color: 'var(--positive-color)', fontSize: 14, fontStyle: 'italic', textAlign: 'start' }}>Nenhum destaque positivo registrado.</span>
                  )}
                </div>
              </div>
              
              {/* Negativos */}
              <div>
                <h6 style={{ color: 'var(--negative-color)', fontWeight: 600, fontSize: 16, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className="bi bi-hand-thumbs-down" /> Negativos
                </h6>
                <div style={{ background: 'var(--negative-background)', borderRadius: 8, padding: 16, minHeight: 60 }}>
                  {data.negativos && data.negativos.length > 0 ? (
                    data.negativos.map((item, index) => {
                      const parsed = parseAsterisksFormatting(item);
                      const bold = isBold(parsed);
                      return (
                        <div key={index} style={{ color: 'var(--negative-color)', fontSize: 15, marginBottom: 8, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          {bold ? (
                            <i className="bi bi-star-fill" style={{ fontSize: 8, color: 'var(--negative-color)', marginRight: 4, display: 'inline-block', lineHeight: 1, paddingTop: 7 }} />
                          ) : (
                            <span style={{ fontSize: 18, lineHeight: 1, marginTop: 2 }}>•</span>
                          )}
                          <span style={{ flex: 1, lineHeight: 1.4, textAlign: 'start' }}>{parsed}</span>
                        </div>
                      );
                    })
                  ) : (
                    <span style={{ color: 'var(--negative-color)', fontSize: 14, fontStyle: 'italic', textAlign: 'start' }}>Nenhum destaque negativo registrado.</span>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          <div style={{ borderTop: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, padding: '16px 24px' }}>
            <button 
              type="button" 
              className="btn btn-secondary"
              onClick={handleClose} 
              style={{ 
                borderRadius: 6, 
                fontWeight: 500, 
                minWidth: 90
              }}
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>,
    portalContainer
  );
};

export default DestaqueViewModal; 