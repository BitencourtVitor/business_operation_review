import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../supabaseClient';
import CloseButton from '../../utils/CloseButton';

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
  usuarioId?: string;
}

function Feedback({ message, type }: { message: string; type: 'success' | 'error' }) {
  return (
    <div style={{
      padding: '8px 12px',
      borderRadius: 6,
      fontSize: 14,
      fontWeight: 500,
      background: type === 'success' ? 'rgba(27, 191, 92, 0.1)' : 'rgba(220, 53, 69, 0.1)',
      color: type === 'success' ? 'rgb(27, 191, 92)' : 'rgb(220, 53, 69)',
      border: `1px solid ${type === 'success' ? 'rgb(27, 191, 92)' : 'rgb(220, 53, 69)'}`,
    }}>
      {message}
    </div>
  );
}

const DestaqueModal: React.FC<DestaqueModalProps> = ({ show, onClose, data, onSaved, anoSelecionado = '', mesSelecionado = '', usuarioId }) => {
  const [destaque, setDestaque] = useState<Destaque | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);


  const monthNamesEn: { [key: string]: string } = {
    '1': 'January', '2': 'February', '3': 'March', '4': 'April',
    '5': 'May', '6': 'June', '7': 'July', '8': 'August',
    '9': 'September', '10': 'October', '11': 'November', '12': 'December'
  };

  useEffect(() => {
    if (show) {
      // Limpar estado anterior
      setDestaque(null);
      setFeedback(null);
      setLoading(false);
      
      // Não validar aqui, permitir que o modal seja aberto
      
      if (data) {
        setDestaque(data);
      } else {
        setDestaque({
          id: '',
          usuario_id: usuarioId || '',
          tela_id: '',
          mes: mesSelecionado,
          ano: anoSelecionado,
          criado_em: new Date().toISOString(),
          positivos: [],
          negativos: []
        });
      }
    }
  }, [show, data, mesSelecionado, anoSelecionado, usuarioId]);

  const handleClose = () => {
    onClose();
  };

  async function handleSave() {
    if (!destaque) return;
    
    setLoading(true);
    setFeedback(null);

    try {
      const mesDb = Number(destaque.mes);
      const anoDb = Number(destaque.ano);

      // Verificar se o usuarioId foi passado
      if (!usuarioId) {
        throw new Error('ID do usuário não fornecido');
      }

      // Verificar se o usuário logado pode editar este registro
      if (destaque.id && destaque.usuario_id !== usuarioId) {
        throw new Error('Você só pode editar registros que você criou');
      }

      // Usar o usuarioId passado diretamente
      const usuarioRow = { id: usuarioId };

      if (destaque.id) {
        // Atualização
        const { data: existente } = await supabase.from('destaques').select('*').eq('id', destaque.id).single();
        if (existente) {
          const dadosParaAtualizar = {
            ...destaque,
            mes: mesDb,
            ano: anoDb,
            positivos: destaque.positivos.filter(t => t.trim() !== ''),
            negativos: destaque.negativos.filter(t => t.trim() !== '')
          };
          // Filtrar campos vazios
          const destaquePrincipal = Object.fromEntries(
            Object.entries(dadosParaAtualizar)
              .filter(([, v]) => v !== undefined && v !== null)
          );
          await supabase.from('destaques').update(destaquePrincipal).eq('id', destaque.id);
          
          // Atualiza positivos/negativos
          const { data: positivosAtuais } = await supabase.from('destaques_positivos').select('id, texto').eq('destaque_id', destaque.id);
          const { data: negativosAtuais } = await supabase.from('destaques_negativos').select('id, texto').eq('destaque_id', destaque.id);
          
          const novosPositivos = destaque.positivos.filter(t => t.trim() !== '');
          const antigosPositivos = (positivosAtuais || []).map(p => p.texto);
          if (JSON.stringify(novosPositivos) !== JSON.stringify(antigosPositivos)) {
            await supabase.from('destaques_positivos').delete().eq('destaque_id', destaque.id);
            for (const texto of novosPositivos) {
              await supabase.from('destaques_positivos').insert([{ destaque_id: destaque.id, texto }]);
            }
          }
          
          const novosNegativos = destaque.negativos.filter(t => t.trim() !== '');
          const antigosNegativos = (negativosAtuais || []).map(n => n.texto);
          if (JSON.stringify(novosNegativos) !== JSON.stringify(antigosNegativos)) {
            await supabase.from('destaques_negativos').delete().eq('destaque_id', destaque.id);
            for (const texto of novosNegativos) {
              await supabase.from('destaques_negativos').insert([{ destaque_id: destaque.id, texto }]);
            }
          }
        }
      } else {
        // Inserção - verificar se já existe um destaque para o USUÁRIO ATUAL nesta tela, mês e ano
        // Permitir múltiplos destaques para o mesmo mês/ano desde que sejam de usuários diferentes
        const { data: existente } = await supabase
          .from('destaques')
          .select('id')
          .eq('tela_id', destaque.tela_id)
          .eq('mes', mesDb)
          .eq('ano', anoDb)
          .eq('usuario_id', usuarioRow.id)
          .single();
        
        if (existente) {
          throw new Error('Você já possui um destaque para esta tela, mês e ano');
        }

        const destaquePrincipal = Object.fromEntries(
          Object.entries({ 
            ...destaque, 
            usuario_id: usuarioRow.id,
            mes: mesDb, 
            ano: anoDb 
          })
            .filter(([k, v]) => !['positivos', 'negativos', 'id'].includes(k) && v !== '')
        );
        
        const { data: inserted, error } = await supabase.from('destaques').insert([destaquePrincipal]).select('id').single();
        if (error) throw error;
        
        for (const texto of destaque.positivos.filter(t => t.trim() !== '')) {
          await supabase.from('destaques_positivos').insert([{ destaque_id: inserted.id, texto }]);
        }
        for (const texto of destaque.negativos.filter(t => t.trim() !== '')) {
          await supabase.from('destaques_negativos').insert([{ destaque_id: inserted.id, texto }]);
        }
      }
      
      setFeedback({ message: 'Destaque salvo com sucesso!', type: 'success' });
      
      // Não fechar automaticamente, deixar o usuário fechar manualmente
      // e chamar onSaved para atualizar os dados na interface
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

  if (!show) return null;

  const portalContainer = typeof document !== 'undefined' ? document.body : null;
  if (!portalContainer) return null;

  return createPortal(
    <div 
      style={{ 
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(0, 0, 0, 0.5)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onClick={handleClose}
    >
      <div 
        style={{ 
          background: 'var(--color-background-primary)',
          borderRadius: 10,
          maxWidth: 700,
          width: '90%',
          maxHeight: '90vh',
          overflow: 'hidden',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ border: '1px solid var(--color-border-divider)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ color: 'var(--color-text-secondary)', margin: 0, fontSize: 24, fontWeight: 400 }}>Edit</span>
              <span style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, margin: 0 }}>Destaque</span>
            </div>
            <CloseButton onClick={handleClose} size="md" />
          </div>
          
          <div style={{ padding: 0, paddingBottom: 24, background: 'var(--color-background-primary)' }}>
            <div>
              <div style={{ marginBottom: 16, borderBottom: '1px solid var(--color-border-divider)', display: 'flex', gap: 16, alignItems: 'center' }}>
                <h4 style={{ color: 'var(--color-text-secondary)', fontWeight: 400, fontSize: 16, margin: '0 0 0 24px' }}>Selected Period</h4>
                <span style={{ color: 'var(--color-text-primary)', height: 38, fontSize: 16, fontWeight: 400, display: 'flex', alignItems: 'center' }}>
                  {(monthNamesEn[destaque?.mes || ''] || destaque?.mes) + ' / ' + destaque?.ano}
                </span>
              </div>
              
              <div style={{ display: 'flex', gap: 8, padding: '0 12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ color: 'var(--positive-color)', fontWeight: 500, marginBottom: 4, display: 'block' }}>Positives</label>
                  <textarea 
                    className="form-control textarea-positive"
                    rows={5} 
                    value={destaque?.positivos?.join('\n') || ''} 
                    onChange={e => setDestaque(destaque ? { ...destaque, positivos: e.target.value.split('\n') } : null)} 
                    style={{ 
                      width: '100%',
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
                <div style={{ flex: 1 }}>
                  <label style={{ color: 'var(--negative-color)', fontWeight: 500, marginBottom: 4, display: 'block' }}>Negatives</label>
                  <textarea 
                    className="form-control textarea-negative"
                    rows={5} 
                    value={destaque?.negativos?.join('\n') || ''} 
                    onChange={e => setDestaque(destaque ? { ...destaque, negativos: e.target.value.split('\n') } : null)} 
                    style={{ 
                      width: '100%',
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
                <p style={{ margin: 0, lineHeight: 1.4 }}>
                  <strong>Formatting:</strong> Use *text* for <em>italic</em>, **text** for <strong>bold</strong>, and ***text*** for <strong><em>bold italic</em></strong>.
                </p>
                <p style={{ margin: '4px 0 0 0', lineHeight: 1.4 }}>
                  <strong>Important:</strong> Each line represents a different point. Press Enter to add a new topic.
                </p>
              </div>
            </div>
          </div>
          
          <div style={{ borderTop: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, padding: '16px 24px' }}>
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'end',
              minHeight: 39,
              margin: 0,
              opacity: feedback ? 1 : 0,
              transition: 'opacity 0.5s ease-in-out'
            }}>
              {feedback && <Feedback message={feedback.message} type={feedback.type} />}
            </div>
            <button 
              type="button" 
              className="btn btn-primary"
              onClick={handleSave} 
              disabled={loading} 
              style={{ 
                borderRadius: 6, 
                fontWeight: 500, 
                minWidth: 90
              }}
            >
              Salvar
            </button>
            <button 
              type="button" 
              className="btn btn-secondary"
              onClick={handleClose} 
              style={{ 
                borderRadius: 6, 
                fontWeight: 500, 
                minWidth: 90
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>,
    portalContainer
  );
};

export default DestaqueModal; 