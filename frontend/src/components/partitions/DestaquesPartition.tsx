import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import dayjs from 'dayjs';
import PartitionCard from './PartitionCard';
import EmptyMessage from './EmptyMessage';
import PartitionLoading from './PartitionLoading';

// Tipos para os dados
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

// Função para formatar *...*, **...**, ***...***
function parseAsterisksFormatting(text: string): React.ReactNode {
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
}

// Função utilitário para agrupar por mês/ano
function groupByMonthYear<T extends { mes: string | number; ano: string | number }>(arr: T[]): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    // Usa sempre o mês como número (sem zero à esquerda)
    const mesNum = Number(item.mes);
    const anoNum = Number(item.ano);
    const key = `${anoNum}-${mesNum}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

interface DestaquesPartitionProps {
  usuarioResponsavelId: string;
  usuariosParaBuscar?: string[];
  telaId: string;
  selectedYear?: string;
  selectedMonth?: string;
  isAdmin: boolean;
  onEdit?: (mes?: string, ano?: string) => void;
  onView?: (destaque: Destaque) => void;
  refreshTrigger?: number;
}

export default function DestaquesPartition({ 
  usuarioResponsavelId, 
  usuariosParaBuscar = [],
  telaId, 
  selectedYear, 
  selectedMonth, 
  isAdmin, 
  onEdit, 
  onView, 
  refreshTrigger
}: DestaquesPartitionProps) {
  const [allDestaques, setAllDestaques] = useState<Destaque[]>([]);
  const [loading, setLoading] = useState(false);
  const [openDestaques, setOpenDestaques] = useState<string>('');

  // Buscar destaques do usuário responsável pela tela
  useEffect(() => {
    const fetchDestaques = async () => {
      if (!usuarioResponsavelId || !telaId) {
        return;
      }
      
      setLoading(true);
      try {
        // Buscar destaques de todos os usuários relevantes
        let destaquesQuery = supabase
          .from('destaques')
          .select('*');
        
        // Se temos usuários específicos para buscar, filtrar por eles
        if (usuariosParaBuscar.length > 0) {
          destaquesQuery = destaquesQuery.in('usuario_id', usuariosParaBuscar);
        } else {
          // Fallback para o comportamento original
          destaquesQuery = destaquesQuery.eq('usuario_id', usuarioResponsavelId);
        }
        
        const { data: destaques } = await destaquesQuery;
        
        if (destaques) {
          // Buscar positivos e negativos
          const { data: positivos } = await supabase.from('destaques_positivos').select('*');
          const { data: negativos } = await supabase.from('destaques_negativos').select('*');
          
          const destaquesCompletos = destaques.map(d => ({
            ...d,
            mes: d.mes.toString(),
            ano: d.ano.toString(),
            positivos: (positivos || []).filter((p: { destaque_id: string; texto: string }) => p.destaque_id === d.id).map((p: { texto: string }) => p.texto),
            negativos: (negativos || []).filter((n: { destaque_id: string; texto: string }) => n.destaque_id === d.id).map((n: { texto: string }) => n.texto),
          }));
          
          setAllDestaques(destaquesCompletos);
        }
      } catch {
        // erro ignorado intencionalmente
      } finally {
        setLoading(false);
      }
    };

    fetchDestaques();
  }, [usuarioResponsavelId, usuariosParaBuscar, telaId, refreshTrigger]);

  // Agrupar dados por mês/ano, ignorando destaques inválidos
  const destaquesValidos = allDestaques.filter(d => d.mes && d.ano && Number(d.mes) > 0 && Number(d.ano) > 0);
  const destaquesByMonth = groupByMonthYear(destaquesValidos);

  // Função para formatar título do card
  function formatMonthYear(key: string) {
    const [ano, mes] = key.split('-');
    const nomeMes = mes ? dayjs(`${ano}-${mes}-01`).format('MMMM') : '';
    return `${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)} / ${ano}`;
  }

  // Função utilitária para detectar se o texto é negrito
  function isBold(parsed: React.ReactNode) {
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
  }

  if (loading) {
    return <PartitionLoading />;
  }

  return (
    <div style={{ flex: '1 1 0%', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 0, borderBottom: '1px solid var(--color-border-divider)', padding: 10, backgroundColor: 'var(--color-background-primary)' }}>
      <div className='fw-light' style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: 10, background: 'transparent', zIndex: 2 }}>
        <div className='d-flex align-items-center justify-content-center'>
          <i className='bi bi-star me-2'></i> Destaques
        </div>
      </div>
      <div className="custom-scrollbar d-flex flex-column gap-1" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {selectedYear && selectedMonth ? (
          (() => {
            const key = `${Number(selectedYear)}-${Number(selectedMonth)}`;
            const destaques = destaquesByMonth[key];
            if (!destaques || destaques.length === 0) {
              return (
                <PartitionCard>
                  <EmptyMessage message="No highlights found for this period." showEdit={isAdmin} onEdit={onEdit} icon="bi-star" />
                </PartitionCard>
              );
            }
            return (
              <div key={key} style={{ borderRadius: 10, background: 'var(--color-background-secondary)', marginBottom: 0, border: '1px solid var(--color-border-divider)' }}>
                <button
                  className={`btn-sidebar d-flex align-items-center justify-content-between w-100${openDestaques === key ? ' btn-sidebar-ativo' : ''}`}
                  style={{ gap: 10, padding: '8px 12px', borderRadius: 8, fontSize: 14, borderTopLeftRadius: 10, borderTopRightRadius: 10, marginBottom: 0, minHeight: 38, width: '100%', border: 'none', outline: 'none', boxShadow: 'none' }}
                  onClick={() => setOpenDestaques(openDestaques === key ? '' : key)}
                >
                  <span style={{ fontWeight: 500, color: 'inherit', fontSize: 14 }}>{formatMonthYear(key)}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className={`bi ${openDestaques === key ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ fontSize: 16, color: 'inherit' }} />
                    <button
                      type="button"
                      className="btn btn-link p-0 ms-1"
                      style={{ color: 'var(--color-text-secondary)', fontSize: 14, lineHeight: 1, boxShadow: 'none', border: 'none', background: 'none' }}
                      onClick={e => {
                        e.stopPropagation();
                        if (onView && destaques[0]) onView(destaques[0]);
                      }}
                      aria-label="Expandir em modal"
                      title="Expandir em modal"
                    >
                      <i className="bi bi-box-arrow-up-left" />
                    </button>
                    {isAdmin && (
                      <button
                        type="button"
                        className="btn btn-link p-0 ms-2"
                        style={{ color: 'var(--color-accent-primary)', fontSize: 16, lineHeight: 1, boxShadow: 'none', border: 'none', background: 'none' }}
                        onClick={e => {
                          e.stopPropagation();
                          if (onEdit) onEdit(destaques[0].mes, destaques[0].ano);
                        }}
                        aria-label="Editar"
                      >
                        <i className="bi bi-pencil" />
                      </button>
                    )}
                  </div>
                </button>
                {openDestaques === key && (
                  <div style={{ padding: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'row', gap: 12 }}>
                      <div style={{ flex: 1, background: 'rgba(0,200,100,0.04)', borderRadius: 8, padding: 10, minHeight: 60 }}>
                        <div style={{ color: '#1bbf5c', fontWeight: 600, fontSize: 14, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}><i className="bi bi-hand-thumbs-up" /> Positivos</div>
                        {destaques[0].positivos.length > 0 ? destaques[0].positivos.map((t, i) => {
                          const parsed = parseAsterisksFormatting(t);
                          const bold = isBold(parsed);
                          return (
                            <div key={i} style={{ color: '#1bbf5c', fontSize: 14, marginBottom: 2, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                              {bold ? (
                                <i className="bi bi-star-fill" style={{ fontSize: 8, color: '#1bbf5c', marginRight: 4, display: 'inline-block', lineHeight: 1, paddingTop: 7 }} />
                              ) : (
                                <span style={{ fontSize: 18, lineHeight: 1, marginRight: 4, display: 'inline-block' }}>•</span>
                              )}
                              <span style={{ textAlign: 'left', flex: 1 }}>{parsed}</span>
                            </div>
                          );
                        }) : <span style={{ color: '#1bbf5c', fontSize: 13 }}>Nenhum</span>}
                      </div>
                      <div style={{ flex: 1, background: 'rgba(220,53,69,0.04)', borderRadius: 8, padding: 10, minHeight: 60 }}>
                        <div style={{ color: '#dc3545', fontWeight: 600, fontSize: 14, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}><i className="bi bi-hand-thumbs-down" /> Negativos</div>
                        {destaques[0].negativos.length > 0 ? destaques[0].negativos.map((t, i) => {
                          const parsed = parseAsterisksFormatting(t);
                          const bold = isBold(parsed);
                          return (
                            <div key={i} style={{ color: '#dc3545', fontSize: 14, marginBottom: 2, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                              {bold ? (
                                <i className="bi bi-star-fill" style={{ fontSize: 8, color: '#dc3545', marginRight: 4, display: 'inline-block', lineHeight: 1, paddingTop: 7 }} />
                              ) : (
                                <span style={{ fontSize: 18, lineHeight: 1, marginRight: 4, display: 'inline-block' }}>•</span>
                              )}
                              <span style={{ textAlign: 'left', flex: 1 }}>{parsed}</span>
                            </div>
                          );
                        }) : <span style={{ color: '#dc3545', fontSize: 13 }}>Nenhum</span>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()
        ) : Object.keys(destaquesByMonth).length === 0 ? (
          <PartitionCard>
            <EmptyMessage message="No highlights found." showEdit={isAdmin} onEdit={onEdit} icon="bi-star" />
          </PartitionCard>
        ) : (
          Object.entries(destaquesByMonth).sort((a, b) => b[0].localeCompare(a[0])).map(([key, destaques]) => (
            <div key={key} style={{ borderRadius: 10, background: 'var(--color-background-secondary)', marginBottom: 0, border: '1px solid var(--color-border-divider)' }}>
              <button
                className={`btn-sidebar d-flex align-items-center justify-content-between w-100${openDestaques === key ? ' btn-sidebar-ativo' : ''}`}
                style={{ gap: 10, padding: '8px 12px', borderRadius: 8, fontSize: 14, borderTopLeftRadius: 10, borderTopRightRadius: 10, marginBottom: 0, minHeight: 38, width: '100%', border: 'none', outline: 'none', boxShadow: 'none' }}
                onClick={() => setOpenDestaques(openDestaques === key ? '' : key)}
              >
                <span style={{ fontWeight: 500, color: 'inherit', fontSize: 14 }}>{formatMonthYear(key)}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className={`bi ${openDestaques === key ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ fontSize: 16, color: 'inherit' }} />
                  <button
                    type="button"
                    className="btn btn-tertiary-custom p-0 ms-1"
                    style={{ fontSize: 14, lineHeight: 1, boxShadow: 'none' }}
                    onClick={e => {
                      e.stopPropagation();
                      if (onView && destaques[0]) onView(destaques[0]);
                    }}
                    aria-label="Expandir em modal"
                    title="Expandir em modal"
                  >
                    <i className="bi bi-box-arrow-up-left" />
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      className="btn btn-link p-0 ms-2"
                      style={{ color: 'var(--color-accent-primary)', fontSize: 16, lineHeight: 1, boxShadow: 'none', border: 'none', background: 'none' }}
                      onClick={e => {
                        e.stopPropagation();
                        if (onEdit) onEdit(destaques[0].mes, destaques[0].ano);
                      }}
                      aria-label="Editar"
                    >
                      <i className="bi bi-pencil" />
                    </button>
                  )}
                </div>
              </button>
              {openDestaques === key && (
                <div style={{ padding: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'row', gap: 12 }}>
                    <div style={{ flex: 1, background: 'rgba(0,200,100,0.04)', borderRadius: 8, padding: 10, minHeight: 60 }}>
                      <div style={{ color: '#1bbf5c', fontWeight: 600, fontSize: 14, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}><i className="bi bi-hand-thumbs-up" /> Positivos</div>
                      {destaques[0].positivos.length > 0 ? destaques[0].positivos.map((t, i) => {
                        const parsed = parseAsterisksFormatting(t);
                        const bold = isBold(parsed);
                        return (
                          <div key={i} style={{ color: '#1bbf5c', fontSize: 14, marginBottom: 2, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                            {bold ? (
                              <i className="bi bi-star-fill" style={{ fontSize: 8, color: '#1bbf5c', marginRight: 4, display: 'inline-block', lineHeight: 1, paddingTop: 7 }} />
                            ) : (
                              <span style={{ fontSize: 18, lineHeight: 1, marginRight: 4, display: 'inline-block' }}>•</span>
                            )}
                            <span style={{ textAlign: 'left', flex: 1 }}>{parsed}</span>
                          </div>
                        );
                      }) : <span style={{ color: '#1bbf5c', fontSize: 13 }}>Nenhum</span>}
                    </div>
                    <div style={{ flex: 1, background: 'rgba(220,53,69,0.04)', borderRadius: 8, padding: 10, minHeight: 60 }}>
                      <div style={{ color: '#dc3545', fontWeight: 600, fontSize: 14, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}><i className="bi bi-hand-thumbs-down" /> Negativos</div>
                      {destaques[0].negativos.length > 0 ? destaques[0].negativos.map((t, i) => {
                        const parsed = parseAsterisksFormatting(t);
                        const bold = isBold(parsed);
                        return (
                          <div key={i} style={{ color: '#dc3545', fontSize: 14, marginBottom: 2, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                            {bold ? (
                              <i className="bi bi-star-fill" style={{ fontSize: 8, color: '#dc3545', marginRight: 4, display: 'inline-block', lineHeight: 1, paddingTop: 7 }} />
                            ) : (
                              <span style={{ fontSize: 18, lineHeight: 1, marginRight: 4, display: 'inline-block' }}>•</span>
                            )}
                            <span style={{ textAlign: 'left', flex: 1 }}>{parsed}</span>
                          </div>
                        );
                      }) : <span style={{ color: '#dc3545', fontSize: 13 }}>Nenhum</span>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
} 