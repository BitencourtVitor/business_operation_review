import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../supabaseClient';
import CloseButton from '../../utils/CloseButton';

// Interface para Oportunidade do timesheet
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
  descricao?: string;
  impacto?: string;
  prioridade?: string;
  status?: string;
  valor_estimado?: number;
  prazo?: string;
  responsavel?: string;
  usuario_nome?: string; // Nome do usuário que criou a oportunidade
}

interface OportunidadeModalProps {
  show: boolean;
  onClose: () => void;
  data: Oportunidade | null;
  onSaved?: () => void;
  anoSelecionado?: string;
  mesSelecionado?: string;
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

// Dicionário para meses por extenso em inglês
const monthNamesEn: Record<string, string> = {
  "01": "January", "02": "February", "03": "March", "04": "April",
  "05": "May", "06": "June", "07": "July", "08": "August",
  "09": "September", "10": "October", "11": "November", "12": "December"
};

const OportunidadeModal: React.FC<OportunidadeModalProps> = ({ show, onClose, data, onSaved, anoSelecionado = '', mesSelecionado = '' }) => {
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Auto-hide feedback após 5 segundos
  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => {
        setFeedback(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  // Estados para múltiplas oportunidades
  const [oportunidadesList, setOportunidadesList] = useState<Oportunidade[]>([]);
  const [currentOportunidadeIdx, setCurrentOportunidadeIdx] = useState(0);

  // Estados locais para edição
  const [oportunidade, setOportunidade] = useState<Oportunidade | null>(
    data
      ? {
          ...data,
          desafios: data.desafios ?? [],
          melhorias: data.melhorias ?? [],
        }
      : null
  );

  // Adicionar estados locais para mês e ano
  const [mes, setMes] = useState(oportunidade ? oportunidade.mes : '');
  const [ano, setAno] = useState(oportunidade ? oportunidade.ano : '');

  // Controle de transição
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

  // Atualizar estados quando o modal abre
  useEffect(() => {
    if (show) {
      if (data) {
        setOportunidade(data);
        setMes(data.mes);
        setAno(data.ano);
      } else {
        // Para novos registros, usar os valores selecionados
        setOportunidade({
          id: '',
          usuario_id: '',
          tela_id: '',
          mes: mesSelecionado,
          ano: anoSelecionado,
          titulo: '',
          criado_em: new Date().toISOString(),
          desafios: [],
          melhorias: []
        });
        setMes(mesSelecionado);
        setAno(anoSelecionado);
      }
    }
  }, [show, data, mesSelecionado, anoSelecionado]);

  // Carregar todas as oportunidades do mesmo mês/ano/tela/usuário ao abrir modal
  useEffect(() => {
    async function fetchOportunidadesList() {
      if (!data) return;
      const op = data;
      // Busca todas as oportunidades do mesmo usuário, tela, mês e ano
      const { data: ops } = await supabase
        .from('oportunidades')
        .select('*')
        .eq('usuario_id', op.usuario_id)
        .eq('tela_id', op.tela_id)
        .eq('mes', op.mes)
        .eq('ano', op.ano)
        .order('criado_em', { ascending: true });
      if (ops && ops.length > 0) {
        // Para cada oportunidade, busca desafios/melhorias e nome do usuário
        const opsCompletas = await Promise.all(ops.map(async (o: Oportunidade) => {
          const { data: desafios } = await supabase.from('desafios').select('texto').eq('oportunidade_id', o.id);
          const { data: melhorias } = await supabase.from('melhorias').select('texto').eq('oportunidade_id', o.id);
          const { data: usuario } = await supabase.from('usuarios').select('nome_completo').eq('id', o.usuario_id).single();
          return {
            ...o,
            desafios: (desafios || []).map(d => d.texto),
            melhorias: (melhorias || []).map(m => m.texto),
            usuario_nome: usuario?.nome_completo || `Admin ${o.usuario_id.slice(0, 8)}...`
          };
        }));
        setOportunidadesList(opsCompletas);
        // Seleciona a oportunidade atual pelo id
        const idx = opsCompletas.findIndex(o => o.id === op.id);
        setCurrentOportunidadeIdx(idx >= 0 ? idx : 0);
        setOportunidade(opsCompletas[idx >= 0 ? idx : 0]);
        // Sincronizar mes e ano
        setMes(op.mes);
        setAno(op.ano);
      } else {
        setOportunidadesList([op]);
        setCurrentOportunidadeIdx(0);
        setOportunidade({ ...op, desafios: [], melhorias: [] });
        // Sincronizar mes e ano
        setMes(op.mes);
        setAno(op.ano);
      }
    }
    if (data && show) fetchOportunidadesList();
  }, [show, data]);

  // Resetar ao abrir/fechar
  useEffect(() => {
    setFeedback(null);
    setLoading(false);
    // Só resetar a oportunidade se não houver dados ou se o modal estiver fechando
    if (!data) {
      setOportunidade(null);
    }
  }, [show]);

  // Sincronizar mes e ano sempre que a oportunidade atual mudar
  useEffect(() => {
    if (oportunidade) {
      setMes(oportunidade.mes);
      setAno(oportunidade.ano);
    }
  }, [oportunidade]);

  // Handler para adicionar nova oportunidade
  async function handleAddOportunidade() {
    // Buscar nome do usuário atual
    let usuarioNome = '';
    if (data?.usuario_id) {
      const { data: usuario } = await supabase.from('usuarios').select('nome_completo').eq('id', data.usuario_id).single();
      usuarioNome = usuario?.nome_completo || `Admin ${data.usuario_id.slice(0, 8)}...`;
    }
    
    const nova: Oportunidade = {
      id: '',
      usuario_id: data?.usuario_id || '',
      tela_id: data?.tela_id || '',
      mes: mes,
      ano: ano,
      titulo: '',
      criado_em: new Date().toISOString(),
      desafios: [],
      melhorias: [],
      usuario_nome: usuarioNome
    };
    const novaLista = [...oportunidadesList, nova];
    setOportunidadesList(novaLista);
    setCurrentOportunidadeIdx(novaLista.length - 1);
    setOportunidade({ ...nova, desafios: [], melhorias: [] });
  }

  // Handler para navegar entre oportunidades
  function handleNavigateOportunidade(dir: -1 | 1) {
    const nextIdx = currentOportunidadeIdx + dir;
    if (nextIdx >= 0 && nextIdx < oportunidadesList.length) {
      setCurrentOportunidadeIdx(nextIdx);
      const op = oportunidadesList[nextIdx];
      // Sempre buscar desafios/melhorias e nome do usuário do banco ao navegar
      (async () => {
        const { data: desafios } = await supabase.from('desafios').select('texto').eq('oportunidade_id', op.id);
        const { data: melhorias } = await supabase.from('melhorias').select('texto').eq('oportunidade_id', op.id);
        const { data: usuario } = await supabase.from('usuarios').select('nome_completo').eq('id', op.usuario_id).single();
        setOportunidade({
          ...op,
          desafios: (desafios || []).map(d => d.texto),
          melhorias: (melhorias || []).map(m => m.texto),
          usuario_nome: usuario?.nome_completo || `Admin ${op.usuario_id.slice(0, 8)}...`
        });
      })();
    }
  }

  // Handler para deletar oportunidade
  async function handleDeleteOportunidade() {
    if (!oportunidade) return;
    
    // Confirmação antes de deletar
    if (!window.confirm('Tem certeza que deseja deletar esta oportunidade? Esta ação não pode ser desfeita.')) {
      return;
    }

    setLoading(true);
    setFeedback(null);
    
    try {
      if (oportunidade.id) {
        // Deletar desafios e melhorias primeiro (devido às foreign keys)
        await supabase.from('desafios').delete().eq('oportunidade_id', oportunidade.id);
        await supabase.from('melhorias').delete().eq('oportunidade_id', oportunidade.id);
        
        // Deletar a oportunidade
        const { error } = await supabase.from('oportunidades').delete().eq('id', oportunidade.id);
        if (error) throw error;
        
        // Remover da lista local
        const novaLista = oportunidadesList.filter((_, idx) => idx !== currentOportunidadeIdx);
        setOportunidadesList(novaLista);
        
        if (novaLista.length === 0) {
          // Se não há mais oportunidades, fechar o modal
          setFeedback({ message: 'Oportunidade deletada com sucesso!', type: 'success' });
          setTimeout(() => onClose(), 2000);
        } else {
          // Navegar para a próxima oportunidade ou a anterior
          const novoIdx = currentOportunidadeIdx >= novaLista.length ? novaLista.length - 1 : currentOportunidadeIdx;
          setCurrentOportunidadeIdx(novoIdx);
          
          const op = novaLista[novoIdx];
          const { data: desafios } = await supabase.from('desafios').select('texto').eq('oportunidade_id', op.id);
          const { data: melhorias } = await supabase.from('melhorias').select('texto').eq('oportunidade_id', op.id);
          const { data: usuario } = await supabase.from('usuarios').select('nome_completo').eq('id', op.usuario_id).single();
          setOportunidade({
            ...op,
            desafios: (desafios || []).map(d => d.texto),
            melhorias: (melhorias || []).map(m => m.texto),
            usuario_nome: usuario?.nome_completo || `Admin ${op.usuario_id.slice(0, 8)}...`
          });
          
          setFeedback({ message: 'Oportunidade deletada com sucesso!', type: 'success' });
        }
      } else {
        // Se é uma oportunidade nova (sem ID), apenas remover da lista
        const novaLista = oportunidadesList.filter((_, idx) => idx !== currentOportunidadeIdx);
        setOportunidadesList(novaLista);
        
        if (novaLista.length === 0) {
          setFeedback({ message: 'Oportunidade removida!', type: 'success' });
          setTimeout(() => onClose(), 2000);
        } else {
          const novoIdx = currentOportunidadeIdx >= novaLista.length ? novaLista.length - 1 : currentOportunidadeIdx;
          setCurrentOportunidadeIdx(novoIdx);
          setOportunidade(novaLista[novoIdx]);
          setFeedback({ message: 'Oportunidade removida!', type: 'success' });
        }
      }
      
      if (onSaved) onSaved();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setFeedback({ message: err.message || 'Erro ao deletar oportunidade.', type: 'error' });
      } else {
        setFeedback({ message: 'Erro ao deletar oportunidade.', type: 'error' });
      }
    } finally {
      setLoading(false);
    }
  }

  // Handler para salvar oportunidade (atualiza lista local após salvar)
  async function handleSave() {
    setLoading(true);
    setFeedback(null);
    try {
      if (oportunidade) {
        // Padronizar mês e ano como integer
        const mesDb = Number(mes);
        const anoDb = Number(ano);
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
        const oportunidadeId = oportunidade.id;
        let principal: Oportunidade;
        
        // Se está editando (tem id), manter o usuario_id original
        if (oportunidadeId) {
          // Busca o registro atual da oportunidade
          const { data: registroAtual } = await supabase.from('oportunidades').select('*').eq('id', oportunidadeId).single();
          if (registroAtual) {
            // Manter o usuario_id original do registro
            const usuarioIdOriginal = registroAtual.usuario_id;
            
            // Atualiza apenas campos da oportunidade principal se necessário, mantendo o usuario_id original
            const oportunidadePrincipal = Object.fromEntries(
              Object.entries({ ...oportunidade, usuario_id: usuarioIdOriginal, mes: mesDb, ano: anoDb })
                .filter(([k, v]) => !['desafios', 'melhorias', 'id'].includes(k) && v !== '')
            );
            await supabase.from('oportunidades').update(oportunidadePrincipal).eq('id', oportunidadeId);
            
            // Atualiza desafios e melhorias
            // Busca os desafios e melhorias atuais
            const { data: desafiosAtuais } = await supabase.from('desafios').select('id, texto').eq('oportunidade_id', oportunidadeId);
            const { data: melhoriasAtuais } = await supabase.from('melhorias').select('id, texto').eq('oportunidade_id', oportunidadeId);
            
            // Atualiza desafios
            const novosDesafios = oportunidade.desafios.filter(t => t.trim() !== '');
            const antigosDesafios = (desafiosAtuais || []).map(d => d.texto);
            if (JSON.stringify(novosDesafios) !== JSON.stringify(antigosDesafios)) {
              await supabase.from('desafios').delete().eq('oportunidade_id', oportunidadeId);
              for (const texto of novosDesafios) {
                await supabase.from('desafios').insert([{ oportunidade_id: oportunidadeId, texto }]);
              }
            }
            
            // Atualiza melhorias
            const novasMelhorias = oportunidade.melhorias.filter(t => t.trim() !== '');
            const antigasMelhorias = (melhoriasAtuais || []).map(m => m.texto);
            if (JSON.stringify(novasMelhorias) !== JSON.stringify(antigasMelhorias)) {
              await supabase.from('melhorias').delete().eq('oportunidade_id', oportunidadeId);
              for (const texto of novasMelhorias) {
                await supabase.from('melhorias').insert([{ oportunidade_id: oportunidadeId, texto }]);
              }
            }
            
            principal = { ...oportunidade, id: oportunidadeId, usuario_id: usuarioIdOriginal, mes: String(mesDb), ano: String(anoDb) };
          } else {
            setFeedback({ message: 'Oportunidade não encontrada.', type: 'error' });
            setLoading(false);
            return;
          }
        } else {
          // Insert - verificar se já existe uma oportunidade para QUALQUER usuário responsável pela tela, mês e ano
          // Primeiro, buscar todos os usuários responsáveis pela tela
          const { data: usuariosResponsaveis } = await supabase
            .from('usuarios_telas')
            .select('usuario_id')
            .eq('tela_id', oportunidade.tela_id);
          
          if (usuariosResponsaveis && usuariosResponsaveis.length > 0) {
            const responsaveisIds = usuariosResponsaveis.map(ut => ut.usuario_id);
            
            // Verificar se já existe oportunidade para qualquer usuário responsável
            const { data: existente } = await supabase
              .from('oportunidades')
              .select('id')
              .eq('tela_id', oportunidade.tela_id)
              .eq('mes', mesDb)
              .eq('ano', anoDb)
              .in('usuario_id', responsaveisIds)
              .single();
            
            if (existente) {
              throw new Error('Já existe uma oportunidade para esta tela, mês e ano');
            }
          }
          
          // Insert - usar o usuario_id do responsável pela tela
          // O usuario_id já deve estar correto no objeto oportunidade (definido na página)
          const oportunidadePrincipal = Object.fromEntries(
            Object.entries({ ...oportunidade, mes: mesDb, ano: anoDb })
              .filter(([k, v]) => !['desafios', 'melhorias', 'id'].includes(k) && v !== '')
          );
          const { data: inserted, error } = await supabase.from('oportunidades').insert([oportunidadePrincipal]).select('id').single();
          if (error) throw error;
          const oportunidadeId = inserted.id;
          for (const texto of oportunidade.desafios.filter(t => t.trim() !== '')) {
            await supabase.from('desafios').insert([{ oportunidade_id: oportunidadeId, texto }]);
          }
          for (const texto of oportunidade.melhorias.filter(t => t.trim() !== '')) {
            await supabase.from('melhorias').insert([{ oportunidade_id: oportunidadeId, texto }]);
          }
          principal = { ...oportunidade, id: oportunidadeId, mes: String(mesDb), ano: String(anoDb) };
        }
        // Atualiza lista local
        const novaLista = oportunidadesList.slice();
        // Buscar nome do usuário para atualizar a lista local
        const { data: usuario } = await supabase.from('usuarios').select('nome_completo').eq('id', principal.usuario_id).single();
        const principalComNome = {
          ...principal,
          usuario_nome: usuario?.nome_completo || `Admin ${principal.usuario_id.slice(0, 8)}...`
        };
        novaLista[currentOportunidadeIdx] = principalComNome;
        setOportunidadesList(novaLista);
        setOportunidade(principalComNome);
        setFeedback({ message: 'Oportunidade salva com sucesso!', type: 'success' });
        if (onSaved) onSaved();
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
    onClose();
  }



  if (!visible) return null;

    return createPortal(
    <>
      <div className={`modal fade show custom-modal-anim${isClosing ? ' closing' : ''}`} tabIndex={-1} style={{ display: 'block', zIndex: 9999 }}>
        <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 700 }}>
          <div className="modal-content" style={{ background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', border: '1.5px solid var(--color-border-divider)', zIndex: 10000, position: 'relative' }}>
            <div className="modal-header px-4 py-2 d-flex flex-row justify-content-between align-items-center" style={{ borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
              <h5 className="modal-title d-flex flex-row gap-2" style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, flex: '0 0 auto', marginBottom: 0 }}>
                <p style={{ color: 'var(--color-text-secondary)', marginBottom: 0 }}>Edit</p>
                <p style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, flex: '0 0 auto', marginBottom: 0 }}>Oportunidade</p>
              </h5>
              <CloseButton onClick={handleCancel} />
            </div>
            <div className="modal-body" style={{ padding: 0, paddingBottom: 24, background: 'var(--color-background-primary)' }}>
              <div>
                <div className="d-flex flex-row gap-4 align-items-center" style={{ marginBottom: 16, borderBottom: '1px solid var(--color-border-divider)' }}>
                  <h4 className="form-label mb-0 ms-4" style={{ color: 'var(--color-text-secondary)', fontWeight: 400, fontSize: 16 }}>Selected Period</h4>
                  <span style={{ display: 'flex', alignItems: 'center', background: 'transparent', color: 'var(--color-text-primary)', height: 38, fontSize: 16, fontWeight: 400 }}>
                    {(monthNamesEn[mes] || mes) + ' / ' + ano}
                  </span>
                </div>
                
                {/* Controles de navegação e adição - logo acima do título */}
                <div className="d-flex flex-row justify-content-between align-items-center" style={{ marginBottom: 16, padding: '0 16px' }}>
                  {/* Botões de ação à esquerda */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button 
                      type="button" 
                      className="d-flex align-items-center justify-content-center flex-row gap-1" 
                      onClick={handleAddOportunidade} 
                      style={{ 
                        width: 180, 
                        height: 32, 
                        fontSize: 14, 
                        marginBottom: 0, 
                        marginTop: 0,
                        borderRadius: 6,
                        fontWeight: 500,
                        background: 'var(--color-background-secondary)',
                        color: 'var(--positive-color)',
                        border: '1.5px solid var(--color-border-divider)',
                        transition: 'background 0.3s, color 0.3s, border 0.3s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--color-background-primary)';
                        e.currentTarget.style.borderColor = 'var(--positive-color)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'var(--color-background-secondary)';
                        e.currentTarget.style.borderColor = 'var(--color-border-divider)';
                      }}
                      title="Nova Oportunidade"
                    >
                      <i className="bi bi-plus" />
                      <span>Nova Oportunidade</span>
                    </button>
                    <button 
                      type="button" 
                      className="d-flex align-items-center justify-content-center flex-row gap-2" 
                      onClick={handleDeleteOportunidade} 
                      disabled={loading}
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
                        transition: 'background 0.3s, color 0.3s, border 0.3s'
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
                      title="Deletar Oportunidade"
                    >
                      <i className="bi bi-trash" />
                      <span style={{ fontSize: 14, fontWeight: 500 }}>Deletar</span>
                    </button>
                  </div>
                  
                  {/* Navegação à direita */}
                  {oportunidadesList.length > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button 
                        type="button" 
                        className="d-flex align-items-center justify-content-center" 
                        onClick={() => handleNavigateOportunidade(-1)} 
                        disabled={currentOportunidadeIdx === 0}
                        style={{ 
                          width: 36, 
                          height: 32, 
                          fontSize: 14, 
                          marginBottom: 0, 
                          marginTop: 0,
                          borderRadius: 6,
                          fontWeight: 500,
                          background: currentOportunidadeIdx === 0 ? 'var(--color-background-primary)' : 'var(--color-background-secondary)',
                          color: currentOportunidadeIdx === 0 ? 'var(--color-text-secondary)' : 'var(--color-accent-primary)',
                          border: '1.5px solid var(--color-border-divider)',
                          transition: 'background 0.3s, color 0.3s, border 0.3s',
                          opacity: currentOportunidadeIdx === 0 ? 0.5 : 1,
                          cursor: currentOportunidadeIdx === 0 ? 'not-allowed' : 'pointer'
                        }}
                        onMouseEnter={(e) => {
                          if (currentOportunidadeIdx !== 0) {
                            e.currentTarget.style.background = 'var(--color-background-primary)';
                            e.currentTarget.style.borderColor = 'var(--color-accent-primary)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = currentOportunidadeIdx === 0 ? 'var(--color-background-primary)' : 'var(--color-background-secondary)';
                          e.currentTarget.style.borderColor = 'var(--color-border-divider)';
                        }}
                        title="Oportunidade Anterior"
                      >
                        <i className="bi bi-arrow-left-short" />
                      </button>
                      <span style={{ fontWeight: 500, fontSize: 14, color: 'var(--color-text-secondary)' }}>
                        Oportunidade {currentOportunidadeIdx + 1} de {oportunidadesList.length}
                      </span>
                      <button 
                        type="button" 
                        className="d-flex align-items-center justify-content-center" 
                        onClick={() => handleNavigateOportunidade(1)} 
                        disabled={currentOportunidadeIdx === oportunidadesList.length - 1}
                        style={{ 
                          width: 36, 
                          height: 32, 
                          fontSize: 14, 
                          marginBottom: 0, 
                          marginTop: 0,
                          borderRadius: 6,
                          fontWeight: 500,
                          background: currentOportunidadeIdx === oportunidadesList.length - 1 ? 'var(--color-background-primary)' : 'var(--color-background-secondary)',
                          color: currentOportunidadeIdx === oportunidadesList.length - 1 ? 'var(--color-text-secondary)' : 'var(--color-accent-primary)',
                          border: '1.5px solid var(--color-border-divider)',
                          transition: 'background 0.3s, color 0.3s, border 0.3s',
                          opacity: currentOportunidadeIdx === oportunidadesList.length - 1 ? 0.5 : 1,
                          cursor: currentOportunidadeIdx === oportunidadesList.length - 1 ? 'not-allowed' : 'pointer'
                        }}
                        onMouseEnter={(e) => {
                          if (currentOportunidadeIdx !== oportunidadesList.length - 1) {
                            e.currentTarget.style.background = 'var(--color-background-primary)';
                            e.currentTarget.style.borderColor = 'var(--color-accent-primary)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = currentOportunidadeIdx === oportunidadesList.length - 1 ? 'var(--color-background-primary)' : 'var(--color-background-secondary)';
                          e.currentTarget.style.borderColor = 'var(--color-border-divider)';
                        }}
                        title="Próxima Oportunidade"
                      >
                        <i className="bi bi-arrow-right-short" />
                      </button>
                    </div>
                  )}
                </div>
                
                <div style={{ padding: '0 16px', marginBottom: 16 }}>
                  <label className="form-label mb-2" style={{ color: 'var(--color-text-secondary)', fontWeight: 500, fontSize: 14, textAlign: 'start', display: 'block' }}>Título da Oportunidade</label>
                  <input 
                    className="form-control" 
                    value={oportunidade?.titulo || ''} 
                    onChange={e => setOportunidade(oportunidade ? { ...oportunidade, titulo: e.target.value } : null)} 
                    style={{ 
                      borderRadius: 6, 
                      background: 'var(--color-background-primary)', 
                      color: 'var(--color-text-primary)', 
                      border: '1px solid var(--color-border-divider)', 
                      fontSize: 14, 
                      padding: '8px 12px' 
                    }}
                    placeholder="Digite o título da oportunidade"
                  />
                </div>
                <div className="d-flex flex-row gap-2 w-100 px-3">
                  <div className="d-flex flex-column gap-1" style={{ flex: 1 }}>
                    <label className="form-label mb-0" style={{ color: 'var(--challenges-color)', fontWeight: 500, textAlign: 'start', display: 'block' }}>Desafios</label>
                    <textarea 
                      className="form-control textarea-challenges" 
                      rows={5} 
                      value={oportunidade?.desafios?.join('\n') || ''} 
                      onChange={e => setOportunidade(oportunidade ? { ...oportunidade, desafios: e.target.value.split('\n') } : null)} 
                      style={{ 
                        marginBottom: 12, 
                        borderRadius: 6, 
                        background: 'var(--color-background-primary)', 
                        color: 'var(--color-text-primary)', 
                        border: '1px solid var(--color-border-divider)', 
                        fontSize: 14, 
                        padding: '8px' 
                      }}
                      placeholder="Digite os desafios identificados"
                    />
                  </div>
                  <div className="d-flex flex-column gap-1" style={{ flex: 1 }}>
                    <label className="form-label mb-0" style={{ color: 'var(--improvements-color)', fontWeight: 500, textAlign: 'start', display: 'block' }}>Melhorias</label>
                    <textarea 
                      className="form-control textarea-improvements" 
                      rows={5} 
                      value={oportunidade?.melhorias?.join('\n') || ''} 
                      onChange={e => setOportunidade(oportunidade ? { ...oportunidade, melhorias: e.target.value.split('\n') } : null)} 
                      style={{ 
                        marginBottom: 12, 
                        borderRadius: 6, 
                        background: 'var(--color-background-primary)', 
                        color: 'var(--color-text-primary)', 
                        border: '1px solid var(--color-border-divider)', 
                        fontSize: 14, 
                        padding: '8px' 
                      }}
                      placeholder="Digite as melhorias propostas"
                    />
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: -8, marginBottom: 8, padding: '0 16px' }}>
                  <p style={{ margin: 0, lineHeight: 1.4, textAlign: 'start' }}>
                    <strong>Formatting:</strong> Use *text* for <em>italic</em>, **text** for <strong>bold</strong>, and ***text*** for <strong><em>bold italic</em></strong>.
                  </p>
                  <p style={{ margin: '4px 0 0 0', lineHeight: 1.4, textAlign: 'start' }}>
                    <strong>Important:</strong> Each line represents a different topic. Press Enter to add a new item.
                  </p>
                </div>
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
              <button type="button" className="btn btn-primary" onClick={handleSave} disabled={loading} style={{ borderRadius: 6, fontWeight: 500, minWidth: 90 }}>Salvar</button>
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

export default OportunidadeModal; 