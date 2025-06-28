import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
// Remover: import './modal-animations.css';
// Remover: import * as Dialog from '@radix-ui/react-dialog';

// Importantos compartilhados (copiados do timesheet_analysis)
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
interface Acao {
  id: string;
  plano_id: string;
  titulo: string;
  responsavel: string;
  status: string;
  data_limite: string;
}

type ModalType = 'destaque' | 'oportunidade' | 'plano';

type ModalProps = {
  show: boolean;
  onClose: () => void;
  type: ModalType;
  data: Destaque | Oportunidade | PlanoAcao | null;
  onSaved?: () => void;
  anoSelecionado?: string;
  mesSelecionado?: string;
};

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

const Modal: React.FC<ModalProps> = (props) => {
  const { show, onClose, type, data, onSaved, anoSelecionado = '', mesSelecionado = '' } = props;
  // DEBUG: props principais
  console.log('[MODAL DEBUG] Renderizando Modal | show:', show, '| type:', type, '| data:', data);

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

  // --- NOVO: Estados para múlImportantlas oportunidades ---
  const [oportunidadesList, setOportunidadesList] = useState<Oportunidade[]>([]);
  const [currentOportunidadeIdx, setCurrentOportunidadeIdx] = useState(0);

  // Estados locais para edição
  const [destaque, setDestaque] = useState<Destaque | null>(type === 'destaque' && data ? data as Destaque : null);
  const [oportunidade, setOportunidade] = useState<Oportunidade | null>(
    type === 'oportunidade' && data
      ? {
          ...data as Oportunidade,
          desafios: (data as Oportunidade).desafios ?? [],
          melhorias: (data as Oportunidade).melhorias ?? [],
        }
      : null
  );
  const [plano, setPlano] = useState<PlanoAcao | null>(type === 'plano' && data ? data as PlanoAcao : null);
  const [originalPlano, setOriginalPlano] = useState<PlanoAcao | null>(type === 'plano' && data ? JSON.parse(JSON.stringify(data)) as PlanoAcao : null);

  // Adicionar estados locais para mês e ano
  const [mes, setMes] = useState(destaque ? destaque.mes : (oportunidade ? oportunidade.mes : ''));
  const [ano, setAno] = useState(destaque ? destaque.ano : (oportunidade ? oportunidade.ano : ''));

  // --- NOVO: Controle de transição ---
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
      }, 250); // tempo igual ao CSS
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  React.useEffect(() => {
    if (type === 'oportunidade' && oportunidade) {
      console.log('[DEBUG MODAL] Estado local oportunidade:', oportunidade);
      console.log('[DEBUG MODAL] Estado local desafios:', oportunidade.desafios, '| melhorias:', oportunidade.melhorias);
    }
  }, [oportunidade, type]);

  // --- NOVO: Carregar todas as oportunidades do mesmo mês/ano/tela/usuário ao abrir modal ---
  React.useEffect(() => {
    async function fetchOportunidadesList() {
      if (type !== 'oportunidade' || !data) return;
      const op = data as Oportunidade;
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
        // Para cada oportunidade, busca desafios/melhorias
        const opsCompletas = await Promise.all(ops.map(async (o: Oportunidade) => {
          const { data: desafios } = await supabase.from('desafios').select('texto').eq('oportunidade_id', o.id);
          const { data: melhorias } = await supabase.from('melhorias').select('texto').eq('oportunidade_id', o.id);
          return {
            ...o,
            desafios: (desafios || []).map(d => d.texto),
            melhorias: (melhorias || []).map(m => m.texto),
          };
        }));
        setOportunidadesList(opsCompletas);
        // Seleciona a oportunidade atual pelo id
        const idx = opsCompletas.findIndex(o => o.id === op.id);
        setCurrentOportunidadeIdx(idx >= 0 ? idx : 0);
        setOportunidade(opsCompletas[idx >= 0 ? idx : 0]);
      } else {
        setOportunidadesList([op]);
        setCurrentOportunidadeIdx(0);
        setOportunidade({ ...op, desafios: [], melhorias: [] });
      }
    }
    if (type === 'oportunidade' && data) fetchOportunidadesList();
  }, [show, type, data]);

  // Ao abrir o modal OU ao trocar o destaque em edição, setar mês/ano do destaque ou do período selecionado
  React.useEffect(() => {
    if (type === 'destaque' && show) {
      console.log('[DEBUG MODAL] data:', data, 'mesSelecionado:', mesSelecionado, 'anoSelecionado:', anoSelecionado);
      if (data && (data as Destaque).mes && (data as Destaque).ano) {
        setMes(String((data as Destaque).mes).padStart(2, '0'));
        setAno(String((data as Destaque).ano));
      } else {
        setMes(mesSelecionado || '');
        setAno(anoSelecionado || '');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, type, data?.id, mesSelecionado, anoSelecionado]);

  // Atualizar objeto destaque ao mudar mês/ano
  React.useEffect(() => {
    if (type === 'destaque' && destaque) {
      setDestaque({ ...destaque, mes, ano });
    }
  }, [mes, ano]);

  // Resetar ao abrir/fechar
  React.useEffect(() => {
    setFeedback(null);
    setLoading(false);
    setDestaque(type === 'destaque' && data ? data as Destaque : null);
    setOportunidade(
      type === 'oportunidade' && data
        ? {
            ...data as Oportunidade,
            desafios: (data as Oportunidade).desafios ?? [],
            melhorias: (data as Oportunidade).melhorias ?? [],
          }
        : null
    );
    setPlano(type === 'plano' && data ? data as PlanoAcao : null);
    setOriginalPlano(type === 'plano' && data ? JSON.parse(JSON.stringify(data)) as PlanoAcao : null);
    if (type === 'oportunidade' && data) {
      setOportunidadesList([data as Oportunidade]);
      setCurrentOportunidadeIdx(0);
    }
    
    // Debug para plano
    if (type === 'plano' && data) {
      console.log('[DEBUG MODAL] Plano recebido no modal:', data);
      console.log('[DEBUG MODAL] usuario_id do plano:', (data as PlanoAcao).usuario_id);
    }
  }, [show, type, data]);

  // Carregar ações quando um plano existente for aberto
  React.useEffect(() => {
    async function fetchPlanoAcoes() {
      if (type !== 'plano' || !data || !(data as PlanoAcao).id) return;
      const planoData = data as PlanoAcao;
      // Buscar ações do plano
      const { data: acoesData } = await supabase
        .from('acoes')
        .select('*')
        .eq('plano_id', planoData.id)
        .order('data_limite', { ascending: true });
      
      if (acoesData) {
        const planoComAcoes = {
          ...planoData,
          acoes: acoesData,
        };
        setPlano(planoComAcoes);
        setOriginalPlano(JSON.parse(JSON.stringify(planoComAcoes)));
      }
    }
    if (type === 'plano' && data && (data as PlanoAcao).id) {
      fetchPlanoAcoes();
    }
  }, [show, type, data]);

  if (!visible) return null;

  // Adicionar/remover ações
  function addAcao() {
    if (!plano) return;
    const newId = 'temp_' + Math.random().toString(36).slice(2);
    console.log('[DEBUG MODAL] Adicionando nova ação com ID temporário:', newId);
    const newAcao: Acao = {
      id: newId,
      plano_id: plano.id,
      titulo: '',
      responsavel: '',
      status: '',
      data_limite: '',
    };
    setPlano({ ...plano, acoes: [...plano.acoes, newAcao] });
  }
  
  function removeAcao(acaoIdx: number) {
    if (!plano) return;
    const newAcoes = plano.acoes.slice();
    newAcoes.splice(acaoIdx, 1);
    setPlano({ ...plano, acoes: newAcoes });
  }

  // Função para atualizar ação e limpar data limite se status for Done
  function updateAcao(acaoIdx: number, updates: Partial<Acao>) {
    if (!plano) return;
    const newAcoes = plano.acoes.slice();
    const acaoAtual = newAcoes[acaoIdx];
    
    // Remover a lógica que limpa a data limite quando status é Done
    // Agora ações Done também podem ter data limite (desde que não seja superior a hoje)
    
    newAcoes[acaoIdx] = { ...acaoAtual, ...updates };
    setPlano({ ...plano, acoes: newAcoes });
  }

  // Detectar alterações para confirmação ao cancelar
  function hasPlanoChanged() {
    if (!plano || !originalPlano) return false;
    
    const changed = JSON.stringify(plano) !== JSON.stringify(originalPlano);
    console.log('[DEBUG MODAL] hasPlanoChanged:', changed);
    if (changed) {
      console.log('[DEBUG MODAL] Plano atual:', JSON.stringify(plano, null, 2));
      console.log('[DEBUG MODAL] Plano original:', JSON.stringify(originalPlano, null, 2));
    }
    return changed;
  }

  // Handler para adicionar nova oportunidade
  function handleAddOportunidade() {
    if (type !== 'oportunidade') return;
    const nova: Oportunidade = {
      id: '',
      usuario_id: oportunidade?.usuario_id || '',
      tela_id: oportunidade?.tela_id || '',
      mes: oportunidade?.mes || '',
      ano: oportunidade?.ano || '',
      titulo: '',
      criado_em: new Date().toISOString(),
      desafios: [],
      melhorias: [],
    };
    setOportunidadesList([...oportunidadesList, nova]);
    setCurrentOportunidadeIdx(oportunidadesList.length);
    setOportunidade({ ...nova, desafios: [], melhorias: [] });
  }

  // Handler para navegar entre oportunidades
  function handleNavigateOportunidade(dir: -1 | 1) {
    if (type !== 'oportunidade') return;
    const nextIdx = currentOportunidadeIdx + dir;
    if (nextIdx >= 0 && nextIdx < oportunidadesList.length) {
      setCurrentOportunidadeIdx(nextIdx);
      const op = oportunidadesList[nextIdx];
      // Sempre buscar desafios/melhorias do banco ao navegar
      (async () => {
        const { data: desafios } = await supabase.from('desafios').select('texto').eq('oportunidade_id', op.id);
        const { data: melhorias } = await supabase.from('melhorias').select('texto').eq('oportunidade_id', op.id);
        setOportunidade({
          ...op,
          desafios: (desafios || []).map(d => d.texto),
          melhorias: (melhorias || []).map(m => m.texto),
        });
      })();
    }
  }

  // Handler para deletar oportunidade
  async function handleDeleteOportunidade() {
    if (type !== 'oportunidade' || !oportunidade) return;
    
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
          setOportunidade({
            ...op,
            desafios: (desafios || []).map(d => d.texto),
            melhorias: (melhorias || []).map(m => m.texto),
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
  async function handleSaveOportunidade() {
    setLoading(true);
    setFeedback(null);
    try {
      if (!oportunidade) return;
      const mesDb = Number(oportunidade.mes);
      const anoDb = Number(oportunidade.ano);
      let usuarioEmail = '';
      let usuarioId = '';
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
      usuarioId = usuarioRow.id;
      let principal = oportunidade;
      if (oportunidade.id) {
        // Update
        const oportunidadePrincipal = Object.fromEntries(
          Object.entries({ ...oportunidade, usuario_id: usuarioId, mes: mesDb, ano: anoDb })
            .filter(([k, v]) => !['desafios', 'melhorias', 'id'].includes(k) && v !== '')
        );
        await supabase.from('oportunidades')
          .update(oportunidadePrincipal)
          .eq('id', oportunidade.id);
        // Atualiza desafios
        const { data: desafiosAtuais } = await supabase.from('desafios').select('id, texto').eq('oportunidade_id', oportunidade.id);
        const novosDesafios = oportunidade.desafios.filter(t => t.trim() !== '');
        const antigosDesafios = (desafiosAtuais || []).map(d => d.texto);
        if (JSON.stringify(novosDesafios) !== JSON.stringify(antigosDesafios)) {
          await supabase.from('desafios').delete().eq('oportunidade_id', oportunidade.id);
          for (const texto of novosDesafios) {
            await supabase.from('desafios').insert([{ oportunidade_id: oportunidade.id, texto }]);
          }
        }
        // Atualiza melhorias
        const { data: melhoriasAtuais } = await supabase.from('melhorias').select('id, texto').eq('oportunidade_id', oportunidade.id);
        const novosMelhorias = oportunidade.melhorias.filter(t => t.trim() !== '');
        const antigosMelhorias = (melhoriasAtuais || []).map(m => m.texto);
        if (JSON.stringify(novosMelhorias) !== JSON.stringify(antigosMelhorias)) {
          await supabase.from('melhorias').delete().eq('oportunidade_id', oportunidade.id);
          for (const texto of novosMelhorias) {
            await supabase.from('melhorias').insert([{ oportunidade_id: oportunidade.id, texto }]);
          }
        }
        principal = { ...oportunidade, usuario_id: usuarioId, mes: String(mesDb), ano: String(anoDb) };
      } else {
        // Insert
        const oportunidadePrincipal = Object.fromEntries(
          Object.entries({ ...oportunidade, usuario_id: usuarioId, mes: mesDb, ano: anoDb })
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
        principal = { ...oportunidade, id: oportunidadeId, usuario_id: usuarioId, mes: String(mesDb), ano: String(anoDb) };
      }
      // Atualiza lista local
      const novaLista = oportunidadesList.slice();
      novaLista[currentOportunidadeIdx] = principal;
      setOportunidadesList(novaLista);
      setOportunidade(principal);
      setFeedback({ message: 'Oportunidade salva com sucesso!', type: 'success' });
      if (onSaved) onSaved();
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

  // Handlers CRUD
  async function handleSave() {
    setLoading(true);
    setFeedback(null);
    try {
      if (type === 'destaque' && destaque) {
        // Padronizar mês e ano como integer
        const mesDb = Number(mes);
        const anoDb = Number(ano);
        let usuarioEmail = '';
        let usuarioId = '';
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
        usuarioId = usuarioRow.id;
        let destaqueId = destaque.id;
        let principal = destaque;
        // Se está editando (tem id), só faz update se todos os campos-chave baterem
        if (destaqueId) {
          // Busca o registro atual do destaque
          const { data: registroAtual } = await supabase.from('destaques').select('*').eq('id', destaqueId).single();
          if (
            registroAtual &&
            registroAtual.usuario_id === usuarioId &&
            registroAtual.tela_id === destaque.tela_id &&
            Number(registroAtual.mes) === mesDb &&
            Number(registroAtual.ano) === anoDb
          ) {
            // Atualiza apenas campos do destaque principal se necessário
            const destaquePrincipal = Object.fromEntries(
              Object.entries({ ...destaque, usuario_id: usuarioId, mes: mesDb, ano: anoDb })
                .filter(([k, v]) => !['positivos', 'negativos', 'id'].includes(k) && v !== '')
            );
            await supabase.from('destaques').update(destaquePrincipal).eq('id', destaqueId);
            // Atualiza positivos/negativos
            // Busca os positivos/negativos atuais
            const { data: positivosAtuais } = await supabase.from('destaques_positivos').select('id, texto').eq('destaque_id', destaqueId);
            const { data: negativosAtuais } = await supabase.from('destaques_negativos').select('id, texto').eq('destaque_id', destaqueId);
            // Atualiza positivos
            const novosPositivos = destaque.positivos.filter(t => t.trim() !== '');
            const antigosPositivos = (positivosAtuais || []).map(p => p.texto);
            // Deleta todos e insere os novos se houver diferença
            if (JSON.stringify(novosPositivos) !== JSON.stringify(antigosPositivos)) {
              await supabase.from('destaques_positivos').delete().eq('destaque_id', destaqueId);
              for (const texto of novosPositivos) {
                await supabase.from('destaques_positivos').insert([{ destaque_id: destaqueId, texto }]);
              }
            }
            // Atualiza negativos
            const novosNegativos = destaque.negativos.filter(t => t.trim() !== '');
            const antigosNegativos = (negativosAtuais || []).map(n => n.texto);
            if (JSON.stringify(novosNegativos) !== JSON.stringify(antigosNegativos)) {
              await supabase.from('destaques_negativos').delete().eq('destaque_id', destaqueId);
              for (const texto of novosNegativos) {
                await supabase.from('destaques_negativos').insert([{ destaque_id: destaqueId, texto }]);
              }
            }
            principal = { ...destaque, id: destaqueId, usuario_id: usuarioId, mes: String(mesDb), ano: String(anoDb) };
          } else {
            setFeedback({ message: 'Não é possível editar este destaque: dados-chave não conferem.', type: 'error' });
            setLoading(false);
            return;
          }
        } else {
          // Inserção normal (sem id)
          const { data: existente } = await supabase.from('destaques').select('id').eq('usuario_id', usuarioId).eq('tela_id', destaque.tela_id).eq('mes', mesDb).eq('ano', anoDb).single();
          if (existente) {
            setFeedback({ message: 'Já existe um destaque para este usuário, tela, mês e ano.', type: 'error' });
            setLoading(false);
            return;
          }
          const destaquePrincipal = Object.fromEntries(
            Object.entries({ ...destaque, usuario_id: usuarioId, mes: mesDb, ano: anoDb })
              .filter(([k, v]) => !['positivos', 'negativos', 'id'].includes(k) && v !== '')
          );
          const { data: inserted, error } = await supabase.from('destaques').insert([destaquePrincipal]).select('id').single();
          if (error) throw error;
          destaqueId = inserted.id;
          // Insere positivos/negativos
          for (const texto of destaque.positivos.filter(t => t.trim() !== '')) {
            await supabase.from('destaques_positivos').insert([{ destaque_id: destaqueId, texto }]);
          }
          for (const texto of destaque.negativos.filter(t => t.trim() !== '')) {
            await supabase.from('destaques_negativos').insert([{ destaque_id: destaqueId, texto }]);
          }
          principal = { ...destaque, id: destaqueId, usuario_id: usuarioId, mes: String(mesDb), ano: String(anoDb) };
        }
        setDestaque(principal);
        setFeedback({ message: 'Destaque salvo com sucesso!', type: 'success' });
      } else if (type === 'plano' && plano && Array.isArray(plano.acoes)) {
        // Validar ações
        const validarAcoes = () => {
          const hoje = new Date().toISOString().split('T')[0];
          const erros = [];
          
          for (let i = 0; i < plano.acoes.length; i++) {
            const acao = plano.acoes[i];
            if (!acao.titulo.trim()) continue; // Pular ações sem título
            
            if (acao.status === 'Pending' && acao.data_limite && acao.data_limite < hoje) {
              erros.push(`Action "${acao.titulo}": Pending actions must have a deadline greater than or equal to today.`);
            }
            if (acao.status === 'Done' && acao.data_limite && acao.data_limite > hoje) {
              erros.push(`Action "${acao.titulo}": Done actions must have a deadline less than or equal to today.`);
            }
          }
          
          return erros;
        };

        const errosValidacao = validarAcoes();

        // Validar ações antes de salvar
        if (errosValidacao.length > 0) {
          setFeedback({ message: 'Please fix validation errors before saving.', type: 'error' });
          setLoading(false);
          return;
        }

        // --- NOVO: Comparação profunda e update/insert/delete para plano, ações ---
        console.log('[DEBUG MODAL] Salvando plano:', plano);
        console.log('[DEBUG MODAL] Plano tem ID?', !!plano.id);
        console.log('[DEBUG MODAL] Original plano:', originalPlano);
        
        // Verificar se o usuario_id está definido
        if (!plano.usuario_id) {
          console.error('[DEBUG MODAL] usuario_id não está definido no plano');
          setFeedback({ message: 'Erro: ID do usuário não está definido.', type: 'error' });
          return;
        }
        
        console.log('[DEBUG MODAL] usuario_id do plano:', plano.usuario_id);
        
        // Verificar se o usuário existe na tabela usuarios
        console.log('[DEBUG MODAL] Verificando se usuário existe na tabela usuarios...');
        const { data: usuarioExists, error: usuarioCheckError } = await supabase
          .from('usuarios')
          .select('id')
          .eq('id', plano.usuario_id)
          .single();
        
        console.log('[DEBUG MODAL] Resultado da verificação de usuário:', { usuarioExists, usuarioCheckError });
        
        if (usuarioCheckError || !usuarioExists) {
          console.error('[DEBUG MODAL] Usuário não encontrado na tabela usuarios:', plano.usuario_id);
          setFeedback({ message: 'Erro: Usuário não encontrado na tabela usuarios.', type: 'error' });
          return;
        }
        
        console.log('[DEBUG MODAL] Usuário verificado com sucesso');
        
        if (plano.id && originalPlano) {
          console.log('[DEBUG MODAL] Entrando no fluxo de atualização');
          console.log('[DEBUG MODAL] Comparando campos:');
          console.log('[DEBUG MODAL] - titulo:', plano.titulo, 'vs', originalPlano.titulo, '=', plano.titulo !== originalPlano.titulo);
          console.log('[DEBUG MODAL] - descricao:', plano.descricao, 'vs', originalPlano.descricao, '=', plano.descricao !== originalPlano.descricao);
          console.log('[DEBUG MODAL] - data_inicio:', plano.data_inicio, 'vs', originalPlano.data_inicio, '=', plano.data_inicio !== originalPlano.data_inicio);
          console.log('[DEBUG MODAL] - data_fim:', plano.data_fim, 'vs', originalPlano.data_fim, '=', plano.data_fim !== originalPlano.data_fim);
          
          // 1. Atualizar plano de ação se mudou
          const planoMudou = (
            plano.titulo !== originalPlano.titulo || 
            plano.descricao !== originalPlano.descricao ||
            plano.data_inicio !== originalPlano.data_inicio
            // Remover data_fim da comparação pois agora é calculada automaticamente
          );
          
          console.log('[DEBUG MODAL] Plano mudou?', planoMudou);
          
          if (planoMudou) {
            console.log('[DEBUG MODAL] Atualizando plano existente:', plano.id);
            
            // Calcular data final baseada nas ações
            const calcularDataFinalParaSalvar = () => {
              if (plano.acoes.length === 0) return '';
              const datasLimite = plano.acoes
                .filter(acao => acao.data_limite)
                .map(acao => new Date(acao.data_limite));
              if (datasLimite.length === 0) return '';
              const dataMaisRecente = new Date(Math.max(...datasLimite.map(d => d.getTime())));
              return dataMaisRecente.toISOString().split('T')[0];
            };
            
            const { error: updateError } = await supabase.from('planos_de_acao').update({ 
              titulo: plano.titulo, 
              descricao: plano.descricao,
              data_inicio: plano.data_inicio,
              data_fim: calcularDataFinalParaSalvar()
            }).eq('id', plano.id);
            if (updateError) {
              console.error('[DEBUG MODAL] Erro ao atualizar plano:', updateError);
              throw updateError;
            }
            console.log('[DEBUG MODAL] Plano atualizado com sucesso');
          } else {
            console.log('[DEBUG MODAL] Plano não mudou, pulando atualização');
          }
          
          // 2. Ações
          console.log('[DEBUG MODAL] Processando ações. Total de ações:', plano.acoes.length);
          console.log('[DEBUG MODAL] Ações originais:', originalPlano.acoes.length);
          
          let acoesModificadas = 0;
          
          for (const acao of plano.acoes) {
            console.log('[DEBUG MODAL] Processando ação:', acao.id, acao.titulo);
            const origAcao = originalPlano.acoes.find(a => a.id === acao.id);
            console.log('[DEBUG MODAL] Ação encontrada no original?', !!origAcao, 'ID:', acao.id);
            
              if (acao.id && origAcao) {
              console.log('[DEBUG MODAL] Ação existente encontrada');
              
              // Verificar se a ação tem pelo menos um título
              if (!acao.titulo.trim()) {
                console.log('[DEBUG MODAL] Ação existente sem título, pulando atualização');
                continue;
              }
              
              const acaoMudou = (
                  acao.titulo !== origAcao.titulo ||
                  acao.responsavel !== origAcao.responsavel ||
                  acao.status !== origAcao.status ||
                  acao.data_limite !== origAcao.data_limite
              );
              console.log('[DEBUG MODAL] Ação mudou?', acaoMudou);
              
              if (acaoMudou) {
                console.log('[DEBUG MODAL] Atualizando ação:', acao.id);
                const { error: acaoError } = await supabase.from('acoes').update({
                    titulo: acao.titulo,
                    responsavel: acao.responsavel,
                    status: acao.status,
                    data_limite: acao.data_limite,
                  }).eq('id', acao.id);
                if (acaoError) {
                  console.error('[DEBUG MODAL] Erro ao atualizar ação:', acaoError);
                  throw acaoError;
                }
                console.log('[DEBUG MODAL] Ação atualizada com sucesso');
                acoesModificadas++;
              } else {
                console.log('[DEBUG MODAL] Ação não mudou, pulando atualização');
              }
            } else if (!origAcao) {
              // Nova ação - não existe no original
              console.log('[DEBUG MODAL] Inserindo nova ação para plano:', plano.id);
              
              // Verificar se a ação tem pelo menos um título
              if (!acao.titulo.trim()) {
                console.log('[DEBUG MODAL] Ação sem título, pulando inserção');
                continue;
              }
              
              const { error: insertAcaoError } = await supabase.from('acoes').insert({
                plano_id: plano.id,
                  titulo: acao.titulo,
                  responsavel: acao.responsavel,
                  status: acao.status,
                  data_limite: acao.data_limite,
                });
              if (insertAcaoError) {
                console.error('[DEBUG MODAL] Erro ao inserir ação:', insertAcaoError);
                throw insertAcaoError;
              }
              console.log('[DEBUG MODAL] Nova ação inserida com sucesso');
              acoesModificadas++;
            } else {
              console.log('[DEBUG MODAL] Ação com ID válido mas não encontrada no original, pulando');
            }
          }
          
          // Deletar ações removidas
          console.log('[DEBUG MODAL] Verificando ações removidas');
          for (const origAcao of originalPlano.acoes) {
            const aindaExiste = plano.acoes.some(a => a.id === origAcao.id);
            console.log('[DEBUG MODAL] Ação original', origAcao.id, 'ainda existe?', aindaExiste);
            
            if (!aindaExiste) {
              console.log('[DEBUG MODAL] Deletando ação:', origAcao.id);
              const { error: deleteError } = await supabase.from('acoes').delete().eq('id', origAcao.id);
              if (deleteError) {
                console.error('[DEBUG MODAL] Erro ao deletar ação:', deleteError);
                throw deleteError;
              }
              console.log('[DEBUG MODAL] Ação deletada com sucesso');
              acoesModificadas++;
              }
            }
          
          // Só mostrar sucesso se algo foi realmente modificado
          const algoFoiModificado = planoMudou || acoesModificadas > 0;
          console.log('[DEBUG MODAL] Algo foi modificado?', algoFoiModificado, '(plano mudou:', planoMudou, ', ações modificadas:', acoesModificadas, ')');
          
          if (algoFoiModificado) {
            setFeedback({ message: 'Plano de ação salvo com sucesso!', type: 'success' });
            // Atualizar originalPlano para refletir o estado salvo
            setOriginalPlano(JSON.parse(JSON.stringify(plano)));
          } else {
            setFeedback({ message: 'Nenhuma alteração detectada.', type: 'success' });
          }
        } else {
          // Novo plano de ação
          // Verificar se a tabela planos_de_acao existe
          const { error: tableCheckError } = await supabase.from('planos_de_acao').select('id').limit(1);
          if (tableCheckError) {
            setFeedback({ message: 'Erro: Tabela planos_de_acao não existe ou não está acessível.', type: 'error' });
            return;
          }
          // Calcular data final baseada nas ações
          const calcularDataFinalParaSalvar = () => {
            if (plano.acoes.length === 0) return '';
            const datasLimite = plano.acoes
              .filter(acao => acao.data_limite)
              .map(acao => new Date(acao.data_limite));
            if (datasLimite.length === 0) return '';
            const dataMaisRecente = new Date(Math.max(...datasLimite.map(d => d.getTime())));
            return dataMaisRecente.toISOString().split('T')[0];
          };
          const { data: insertedPlano, error: errorPlano } = await supabase.from('planos_de_acao').insert({
            usuario_id: plano.usuario_id,
            titulo: plano.titulo,
            descricao: plano.descricao,
            data_inicio: plano.data_inicio || null,
            data_fim: calcularDataFinalParaSalvar() || null,
          }).select('id').single();
          if (errorPlano) {
            setFeedback({ message: 'Erro ao inserir plano: ' + errorPlano.message, type: 'error' });
            return;
          }
          const planoId = insertedPlano.id;
          // Verificar se a tabela acoes existe
          const { error: acoesTableCheckError } = await supabase.from('acoes').select('id').limit(1);
          if (acoesTableCheckError) {
            setFeedback({ message: 'Erro: Tabela acoes não existe ou não está acessível.', type: 'error' });
            return;
          }
          for (const acao of plano.acoes) {
            const { error: acaoError } = await supabase.from('acoes').insert({
              plano_id: planoId,
              titulo: acao.titulo,
              responsavel: acao.responsavel,
              status: acao.status,
              data_limite: acao.data_limite,
            });
            if (acaoError) {
              setFeedback({ message: 'Erro ao inserir ação: ' + acaoError.message, type: 'error' });
              return;
            }
          }
          setFeedback({ message: 'Plano de ação criado com sucesso!', type: 'success' });
          // Atualizar o plano com o ID real e atualizar originalPlano
          const planoAtualizado = {
            ...plano,
            id: insertedPlano.id,
            acoes: plano.acoes.map((acao, index) => ({
              ...acao,
              id: `temp_${index}`,
              plano_id: insertedPlano.id,
            }))
          };
          setPlano(planoAtualizado);
          setOriginalPlano(JSON.parse(JSON.stringify(planoAtualizado)));
        }
        
        // Limpa cache para forçar refresh
        sessionStorage.removeItem('individual_data_cache');
      }
      if (onSaved) onSaved();
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
    if (type === 'plano' && hasPlanoChanged()) {
      if (!window.confirm('You have unsaved changes. Are you sure you want to cancel?')) return;
    }
    onClose();
  }

  // Dicionário para meses por extenso em inglês
  const monthNamesEn: Record<string, string> = {
    "01": "January", "02": "February", "03": "March", "04": "April",
    "05": "May", "06": "June", "07": "July", "08": "August",
    "09": "September", "10": "October", "11": "November", "12": "December"
  };

  // Renderização condicional dos formulários
  function renderForm() {
    if (type === 'destaque' && destaque) {
      return (
        <div>
          <div className="d-flex flex-row gap-4 align-items-center" style={{ marginBottom: 16, borderBottom: '1px solid var(--color-border-divider)' }}>
            <h4 className="form-label mb-0 ms-4" style={{ color: 'var(--color-text-secondary)', fontWeight: 400, fontSize: 16 }}>Selected Period</h4>
            <span style={{ display: 'flex', alignItems: 'center', background: 'transparent', color: 'var(--color-text-primary)', height: 38, fontSize: 16, fontWeight: 400 }}>
              {(monthNamesEn[mes] || mes) + ' / ' + ano}
            </span>
          </div>
          <div className="d-flex flex-row gap-2 w-100 px-3">
            <div className="d-flex flex-column gap-1" style={{ flex: 1 }}>
                <label className="form-label mb-0 ms-2" style={{ color: 'var(--positive-color)', fontWeight: 500 }}>Positives</label>
                <textarea className="form-control textarea-positive" rows={5} value={destaque.positivos.join('\n')} onChange={e => setDestaque({ ...destaque, positivos: e.target.value.split('\n') })} style={{ marginBottom: 12, borderRadius: 6, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-divider)', fontSize: 14, padding: '8px' }} />
            </div>
            <div className="d-flex flex-column gap-1" style={{ flex: 1 }}>
                <label className="form-label mb-0 ms-2" style={{ color: 'var(--negative-color)', fontWeight: 500 }}>Negatives</label>
                <textarea className="form-control textarea-negative" rows={5} value={destaque.negativos.join('\n')} onChange={e => setDestaque({ ...destaque, negativos: e.target.value.split('\n') })} style={{ marginBottom: 12, borderRadius: 6, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-divider)', fontSize: 14, padding: '8px' }} />
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: -8, marginBottom: 8, padding: '0 16px' }}>
            <p style={{ margin: 0, lineHeight: 1.4 }}>
              <strong>Formatting:</strong> Use *text* for <em>italic</em>, **text** for <strong>bold</strong>, and ***text*** for <strong><em>bold italic</em></strong>.
            </p>
            <p style={{ margin: '4px 0 0 0', lineHeight: 1.4 }}>
              <strong>Important:</strong> Each line represents a different point. Press Enter to add a new topic.
            </p>
          </div>
        </div>
      );
    }
    if (type === 'oportunidade') {
      // --- NOVO: Formulário adaptado para múlImportantlas oportunidades ---
      return (
        <div>
          {/* Cabeçalho com período selecionado (igual aos destaques) */}
          <div className="d-flex flex-row gap-4 align-items-center" style={{ marginBottom: 16, borderBottom: '1px solid var(--color-border-divider)' }}>
            <h4 className="form-label mb-0 ms-4" style={{ color: 'var(--color-text-secondary)', fontWeight: 400, fontSize: 16 }}>Selected Period</h4>
            <span style={{ display: 'flex', alignItems: 'center', background: 'transparent', color: 'var(--color-text-primary)', height: 38, fontSize: 16, fontWeight: 400 }}>
              {(monthNamesEn[mes] || mes) + ' / ' + ano}
            </span>
            </div>
          
          {/* Controles de navegação e adição */}
          <div className="d-flex flex-row justify-content-between align-items-center" style={{ marginBottom: 16, padding: '0 16px' }}>
            {/* Botões de ação à esquerda */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button 
                type="button" 
                className="d-flex align-items-center justify-content-center flex-row gap-1" 
                onClick={handleAddOportunidade} 
                style={{ 
                  width: 150, 
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
                <span>New Opportunity</span>
              </button>
              {oportunidade && (
                <button 
                  type="button" 
                  className="d-flex align-items-center justify-content-center flex-row gap-2" 
                  onClick={handleDeleteOportunidade} 
                  disabled={loading}
                  style={{ 
                    width: 80, 
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
                  <span style={{ fontSize: 14, fontWeight: 500 }}>Delete</span>
                </button>
              )}
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
                  Oportunidade {currentOportunidadeIdx + 1} of {oportunidadesList.length}
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
          
          {oportunidade && (
            <>
              {/* Título da oportunidade */}
              <div style={{ padding: '0 16px', marginBottom: 16 }}>
                <label className="form-label mb-2" style={{ color: 'var(--color-text-secondary)', fontWeight: 500, fontSize: 14 }}>Título da Oportunidade</label>
                <input 
                  className="form-control" 
                  value={oportunidade.titulo} 
                  onChange={e => setOportunidade({ ...oportunidade, titulo: e.target.value })} 
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
              
              {/* Desafios e Melhorias lado a lado (igual aos destaques) */}
              <div className="d-flex flex-row gap-2 w-100 px-3">
                <div className="d-flex flex-column gap-1" style={{ flex: 1 }}>
                  <label className="form-label mb-0 ms-2" style={{ color: 'var(--challenges-color)', fontWeight: 500 }}>Desafios</label>
                  <textarea 
                    className="form-control textarea-challenges" 
                    rows={5} 
                    value={oportunidade?.desafios?.join('\n') || ''} 
                    onChange={e => setOportunidade({ ...oportunidade, desafios: e.target.value.split('\n') })} 
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
                  <label className="form-label mb-0 ms-2" style={{ color: 'var(--improvements-color)', fontWeight: 500 }}>Melhorias</label>
                  <textarea 
                    className="form-control textarea-improvements" 
                    rows={5} 
                    value={oportunidade?.melhorias?.join('\n') || ''} 
                    onChange={e => setOportunidade({ ...oportunidade, melhorias: e.target.value.split('\n') })} 
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
                <p style={{ margin: 0, lineHeight: 1.4 }}>
                  <strong>Formatting:</strong> Use *text* for <em>italic</em>, **text** for <strong>bold</strong>, and ***text*** for <strong><em>bold italic</em></strong>.
                </p>
                <p style={{ margin: '4px 0 0 0', lineHeight: 1.4 }}>
                  <strong>Important:</strong> Each line represents a different topic. Press Enter to add a new item.
                </p>
              </div>
            </>
          )}
        </div>
      );
    }
    if (type === 'plano' && plano && Array.isArray(plano.acoes)) {
      // Calcular data final baseada na última ação
      const calcularDataFinal = () => {
        if (plano.acoes.length === 0) return '';
        const datasLimite = plano.acoes
          .filter(acao => acao.data_limite) // Incluir todas as ações com data limite (Pending e Done)
          .map(acao => new Date(acao.data_limite));
        if (datasLimite.length === 0) return '';
        const dataMaisRecente = new Date(Math.max(...datasLimite.map(d => d.getTime())));
        return dataMaisRecente.toISOString().split('T')[0];
      };

      // Validar ações
      const validarAcoes = () => {
        const hoje = new Date().toISOString().split('T')[0];
        const erros = [];
        
        for (let i = 0; i < plano.acoes.length; i++) {
          const acao = plano.acoes[i];
          if (!acao.titulo.trim()) continue; // Pular ações sem título
          
          if (acao.status === 'Pending' && acao.data_limite && acao.data_limite < hoje) {
            erros.push(`Action "${acao.titulo}": Pending actions must have a deadline greater than or equal to today.`);
          }
          if (acao.status === 'Done' && acao.data_limite && acao.data_limite > hoje) {
            erros.push(`Action "${acao.titulo}": Done actions must have a deadline less than or equal to today.`);
          }
        }
        
        return erros;
      };

      const errosValidacao = validarAcoes();

      return (
        <div>
          {/* Primeira parte: Título, Descrição e Datas */}
          <div className="d-flex flex-row gap-4 w-100 px-3 pt-2" style={{ marginBottom: 20 }}>
            {/* Lado esquerdo: Título e Descrição */}
            <div className="d-flex flex-column gap-3" style={{ flex: 1 }}>
              <div>
                <label className="form-label mb-2" style={{ color: 'var(--color-text-secondary)', fontWeight: 500, fontSize: 14 }}>Title</label>
                <input 
                  className="form-control" 
                  value={plano.titulo} 
                  onChange={e => setPlano({ ...plano, titulo: e.target.value })} 
                  style={{ 
                    borderRadius: 6, 
                    background: 'var(--color-background-primary)', 
                    color: 'var(--color-text-primary)', 
                    border: '1px solid var(--color-border-divider)', 
                    fontSize: 14, 
                    padding: '8px 12px' 
                  }}
                  placeholder="Enter the action plan title"
                />
              </div>
              <div>
                <label className="form-label mb-2" style={{ color: 'var(--color-text-secondary)', fontWeight: 500, fontSize: 14 }}>Description</label>
                <textarea 
                  className="form-control" 
                  rows={4} 
                  value={plano.descricao} 
                  onChange={e => setPlano({ ...plano, descricao: e.target.value })} 
                  style={{ 
                    borderRadius: 6, 
                    background: 'var(--color-background-primary)', 
                    color: 'var(--color-text-primary)', 
                    border: '1px solid var(--color-border-divider)', 
                    fontSize: 14, 
                    padding: '8px' 
                  }}
                  placeholder="Enter the action plan description"
                />
              </div>
            </div>
            
            {/* Lado direito: Datas */}
            <div className="d-flex flex-column gap-3" style={{ width: 200 }}>
              <div>
                <label className="form-label mb-2" style={{ color: 'var(--color-text-secondary)', fontWeight: 500, fontSize: 14 }}>Start Date</label>
                <input 
                  type="date" 
                  className="form-control" 
                  value={plano.data_inicio} 
                  onChange={e => setPlano({ ...plano, data_inicio: e.target.value })} 
                  style={{ 
                    borderRadius: 6, 
                    background: 'var(--color-background-primary)', 
                    color: 'var(--color-text-primary)', 
                    border: '1px solid var(--color-border-divider)', 
                    fontSize: 14, 
                    padding: '8px 12px' 
                  }}
                />
              </div>
              <div>
                <label className="form-label mb-2" style={{ color: 'var(--color-text-secondary)', fontWeight: 500, fontSize: 14 }}>End Date</label>
                <input 
                  type="date" 
                  className="form-control" 
                  value={calcularDataFinal()} 
                  disabled={true}
                  style={{ 
                    borderRadius: 6, 
                    background: 'var(--color-background-secondary)', 
                    color: 'var(--color-text-secondary)', 
                    border: '1px solid var(--color-border-divider)', 
                    fontSize: 14, 
                    padding: '8px 12px',
                    opacity: 0.6
                  }}
                />
              </div>
            </div>
          </div>

          {/* Segunda parte: Controle de Ações */}
          <div style={{ padding: '0 16px' }}>
            <div className="d-flex flex-row justify-content-between align-items-center" style={{ marginBottom: 16 }}>
              <h5 style={{ color: 'var(--color-text-primary)', fontSize: 16, fontWeight: 500, margin: 0 }}>Actions</h5>
              <button 
                type="button" 
                className="d-flex align-items-center justify-content-center flex-row gap-1" 
                onClick={addAcao} 
                style={{ 
                  width: 120, 
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
                title="Add Action"
              >
                <i className="bi bi-plus" />
                <span>Add Action</span>
                  </button>
                </div>

            {/* Lista de Ações */}
            {plano.acoes.length === 0 && (
              <div style={{ color: 'var(--color-text-secondary)', fontSize: 13, textAlign: 'center', padding: 20 }}>
                No actions added yet. Click "Add Action" to get started.
              </div>
            )}
            
            {plano.acoes.map((acao, i) => (
              <div key={acao.id} style={{ 
                background: 'var(--color-background-secondary)', 
                borderRadius: 8, 
                padding: '8px 12px', 
                margin: '8px 0', 
                border: '1px solid var(--color-border-divider)' 
              }}>
                <div className="d-flex flex-column gap-1">
                  {/* Título da Ação */}
                  <div>
                    <label className="form-label mb-2" style={{ color: 'var(--color-text-secondary)', fontWeight: 500, fontSize: 13 }}>Action Title</label>
                    <input 
                      className="form-control" 
                      value={acao.titulo} 
                      onChange={e => updateAcao(i, { titulo: e.target.value })} 
                      style={{ 
                        borderRadius: 6, 
                        background: 'var(--color-background-primary)', 
                        color: 'var(--color-text-primary)', 
                        border: '1px solid var(--color-border-divider)', 
                        fontSize: 14, 
                        padding: '8px 12px' 
                      }}
                      placeholder="Enter action title"
                    />
                  </div>
                  
                  {/* Responsável, Status e Data Limite */}
                  <div className="d-flex flex-row gap-3">
                  <div style={{ flex: 1 }}>
                      <label className="form-label mb-2" style={{ color: 'var(--color-text-secondary)', fontWeight: 500, fontSize: 13 }}>Responsible</label>
                      <select 
                        className="form-control" 
                        value={acao.responsavel} 
                        onChange={e => updateAcao(i, { responsavel: e.target.value })}
                        style={{ 
                          borderRadius: 6, 
                          background: 'var(--color-background-primary)', 
                          color: 'var(--color-text-primary)', 
                          border: '1px solid var(--color-border-divider)', 
                          fontSize: 14, 
                          padding: '8px 12px' 
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
                  <div style={{ flex: 1 }}>
                      <label className="form-label mb-2" style={{ color: 'var(--color-text-secondary)', fontWeight: 500, fontSize: 13 }}>Status</label>
                      <select 
                        className="form-control" 
                        value={acao.status} 
                        onChange={e => updateAcao(i, { status: e.target.value })}
                        style={{ 
                          borderRadius: 6, 
                          background: 'var(--color-background-primary)', 
                          color: 'var(--color-text-primary)', 
                          border: '1px solid var(--color-border-divider)', 
                          fontSize: 14, 
                          padding: '8px 12px' 
                        }}
                      >
                        <option value="">Select status</option>
                        <option value="Pending">Pending</option>
                        <option value="Done">Done</option>
                      </select>
                  </div>
                    <div style={{ flex: 1 }}>
                      <label className="form-label mb-2" style={{ color: 'var(--color-text-secondary)', fontWeight: 500, fontSize: 13 }}>Deadline</label>
                      <input 
                        type="date" 
                        className="form-control" 
                        value={acao.data_limite} 
                        onChange={e => updateAcao(i, { data_limite: e.target.value })}
                        style={{ 
                          borderRadius: 6, 
                          background: 'var(--color-background-primary)', 
                          color: 'var(--color-text-primary)', 
                          border: '1px solid var(--color-border-divider)', 
                          fontSize: 14, 
                          padding: '8px 12px'
                        }}
                      />
                </div>
                    <div style={{ display: 'flex', alignItems: 'end', paddingBottom: 4 }}>
                      <button 
                        type="button" 
                        className="d-flex align-items-center justify-content-center" 
                        onClick={() => removeAcao(i)} 
                        style={{ 
                          width: 36, 
                          height: 32, 
                          fontSize: 14, 
                          borderRadius: 6,
                          fontWeight: 500,
                          background: 'var(--color-background-secondary)',
                          color: 'var(--negative-color)',
                          border: '1.5px solid var(--color-border-divider)',
                          transition: 'background 0.3s, color 0.3s, border 0.3s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--color-background-primary)';
                          e.currentTarget.style.borderColor = 'var(--negative-color)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'var(--color-background-secondary)';
                          e.currentTarget.style.borderColor = 'var(--color-border-divider)';
                        }}
                        title="Remove Action"
                      >
                      <i className="bi bi-trash" />
                    </button>
                    </div>
                  </div>
                </div>
                  </div>
                ))}
          </div>

          {/* Alertas de Validação */}
          {errosValidacao.length > 0 && (
            <div style={{ padding: '0 16px', marginTop: 16 }}>
              <div style={{
                background: 'rgba(220,53,69,0.12)',
                color: '#dc3545',
                border: '1px solid #dc3545',
                borderRadius: 6,
                padding: '12px 16px',
                fontSize: 14,
                textAlign: 'left',
                transition: 'all 0.5s ease-in-out',
                animation: 'fadeInOut 0.5s ease-in-out',
              }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Validation Errors:</div>
                {errosValidacao.map((erro, index) => (
                  <div key={index} style={{ marginBottom: 4, fontSize: 13 }}>
                    • {erro}
              </div>
            ))}
          </div>
            </div>
          )}
        </div>
      );
    }
    return <div style={{ color: 'var(--color-text-secondary)', textAlign: 'center', padding: 20 }}>Selecione um item para editar.</div>;
  }

  // Antes do return do JSX
  console.log('[MODAL DEBUG] Antes do return | show:', show);
  console.log('[MODAL DEBUG] renderForm Importanto:', type);

  return (
    <>
      <div className={`modal fade show custom-modal-anim${isClosing ? ' closing' : ''}`} tabIndex={-1} style={{ display: 'block', zIndex: 2200 }}>
        <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 700 }}>
          <div className="modal-content" style={{ background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', border: '1.5px solid var(--color-border-divider)', zIndex: 2200, position: 'relative' }}>
            <div className="modal-header px-4 py-2 d-flex flex-row gap-2 align-items-center" style={{ borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
              <h5 className="modal-title d-flex flex-row gap-2" style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, flex: '0 0 auto', marginBottom: 0 }}>
                <p style={{ color: 'var(--color-text-secondary)', marginBottom: 0 }}>Edit</p>
                <p style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, flex: '0 0 auto', marginBottom: 0 }}>{type === 'destaque' && 'Destaque'}
                {type === 'oportunidade' && 'Oportunidade'}
                {type === 'plano' && 'Plano de Ação'}
                </p>
              </h5>
              <button type="button" className="btn-close" aria-label="Close" onClick={handleCancel} style={{ filter: 'invert(1)' }} />
            </div>
            <div className="modal-body" style={{ padding: 0, paddingBottom: 24, background: 'var(--color-background-primary)' }}>
              {renderForm()}
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
              {type === 'oportunidade' && <button type="button" className="btn btn-primary" onClick={handleSaveOportunidade} disabled={loading} style={{ borderRadius: 6, fontWeight: 500, minWidth: 90 }}>Salvar</button>}
              {type !== 'oportunidade' && type !== 'plano' && <button type="button" className="btn btn-primary" onClick={handleSave} disabled={loading} style={{ borderRadius: 6, fontWeight: 500, minWidth: 90 }}>Salvar</button>}
              {type === 'plano' && <button type="button" className="btn btn-primary" onClick={handleSave} disabled={loading} style={{ borderRadius: 6, fontWeight: 500, minWidth: 90 }}>Salvar</button>}
              <button type="button" className="btn btn-secondary" onClick={handleCancel} style={{ borderRadius: 6, fontWeight: 500, minWidth: 90 }}>Cancelar</button>
            </div>
          </div>
        </div>
        <div className="modal-backdrop fade show" style={{ zIndex: 2100 }}></div>
      </div>
    </>
  );
};

export default Modal; 

// Adicionar estilos CSS para animações
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeInOut {
    0% {
      opacity: 0;
      transform: translateY(-10px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;
document.head.appendChild(style);