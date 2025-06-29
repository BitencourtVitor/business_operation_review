import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';

// Interface para Destaque do timesheet
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

interface DestaqueModalProps {
  show: boolean;
  onClose: () => void;
  data: Destaque | null;
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

const DestaqueModal: React.FC<DestaqueModalProps> = ({ show, onClose, data, onSaved, anoSelecionado = '', mesSelecionado = '' }) => {
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

  // Estados locais para edição
  const [destaque, setDestaque] = useState<Destaque | null>(data ? data as Destaque : null);

  // Adicionar estados locais para mês e ano
  const [mes, setMes] = useState(destaque ? destaque.mes : '');
  const [ano, setAno] = useState(destaque ? destaque.ano : '');

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

  // Ao abrir o modal OU ao trocar o destaque em edição, setar mês/ano do destaque ou do período selecionado
  useEffect(() => {
    if (show) {
      if (data && data.mes && data.ano) {
        setMes(String(data.mes).padStart(2, '0'));
        setAno(String(data.ano));
      } else {
        setMes(mesSelecionado ? String(mesSelecionado).padStart(2, '0') : '');
        setAno(anoSelecionado || '');
      }
    }
  }, [show, data?.id, mesSelecionado, anoSelecionado]);

  // Atualizar objeto destaque ao mudar mês/ano
  useEffect(() => {
    if (destaque) {
      setDestaque({ ...destaque, mes, ano });
    } else if (mes && ano) {
      setDestaque({
        id: '',
        usuario_id: '',
        tela_id: '',
        mes,
        ano,
        criado_em: '',
        positivos: [],
        negativos: []
      });
    }
  }, [mes, ano]);

  // Resetar ao abrir/fechar
  useEffect(() => {
    setFeedback(null);
    setLoading(false);
    setDestaque(data ? data : (mes && ano ? {
      id: '',
      usuario_id: '',
      tela_id: '',
      mes,
      ano,
      criado_em: '',
      positivos: [],
      negativos: []
    } : null));
  }, [show, data, mes, ano]);

  // Dicionário para meses por extenso em inglês
  const monthNamesEn: Record<string, string> = {
    "01": "January", "02": "February", "03": "March", "04": "April",
    "05": "May", "06": "June", "07": "July", "08": "August",
    "09": "September", "10": "October", "11": "November", "12": "December"
  };

  // Handlers CRUD
  async function handleSave() {
    setLoading(true);
    setFeedback(null);
    try {
      if (destaque) {
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
        let destaqueId = destaque.id;
        
        // Se está editando (tem id), manter o usuario_id original
        if (destaqueId) {
          // Busca o registro atual do destaque
          const { data: registroAtual } = await supabase.from('destaques').select('*').eq('id', destaqueId).single();
          if (registroAtual) {
            // Manter o usuario_id original do registro
            const usuarioIdOriginal = registroAtual.usuario_id;
            
            // Atualiza apenas campos do destaque principal se necessário, mantendo o usuario_id original
            const destaquePrincipal = Object.fromEntries(
              Object.entries({ ...destaque, usuario_id: usuarioIdOriginal, mes: mesDb, ano: anoDb })
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
          } else {
            setFeedback({ message: 'Destaque não encontrado.', type: 'error' });
            setLoading(false);
            return;
          }
        } else {
          // Inserção normal (sem id) - usar o usuario_id do responsável pela tela
          // O usuario_id já deve estar correto no objeto destaque (definido na página)
          const { data: existente } = await supabase.from('destaques').select('id').eq('usuario_id', destaque.usuario_id).eq('tela_id', destaque.tela_id).eq('mes', mesDb).eq('ano', anoDb).single();
          if (existente) {
            setFeedback({ message: 'Já existe um destaque para este usuário, tela, mês e ano.', type: 'error' });
            setLoading(false);
            return;
          }
          const destaquePrincipal = Object.fromEntries(
            Object.entries({ ...destaque, mes: mesDb, ano: anoDb })
              .filter(([k, v]) => !['positivos', 'negativos', 'id'].includes(k) && v !== '')
          );
          const { data: inserted, error } = await supabase.from('destaques').insert([destaquePrincipal]).select('id').single();
          if (error) throw error;
          destaqueId = inserted.id;
          for (const texto of destaque.positivos.filter(t => t.trim() !== '')) {
            await supabase.from('destaques_positivos').insert([{ destaque_id: destaqueId, texto }]);
          }
          for (const texto of destaque.negativos.filter(t => t.trim() !== '')) {
            await supabase.from('destaques_negativos').insert([{ destaque_id: destaqueId, texto }]);
          }
        }
        setFeedback({ message: 'Destaque salvo com sucesso!', type: 'success' });
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

  return (
    <>
      <div className={`modal fade show custom-modal-anim${isClosing ? ' closing' : ''}`} tabIndex={-1} style={{ display: 'block', zIndex: 2200 }}>
        <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 700 }}>
          <div className="modal-content" style={{ background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', border: '1.5px solid var(--color-border-divider)', zIndex: 2200, position: 'relative' }}>
            <div className="modal-header px-4 py-2 d-flex flex-row gap-2 align-items-center" style={{ borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
              <h5 className="modal-title d-flex flex-row gap-2" style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, flex: '0 0 auto', marginBottom: 0 }}>
                <p style={{ color: 'var(--color-text-secondary)', marginBottom: 0 }}>Edit</p>
                <p style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, flex: '0 0 auto', marginBottom: 0 }}>Destaque</p>
              </h5>
              <button type="button" className="btn-close" aria-label="Close" onClick={handleCancel} style={{ filter: 'invert(1)' }} />
            </div>
            <div className="modal-body" style={{ padding: 0, paddingBottom: 24, background: 'var(--color-background-primary)' }}>
              <div>
                <div className="d-flex flex-row gap-4 align-items-center" style={{ marginBottom: 16, borderBottom: '1px solid var(--color-border-divider)' }}>
                  <h4 className="form-label mb-0 ms-4" style={{ color: 'var(--color-text-secondary)', fontWeight: 400, fontSize: 16 }}>Selected Period</h4>
                  <span style={{ display: 'flex', alignItems: 'center', background: 'transparent', color: 'var(--color-text-primary)', height: 38, fontSize: 16, fontWeight: 400 }}>
                    {(monthNamesEn[mes] || mes) + ' / ' + ano}
                  </span>
                </div>
                <div className="d-flex flex-row gap-2 w-100 px-3">
                  <div className="d-flex flex-column gap-1" style={{ flex: 1 }}>
                    <label className="form-label mb-0 ms-2" style={{ color: 'var(--positive-color)', fontWeight: 500, textAlign: 'start' }}>Positives</label>
                    <textarea 
                      className="form-control textarea-positive" 
                      rows={5} 
                      value={destaque?.positivos?.join('\n') || ''} 
                      onChange={e => setDestaque(destaque ? { ...destaque, positivos: e.target.value.split('\n') } : null)} 
                      style={{ 
                        marginBottom: 12, 
                        borderRadius: 6, 
                        background: 'var(--color-background-primary)', 
                        color: 'var(--color-text-primary)', 
                        border: '1px solid var(--color-border-divider)', 
                        fontSize: 14, 
                        padding: '8px' 
                      }} 
                    />
                  </div>
                  <div className="d-flex flex-column gap-1" style={{ flex: 1 }}>
                    <label className="form-label mb-0 ms-2" style={{ color: 'var(--negative-color)', fontWeight: 500, textAlign: 'start' }}>Negatives</label>
                    <textarea 
                      className="form-control textarea-negative" 
                      rows={5} 
                      value={destaque?.negativos?.join('\n') || ''} 
                      onChange={e => setDestaque(destaque ? { ...destaque, negativos: e.target.value.split('\n') } : null)} 
                      style={{ 
                        marginBottom: 12, 
                        borderRadius: 6, 
                        background: 'var(--color-background-primary)', 
                        color: 'var(--color-text-primary)', 
                        border: '1px solid var(--color-border-divider)', 
                        fontSize: 14, 
                        padding: '8px' 
                      }} 
                    />
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: -8, marginBottom: 8, padding: '0 24px' }}>
                  <p style={{ margin: 0, lineHeight: 1.4, textAlign: 'start' }}>
                    <strong>Formatting:</strong> Use *text* for <em>italic</em>, **text** for <strong>bold</strong>, and ***text*** for <strong><em>bold italic</em></strong>.
                  </p>
                  <p style={{ margin: '4px 0 0 0', lineHeight: 1.4, textAlign: 'start' }}>
                    <strong>Important:</strong> Each line represents a different point. Press Enter to add a new topic.
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
        <div className="modal-backdrop fade show" style={{ zIndex: 2100 }}></div>
      </div>
    </>
  );
};

export default DestaqueModal; 