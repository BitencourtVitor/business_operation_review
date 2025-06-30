import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import dayjs from 'dayjs';
import PartitionCard from './PartitionCard';
import EmptyMessage from './EmptyMessage';
import PartitionLoading from './PartitionLoading';

// Tipos para os dados
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

interface PlanoAcaoPartitionProps {
  usuarioResponsavelId: string;
  usuariosParaBuscar?: string[];
  isAdmin: boolean;
  onEdit?: () => void;
  onView?: (plano: PlanoAcao) => void;
  refreshTrigger?: number;
}

export default function PlanoAcaoPartition({ 
  usuarioResponsavelId, 
  usuariosParaBuscar = [],
  isAdmin, 
  onEdit, 
  onView, 
  refreshTrigger 
}: PlanoAcaoPartitionProps) {
  const [allPlanos, setAllPlanos] = useState<PlanoAcao[]>([]);
  const [allAcoes, setAllAcoes] = useState<Acao[]>([]);
  const [loading, setLoading] = useState(false);
  const [openPlanoId, setOpenPlanoId] = useState<string>('');
  const [loadingView, setLoadingView] = useState<string>('');

  // Buscar planos de ação e ações do usuário responsável pela tela
  useEffect(() => {
    const fetchPlanosEAcoes = async () => {
      if (!usuarioResponsavelId) {
        return;
      }
      
      setLoading(true);
      try {
        // Buscar planos de ação de todos os usuários relevantes
        let planosQuery = supabase
          .from('planos_de_acao')
          .select('*');
        
        // Se temos usuários específicos para buscar, filtrar por eles
        if (usuariosParaBuscar.length > 0) {
          planosQuery = planosQuery.in('usuario_id', usuariosParaBuscar);
        } else {
          // Fallback para o comportamento original
          planosQuery = planosQuery.eq('usuario_id', usuarioResponsavelId);
        }
        
        const { data: planosData } = await planosQuery;
        
        // Buscar ações
        const { data: acoesData } = await supabase
          .from('acoes')
          .select('*');
        
        setAllPlanos(planosData || []);
        setAllAcoes(acoesData || []);
      } catch (error) {
        console.error('Erro ao carregar planos de ação:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPlanosEAcoes();
  }, [usuarioResponsavelId, usuariosParaBuscar, refreshTrigger]);

  // Filtrar planos do responsável e adicionar ações correspondentes
  const planosComAcoes = React.useMemo(() => {
    if (!allPlanos.length) return [];
    
    // Filtrar planos dos usuários relevantes
    const planosFiltrados = allPlanos.filter(plano => {
      if (usuariosParaBuscar.length > 0) {
        return usuariosParaBuscar.includes(plano.usuario_id);
      }
      return plano.usuario_id === usuarioResponsavelId;
    });
    
    // Para cada plano, adicionar as ações correspondentes
    return planosFiltrados.map(plano => ({
      ...plano,
      acoes: allAcoes.filter(acao => acao.plano_id === plano.id),
    }));
  }, [allPlanos, allAcoes, usuarioResponsavelId, usuariosParaBuscar]);

  if (loading) {
    return <PartitionLoading />;
  }

  return (
    <div style={{ flex: '1 1 0%', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 0, borderBottom: '1px solid var(--color-border-divider)', padding: 10, backgroundColor: 'var(--color-background-primary)' }}>
      <div className='fw-light' style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: 5, background: 'transparent', zIndex: 2 }}>Plano de Ação</div>
      <div className="custom-scrollbar d-flex flex-column gap-1" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {planosComAcoes.length === 0 ? (
          <PartitionCard>
            <EmptyMessage message="No action plan found." showEdit={isAdmin} onEdit={onEdit} icon="bi-map" />
          </PartitionCard>
        ) : (
          planosComAcoes.map(plano => (
            <div key={plano.id} style={{ borderRadius: 10, background: 'var(--color-background-secondary)', marginBottom: 0, border: '1px solid var(--color-border-divider)' }}>
              <button
                className={`btn-sidebar d-flex align-items-center justify-content-between w-100${openPlanoId === plano.id ? ' btn-sidebar-ativo' : ''}`}
                style={{ gap: 10, padding: '8px 12px', borderRadius: 8, fontSize: 14, borderTopLeftRadius: 10, borderTopRightRadius: 10, marginBottom: 0, minHeight: 38, width: '100%', border: 'none', outline: 'none', boxShadow: 'none' }}
                onClick={() => setOpenPlanoId(openPlanoId === plano.id ? '' : plano.id)}
              >
                <span style={{ fontWeight: 600, color: 'inherit', fontSize: 15 }}>{plano.titulo || 'Sem título'}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className={`bi ${openPlanoId === plano.id ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ fontSize: 16, color: 'inherit' }} />
                  <div
                    className="btn btn-link p-0 ms-1"
                    style={{ color: 'var(--color-text-secondary)', fontSize: 14, lineHeight: 1, boxShadow: 'none', border: 'none', background: 'none', cursor: 'pointer' }}
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (onView) {
                        setLoadingView(plano.id);
                        try {
                          // PASSO 1: Buscar todas as ações do plano para recalcular data_fim
                          const { data: todasAcoes } = await supabase
                            .from('acoes')
                            .select('*')
                            .eq('plano_id', plano.id);
                          
                          // PASSO 2: Calcular a nova data_fim baseada nas ações
                          const calcularDataFim = (acoes: Acao[]) => {
                            const acoesComData = acoes.filter(acao => acao.data_limite && acao.titulo.trim() !== '');
                            if (acoesComData.length === 0) return null;
                            // Pega a maior data como string (ordenação lexicográfica funciona para yyyy-mm-dd)
                            return acoesComData.map(acao => acao.data_limite).sort().reverse()[0];
                          };
                          
                          const novaDataFim = calcularDataFim(todasAcoes || []);
                          
                          // PASSO 3: Atualizar a data_fim no banco ANTES de buscar os dados
                          if (novaDataFim !== null) {
                            const { error: updateError } = await supabase
                              .from('planos_de_acao')
                              .update({ data_fim: novaDataFim })
                              .eq('id', plano.id);
                            
                            if (updateError) {
                              console.error('Erro ao atualizar data_fim:', updateError);
                            }
                          }
                          
                          // PASSO 4: Aguardar um pouco para garantir que a atualização foi processada
                          await new Promise(resolve => setTimeout(resolve, 100));
                          
                          // PASSO 5: Buscar plano completo com data_fim atualizada
                          const { data: planoCompleto } = await supabase
                            .from('planos_de_acao')
                            .select('*')
                            .eq('id', plano.id)
                            .single();
                          
                          // PASSO 6: Buscar todas as ações do plano novamente (ordenadas)
                          const { data: acoesCompletas } = await supabase
                            .from('acoes')
                            .select('*')
                            .eq('plano_id', plano.id)
                            .order('data_limite', { ascending: true });
                          
                          if (planoCompleto) {
                            const dadosCompletos = {
                              ...planoCompleto,
                              acoes: acoesCompletas || [],
                            };
                            
                            // VERIFICAÇÃO FINAL: Garantir que a data_fim está correta
                            if (dadosCompletos.data_fim !== novaDataFim) {
                              // Forçar a data_fim correta no objeto
                              dadosCompletos.data_fim = novaDataFim || '';
                            }
                            
                            onView(dadosCompletos);
                          } else {
                            onView(plano);
                          }
                        } catch {
                          onView(plano);
                        } finally {
                          setLoadingView('');
                        }
                      }
                    }}
                    title="Expandir em modal"
                  >
                    <i className={`bi ${loadingView === plano.id ? 'bi-hourglass-split' : 'bi-box-arrow-up-left'}`} />
                  </div>
                  {isAdmin && (
                    <div
                      className="btn btn-link p-0 ms-2"
                      style={{ color: 'var(--color-accent-primary)', fontSize: 16, lineHeight: 1, boxShadow: 'none', border: 'none', background: 'none', cursor: 'pointer' }}
                      onClick={e => {
                        e.stopPropagation();
                        if (onEdit) onEdit();
                      }}
                      title="Editar"
                    >
                      <i className="bi bi-pencil" />
                    </div>
                  )}
                </div>
              </button>
              {openPlanoId === plano.id && (
                <div style={{ padding: 12, paddingTop: 0 }}>
                  <div style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: 8, textAlign: 'start' }}>{plano.descricao || <span style={{ color: '#aaa' }}>Sem descrição</span>}</div>
                  {/* Listar ações do plano */}
                  <div style={{ marginLeft: 8, borderLeft: '2px solid var(--color-border-divider)', paddingLeft: 8, marginTop: 4 }}>
                    {plano.acoes && plano.acoes.length > 0
                      ? plano.acoes
                          .slice()
                          .sort((a: Acao, b: Acao) => {
                            if (dayjs(a.data_limite).isBefore(dayjs(b.data_limite))) return -1;
                            if (dayjs(a.data_limite).isAfter(dayjs(b.data_limite))) return 1;
                            return 0;
                          })
                          .map((acao: Acao) => {
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
                              <div key={acao.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                <i className={`bi ${statusIcon}`} style={{ color: statusColor, fontSize: 15, marginTop: 2, flexShrink: 0 }} />
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                  <div style={{ color: 'var(--color-text-primary)', fontSize: 13, fontWeight: 500, marginBottom: 2, wordBreak: 'break-word', textAlign: 'left' }}>{acao.titulo}</div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#888' }}>
                                    <span style={{ color: '#888' }}>{acao.responsavel}</span>
                                    <span style={{ color: statusColor }}>{acao.status}</span>
                                    <span style={{ color: '#888' }}>{acao.data_limite}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                      : <span style={{ color: '#888', fontSize: 12 }}>Nenhuma ação</span>}
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