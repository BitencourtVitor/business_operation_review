import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../supabaseClient';
import dayjs from 'dayjs';
import CloseButton from '../../utils/CloseButton';

// Interface para Plano de Ação
interface PlanoAcao {
  id: string;
  usuario_id: string;
  titulo: string;
  descricao: string;
  criado_em: string;
  data_inicio: string;
  data_fim: string | null;
  acoes: Acao[];
  deletado?: boolean;
}

interface Acao {
  id: string;
  plano_id: string;
  titulo: string;
  responsavel: string;
  status: string;
  data_limite: string;
}

interface PlanoAcaoModalProps {
  show: boolean;
  onClose: () => void;
  data: PlanoAcao | null;
  onSaved?: (updatedData?: PlanoAcao) => void;
}

// Utilitário para exibir feedback
function Feedback({ message, type }: { message: string; type: 'success' | 'error' }) {
  return (
    <div style={{
      background: type === 'success' ? 'rgba(40,167,69,0.12)' : 'rgba(220,53,69,0.12)',
      color: type === 'success' ? '#28a745' : '#dc3545',
      border: `1px solid ${type === 'success' ? '#28a745' : '#dc3545'}`,
      borderRadius: 6,
      padding: '8px 14px',
      fontSize: 14,
      textAlign: 'center',
      transition: 'all 0.5s ease-in-out',
      animation: 'fadeInOut 0.5s ease-in-out',
    }}>{message}</div>
  );
}

const PlanoAcaoModal: React.FC<PlanoAcaoModalProps> = ({ show, onClose, data, onSaved }) => {
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [plano, setPlano] = useState<PlanoAcao | null>(null);
  const [visible, setVisible] = useState(show);
  const [isClosing, setIsClosing] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedState, setLastSavedState] = useState<PlanoAcao | null>(null);

  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

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

  // Calcular data_fim automaticamente baseada nas ações
  const calcularDataFim = (acoes: Acao[]) => {
    const acoesComData = acoes.filter(acao => acao.data_limite && acao.titulo.trim() !== '');
    if (acoesComData.length === 0) return null;
    
    const datas = acoesComData.map(acao => new Date(acao.data_limite));
    const dataMaisRecente = new Date(Math.max(...datas.map(d => d.getTime())));
    return dataMaisRecente.toISOString().split('T')[0];
  };

  // Validar data limite baseada no status
  const validarDataLimite = (status: string, dataLimite: string, dataInicio: string) => {
    if (!status || !dataLimite) return null;
    
    const hoje = new Date().toISOString().split('T')[0];
    const dataLimiteDate = new Date(dataLimite);
    const dataInicioDate = new Date(dataInicio);
    
    if (status === 'Pending') {
      if (dataLimite < hoje) {
        return 'Ações pendentes devem ter data limite igual ou posterior a hoje';
      }
    } else if (status === 'Done') {
      if (dataLimite > hoje) {
        return 'Ações concluídas devem ter data limite igual ou anterior a hoje';
      }
      if (dataLimiteDate < dataInicioDate) {
        return 'A data limite não pode ser anterior à data de início do projeto';
      }
    }
    
    return null;
  };

  // Validar uma ação específica
  const validarAcao = (acao: Acao, dataInicio: string) => {
    if (!acao.titulo.trim()) return null;
    
    if (!acao.status) {
      return 'Status é obrigatório';
    }
    
    if (!acao.data_limite) {
      return 'Data limite é obrigatória quando há status';
    }
    
    return validarDataLimite(acao.status, acao.data_limite, dataInicio);
  };

  // Validar apenas incompatibilidade entre status e data limite
  const validarIncompatibilidadeStatusData = (acao: Acao, dataInicio: string) => {
    if (!acao.status || !acao.data_limite) return null;
    return validarDataLimite(acao.status, acao.data_limite, dataInicio);
  };

  // Função para verificar se uma ação está atrasada
  const isActionOverdue = (acao: Acao): boolean => {
    if (!acao.data_limite) return false;
    const hoje = dayjs().startOf('day');
    const dataLimite = dayjs(acao.data_limite).startOf('day');
    return dataLimite.isBefore(hoje);
  };

  // Função para obter o status real de uma ação (considerando overdue)
  const getActionStatus = (acao: Acao): string => {
    // Se a ação já está concluída (Done), mantém o status como Done
    if (acao.status === 'Done' || acao.status === 'concluída') {
      return acao.status;
    }
    
    // Se a ação está pendente e a data limite passou, marca como Overdue
    if ((acao.status === 'Pending' || acao.status === 'Pendente') && isActionOverdue(acao)) {
      return 'Overdue';
    }
    
    // Caso contrário, mantém o status original
    return acao.status;
  };

  // Função para comparar dois planos e retornar apenas as diferenças
  const compararPlanos = (planoAtual: PlanoAcao, planoOriginal: PlanoAcao) => {
    const diferencas: {
      plano?: Partial<PlanoAcao>;
      acoesParaInserir?: Acao[];
      acoesParaAtualizar?: Acao[];
      acoesParaDeletar?: string[];
    } = {};

    // Comparar campos do plano principal
    const camposPlano = ['titulo', 'descricao', 'data_inicio', 'data_fim'];
    const mudancasPlano: Partial<PlanoAcao> = {};
    let temMudancaPlano = false;

    camposPlano.forEach(campo => {
      const valorAtual = planoAtual[campo as keyof PlanoAcao];
      const valorOriginal = planoOriginal[campo as keyof PlanoAcao];
      
      if (valorAtual !== valorOriginal) {
        if (campo === 'titulo') mudancasPlano.titulo = valorAtual as string;
        if (campo === 'descricao') mudancasPlano.descricao = valorAtual as string;
        if (campo === 'data_inicio') mudancasPlano.data_inicio = valorAtual as string;
        if (campo === 'data_fim') mudancasPlano.data_fim = valorAtual as string | null;
        temMudancaPlano = true;
      }
    });

    if (temMudancaPlano) {
      diferencas.plano = mudancasPlano;
    }

    // Comparar ações
    const acoesAtuais = planoAtual.acoes.filter(a => a.titulo.trim() !== '');
    const acoesOriginais = planoOriginal.acoes.filter(a => a.titulo.trim() !== '');
    
    // Ações para inserir (novas ações com ID temporário)
    const acoesParaInserir = acoesAtuais.filter(acao => 
      acao.id.startsWith('temp_') && acao.titulo.trim() !== ''
    );

    // Ações para deletar (ações que existiam mas não existem mais)
    const acoesParaDeletar = acoesOriginais
      .filter(acaoOriginal => 
        !acoesAtuais.some(acaoAtual => acaoAtual.id === acaoOriginal.id)
      )
      .map(acao => acao.id);

    // Ações para atualizar (ações existentes que mudaram)
    const acoesParaAtualizar = acoesAtuais
      .filter(acaoAtual => 
        !acaoAtual.id.startsWith('temp_') && acaoAtual.titulo.trim() !== ''
      )
      .filter(acaoAtual => {
        const acaoOriginal = acoesOriginais.find(a => a.id === acaoAtual.id);
        if (!acaoOriginal) return false;
        
        return (
          acaoAtual.titulo !== acaoOriginal.titulo ||
          acaoAtual.responsavel !== acaoOriginal.responsavel ||
          acaoAtual.status !== acaoOriginal.status ||
          acaoAtual.data_limite !== acaoOriginal.data_limite
        );
      });

    if (acoesParaInserir.length > 0) {
      diferencas.acoesParaInserir = acoesParaInserir;
    }
    if (acoesParaDeletar.length > 0) {
      diferencas.acoesParaDeletar = acoesParaDeletar;
    }
    if (acoesParaAtualizar.length > 0) {
      diferencas.acoesParaAtualizar = acoesParaAtualizar;
    }

    return diferencas;
  };

  // Carregar ações quando um plano existente for aberto
  useEffect(() => {
    async function fetchPlanoAcoes() {
      if (!data) {
        const novoPlano: PlanoAcao = {
          id: '',
          usuario_id: '',
          titulo: '',
          descricao: '',
          criado_em: '',
          data_inicio: '',
          data_fim: null,
          acoes: [],
        };
        setPlano(novoPlano);
        setLastSavedState(JSON.parse(JSON.stringify(novoPlano)));
        return;
      }
      if (data.id) {
        const { data: acoesData } = await supabase
          .from('acoes')
          .select('*')
          .eq('plano_id', data.id)
          .order('data_limite', { ascending: true });
        const acoes = Array.isArray(acoesData) ? acoesData : [];
        const dataFim = calcularDataFim(acoes);
        const planoComAcoes = {
          ...data,
          acoes,
          data_fim: dataFim,
        };
        setPlano(planoComAcoes);
        setLastSavedState(JSON.parse(JSON.stringify(planoComAcoes)));
      } else {
        const acoes = Array.isArray(data.acoes) ? data.acoes : [];
        const dataFim = calcularDataFim(acoes);
        const planoComAcoes = { ...data, acoes, data_fim: dataFim };
        setPlano(planoComAcoes);
        setLastSavedState(JSON.parse(JSON.stringify(planoComAcoes)));
      }
    }
    if (show) fetchPlanoAcoes();
  }, [show, data]);

  // Resetar ao abrir/fechar
  useEffect(() => {
    setFeedback(null);
    setLoading(false);
    setHasUnsavedChanges(false);
  }, [show]);

  // Verificar mudanças em tempo real
  useEffect(() => {
    if (plano && lastSavedState) {
      const diferencas = compararPlanos(plano, lastSavedState);
      const temMudancas = Object.keys(diferencas).length > 0;
      setHasUnsavedChanges(temMudancas);
    }
  }, [plano, lastSavedState]);

  function addAcao() {
    if (!plano) return;
    const newId = 'temp_' + Math.random().toString(36).slice(2);
    const newAcao: Acao = {
      id: newId,
      plano_id: plano.id,
      titulo: '',
      responsavel: '',
      status: '',
      data_limite: '',
    };
    const novasAcoes = [...plano.acoes, newAcao];
    const dataFim = calcularDataFim(novasAcoes);
    setPlano({ ...plano, acoes: novasAcoes, data_fim: dataFim });
  }
  
  function removeAcao(acaoIdx: number) {
    if (!plano) return;
    const newAcoes = plano.acoes.slice();
    newAcoes.splice(acaoIdx, 1);
    const dataFim = calcularDataFim(newAcoes);
    setPlano({ ...plano, acoes: newAcoes, data_fim: dataFim });
  }

  function updateAcao(acaoIdx: number, updates: Partial<Acao>) {
    if (!plano) return;
    const newAcoes = plano.acoes.slice();
    const acaoAtual = newAcoes[acaoIdx];
    newAcoes[acaoIdx] = { ...acaoAtual, ...updates };
    const dataFim = calcularDataFim(newAcoes);
    setPlano({ ...plano, acoes: newAcoes, data_fim: dataFim });
  }

  async function handleSave() {
    setLoading(true);
    setFeedback(null);
    try {
      if (!plano || !lastSavedState) return;

      // Validar ações
      const erros = [];
      for (let i = 0; i < plano.acoes.length; i++) {
        const acao = plano.acoes[i];
        if (!acao.titulo.trim()) continue;
        
        const erroAcao = validarAcao(acao, plano.data_inicio);
        if (erroAcao) {
          erros.push(`Ação "${acao.titulo}": ${erroAcao}`);
        }
      }
      
      if (erros.length > 0) {
        setFeedback({ message: erros.join('\n'), type: 'error' });
        setLoading(false);
        return;
      }

      let usuarioEmail = '';
      usuarioEmail = (window as Window & { user?: { email?: string } }).user?.email || '';
      if (!usuarioEmail && typeof supabase.auth.getUser === 'function') {
        const { data: authData } = await supabase.auth.getUser();
        usuarioEmail = authData?.user?.email || '';
      }
      if (!usuarioEmail) {
        setFeedback({ message: 'Não foi possível obter o email do usuário autenticado.', type: 'error' });
        setLoading(false);
        return;
      }
      const { data: usuarioRow, error: usuarioError } = await supabase.from('usuarios').select('id').eq('email', usuarioEmail).single();
      if (usuarioError || !usuarioRow) {
        setFeedback({ message: 'Usuário não encontrado na tabela usuarios.', type: 'error' });
        setLoading(false);
        return;
      }

      // Comparar estados e aplicar apenas mudanças necessárias
      const diferencas = compararPlanos(plano, lastSavedState);

      if (plano.id) {
        // Update - sempre atualizar a data_fim calculada
        const dataFimCalculada = calcularDataFim(plano.acoes);
        console.log('Data fim calculada para update:', dataFimCalculada);
        
        // Buscar o registro atual do plano para manter o usuario_id original
        const { data: registroAtual } = await supabase.from('planos_de_acao').select('*').eq('id', plano.id).single();
        if (!registroAtual) {
          setFeedback({ message: 'Plano não encontrado.', type: 'error' });
          setLoading(false);
          return;
        }
        
        // Manter o usuario_id original do registro
        const usuarioIdOriginal = registroAtual.usuario_id;
        
        const planoParaAtualizar = {
          ...diferencas.plano,
          data_fim: dataFimCalculada,
          usuario_id: usuarioIdOriginal
        };
        
        // Filtrar campos vazios e campos que não devem ser enviados
        const planoPrincipal = Object.fromEntries(
          Object.entries(planoParaAtualizar)
            .filter(([k, v]) => !['acoes', 'id'].includes(k) && v !== undefined && v !== '')
        );
        
        console.log('Dados do plano para atualizar:', planoPrincipal);
        await supabase.from('planos_de_acao').update(planoPrincipal).eq('id', plano.id);
        
        // Aplicar mudanças nas ações
        if (diferencas.acoesParaDeletar && diferencas.acoesParaDeletar.length > 0) {
          for (const acaoId of diferencas.acoesParaDeletar) {
            await supabase.from('acoes').delete().eq('id', acaoId);
          }
        }
        
        if (diferencas.acoesParaAtualizar && diferencas.acoesParaAtualizar.length > 0) {
          for (const acao of diferencas.acoesParaAtualizar) {
            const acaoData = {
              plano_id: plano.id,
              titulo: acao.titulo,
              responsavel: acao.responsavel,
              status: acao.status,
              data_limite: acao.data_limite,
            };
            await supabase.from('acoes').update(acaoData).eq('id', acao.id);
          }
        }
        
        if (diferencas.acoesParaInserir && diferencas.acoesParaInserir.length > 0) {
          for (const acao of diferencas.acoesParaInserir) {
            const acaoData = {
              plano_id: plano.id,
              titulo: acao.titulo,
              responsavel: acao.responsavel,
              status: acao.status,
              data_limite: acao.data_limite,
            };
            await supabase.from('acoes').insert([acaoData]);
          }
        }
      } else {
        // Insert - criar novo plano usando o usuario_id do responsável pela tela
        // O usuario_id já deve estar correto no objeto plano (definido na página)
        const dataFimCalculada = calcularDataFim(plano.acoes);
        const planoParaInserir = {
          ...plano,
          ...(dataFimCalculada && { data_fim: dataFimCalculada })
        };
        
        const planoPrincipal = Object.fromEntries(
          Object.entries(planoParaInserir)
            .filter(([k, v]) => {
              if (['acoes', 'id', 'criado_em'].includes(k)) return false;
              if (v === undefined || v === null) return false;
              if (typeof v === 'string' && v.trim() === '') return false;
              return true;
            })
        );
        
        const { data: inserted, error } = await supabase.from('planos_de_acao').insert([planoPrincipal]).select('id').single();
        if (error) throw error;
        
        const planoId = inserted.id;
        
        // Inserir ações
        for (const acao of plano.acoes.filter(a => a.titulo.trim() !== '')) {
          await supabase.from('acoes').insert([{
            plano_id: planoId,
            titulo: acao.titulo,
            responsavel: acao.responsavel,
            status: acao.status,
            data_limite: acao.data_limite,
          }]);
        }
      }
      
      // Atualizar estado salvo e feedback
      const dataFimCalculada = calcularDataFim(plano.acoes);
      const planoSalvo = {
        ...JSON.parse(JSON.stringify(plano)),
        data_fim: dataFimCalculada
      };
      setPlano(planoSalvo);
      setLastSavedState(planoSalvo);
      setHasUnsavedChanges(false);
      setFeedback({ message: 'Plano de ação salvo com sucesso!', type: 'success' });
      
      // Chamar callback para atualizar dados na página
      if (onSaved) {
        console.log('Chamando onSaved com dados atualizados:', planoSalvo);
        onSaved(planoSalvo);
      }
      
    } catch (err: unknown) {
      if (err instanceof Error) {
        setFeedback({ message: err.message || 'Erro ao salvar.', type: 'error' });
      } else {
        setFeedback({ message: 'Erro ao salvar.', type: 'error' });
      }
    } finally {
      setLoading(false);
    }
  }

  function handleCancel() {
    if (hasUnsavedChanges) {
      if (window.confirm('Tem certeza que deseja cancelar? As alterações serão perdidas.')) {
        onClose();
      }
    } else {
      onClose();
    }
  }

  // Handler para deletar plano
  async function handleDeletePlano() {
    if (!plano) return;
    
    // Confirmação antes de deletar
    if (!window.confirm('Tem certeza que deseja deletar este plano de ação? Esta ação não pode ser desfeita.')) {
      return;
    }

    setLoading(true);
    setFeedback(null);
    
    try {
      if (plano.id) {
        // Soft delete - marcar como deletado
        const { error } = await supabase
          .from('planos_de_acao')
          .update({ deletado: true })
          .eq('id', plano.id);
        
        if (error) throw error;
        
        setFeedback({ message: 'Plano de ação deletado com sucesso!', type: 'success' });
        setTimeout(() => onClose(), 2000);
      } else {
        // Se é um plano novo (sem ID), apenas fechar o modal
        setFeedback({ message: 'Plano removido!', type: 'success' });
        setTimeout(() => onClose(), 2000);
      }
      
      if (onSaved) onSaved();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setFeedback({ message: err.message || 'Erro ao deletar plano de ação.', type: 'error' });
      } else {
        setFeedback({ message: 'Erro ao deletar plano de ação.', type: 'error' });
      }
    } finally {
      setLoading(false);
    }
  }

  if (!visible) return null;

  return createPortal(
    <>
      <div className={`modal fade show custom-modal-anim${isClosing ? ' closing' : ''}`} tabIndex={-1} style={{ display: 'block', zIndex: 9999 }}>
        <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 800 }}>
          <div className="modal-content" style={{ background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', border: '1.5px solid var(--color-border-divider)', zIndex: 10000, position: 'relative' }}>
            <div className="modal-header px-4 py-2 d-flex flex-row justify-content-between align-items-center" style={{ borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
              <h5 className="modal-title d-flex flex-row gap-2" style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, flex: '0 0 auto', marginBottom: 0 }}>
                <p style={{ color: 'var(--color-text-secondary)', marginBottom: 0 }}>Edit</p>
                <p style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, flex: '0 0 auto', marginBottom: 0 }}>
                  {plano?.id ? 'Plano de Ação' : 'Novo Plano de Ação'}
                </p>
              </h5>
              <CloseButton onClick={handleCancel} />
            </div>
            <div className="modal-body custom-scrollbar" style={{ padding: 0, paddingBottom: 24, background: 'var(--color-background-primary)', maxHeight: 'calc(90vh - 200px)', overflowY: 'auto' }}>
              <div style={{ padding: '0 24px' }}>
                                <form onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
                  <div style={{ display: 'flex', gap: 16, marginBottom: 16, marginTop: 16 }}>
                    <div style={{ flex: 2 }}>
                      <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', textAlign: 'start' }}>
                        Título
                      </label>
                      <input
                        type="text"
                        value={plano?.titulo || ''}
                        onChange={(e) => setPlano(plano ? { ...plano, titulo: e.target.value } : null)}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid var(--color-border-divider)',
                          borderRadius: 6,
                          fontSize: 14,
                          background: 'var(--color-background-primary)',
                          color: 'var(--color-text-primary)',
                        }}
                        placeholder="Digite o título do plano"
                        required
                      />
                    </div>
                    {plano?.id && (
                      <div style={{ flex: 0, display: 'flex', alignItems: 'end', paddingBottom: 4 }}>
                        <button
                          type="button"
                          onClick={handleDeletePlano}
                          disabled={loading}
                          className="d-flex align-items-center justify-content-center flex-row gap-2"
                          style={{
                            width: 100,
                            height: 32,
                            fontSize: 14,
                            marginBottom: 0,
                            marginTop: 0,
                            borderRadius: 6,
                            fontWeight: 500,
                            background: 'var(--color-background-secondary)',
                            color: 'var(--negative-color)',
                            border: '1.5px solid var(--color-border-divider)',
                            transition: 'background 0.3s, color 0.3s, border 0.3s',
                            cursor: 'pointer',
                          }}
                          onMouseEnter={(e) => {
                            if (!loading) {
                              e.currentTarget.style.background = 'var(--color-background-primary)';
                              e.currentTarget.style.borderColor = 'var(--negative-color)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'var(--color-background-secondary)';
                            e.currentTarget.style.borderColor = 'var(--color-border-divider)';
                          }}
                          title="Deletar Plano de Ação"
                        >
                          <i className="bi bi-trash" />
                          <span style={{ fontSize: 14, fontWeight: 500 }}>Deletar</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                    <div style={{ flex: 2 }}>
                      <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', textAlign: 'start' }}>
                        Descrição
                      </label>
                      <textarea
                        value={plano?.descricao || ''}
                        onChange={(e) => setPlano(plano ? { ...plano, descricao: e.target.value } : null)}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid var(--color-border-divider)',
                          borderRadius: 6,
                          fontSize: 14,
                          background: 'var(--color-background-primary)',
                          color: 'var(--color-text-primary)',
                          minHeight: 100,
                          resize: 'vertical',
                        }}
                        placeholder="Digite a descrição do plano"
                        rows={4}
                      />
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', textAlign: 'start' }}>
                          Data de Início
                        </label>
                        <input
                          type="date"
                          value={plano?.data_inicio || ''}
                          onChange={(e) => setPlano(plano ? { ...plano, data_inicio: e.target.value } : null)}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            border: '1px solid var(--color-border-divider)',
                            borderRadius: 6,
                            fontSize: 14,
                            background: 'var(--color-background-primary)',
                            color: 'var(--color-text-primary)',
                          }}
                          required
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', textAlign: 'start' }}>
                          Data de Fim
                        </label>
                        <input
                          type="date"
                          value={plano?.data_fim || ''}
                          disabled
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            border: '1px solid var(--color-border-divider)',
                            borderRadius: 6,
                            fontSize: 14,
                            background: 'var(--color-background-secondary)',
                            color: 'var(--color-text-secondary)',
                            cursor: 'not-allowed',
                          }}
                          title="Data calculada automaticamente baseada nas ações"
                        />
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <label style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', textAlign: 'start' }}>
                        Ações
                      </label>
                      <button
                        type="button"
                        onClick={addAcao}
                        className="d-flex align-items-center justify-content-center flex-row gap-2"
                        style={{
                          width: 140,
                          height: 32,
                          fontSize: 14,
                          marginBottom: 0,
                          marginTop: 0,
                          borderRadius: 6,
                          fontWeight: 500,
                          background: 'var(--color-background-secondary)',
                          color: 'var(--positive-color)',
                          border: '1.5px solid var(--color-border-divider)',
                          transition: 'background 0.3s, color 0.3s, border 0.3s',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--color-background-primary)';
                          e.currentTarget.style.borderColor = 'var(--positive-color)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'var(--color-background-secondary)';
                          e.currentTarget.style.borderColor = 'var(--color-border-divider)';
                        }}
                      >
                        <i className="bi bi-plus" />
                        <span>Adicionar Ação</span>
                      </button>
                    </div>
                    
                    {plano?.acoes.map((acao, index) => {
                      const erroAcao = validarIncompatibilidadeStatusData(acao, plano?.data_inicio || '');
                      const realStatus = getActionStatus(acao);
                      const isOverdue = realStatus === 'Overdue';
                      
                      return (
                        <div key={acao.id} style={{ 
                          border: '1px solid var(--color-border-divider)', 
                          borderRadius: 6, 
                          padding: 12, 
                          marginBottom: 12,
                          background: 'var(--color-background-secondary)'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                              Ação {index + 1}
                            </h4>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {erroAcao && (
                                <div style={{
                                  background: 'rgba(220,53,69,0.12)',
                                  color: '#dc3545',
                                  border: '1px solid #dc3545',
                                  borderRadius: 4,
                                  padding: '4px 8px',
                                  fontSize: 11,
                                  textAlign: 'center',
                                  maxWidth: 400,
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                                title={erroAcao}
                                >
                                  {erroAcao}
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => removeAcao(index)}
                                disabled={isOverdue}
                                className="d-flex align-items-center justify-content-center flex-row gap-2"
                                style={{
                                  width: 100,
                                  height: 32,
                                  fontSize: 14,
                                  marginBottom: 0,
                                  marginTop: 0,
                                  borderRadius: 6,
                                  fontWeight: 500,
                                  background: isOverdue ? 'var(--color-background-secondary)' : 'var(--color-background-secondary)',
                                  color: isOverdue ? 'var(--color-text-secondary)' : 'var(--negative-color)',
                                  border: '1.5px solid var(--color-border-divider)',
                                  transition: 'background 0.3s, color 0.3s, border 0.3s',
                                  cursor: isOverdue ? 'not-allowed' : 'pointer',
                                  opacity: isOverdue ? 0.5 : 1,
                                }}
                                onMouseEnter={(e) => {
                                  if (!isOverdue) {
                                    e.currentTarget.style.background = 'var(--color-background-primary)';
                                    e.currentTarget.style.borderColor = 'var(--negative-color)';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!isOverdue) {
                                    e.currentTarget.style.background = 'var(--color-background-secondary)';
                                    e.currentTarget.style.borderColor = 'var(--color-border-divider)';
                                  }
                                }}
                              >
                                <i className="bi bi-trash" />
                                <span>Remover</span>
                              </button>
                            </div>
                          </div>
                          
                          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 8 }}>
                            <div>
                              <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--color-text-secondary)', textAlign: 'start' }}>
                                Título
                              </label>
                              <input
                                type="text"
                                value={acao.titulo}
                                onChange={(e) => updateAcao(index, { titulo: e.target.value })}
                                disabled={isOverdue}
                                style={{
                                  width: '100%',
                                  padding: '6px 12px',
                                  border: '1px solid var(--color-border-divider)',
                                  borderRadius: 4,
                                  fontSize: 12,
                                  background: isOverdue ? 'var(--color-background-secondary)' : 'var(--color-background-primary)',
                                  color: isOverdue ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
                                  cursor: isOverdue ? 'not-allowed' : 'auto',
                                  height: '32px',
                                  boxSizing: 'border-box',
                                }}
                                placeholder="Título da ação"
                              />
                            </div>
                            <div>
                              <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--color-text-secondary)', textAlign: 'start' }}>
                                Responsável
                              </label>
                              <div style={{
                                border: '1px solid var(--color-border-divider)',
                                borderRadius: 4,
                                background: isOverdue ? 'var(--color-background-secondary)' : 'var(--color-background-primary)',
                                padding: '6px 12px',
                                height: '32px',
                                display: 'flex',
                                alignItems: 'center',
                              }}>
                                <select
                                  value={acao.responsavel}
                                  onChange={(e) => updateAcao(index, { responsavel: e.target.value })}
                                  disabled={isOverdue}
                                  style={{
                                    width: '100%',
                                    border: 'none',
                                    fontSize: 12,
                                    background: 'transparent',
                                    color: isOverdue ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
                                    cursor: isOverdue ? 'not-allowed' : 'auto',
                                    outline: 'none',
                                  }}
                                  onFocus={(e) => {
                                    e.target.style.backgroundColor = 'var(--color-background-primary)';
                                  }}
                                  onBlur={(e) => {
                                    e.target.style.backgroundColor = 'transparent';
                                  }}
                                >
                                  <option value="">Select responsible</option>
                                  <option value="Ananda">Ananda</option>
                                  <option value="Dário">Dário</option>
                                  <option value="Diego">Diego</option>
                                  <option value="Eddy">Eddy</option>
                                  <option value="Eleana">Eleana</option>
                                  <option value="Felipe">Felipe</option>
                                  <option value="Guilherme">Guilherme</option>
                                  <option value="Ítalo">Ítalo</option>
                                  <option value="Josimar">Josimar</option>
                                  <option value="Leonardo">Leonardo</option>
                                  <option value="Paula">Paula</option>
                                  <option value="Thiago">Thiago</option>
                                  <option value="Victor Paiva">Victor Paiva</option>
                                  <option value="Vinicius">Vinicius</option>
                                  <option value="Vitor Bitencourt">Vitor Bitencourt</option>
                                  <option value="Williana">Williana</option>
                                </select>
                              </div>
                            </div>
                          </div>
                          
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'start' }}>
                              <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--color-text-secondary)', textAlign: 'start' }}>
                                Status
                              </label>
                              <div style={{
                                border: '1px solid var(--color-border-divider)',
                                borderRadius: 4,
                                background: isOverdue ? 'var(--color-background-secondary)' : 'var(--color-background-primary)',
                                padding: '6px 12px',
                                width: '150px',
                                height: '32px',
                                display: 'flex',
                                alignItems: 'center',
                              }}>
                                <select
                                  value={realStatus}
                                  onChange={(e) => updateAcao(index, { status: e.target.value })}
                                  disabled={isOverdue}
                                  style={{
                                    width: '100%',
                                    border: 'none',
                                    fontSize: 12,
                                    background: 'transparent',
                                    color: isOverdue ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
                                    cursor: isOverdue ? 'not-allowed' : 'auto',
                                    outline: 'none',
                                  }}
                                  onFocus={(e) => {
                                    e.target.style.backgroundColor = 'var(--color-background-primary)';
                                  }}
                                  onBlur={(e) => {
                                    e.target.style.backgroundColor = 'transparent';
                                  }}
                                  title={isOverdue ? 'Status alterado automaticamente pelo sistema' : ''}
                                >
                                  <option value="">Selecione</option>
                                  <option value="Pending">Pending</option>
                                  <option value="Done">Done</option>
                                  {isOverdue && <option value="Overdue" disabled>Overdue</option>}
                                </select>
                              </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'end' }}>
                              <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--color-text-secondary)', textAlign: 'start', marginRight: '89.87px' }}>
                                Data Limite
                              </label>
                              <input
                                type="date"
                                value={acao.data_limite}
                                onChange={(e) => updateAcao(index, { data_limite: e.target.value })}
                                disabled={isOverdue}
                                style={{
                                  width: '150px',
                                  padding: '6px 12px',
                                  border: '1px solid var(--color-border-divider)',
                                  borderRadius: 4,
                                  fontSize: 12,
                                  background: isOverdue ? 'var(--color-background-secondary)' : 'var(--color-background-primary)',
                                  color: isOverdue ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
                                  cursor: isOverdue ? 'not-allowed' : 'auto',
                                  height: '32px',
                                  boxSizing: 'border-box',
                                }}
                                title={isOverdue ? 'Data limite não pode ser alterada para ações atrasadas' : ''}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </form>
              </div>
            </div>
            <div className="modal-footer" style={{ borderTop: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
              <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'end',
                minHeight: 39,
                margin: 0,
                transition: 'opacity 0.5s ease-in-out, transform 0.5s ease-in-out',
                opacity: feedback ? 1 : 0,
                transform: feedback ? 'translateY(0)' : 'translateY(-10px)',
                pointerEvents: feedback ? ('auto' as React.CSSProperties['pointerEvents']) : ('none' as React.CSSProperties['pointerEvents']),
              }}>
                {feedback ? <Feedback message={feedback.message} type={feedback.type} /> : null}
              </div>
              <button type="button" className="btn btn-primary" onClick={handleSave} disabled={loading} style={{ borderRadius: 6, fontWeight: 500, minWidth: 90 }}>{loading ? 'Salvando...' : 'Salvar'}</button>
              <button type="button" className="btn btn-secondary" onClick={handleCancel} style={{ borderRadius: 6, fontWeight: 500, minWidth: 90 }}>Cancelar</button>
            </div>
          </div>
        </div>
        <div className="modal-backdrop fade show" style={{ zIndex: 9999 }}></div>
      </div>
    </>,
    document.body
  );
};

export default PlanoAcaoModal; 