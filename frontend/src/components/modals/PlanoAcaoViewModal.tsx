import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import CloseButton from '../../utils/CloseButton';

// Interface para Plano de Ação do timesheet
interface Acao {
  id: string;
  plano_id: string;
  titulo: string;
  responsavel: string;
  status: string;
  data_limite: string;
}

interface PlanoAcao {
  id: string;
  usuario_id: string;
  titulo: string;
  descricao: string;
  criado_em: string;
  data_inicio: string;
  data_fim: string;
  acoes: Acao[];
}

interface PlanoAcaoViewModalProps {
  show: boolean;
  onClose: () => void;
  data: PlanoAcao | null;
  responsavelNome?: string;
}

const PlanoAcaoViewModal: React.FC<PlanoAcaoViewModalProps> = ({ show, onClose, data, responsavelNome }) => {
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

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const [ano, mes, dia] = dateString.split('-');
    return `${dia}/${mes}/${ano}`;
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

  if (!visible || !data) return null;

  return createPortal(
    <>
      <div className={`modal fade show custom-modal-anim${isClosing ? ' closing' : ''}`} tabIndex={-1} style={{ display: 'block', zIndex: 9999 }}>
        <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 800 }}>
          <div className="modal-content" style={{ background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', border: '1.5px solid var(--color-border-divider)', zIndex: 10000, position: 'relative' }}>
            <div className="modal-header px-4 py-3 d-flex flex-row justify-content-between align-items-center" style={{ borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
              <h5 className="modal-title d-flex flex-row gap-2" style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, flex: '0 0 auto', marginBottom: 0 }}>
                <p style={{ color: 'var(--color-text-secondary)', marginBottom: 0 }}>Visualizar</p>
                <p style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, flex: '0 0 auto', marginBottom: 0 }}>Plano de Ação</p>
              </h5>
              <CloseButton onClick={onClose} />
            </div>
            {/* Sub-header */}
            <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-secondary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                  <i className="bi bi-calendar-range" style={{ color: 'var(--color-accent-primary)', fontSize: 15 }} />
                  <span>Início: {formatDate(data.data_inicio)}</span>
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
                {/* Título do Plano */}
                <div style={{ marginBottom: 24 }}>
                  <h6 style={{ color: 'var(--color-text-primary)', fontWeight: 600, fontSize: 20, marginBottom: 8 }}>{data.titulo || 'Sem título'}</h6>
                </div>
                {/* Descrição */}
                <div style={{ marginBottom: 24 }}>
                  <h6 style={{ color: 'var(--color-text-primary)', fontWeight: 600, fontSize: 16, marginBottom: 12 }}>Descrição</h6>
                  <div style={{ background: 'var(--color-background-secondary)', borderRadius: 8, padding: 16, color: 'var(--color-text-secondary)', fontSize: 15, lineHeight: 1.5 }}>
                    {parseAsterisksFormatting(data.descricao || 'Sem descrição')}
                  </div>
                </div>
                {/* Período */}
                <div style={{ marginBottom: 24 }}>
                  <h6 style={{ color: 'var(--color-text-primary)', fontWeight: 600, fontSize: 16, marginBottom: 12 }}>Período</h6>
                  <div style={{ background: 'rgba(46, 107, 230, 0.08)', borderRadius: 8, padding: 20, fontSize: 15 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
                      <div style={{ display: 'flex', gap: 40 }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ color: 'var(--color-text-secondary)', fontSize: 13, marginBottom: 4 }}>Data de Início</div>
                          <div style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{formatDate(data.data_inicio)}</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ color: 'var(--color-text-secondary)', fontSize: 13, marginBottom: 4 }}>Data de Fim</div>
                          <div style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{formatDate(data.data_fim)}</div>
                        </div>
                      </div>
                      {responsavelNome && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                          <i className="bi bi-person" style={{ color: 'var(--color-accent-primary)', fontSize: 15 }} />
                          <span style={{ fontWeight: 500 }}>Responsável: {responsavelNome}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {/* Ações */}
                <div>
                  <h6 style={{ color: 'var(--color-text-primary)', fontWeight: 600, fontSize: 16, marginBottom: 16 }}>Ações</h6>
                  {data.acoes && data.acoes.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {data.acoes.map((acao, index) => {
                        let statusIcon = 'bi-arrow-repeat';
                        let statusColor = '#e67e22';
                        if (acao.status === 'Done' || acao.status === 'concluída') {
                          statusIcon = 'bi-check-circle';
                          statusColor = '#1bbf5c';
                        } else if (acao.status === 'Overdue') {
                          statusIcon = 'bi-exclamation-octagon';
                          statusColor = '#dc3545';
                        }
                        return (
                          <div key={index} style={{ background: 'var(--color-background-secondary)', borderRadius: 8, padding: '10px 16px', border: '1px solid var(--color-border-divider)' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                              <i className={`bi ${statusIcon}`} style={{ color: statusColor, fontSize: 18, marginTop: 2, flexShrink: 0 }} />
                              <div style={{ flex: 1 }}>
                                <div style={{ color: 'var(--color-text-primary)', fontSize: 16, fontWeight: 500, marginBottom: 8, textAlign: 'start' }}>{acao.titulo}</div>
                                <div style={{ display: 'flex', justifyContent: 'space-evenly', gap: 24, fontSize: 14, color: 'var(--color-text-secondary)' }}>
                                  <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 12, marginBottom: 2 }}>Responsável</div>
                                    <div style={{ fontWeight: 500 }}>{acao.responsavel}</div>
                                  </div>
                                  <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 12, marginBottom: 2 }}>Status</div>
                                    <div style={{ color: statusColor, fontWeight: 500 }}>{acao.status}</div>
                                  </div>
                                  <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 12, marginBottom: 2 }}>Prazo Limite</div>
                                    <div style={{ fontWeight: 500 }}>{formatDate(acao.data_limite)}</div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ background: 'var(--color-background-secondary)', borderRadius: 8, padding: 20, color: 'var(--color-text-secondary)', fontSize: 14, fontStyle: 'italic', textAlign: 'center' }}>Nenhuma ação registrada.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-backdrop fade show" style={{ zIndex: 9999 }}></div>
      </div>
    </>,
    document.body
  );
};

export default PlanoAcaoViewModal; 