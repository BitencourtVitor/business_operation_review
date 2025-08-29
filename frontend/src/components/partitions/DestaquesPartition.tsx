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
  usuario_nome?: string; // Nome do usuário que criou o destaque
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
  usuarioResponsavelId: string | string[];
  usuariosParaBuscar?: string[];
  telaId: string;
  selectedYear?: string;
  selectedMonth?: string;
  isAdmin: boolean;
  usuarioLogadoId?: string; // ID do usuário atualmente logado
  onEdit?: (mes?: string, ano?: string, usuarioId?: string) => void;
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
  usuarioLogadoId,
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
      
      // SEMPRE limpar cache e buscar dados frescos
      setAllDestaques([]);
      setOpenDestaques('');
      setLoading(true);
      
      try {
        // Buscar destaques específicos da tela e usuário
        let destaquesQuery = supabase
          .from('destaques')
          .select('*')
          .eq('tela_id', telaId);
        
        // SEMPRE usar usuariosParaBuscar se disponível, senão fallback para usuarioResponsavelId
        const usuariosParaBuscarDados = usuariosParaBuscar && usuariosParaBuscar.length > 0 
          ? usuariosParaBuscar 
          : (Array.isArray(usuarioResponsavelId) ? usuarioResponsavelId : [usuarioResponsavelId]);
        
        if (!usuariosParaBuscarDados || usuariosParaBuscarDados.length === 0) {
          console.error('Nenhum usuário disponível para buscar dados');
          setAllDestaques([]);
          return;
        }
        
        destaquesQuery = destaquesQuery.in('usuario_id', usuariosParaBuscarDados);
        
        const { data: destaques, error: destaquesError } = await destaquesQuery;
        
        if (destaquesError) {
          console.error('Erro ao buscar destaques:', destaquesError);
          return;
        }
        
        if (destaques) {
          // Buscar positivos e negativos apenas para os destaques encontrados
          const destaqueIds = destaques.map(d => d.id);
          
          let positivos: { destaque_id: string; texto: string }[] = [];
          let negativos: { destaque_id: string; texto: string }[] = [];
          
          if (destaqueIds.length > 0) {
            const { data: positivosData } = await supabase
              .from('destaques_positivos')
              .select('*')
              .in('destaque_id', destaqueIds);
            const { data: negativosData } = await supabase
              .from('destaques_negativos')
              .select('*')
              .in('destaque_id', destaqueIds);
            
            positivos = positivosData || [];
            negativos = negativosData || [];
          }
          
          // Buscar nomes dos usuários dos destaques
          const userIds = [...new Set(destaques.map(d => d.usuario_id))];
          let usuariosNomes: { id: string; nome_completo: string }[] = [];
          
          if (userIds.length > 0) {
            const { data: usuariosData } = await supabase
              .from('usuarios')
              .select('id, nome_completo')
              .in('id', userIds);
            usuariosNomes = usuariosData || [];
          }
          
          const destaquesCompletos = destaques.map(d => ({
            ...d,
            mes: d.mes.toString(),
            ano: d.ano.toString(),
            positivos: positivos.filter((p: { destaque_id: string; texto: string }) => p.destaque_id === d.id).map((p: { texto: string }) => p.texto),
            negativos: negativos.filter((n: { destaque_id: string; texto: string }) => n.destaque_id === d.id).map((n: { texto: string }) => n.texto),
            usuario_nome: usuariosNomes.find(u => u.id === d.usuario_id)?.nome_completo || `Admin ${d.usuario_id.slice(0, 8)}...`
          }));
          
          setAllDestaques(destaquesCompletos);
        }
      } catch (error) {
        console.error('Erro ao buscar destaques:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDestaques();
  }, [usuarioResponsavelId, usuariosParaBuscar, telaId, refreshTrigger]);

  // Agrupar dados por mês/ano, ignorando destaques inválidos
  const destaquesValidos = allDestaques.filter(d => {
    const mesValido = d.mes && d.ano && Number(d.mes) > 0 && Number(d.ano) > 0;
    return mesValido;
  });
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
           // Quando há filtro mensal, mostrar todos os destaques daquele período individualmente
           (() => {
             const key = `${Number(selectedYear)}-${Number(selectedMonth)}`;
             const destaques = destaquesByMonth[key];
             
             // Verificar se o usuário logado já tem destaque para este período
             const usuarioLogadoTemDestaque = usuarioLogadoId && destaques && destaques.some(d => d.usuario_id === usuarioLogadoId);
             
             return (
               <>
                 {/* Mostrar destaques existentes */}
                 {destaques && destaques.length > 0 && destaques.map((destaque) => {
                   const destaqueKey = `${destaque.ano}-${destaque.mes}-${destaque.usuario_id}`;
                   const isOpen = openDestaques === destaqueKey;
                   
                   return (
                     <div key={destaqueKey} style={{ borderRadius: 10, background: 'var(--color-background-secondary)', marginBottom: 2, border: '1px solid var(--color-border-divider)' }}>
                       <button
                         className={`btn-sidebar d-flex align-items-center justify-content-between w-100${isOpen ? ' btn-sidebar-ativo' : ''}`}
                         style={{ gap: 10, padding: '8px 12px', borderRadius: 8, fontSize: 14, borderTopLeftRadius: 10, borderTopRightRadius: 10, marginBottom: 0, minHeight: 38, width: '100%', border: 'none', outline: 'none', boxShadow: 'none' }}
                         onClick={() => setOpenDestaques(isOpen ? '' : destaqueKey)}
                       >
                         <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                           <span style={{ fontWeight: 500, color: 'inherit', fontSize: 14 }}>
                             {formatMonthYear(`${destaque.ano}-${destaque.mes}`)}
                           </span>
                           <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 400 }}>
                             • {destaque.usuario_nome || `Admin ${destaque.usuario_id.slice(0, 8)}...`}
                           </span>
                         </div>
                         <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                           <i className={`bi ${isOpen ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ fontSize: 16, color: 'inherit' }} />
                           <div
                             className="btn btn-link p-0 ms-1"
                             style={{ color: 'var(--color-text-secondary)', fontSize: 14, lineHeight: 1, boxShadow: 'none', border: 'none', background: 'none', cursor: 'pointer' }}
                             onClick={e => {
                               e.stopPropagation();
                               if (onView && destaque) onView(destaque);
                             }}
                             aria-label="Expandir em modal"
                             title="Expandir em modal"
                           >
                             <i className="bi bi-box-arrow-up-left" />
                           </div>
                           {isAdmin && (() => {
                             // Verificar se o usuário logado pode editar este bloco específico
                             // O usuário logado só pode editar os blocos que ELE criou
                             const podeEditarEsteBloco = usuarioLogadoId && destaque.usuario_id === usuarioLogadoId;
                             
                             return podeEditarEsteBloco ? (
                               <div
                                 className="btn btn-link p-0 ms-2"
                                 style={{ color: 'var(--color-accent-primary)', fontSize: 16, lineHeight: 1, boxShadow: 'none', border: 'none', background: 'none', cursor: 'pointer' }}
                                 onClick={e => {
                                   e.stopPropagation();
                                   if (onEdit) onEdit(destaque.mes, destaque.ano, destaque.usuario_id);
                                 }}
                                 aria-label="Editar"
                               >
                                 <i className="bi bi-pencil" />
                               </div>
                             ) : null;
                           })()}
                         </div>
                       </button>
                       {isOpen && (
                         <div style={{ padding: 12 }}>
                           <div style={{ display: 'flex', flexDirection: 'row', gap: 12 }}>
                             <div style={{ flex: 1, background: 'rgba(0,200,100,0.04)', borderRadius: 8, padding: 10, minHeight: 60 }}>
                               <div style={{ color: '#1bbf5c', fontWeight: 600, fontSize: 14, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}><i className="bi bi-hand-thumbs-up" /> Positivos</div>
                               {destaque.positivos.length > 0 ? destaque.positivos.map((t, i) => {
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
                               {destaque.negativos.length > 0 ? destaque.negativos.map((t, i) => {
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
                 })}
                 
                 {/* Mostrar opção para adicionar novo destaque se o usuário logado não tiver um para este período */}
                 {isAdmin && !usuarioLogadoTemDestaque && (
                   <PartitionCard>
                     <EmptyMessage 
                       message="Add your highlight for this period" 
                       showEdit={true} 
                       onEdit={() => onEdit && onEdit(selectedMonth, selectedYear)} 
                       icon="bi-plus-circle" 
                     />
                   </PartitionCard>
                 )}
                 
                 {/* Mostrar mensagem quando não há nenhum destaque */}
                 {(!destaques || destaques.length === 0) && (
                   <PartitionCard>
                     <EmptyMessage 
                       message="No highlights found for this period." 
                       showEdit={isAdmin} 
                       onEdit={() => onEdit && onEdit(selectedMonth, selectedYear)} 
                       icon="bi-star" 
                     />
                   </PartitionCard>
                 )}
               </>
             );
           })()
        ) : Object.keys(destaquesByMonth).length === 0 ? (
          <PartitionCard>
            <EmptyMessage message="No highlights found." showEdit={isAdmin} onEdit={onEdit} icon="bi-star" />
          </PartitionCard>
        ) : (
          // Criar blocos separados para cada administrador, mesmo quando são do mesmo período
          allDestaques
            .filter(d => {
              const mesValido = d.mes && d.ano && Number(d.mes) > 0 && Number(d.ano) > 0;
              return mesValido;
            })
            .sort((a, b) => {
              // Ordenar por ano (decrescente), depois por mês (decrescente), depois por usuário
              const anoA = Number(a.ano);
              const anoB = Number(b.ano);
              if (anoA !== anoB) return anoB - anoA;
              
              const mesA = Number(a.mes);
              const mesB = Number(b.mes);
              if (mesA !== mesB) return mesB - mesA;
              
              return a.usuario_id.localeCompare(b.usuario_id);
            })
            .map((destaque) => {
              const key = `${destaque.ano}-${destaque.mes}-${destaque.usuario_id}`;
              const isOpen = openDestaques === key;
              
              return (
                <div key={key} style={{ borderRadius: 10, background: 'var(--color-background-secondary)', marginBottom: 2, border: '1px solid var(--color-border-divider)' }}>
                  <button
                    className={`btn-sidebar d-flex align-items-center justify-content-between w-100${isOpen ? ' btn-sidebar-ativo' : ''}`}
                    style={{ gap: 10, padding: '8px 12px', borderRadius: 8, fontSize: 14, borderTopLeftRadius: 10, borderTopRightRadius: 10, marginBottom: 0, minHeight: 38, width: '100%', border: 'none', outline: 'none', boxShadow: 'none' }}
                    onClick={() => setOpenDestaques(isOpen ? '' : key)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 500, color: 'inherit', fontSize: 14 }}>
                        {formatMonthYear(`${destaque.ano}-${destaque.mes}`)}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 400 }}>
                        • {destaque.usuario_nome || `Admin ${destaque.usuario_id.slice(0, 8)}...`}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <i className={`bi ${isOpen ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ fontSize: 16, color: 'inherit' }} />
                      <div
                        className="btn btn-tertiary-custom p-0 ms-1"
                        style={{ fontSize: 14, lineHeight: 1, boxShadow: 'none' }}
                        onClick={e => {
                          e.stopPropagation();
                          if (onView && destaque) onView(destaque);
                        }}
                        aria-label="Expandir em modal"
                        title="Expandir em modal"
                      >
                        <i className="bi bi-box-arrow-up-left" />
                      </div>
                                             {isAdmin && (() => {
                         // Verificar se o usuário logado pode editar este bloco específico
                         // O usuário logado só pode editar os blocos que ELE criou
                         const podeEditarEsteBloco = usuarioLogadoId && destaque.usuario_id === usuarioLogadoId;
                         
                         return podeEditarEsteBloco ? (
                          <div
                            className="btn btn-link p-0 ms-2"
                            style={{ color: 'var(--color-accent-primary)', fontSize: 16, lineHeight: 1, boxShadow: 'none', border: 'none', background: 'none', cursor: 'pointer' }}
                            onClick={e => {
                              e.stopPropagation();
                              if (onEdit) onEdit(destaque.mes, destaque.ano, destaque.usuario_id);
                            }}
                            aria-label="Editar"
                          >
                            <i className="bi bi-pencil" />
                          </div>
                        ) : null;
                      })()}
                    </div>
                  </button>
                  {isOpen && (
                    <div style={{ padding: 12 }}>
                      <div style={{ display: 'flex', flexDirection: 'row', gap: 12 }}>
                        <div style={{ flex: 1, background: 'rgba(0,200,100,0.04)', borderRadius: 8, padding: 10, minHeight: 60 }}>
                          <div style={{ color: '#1bbf5c', fontWeight: 600, fontSize: 14, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}><i className="bi bi-hand-thumbs-up" /> Positivos</div>
                          {destaque.positivos.length > 0 ? destaque.positivos.map((t, i) => {
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
                          {destaque.negativos.length > 0 ? destaque.negativos.map((t, i) => {
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
            })
        )}
      </div>
    </div>
  );
} 