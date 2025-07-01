import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import dayjs from 'dayjs';
import PartitionCard from './PartitionCard';
import EmptyMessage from './EmptyMessage';
import PartitionLoading from './PartitionLoading';

// Tipos para os dados
interface Oportunidade {
  id: string;
  usuario_id: string;
  tela_id: string;
  mes: string;
  ano: string;
  titulo: string;
  criado_em: string;
  desafios: string[];
  melhorias: string[];
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

interface OportunidadesPartitionProps {
  usuarioResponsavelId: string;
  usuariosParaBuscar?: string[];
  telaId: string;
  selectedYear?: string;
  selectedMonth?: string;
  isAdmin: boolean;
  onEdit?: (mes?: string, ano?: string) => void;
  onView?: (oportunidade: Oportunidade, mes: string, ano: string) => void;
  refreshTrigger?: number;
}

export default function OportunidadesPartition({ 
  usuarioResponsavelId, 
  usuariosParaBuscar = [],
  telaId, 
  selectedYear, 
  selectedMonth, 
  isAdmin, 
  onEdit, 
  onView, 
  refreshTrigger
}: OportunidadesPartitionProps) {
  const [allOportunidades, setAllOportunidades] = useState<Oportunidade[]>([]);
  const [loading, setLoading] = useState(false);
  const [openOportunidades, setOpenOportunidades] = useState<string>('');

  // Buscar oportunidades do usuário responsável pela tela
  useEffect(() => {
    const fetchOportunidades = async () => {
      if (!usuarioResponsavelId || !telaId) {
        return;
      }
      
      setLoading(true);
      try {
        // Buscar oportunidades de todos os usuários relevantes
        let oportunidadesQuery = supabase
          .from('oportunidades')
          .select('*')
          .eq('tela_id', telaId);
        
        // Se temos usuários específicos para buscar, filtrar por eles
        if (usuariosParaBuscar.length > 0) {
          oportunidadesQuery = oportunidadesQuery.in('usuario_id', usuariosParaBuscar);
        } else {
          // Fallback para o comportamento original
          oportunidadesQuery = oportunidadesQuery.eq('usuario_id', usuarioResponsavelId);
        }
        
        const { data: oportunidades } = await oportunidadesQuery;
        
        if (oportunidades) {
          // Buscar desafios e melhorias
          const { data: desafios } = await supabase.from('desafios').select('*');
          const { data: melhorias } = await supabase.from('melhorias').select('*');
          
          const oportunidadesCompletas = oportunidades.map(op => ({
            ...op,
            mes: op.mes.toString(),
            ano: op.ano.toString(),
            desafios: (desafios || []).filter((d: { oportunidade_id: string; texto: string }) => d.oportunidade_id === op.id).map((d: { texto: string }) => d.texto),
            melhorias: (melhorias || []).filter((m: { oportunidade_id: string; texto: string }) => m.oportunidade_id === op.id).map((m: { texto: string }) => m.texto),
          }));
          
          setAllOportunidades(oportunidadesCompletas);
        }
      } catch {
        // erro ignorado intencionalmente
      } finally {
        setLoading(false);
      }
    };

    fetchOportunidades();
  }, [usuarioResponsavelId, usuariosParaBuscar, telaId, refreshTrigger]);

  // Agrupar dados por mês/ano
  const oportunidadesByMonth = groupByMonthYear(allOportunidades);

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
      <div className='fw-light d-flex justify-content-evenly' style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: 10, background: 'transparent', zIndex: 2 }}>
        <div className='d-flex align-items-center justify-content-center'>
          <i className='bi bi-lightbulb me-2'></i> Oportunidades
        </div>
      </div>
      <div className="custom-scrollbar d-flex flex-column gap-1" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {selectedYear && selectedMonth ? (
          (() => {
            const key = `${Number(selectedYear)}-${Number(selectedMonth)}`;
            const oportunidades = oportunidadesByMonth[key];
            if (!oportunidades || oportunidades.length === 0) {
              return (
                <PartitionCard>
                  <EmptyMessage message="No opportunities found for this period." showEdit={isAdmin} onEdit={onEdit} icon="bi-lightbulb" />
                </PartitionCard>
              );
            }
            return (
              <div key={key} style={{ borderRadius: 10, background: 'var(--color-background-secondary)', marginBottom: 0, border: '1px solid var(--color-border-divider)' }}>
                <button
                  className={`btn-sidebar d-flex align-items-center justify-content-between w-100${openOportunidades === key ? ' btn-sidebar-ativo' : ''}`}
                  style={{ gap: 10, padding: '8px 12px', borderRadius: 8, fontSize: 14, borderTopLeftRadius: 10, borderTopRightRadius: 10, marginBottom: 0, minHeight: 38, width: '100%', border: 'none', outline: 'none', boxShadow: 'none' }}
                  onClick={() => setOpenOportunidades(openOportunidades === key ? '' : key)}
                >
                  <span style={{ fontWeight: 600, color: 'inherit', fontSize: 15 }}>{formatMonthYear(key)}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className={`bi ${openOportunidades === key ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ fontSize: 16, color: 'inherit' }} />
                                      <button
                    type="button"
                    className="btn btn-tertiary-custom p-0 ms-1"
                    style={{ fontSize: 14, lineHeight: 1, boxShadow: 'none' }}
                    onClick={e => {
                      e.stopPropagation();
                      if (onView && oportunidades[0]) onView(oportunidades[0], oportunidades[0].mes, oportunidades[0].ano);
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
                          if (onEdit) onEdit(oportunidades[0].mes, oportunidades[0].ano);
                        }}
                        aria-label="Editar"
                      >
                        <i className="bi bi-pencil" />
                      </button>
                    )}
                  </div>
                </button>
                {openOportunidades === key && (
                  <div style={{ padding: 12 }}>
                    <PartitionCard>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, background: 'var(--color-background-secondary)' }}>
                        {oportunidades.map(op => (
                          <div key={op.id} style={{ background: 'var(--color-background-secondary)', borderRadius: 8, padding: 12, border: '1px solid var(--color-border-divider)' }}>
                            <div style={{ color: 'var(--color-text-primary)', fontWeight: 600, fontSize: 14, marginBottom: 8, textAlign: 'left' }}>{parseAsterisksFormatting(op.titulo)}</div>
                            <div style={{ display: 'flex', flexDirection: 'row', gap: 12 }}>
                              {/* Desafios */}
                              <div style={{ flex: 1, background: 'rgba(230, 126, 34, 0.08)', borderRadius: 8, padding: 10, minHeight: 60 }}>
                                <div style={{ color: '#e67e22', fontWeight: 600, fontSize: 14, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <i className="bi bi-exclamation-triangle" /> Desafios
                                </div>
                                {op.desafios.length > 0 ? op.desafios.map((t, i) => {
                                  const parsed = parseAsterisksFormatting(t);
                                  const bold = isBold(parsed);
                                  return (
                                    <div key={i} style={{ color: '#e67e22', fontSize: 14, marginBottom: 2, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                                      {bold ? (
                                        <i className="bi bi-star-fill" style={{ fontSize: 8, color: '#e67e22', marginRight: 4, display: 'inline-block', lineHeight: 1, paddingTop: 7 }} />
                                      ) : (
                                        <span style={{ fontSize: 18, lineHeight: 1, marginRight: 4, display: 'inline-block' }}>•</span>
                                      )}
                                      <span style={{ textAlign: 'left', flex: 1 }}>{parsed}</span>
                                    </div>
                                  );
                                }) : <span style={{ color: '#e67e22', fontSize: 13 }}>Nenhum</span>}
                              </div>
                              {/* Melhorias */}
                              <div style={{ flex: 1, background: 'rgba(46, 107, 230, 0.08)', borderRadius: 8, padding: 10, minHeight: 60 }}>
                                <div style={{ color: '#2e86de', fontWeight: 600, fontSize: 14, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <i className="bi bi-lightbulb" /> Melhorias
                                </div>
                                {op.melhorias.length > 0 ? op.melhorias.map((t, i) => {
                                  const parsed = parseAsterisksFormatting(t);
                                  const bold = isBold(parsed);
                                  return (
                                    <div key={i} style={{ color: '#2e86de', fontSize: 14, marginBottom: 2, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                                      {bold ? (
                                        <i className="bi bi-star-fill" style={{ fontSize: 8, color: '#2e86de', marginRight: 4, display: 'inline-block', lineHeight: 1, paddingTop: 7 }} />
                                      ) : (
                                        <span style={{ fontSize: 18, lineHeight: 1, marginRight: 4, display: 'inline-block' }}>•</span>
                                      )}
                                      <span style={{ textAlign: 'left', flex: 1 }}>{parsed}</span>
                                    </div>
                                  );
                                }) : <span style={{ color: '#2e86de', fontSize: 13 }}>Nenhuma</span>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </PartitionCard>
                  </div>
                )}
              </div>
            );
          })()
        ) : Object.keys(oportunidadesByMonth).length === 0 ? (
          <PartitionCard>
            <EmptyMessage message="No opportunities found." showEdit={isAdmin} onEdit={onEdit} icon="bi-lightbulb" />
          </PartitionCard>
        ) : (
          Object.entries(oportunidadesByMonth).sort((a, b) => b[0].localeCompare(a[0])).map(([key, oportunidades]) => (
            <div key={key} style={{ borderRadius: 10, background: 'var(--color-background-secondary)', marginBottom: 0, border: '1px solid var(--color-border-divider)' }}>
              <button
                className={`btn-sidebar d-flex align-items-center justify-content-between w-100${openOportunidades === key ? ' btn-sidebar-ativo' : ''}`}
                style={{ gap: 10, padding: '8px 12px', borderRadius: 8, fontSize: 14, borderTopLeftRadius: 10, borderTopRightRadius: 10, marginBottom: 0, minHeight: 38, width: '100%', border: 'none', outline: 'none', boxShadow: 'none' }}
                onClick={() => setOpenOportunidades(openOportunidades === key ? '' : key)}
              >
                <span style={{ fontWeight: 600, color: 'inherit', fontSize: 15 }}>{formatMonthYear(key)}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className={`bi ${openOportunidades === key ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ fontSize: 16, color: 'inherit' }} />
                  <button
                    type="button"
                    className="btn btn-tertiary-custom p-0 ms-1"
                    style={{ fontSize: 14, lineHeight: 1, boxShadow: 'none' }}
                    onClick={e => {
                      e.stopPropagation();
                      if (onView && oportunidades[0]) onView(oportunidades[0], oportunidades[0].mes, oportunidades[0].ano);
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
                        if (onEdit) onEdit(oportunidades[0].mes, oportunidades[0].ano);
                      }}
                      aria-label="Editar"
                    >
                      <i className="bi bi-pencil" />
                    </button>
                  )}
                </div>
              </button>
              {openOportunidades === key && (
                <div style={{ padding: 12 }}>
                  <PartitionCard>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, background: 'var(--color-background-secondary)' }}>
                      {oportunidades.map(op => (
                        <div key={op.id} style={{ background: 'var(--color-background-secondary)', borderRadius: 8, padding: 12, border: '1px solid var(--color-border-divider)' }}>
                          <div style={{ color: 'var(--color-text-primary)', fontWeight: 600, fontSize: 14, marginBottom: 8, textAlign: 'left' }}>{parseAsterisksFormatting(op.titulo)}</div>
                          <div style={{ display: 'flex', flexDirection: 'row', gap: 12 }}>
                            {/* Desafios */}
                            <div style={{ flex: 1, background: 'rgba(230, 126, 34, 0.08)', borderRadius: 8, padding: 10, minHeight: 60 }}>
                              <div style={{ color: '#e67e22', fontWeight: 600, fontSize: 14, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <i className="bi bi-exclamation-triangle" /> Desafios
                              </div>
                              {op.desafios.length > 0 ? op.desafios.map((t, i) => {
                                const parsed = parseAsterisksFormatting(t);
                                const bold = isBold(parsed);
                                return (
                                  <div key={i} style={{ color: '#e67e22', fontSize: 14, marginBottom: 2, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                                    {bold ? (
                                      <i className="bi bi-star-fill" style={{ fontSize: 8, color: '#e67e22', marginRight: 4, display: 'inline-block', lineHeight: 1, paddingTop: 7 }} />
                                    ) : (
                                      <span style={{ fontSize: 18, lineHeight: 1, marginRight: 4, display: 'inline-block' }}>•</span>
                                    )}
                                    <span style={{ textAlign: 'left', flex: 1 }}>{parsed}</span>
                                  </div>
                                );
                              }) : <span style={{ color: '#e67e22', fontSize: 13 }}>Nenhum</span>}
                            </div>
                            {/* Melhorias */}
                            <div style={{ flex: 1, background: 'rgba(46, 107, 230, 0.08)', borderRadius: 8, padding: 10, minHeight: 60 }}>
                              <div style={{ color: '#2e86de', fontWeight: 600, fontSize: 14, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <i className="bi bi-lightbulb" /> Melhorias
                              </div>
                              {op.melhorias.length > 0 ? op.melhorias.map((t, i) => {
                                const parsed = parseAsterisksFormatting(t);
                                const bold = isBold(parsed);
                                return (
                                  <div key={i} style={{ color: '#2e86de', fontSize: 14, marginBottom: 2, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                                    {bold ? (
                                      <i className="bi bi-star-fill" style={{ fontSize: 8, color: '#2e86de', marginRight: 4, display: 'inline-block', lineHeight: 1, paddingTop: 7 }} />
                                    ) : (
                                      <span style={{ fontSize: 18, lineHeight: 1, marginRight: 4, display: 'inline-block' }}>•</span>
                                    )}
                                    <span style={{ textAlign: 'left', flex: 1 }}>{parsed}</span>
                                  </div>
                                );
                              }) : <span style={{ color: '#2e86de', fontSize: 13 }}>Nenhuma</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </PartitionCard>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
} 