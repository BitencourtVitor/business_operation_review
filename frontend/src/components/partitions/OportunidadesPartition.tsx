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
  usuario_nome?: string; // Nome do usuário que criou a oportunidade
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

// Função utilitário para agrupar por mês/ano/usuário
function groupByMonthYearUser<T extends { mes: string | number; ano: string | number; usuario_id: string }>(arr: T[]): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    // Usa sempre o mês como número (sem zero à esquerda)
    const mesNum = Number(item.mes);
    const anoNum = Number(item.ano);
    const key = `${anoNum}-${mesNum}-${item.usuario_id}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

interface OportunidadesPartitionProps {
  usuarioResponsavelId: string | string[];
  usuariosParaBuscar?: string[];
  telaId: string;
  selectedYear?: number;
  selectedMonth?: number;
  isAdmin: boolean;
  usuarioLogadoId?: string; // ID do usuário atualmente logado
  onEdit?: (mes: string | number, ano: string | number, usuarioId?: string) => void;
  onView?: (oportunidade: Oportunidade, mes?: string | number, ano?: string | number) => void;
  refreshTrigger?: number;
}

export default function OportunidadesPartition({ 
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
}: OportunidadesPartitionProps) {
  const [allOportunidades, setAllOportunidades] = useState<Oportunidade[]>([]);
  const [loading, setLoading] = useState(false);
  const [openOportunidades, setOpenOportunidades] = useState<string>('');

  // Função wrapper para compatibilidade com EmptyMessage
  const handleEmptyMessageEdit = () => {
    if (onEdit && selectedYear && selectedMonth) {
      // Usar o usuário logado como responsável pela oportunidade
      onEdit(selectedMonth, selectedYear, usuarioLogadoId);
    }
  };

  // Buscar oportunidades do usuário responsável pela tela
  useEffect(() => {
    const fetchOportunidades = async () => {
      if (!usuarioResponsavelId || !telaId) {
        return;
      }
      
      // SEMPRE limpar cache e buscar dados frescos
      setAllOportunidades([]);
      setOpenOportunidades('');
      setLoading(true);
      
      try {
        // Buscar oportunidades específicas da tela e usuário
        let oportunidadesQuery = supabase
          .from('oportunidades')
          .select('*')
          .eq('tela_id', telaId);
        
        // SEMPRE usar usuariosParaBuscar se disponível, senão fallback para usuarioResponsavelId
        const usuariosParaBuscarDados = usuariosParaBuscar && usuariosParaBuscar.length > 0 
          ? usuariosParaBuscar 
          : (Array.isArray(usuarioResponsavelId) ? usuarioResponsavelId : [usuarioResponsavelId]);
        
        if (!usuariosParaBuscarDados || usuariosParaBuscarDados.length === 0) {
          console.error('Nenhum usuário disponível para buscar dados');
          setAllOportunidades([]);
          return;
        }
        
        oportunidadesQuery = oportunidadesQuery.in('usuario_id', usuariosParaBuscarDados);
        
        const { data: oportunidades, error: oportunidadesError } = await oportunidadesQuery;
        
        if (oportunidadesError) {
          console.error('Erro ao buscar oportunidades:', oportunidadesError);
          return;
        }
        
        if (oportunidades) {
          // Buscar desafios e melhorias apenas para as oportunidades encontradas
          const oportunidadeIds = oportunidades.map(op => op.id);
          
          let desafios: { oportunidade_id: string; texto: string }[] = [];
          let melhorias: { oportunidade_id: string; texto: string }[] = [];
          
          if (oportunidadeIds.length > 0) {
            const { data: desafiosData } = await supabase
              .from('desafios')
              .select('*')
              .in('oportunidade_id', oportunidadeIds);
            const { data: melhoriasData } = await supabase
              .from('melhorias')
              .select('*')
              .in('oportunidade_id', oportunidadeIds);
            
            desafios = desafiosData || [];
            melhorias = melhoriasData || [];
          }
          
          // Buscar nomes dos usuários das oportunidades
          const userIds = [...new Set(oportunidades.map(op => op.usuario_id))];
          let usuariosNomes: { id: string; nome_completo: string }[] = [];
          
          if (userIds.length > 0) {
            const { data: usuariosData } = await supabase
              .from('usuarios')
              .select('id, nome_completo')
              .in('id', userIds);
            usuariosNomes = usuariosData || [];
          }
          
          const oportunidadesCompletas = oportunidades.map(oportunidade => ({
            ...oportunidade,
            mes: oportunidade.mes.toString(),
            ano: oportunidade.ano.toString(),
            desafios: desafios.filter((d: { oportunidade_id: string; texto: string }) => d.oportunidade_id === oportunidade.id).map((d: { texto: string }) => d.texto),
            melhorias: melhorias.filter((m: { oportunidade_id: string; texto: string }) => m.oportunidade_id === oportunidade.id).map((m: { texto: string }) => m.texto),
            usuario_nome: usuariosNomes.find(u => u.id === oportunidade.usuario_id)?.nome_completo || `Admin ${oportunidade.usuario_id.slice(0, 8)}...`
          }));
          
          setAllOportunidades(oportunidadesCompletas);
        }
      } catch (error) {
        console.error('Erro ao buscar oportunidades:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchOportunidades();
  }, [usuarioResponsavelId, usuariosParaBuscar, telaId, refreshTrigger]);

  // Agrupar dados por mês/ano, ignorando oportunidades inválidas
  const oportunidadesValidas = allOportunidades.filter(op => {
    const mesValido = op.mes && op.ano && Number(op.mes) > 0 && Number(op.ano) > 0;
    return mesValido;
  });
  
  const oportunidadesByMonth = groupByMonthYearUser(oportunidadesValidas);

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
          // Quando há filtro mensal, mostrar todas as oportunidades daquele período individualmente
          (() => {
            // Buscar oportunidades que correspondem ao mês/ano filtrado, independente do usuário
            const oportunidadesDoPeriodo = allOportunidades.filter(op => 
              Number(op.mes) === Number(selectedMonth) && Number(op.ano) === Number(selectedYear)
            );
            
            if (!oportunidadesDoPeriodo || oportunidadesDoPeriodo.length === 0) {
              return (
                <PartitionCard>
                  <EmptyMessage message="No opportunities found for this period." showEdit={isAdmin} onEdit={handleEmptyMessageEdit} icon="bi-lightbulb" />
                </PartitionCard>
              );
            }
            
            // Mostrar cada oportunidade individualmente, igual ao comportamento sem filtro
            return oportunidadesDoPeriodo.map((oportunidade) => {
              const oportunidadeKey = `${oportunidade.ano}-${oportunidade.mes}-${oportunidade.usuario_id}`;
              const isOpen = openOportunidades === oportunidadeKey;
              
              return (
                <div key={oportunidadeKey} style={{ borderRadius: 10, background: 'var(--color-background-secondary)', marginBottom: 2, border: '1px solid var(--color-border-divider)' }}>
                  <button
                    className={`btn-sidebar d-flex align-items-center justify-content-between w-100${isOpen ? ' btn-sidebar-ativo' : ''}`}
                    style={{ gap: 10, padding: '8px 12px', borderRadius: 8, fontSize: 14, borderTopLeftRadius: 10, borderTopRightRadius: 10, marginBottom: 0, minHeight: 38, width: '100%', border: 'none', outline: 'none', boxShadow: 'none' }}
                    onClick={() => setOpenOportunidades(isOpen ? '' : oportunidadeKey)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 500, color: 'inherit', fontSize: 14 }}>
                        {formatMonthYear(`${oportunidade.ano}-${oportunidade.mes}`)}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 400 }}>
                        • {oportunidade.usuario_nome || `Admin ${oportunidade.usuario_id.slice(0, 8)}...`}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <i className={`bi ${isOpen ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ fontSize: 16, color: 'inherit' }} />
                      <div
                        className="btn btn-tertiary-custom p-0 ms-1"
                        style={{ fontSize: 14, lineHeight: 1, boxShadow: 'none', cursor: 'pointer' }}
                        onClick={e => {
                          e.stopPropagation();
                          if (onView && oportunidade) onView(oportunidade, oportunidade.mes, oportunidade.ano);
                        }}
                        aria-label="Expandir em modal"
                        title="Expandir em modal"
                      >
                        <i className="bi bi-box-arrow-up-left" />
                      </div>
                      {isAdmin && (() => {
                        // Verificar se o usuário logado pode editar este bloco específico
                        // O usuário logado só pode editar os blocos que ELE criou
                        const podeEditarEsteBloco = usuarioLogadoId && oportunidade.usuario_id === usuarioLogadoId;
                        
                        return podeEditarEsteBloco ? (
                          <div
                            className="btn btn-link p-0 ms-2"
                            style={{ color: 'var(--color-accent-primary)', fontSize: 16, lineHeight: 1, boxShadow: 'none', border: 'none', background: 'none', cursor: 'pointer' }}
                            onClick={e => {
                              e.stopPropagation();
                              if (onEdit) onEdit(oportunidade.mes, oportunidade.ano, oportunidade.usuario_id);
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
                    <PartitionCard>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, background: 'var(--color-background-secondary)' }}>
                        <div style={{ background: 'var(--color-background-secondary)', borderRadius: 8, padding: 12, border: '1px solid var(--color-border-divider)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <div style={{ color: 'var(--color-text-primary)', fontWeight: 600, fontSize: 14, textAlign: 'left' }}>{parseAsterisksFormatting(oportunidade.titulo)}</div>
                            {oportunidade.usuario_nome && (
                              <div style={{ 
                                fontSize: 12, 
                                color: 'var(--color-text-secondary)', 
                                background: 'var(--color-background-primary)', 
                                padding: '4px 8px', 
                                borderRadius: 4,
                                border: '1px solid var(--color-border-divider)'
                              }}>
                                {oportunidade.usuario_nome}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'row', gap: 12 }}>
                            {/* Desafios */}
                            <div style={{ flex: 1, background: 'rgba(230, 126, 34, 0.08)', borderRadius: 8, padding: 10, minHeight: 60 }}>
                              <div style={{ color: '#e67e22', fontWeight: 600, fontSize: 14, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <i className="bi bi-exclamation-triangle" /> Desafios
                              </div>
                              {oportunidade.desafios.length > 0 ? oportunidade.desafios.map((t, i) => {
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
                              {oportunidade.melhorias.length > 0 ? oportunidade.melhorias.map((t, i) => {
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
                      </div>
                    </PartitionCard>
                  )}
                </div>
              );
            });
          })()
        ) : Object.keys(oportunidadesByMonth).length === 0 ? (
          <PartitionCard>
            <EmptyMessage message="No opportunities found." showEdit={isAdmin} onEdit={handleEmptyMessageEdit} icon="bi-lightbulb" />
          </PartitionCard>
        ) : (
          // Agrupar oportunidades por período/usuário e exibir todas juntas
          Object.entries(oportunidadesByMonth)
            .sort(([keyA], [keyB]) => {
              // Extrair ano, mês e usuarioId da chave de forma robusta
              const partsA = keyA.split('-');
              const partsB = keyB.split('-');
              const anoA = partsA[0];
              const mesA = partsA[1];
              const usuarioA = partsA.slice(2).join('-');
              const anoB = partsB[0];
              const mesB = partsB[1];
              const usuarioB = partsB.slice(2).join('-');
              
              const anoNumA = Number(anoA);
              const anoNumB = Number(anoB);
              if (anoNumA !== anoNumB) return anoNumB - anoNumA;
              
              const mesNumA = Number(mesA);
              const mesNumB = Number(mesB);
              if (mesNumA !== mesNumB) return mesNumB - mesNumA;
              
              return usuarioA.localeCompare(usuarioB);
            })
            .map(([key, oportunidades]) => {
              // Extrair ano, mês e usuarioId da chave de forma robusta
              const parts = key.split('-');
              const ano = parts[0];
              const mes = parts[1];
              // O usuarioId é tudo que vem depois do segundo hífen
              const usuarioId = parts.slice(2).join('-');
              const primeiraOportunidade = oportunidades[0];
              const isOpen = openOportunidades === key;
              
              return (
                <div key={key} style={{ borderRadius: 10, background: 'var(--color-background-secondary)', marginBottom: 2, border: '1px solid var(--color-border-divider)' }}>
                  <button
                    className={`btn-sidebar d-flex align-items-center justify-content-between w-100${isOpen ? ' btn-sidebar-ativo' : ''}`}
                    style={{ gap: 10, padding: '8px 12px', borderRadius: 8, fontSize: 14, borderTopLeftRadius: 10, borderTopRightRadius: 10, marginBottom: 0, minHeight: 38, width: '100%', border: 'none', outline: 'none', boxShadow: 'none' }}
                    onClick={() => setOpenOportunidades(isOpen ? '' : key)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 500, color: 'inherit', fontSize: 14 }}>
                        {formatMonthYear(`${ano}-${mes}`)}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 400 }}>
                        • {primeiraOportunidade.usuario_nome || `Admin ${usuarioId.slice(0, 8)}...`}
                        {oportunidades.length > 1 && (
                          <span style={{ marginLeft: 4, color: 'var(--color-accent-primary)', fontSize: 12 }}>
                            {oportunidades.length}
                          </span>
                        )}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <i className={`bi ${isOpen ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ fontSize: 16, color: 'inherit' }} />
                      {isAdmin && (() => {
                        // Verificar se o usuário logado pode editar este bloco específico
                        // O usuário logado pode editar se for o responsável pelo bloco
                        // Usar startsWith porque o usuarioId pode estar truncado
                        const podeEditarEsteBloco = usuarioLogadoId && (
                          usuarioId === usuarioLogadoId || 
                          usuarioLogadoId.startsWith(usuarioId) ||
                          usuarioId.startsWith(usuarioLogadoId.substring(0, 8))
                        );
                        
                        return podeEditarEsteBloco ? (
                          <div
                            className="btn btn-link p-0 ms-2"
                            style={{ color: 'var(--color-accent-primary)', fontSize: 16, lineHeight: 1, boxShadow: 'none', border: 'none', background: 'none', cursor: 'pointer' }}
                            onClick={e => {
                              e.stopPropagation();
                              if (onEdit) onEdit(mes, ano, usuarioId);
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
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {oportunidades.map((oportunidade, index) => (
                          <PartitionCard key={`${oportunidade.id}-${index}`}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, background: 'var(--color-background-secondary)' }}>
                              <div style={{ background: 'var(--color-background-secondary)', borderRadius: 8, padding: 12, border: '1px solid var(--color-border-divider)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                  <div style={{ color: 'var(--color-text-primary)', fontWeight: 600, fontSize: 14, textAlign: 'left' }}>
                                    {parseAsterisksFormatting(oportunidade.titulo)}
                                  </div>
                                  <div
                                    className="btn btn-tertiary-custom p-0"
                                    style={{ fontSize: 14, lineHeight: 1, boxShadow: 'none', cursor: 'pointer' }}
                                    onClick={() => {
                                      if (onView && oportunidade) onView(oportunidade, oportunidade.mes, oportunidade.ano);
                                    }}
                                    aria-label="Expandir em modal"
                                    title="Expandir em modal"
                                  >
                                    <i className="bi bi-box-arrow-up-left" />
                                  </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'row', gap: 12 }}>
                                  {/* Desafios */}
                                  <div style={{ flex: 1, background: 'rgba(230, 126, 34, 0.08)', borderRadius: 8, padding: 10, minHeight: 60 }}>
                                    <div style={{ color: '#e67e22', fontWeight: 600, fontSize: 14, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <i className="bi bi-exclamation-triangle" /> Desafios
                                    </div>
                                    {oportunidade.desafios.length > 0 ? oportunidade.desafios.map((t, i) => {
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
                                    {oportunidade.melhorias.length > 0 ? oportunidade.melhorias.map((t, i) => {
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
                            </div>
                          </PartitionCard>
                        ))}
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