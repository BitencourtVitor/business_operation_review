import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import dayjs from 'dayjs';
import type { TooltipItem } from 'chart.js';
import Modal, { ViewModal } from './modal';
// Reutilizando o MultiSelectDropdown do timesheet_analysis

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

// Interface para dados contábeis
interface AccountingRow {
  id: string;
  date: string;
  open_balance: number;
  aging_intervals: string;
  category: string;
  type: 'receivables' | 'payables';
}

// Interface de props igual ao timesheet_analysis
interface AccountingIndicatorsProps {
  usuario_responsavel_id: string; // responsável pela tela
  tela_id: string;
  user_role: string;
  user_setor_id: string;
  isAdmin: boolean;
  ofThisScreen: boolean;
  planos_iniciais?: PlanoAcao[];
}

// MultiSelectDropdown copiado do timesheet_analysis
function MultiSelectDropdown({ options, selected, setSelected, allLabel = 'Todos', dropdownTitle }: {
  options: string[];
  selected: string[];
  setSelected: (v: string[]) => void;
  allLabel?: string;
  dropdownTitle?: string;
}) {
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{top: number, left: number, width: number}>({top: 0, left: 0, width: 0});
  const [hasPreRendered, setHasPreRendered] = useState(false);

  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  React.useEffect(() => {
    if ((open || !hasPreRendered) && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
      if (!hasPreRendered) setHasPreRendered(true);
    }
  }, [open, hasPreRendered]);

  const allSelected = selected.length === options.length;
  const toggleOption = (opt: string) => {
    if (selected.includes(opt)) setSelected(selected.filter(o => o !== opt));
    else setSelected([...selected, opt]);
  };
  const toggleAll = () => {
    if (allSelected) setSelected([]);
    else setSelected(options);
  };
  const dropdownJSX = (
    <div
      ref={dropdownRef}
      style={{
        position: 'absolute',
        zIndex: 1000,
        top: dropdownPos.top,
        left: dropdownPos.left,
        width: dropdownPos.width,
        background: 'var(--color-background-primary)',
        color: 'var(--color-text-primary)',
        border: '1.5px solid var(--color-border-divider)',
        borderRadius: 6,
        minWidth: 0,
        maxHeight: 220,
        overflowY: 'auto',
        padding: 0,
        boxShadow: 'none',
        fontSize: 14,
        display: open ? 'block' : 'none',
      }}
      className="custom-scrollbar"
    >
      {dropdownTitle && (
        <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--color-accent-primary)', background: 'var(--color-background-secondary)', padding: '6px 12px 4px 12px', borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottom: '1px solid var(--color-border-divider)', letterSpacing: 0.2 }}>{dropdownTitle}</div>
      )}
      <div style={{ padding: 0, borderBottom: '1px solid var(--color-border-divider)' }}>
        <label className="d-flex align-items-center" style={{ gap: 8, fontSize: 14, color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '6px 12px' }}>
          <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ accentColor: 'var(--color-accent-primary)', margin: 0 }} />
          <span>{allLabel}</span>
        </label>
      </div>
      {options.map(opt => (
        <label key={opt} className="d-flex align-items-center" style={{ gap: 8, fontSize: 14, color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '6px 12px' }}>
          <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggleOption(opt)} style={{ accentColor: 'var(--color-accent-primary)', margin: 0 }} />
          <span>{opt}</span>
        </label>
      ))}
    </div>
  );
  return (
    <div style={{ position: 'relative', minWidth: 0, width: '100%', height: 38, borderTopRightRadius: 8, borderBottomRightRadius: 8 }}>
      <button
        ref={buttonRef}
        type="button"
        className="form-control d-flex align-items-center justify-content-between"
        style={{ cursor: 'pointer', width: '100%', height: 38, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', border: 'none', borderRadius: 0, fontSize: 14, boxShadow: 'none', padding: '0 12px', margin: 0 }}
        onClick={() => setOpen(o => !o)}
      >
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}>
          {selected.length === 0
            ? 'Nenhum'
            : selected.length === options.length
              ? allLabel
              : `${selected.length} selecionados`}
        </span>
        <i className={`bi ${open ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ marginLeft: 8 }} />
      </button>
      {hasPreRendered && createPortal(dropdownJSX, document.body)}
    </div>
  );
}

// Tipos para os dados individuais
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

function EmptyMessage({ text, showEdit, onEdit }: { text: string; showEdit?: boolean; onEdit?: () => void }) {
  return (
    <div style={{ height: '100%', minHeight: 120, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <span style={{ color: 'var(--color-text-secondary)', fontSize: 15, textAlign: 'center' }}>{text}</span>
      {showEdit && (
        <button onClick={onEdit} style={{ marginTop: 8, border: 'none', background: 'var(--color-background-secondary)', borderRadius: 6, padding: '6px 14px', color: 'var(--color-accent-primary)', fontWeight: 500, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 1px 4px 0 rgba(0,0,0,0.04)', cursor: 'pointer' }}>
          <i className="bi bi-pencil" /> Editar
        </button>
      )}
    </div>
  );
}

function PartitionCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--color-background-primary)', minHeight: 120, position: 'relative', display: 'flex', flexDirection: 'column', flex: '1 1 0%', borderRadius: 10 }}>
      <div style={{ flex: 1, minHeight: 60, width: '100%' }}>{children}</div>
    </div>
  );
}

type PartitionProps = { destaque?: Destaque; oportunidades?: Oportunidade[]; plano?: PlanoAcao; isAdmin: boolean; onEdit?: () => void; year?: string; month?: string };
function DestaquesPartition({ destaque, isAdmin, onEdit }: PartitionProps) {
  if (!destaque) {
    return <PartitionCard><EmptyMessage text="Nenhum destaque encontrado para este período." showEdit={isAdmin} onEdit={onEdit} /></PartitionCard>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'row', gap: 12 }}>
      <div style={{ flex: 1, background: 'rgba(0,200,100,0.04)', borderRadius: 8, padding: 10, minHeight: 60 }}>
        <div style={{ color: '#1bbf5c', fontWeight: 600, fontSize: 14, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}><i className="bi bi-hand-thumbs-up" /> Positivos</div>
        {destaque.positivos.length > 0 ? destaque.positivos.map((t, i) => (
          <div key={i} style={{ color: '#1bbf5c', fontSize: 14, marginBottom: 2, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <span style={{ fontSize: 18, lineHeight: 1, marginRight: 4, display: 'inline-block' }}>•</span>
            <span style={{ textAlign: 'left', flex: 1 }}>{t}</span>
          </div>
        )) : <span style={{ color: '#1bbf5c', fontSize: 13 }}>Nenhum</span>}
      </div>
      <div style={{ flex: 1, background: 'rgba(220,53,69,0.04)', borderRadius: 8, padding: 10, minHeight: 60 }}>
        <div style={{ color: '#dc3545', fontWeight: 600, fontSize: 14, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}><i className="bi bi-hand-thumbs-down" /> Negativos</div>
        {destaque.negativos.length > 0 ? destaque.negativos.map((t, i) => (
          <div key={i} style={{ color: '#dc3545', fontSize: 14, marginBottom: 2, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <span style={{ fontSize: 18, lineHeight: 1, marginRight: 4, display: 'inline-block' }}>•</span>
            <span style={{ textAlign: 'left', flex: 1 }}>{t}</span>
          </div>
        )) : <span style={{ color: '#dc3545', fontSize: 13 }}>Nenhum</span>}
      </div>
    </div>
  );
}

function OportunidadesPartition({ oportunidades = [], isAdmin, onEdit }: PartitionProps) {
  if (!oportunidades || oportunidades.length === 0) {
    return <PartitionCard><EmptyMessage text="Nenhuma oportunidade encontrada para este período." showEdit={isAdmin} onEdit={onEdit} /></PartitionCard>;
  }
  return (
    <PartitionCard>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, background: 'var(--color-background-secondary)' }}>
        {oportunidades.map(op => (
          <div key={op.id} style={{ background: 'var(--color-background-secondary)', borderRadius: 8, padding: 12, border: '1px solid var(--color-border-divider)' }}>
            <div style={{ color: 'var(--color-text-primary)', fontWeight: 600, fontSize: 14, marginBottom: 8, textAlign: 'left' }}>{op.titulo}</div>
            <div style={{ display: 'flex', flexDirection: 'row', gap: 12 }}>
              {/* Desafios */}
              <div style={{ flex: 1, background: 'rgba(230, 126, 34, 0.08)', borderRadius: 8, padding: 10, minHeight: 60 }}>
                <div style={{ color: '#e67e22', fontWeight: 600, fontSize: 14, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="bi bi-exclamation-triangle" /> Desafios
                </div>
                {op.desafios.length > 0 ? op.desafios.map((t, i) => (
                  <div key={i} style={{ color: '#e67e22', fontSize: 14, marginBottom: 2, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                    <span style={{ fontSize: 18, lineHeight: 1, marginRight: 4, display: 'inline-block' }}>•</span>
                    <span style={{ textAlign: 'left', flex: 1 }}>{t}</span>
                  </div>
                )) : <span style={{ color: '#e67e22', fontSize: 13 }}>Nenhum</span>}
              </div>
              {/* Melhorias */}
              <div style={{ flex: 1, background: 'rgba(46, 107, 230, 0.08)', borderRadius: 8, padding: 10, minHeight: 60 }}>
                <div style={{ color: '#2e86de', fontWeight: 600, fontSize: 14, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="bi bi-lightbulb" /> Melhorias
                </div>
                {op.melhorias.length > 0 ? op.melhorias.map((t, i) => (
                  <div key={i} style={{ color: '#2e86de', fontSize: 14, marginBottom: 2, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                    <span style={{ fontSize: 18, lineHeight: 1, marginRight: 4, display: 'inline-block' }}>•</span>
                    <span style={{ textAlign: 'left', flex: 1 }}>{t}</span>
                  </div>
                )) : <span style={{ color: '#2e86de', fontSize: 13 }}>Nenhuma</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </PartitionCard>
  );
}

// Componente de Tooltip personalizado
function MetricTooltip({ children, title, content, agingDetails }: { 
  children: React.ReactNode; 
  title: string; 
  content: string;
  agingDetails?: { interval: string; value: number; percentage: number }[];
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const handleMouseEnter = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPosition({ x: rect.left + rect.width / 2, y: rect.top - 10 });
    setShowTooltip(true);
  };

  const handleMouseLeave = () => {
    setShowTooltip(false);
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
        {children}
      </div>
      {showTooltip && (
        <div
          style={{
            position: 'fixed',
            left: position.x,
            top: position.y,
            transform: 'translateX(-50%) translateY(-100%)',
            background: 'var(--color-background-secondary)',
            border: '1px solid var(--color-border-divider)',
            borderRadius: 8,
            padding: '12px',
            fontSize: 13,
            color: 'var(--color-text-primary)',
            maxWidth: 350,
            zIndex: 1000,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--color-accent-primary)' }}>{title}</div>
          <div style={{ color: 'var(--color-text-secondary)', lineHeight: 1.4, marginBottom: agingDetails && agingDetails.length > 0 ? 8 : 0 }}>{content}</div>
          
          {agingDetails && agingDetails.length > 0 && (
            <div style={{ marginTop: 8, borderTop: '1px solid var(--color-border-divider)', paddingTop: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--color-accent-primary)', marginBottom: 6 }}>Aging Detail:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {agingDetails.map((detail, index) => (
                  <div key={index}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '4px 0' }}>
                      <span style={{ color: 'var(--color-text-secondary)', minWidth: 80 }}>{detail.interval}</span>
                      <span style={{ color: 'var(--color-text-primary)', fontWeight: 500, margin: '0 8px' }}>
                        {detail.value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                      </span>
                      <span style={{ color: 'var(--color-accent-primary)', fontWeight: 600, minWidth: 40, textAlign: 'right' }}>
                        {detail.percentage.toFixed(1)}%
                      </span>
                    </div>
                    {index < agingDetails.length - 1 && (
                      <div style={{ 
                        height: '1px', 
                        background: 'var(--color-border-divider)', 
                        margin: '4px 0',
                        opacity: 0.6 
                      }} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Componente Modal para edição/criação
function EditModal({ isOpen, onClose, type, data, onSave }: {
  isOpen: boolean;
  onClose: () => void;
  type: 'destaque' | 'oportunidade' | 'plano';
  data?: Destaque | Oportunidade | PlanoAcao | null;
  onSave: (data: Destaque | Oportunidade | PlanoAcao) => void;
}) {
  const [formData, setFormData] = useState<Partial<Destaque | Oportunidade | PlanoAcao>>({});

  useEffect(() => {
    if (data) {
      setFormData(data);
    } else {
      setFormData({});
    }
  }, [data]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData as Destaque | Oportunidade | PlanoAcao);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--color-background-primary)',
        borderRadius: 12,
        padding: 24,
        maxWidth: 500,
        width: '90%',
        maxHeight: '80vh',
        overflow: 'auto',
      }}>
        <h3 style={{ marginBottom: 20, color: 'var(--color-text-primary)' }}>
          {data ? 'Editar' : 'Criar'} {type === 'destaque' ? 'Destaque' : type === 'oportunidade' ? 'Oportunidade' : 'Plano de Ação'}
        </h3>
        <form onSubmit={handleSubmit}>
          {type === 'destaque' && (
            <>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, color: 'var(--color-text-primary)' }}>
                  Pontos Positivos
                </label>
                <textarea
                  value={(formData as Partial<Destaque>).positivos?.join('\n') || ''}
                  onChange={(e) => setFormData({...formData, positivos: e.target.value.split('\n').filter(Boolean)})}
                  style={{
                    width: '100%',
                    minHeight: 80,
                    padding: 8,
                    border: '1px solid var(--color-border-divider)',
                    borderRadius: 6,
                    background: 'var(--color-background-secondary)',
                    color: 'var(--color-text-primary)',
                  }}
                  placeholder="Digite os pontos positivos, um por linha"
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, color: 'var(--color-text-primary)' }}>
                  Pontos Negativos
                </label>
                <textarea
                  value={(formData as Partial<Destaque>).negativos?.join('\n') || ''}
                  onChange={(e) => setFormData({...formData, negativos: e.target.value.split('\n').filter(Boolean)})}
                  style={{
                    width: '100%',
                    minHeight: 80,
                    padding: 8,
                    border: '1px solid var(--color-border-divider)',
                    borderRadius: 6,
                    background: 'var(--color-background-secondary)',
                    color: 'var(--color-text-primary)',
                  }}
                  placeholder="Digite os pontos negativos, um por linha"
                />
              </div>
            </>
          )}
          {type === 'oportunidade' && (
            <>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, color: 'var(--color-text-primary)' }}>
                  Título
                </label>
                <input
                  type="text"
                  value={(formData as Partial<Oportunidade>).titulo || ''}
                  onChange={(e) => setFormData({...formData, titulo: e.target.value})}
                  style={{
                    width: '100%',
                    padding: 8,
                    border: '1px solid var(--color-border-divider)',
                    borderRadius: 6,
                    background: 'var(--color-background-secondary)',
                    color: 'var(--color-text-primary)',
                  }}
                  placeholder="Digite o título da oportunidade"
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, color: 'var(--color-text-primary)' }}>
                  Desafios
                </label>
                <textarea
                  value={(formData as Partial<Oportunidade>).desafios?.join('\n') || ''}
                  onChange={(e) => setFormData({...formData, desafios: e.target.value.split('\n').filter(Boolean)})}
                  style={{
                    width: '100%',
                    minHeight: 80,
                    padding: 8,
                    border: '1px solid var(--color-border-divider)',
                    borderRadius: 6,
                    background: 'var(--color-background-secondary)',
                    color: 'var(--color-text-primary)',
                  }}
                  placeholder="Digite os desafios, um por linha"
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, color: 'var(--color-text-primary)' }}>
                  Melhorias
                </label>
                <textarea
                  value={(formData as Partial<Oportunidade>).melhorias?.join('\n') || ''}
                  onChange={(e) => setFormData({...formData, melhorias: e.target.value.split('\n').filter(Boolean)})}
                  style={{
                    width: '100%',
                    minHeight: 80,
                    padding: 8,
                    border: '1px solid var(--color-border-divider)',
                    borderRadius: 6,
                    background: 'var(--color-background-secondary)',
                    color: 'var(--color-text-primary)',
                  }}
                  placeholder="Digite as melhorias, um por linha"
                />
              </div>
            </>
          )}
          {type === 'plano' && (
            <>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, color: 'var(--color-text-primary)' }}>
                  Título
                </label>
                <input
                  type="text"
                  value={(formData as Partial<PlanoAcao>).titulo || ''}
                  onChange={(e) => setFormData({...formData, titulo: e.target.value})}
                  style={{
                    width: '100%',
                    padding: 8,
                    border: '1px solid var(--color-border-divider)',
                    borderRadius: 6,
                    background: 'var(--color-background-secondary)',
                    color: 'var(--color-text-primary)',
                  }}
                  placeholder="Digite o título do plano"
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, color: 'var(--color-text-primary)' }}>
                  Descrição
                </label>
                <textarea
                  value={(formData as Partial<PlanoAcao>).descricao || ''}
                  onChange={(e) => setFormData({...formData, descricao: e.target.value})}
                  style={{
                    width: '100%',
                    minHeight: 80,
                    padding: 8,
                    border: '1px solid var(--color-border-divider)',
                    borderRadius: 6,
                    background: 'var(--color-background-secondary)',
                    color: 'var(--color-text-primary)',
                  }}
                  placeholder="Digite a descrição do plano"
                />
              </div>
            </>
          )}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                border: '1px solid var(--color-border-divider)',
                borderRadius: 6,
                background: 'var(--color-background-secondary)',
                color: 'var(--color-text-primary)',
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: 6,
                background: 'var(--color-accent-primary)',
                color: 'white',
                cursor: 'pointer',
              }}
            >
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Componente de loading centralizado para partições
function PartitionLoading() {
  return (
    <div style={{
      minHeight: 120,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: '100%',
      background: 'transparent',
    }}>
      <div className="spinner-border" style={{ width: 40, height: 40, color: 'var(--color-accent-primary)' }} role="status">
        <span className="visually-hidden">Carregando...</span>
      </div>
    </div>
  );
}

export default function AccountingIndicators({ usuario_responsavel_id, tela_id, ofThisScreen, planos_iniciais = [] }: AccountingIndicatorsProps) {
  // Estados para dados
  const [allData, setAllData] = useState<AccountingRow[]>([]);
  const [filteredData, setFilteredData] = useState<AccountingRow[]>([]);
  
  // Estados para filtros
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedGroup, setSelectedGroup] = useState<'all' | 'receivables' | 'payables'>('all');
  const [separateAging, setSeparateAging] = useState<boolean>(false);
  const [selectedAging, setSelectedAging] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string[]>([]);
  
  // Estados para opções de filtro
  const [years, setYears] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [agingIntervals, setAgingIntervals] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  
  // Estados para partições laterais (igual ao timesheet)
  const [allHighlights, setAllHighlights] = useState<Destaque[]>([]);
  const [allOportunidades, setAllOportunidades] = useState<Oportunidade[]>([]);
  const [partitionLoading, setPartitionLoading] = useState(false);
  const [openPlanoId, setOpenPlanoId] = useState<string>('');
  
  // Estados para modais
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'destaque' | 'oportunidade' | 'plano' | null>(null);
  const [modalData, setModalData] = useState<Destaque | Oportunidade | PlanoAcao | null>(null);

  // NOVO: Estados para o modal de visualização
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [viewModalType, setViewModalType] = useState<'destaque' | 'oportunidade' | 'plano' | null>(null);
  const [viewModalData, setViewModalData] = useState<Destaque | Oportunidade | PlanoAcao | null>(null);
  const [responsavelNome, setResponsavelNome] = useState<string>('');

  // Estados para planos de ação (igual ao timesheet)
  const [planosAbertos, setPlanosAbertos] = useState<PlanoAcao[]>(planos_iniciais);
  const [allPlanos, setAllPlanos] = useState<PlanoAcao[]>([]);
  const [allAcoes, setAllAcoes] = useState<Acao[]>([]);

  // Cores do tema
  const isDark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
  const accent = '#2E6BE6';
  const textSecondary = isDark ? '#adb5bd' : '#6c757d';
  const borderDivider = isDark ? '#495057' : '#dee2e6';

  // Estados para cache global de todas as telas
  const [globalCache, setGlobalCache] = useState<Record<string, { highlights: Destaque[], oportunidades: Oportunidade[] }>>({});

  // Funções auxiliares
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

  function getMostRecentMonthKey<T>(obj: Record<string, T>) {
    const keys = Object.keys(obj).sort((a, b) => b.localeCompare(a));
    return keys[0] || '';
  }

  // Função reutilizável para buscar todos os dados individuais
  const fetchAllIndividual = async () => {
    let highlights: Destaque[] = [];
    let oportunidades: Oportunidade[] = [];
    
    // Verificar se já temos cache para esta tela
    const cacheKey = `tela_${tela_id}_user_${usuario_responsavel_id}`;
    const cachedData = globalCache[cacheKey];
    
    if (cachedData) {
      console.log('📦 Usando cache para:', cacheKey);
      highlights = cachedData.highlights;
      oportunidades = cachedData.oportunidades;
    } else {
      console.log('🔄 Buscando dados do banco para:', cacheKey);
      
      // Sempre buscar dados frescos do banco para garantir consistência
      // Destaques - usar tela_id (UUID) correto
      const { data: destaquesResult } = await supabase
        .from('destaques')
        .select('*')
        .eq('usuario_id', usuario_responsavel_id)
        .eq('tela_id', tela_id);
      
      highlights = destaquesResult || [];
      
      // Destaques positivos/negativos
      const { data: positivos } = await supabase.from('destaques_positivos').select('*');
      const { data: negativos } = await supabase.from('destaques_negativos').select('*');
      
      highlights = highlights.map(d => ({
        ...d,
        positivos: (positivos || []).filter((p: { destaque_id: string; texto: string }) => p.destaque_id === d.id).map((p: { texto: string }) => p.texto),
        negativos: (negativos || []).filter((n: { destaque_id: string; texto: string }) => n.destaque_id === d.id).map((n: { texto: string }) => n.texto),
      }));
      
      // Oportunidades - usar tela_id (UUID) correto
      const { data: opsResult } = await supabase
        .from('oportunidades')
        .select('*')
        .eq('usuario_id', usuario_responsavel_id)
        .eq('tela_id', tela_id);
      
      const { data: desafios } = await supabase.from('desafios').select('*');
      const { data: melhorias } = await supabase.from('melhorias').select('*');
      
      oportunidades = (opsResult || []).map((op: Oportunidade) => ({
        ...op,
        desafios: (desafios || []).filter((d: { oportunidade_id: string; texto: string }) => d.oportunidade_id === op.id).map((d: { texto: string }) => d.texto),
        melhorias: (melhorias || []).filter((m: { oportunidade_id: string; texto: string }) => m.oportunidade_id === op.id).map((m: { texto: string }) => m.texto),
      }));
      
      // Salvar no cache global
      setGlobalCache(prev => ({
        ...prev,
        [cacheKey]: { highlights, oportunidades }
      }));
      
      console.log('💾 Dados salvos no cache:', cacheKey);
    }
    
    // Atualizar estados para exibição (apenas dados da tela atual)
    setAllHighlights(highlights);
    setAllOportunidades(oportunidades);
    
    return { highlights, oportunidades };
  };

  // useEffect único e robusto para carregar dados
  useEffect(() => {
    if (usuario_responsavel_id && tela_id) {
      console.log('🔄 Carregando dados para tela:', tela_id, 'usuário:', usuario_responsavel_id);
      
      // Iniciar loading
      setPartitionLoading(true);
      
      // Buscar dados
      fetchAllIndividual()
        .catch((error) => {
          console.error('Erro ao carregar dados:', error);
        })
        .finally(() => {
          setPartitionLoading(false);
        });
    }
  }, [usuario_responsavel_id, tela_id]); // Dependências específicas

  // Buscar todos os planos de ação e ações ao montar
  useEffect(() => {
    const fetchAllPlanosEAcoes = async () => {
      const { data: planosData } = await supabase.from('planos_de_acao').select('*');
      const { data: acoesData } = await supabase.from('acoes').select('*');
      setAllPlanos(planosData || []);
      setAllAcoes(acoesData || []);
    };
    fetchAllPlanosEAcoes();
  }, []);

  // Sempre que usuario_responsavel_id, tela_id, allPlanos ou allAcoes mudarem, filtrar e montar os planos exibidos
  useEffect(() => {
    if (!usuario_responsavel_id) return;
    // Filtrar planos do responsável
    const planosFiltrados = allPlanos.filter(
      plano => plano.usuario_id === usuario_responsavel_id
    );
    // Para cada plano, adicionar as ações correspondentes
    const planosComAcoes = planosFiltrados.map(plano => ({
      ...plano,
      acoes: allAcoes.filter(acao => acao.plano_id === plano.id),
    }));
    setPlanosAbertos(planosComAcoes);
  }, [usuario_responsavel_id, allPlanos, allAcoes]);

  // Agrupar dados por mês/ano
  const highlightsByMonth = groupByMonthYear(allHighlights);
  const oportunidadesByMonth = groupByMonthYear(allOportunidades);
  
  // Estados de expansão para cada partição - SOLUÇÃO ROBUSTA
  const [openDestaques, setOpenDestaques] = React.useState<string>('');
  const [openOportunidades, setOpenOportunidades] = React.useState<string>('');
  
  // Removido: expansão inicial automática - agora todos os botões começam retraídos

  // Função para formatar título do card
  function formatMonthYear(key: string) {
    const [ano, mes] = key.split('-');
    const nomeMes = mes ? dayjs(`${ano}-${mes}-01`).format('MMMM') : '';
    return `${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)} / ${ano}`;
  }

  // Buscar dados contábeis
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Buscar dados de receivables_accounting usando a coluna date_field
        const { data: receivablesData, error } = await supabase
          .from('receivables_accounting')
          .select('*');
        
        if (error) {
          console.error('Erro ao buscar dados:', error);
          return;
        }

        // Transformar dados para o formato esperado
        const transformedData: AccountingRow[] = (receivablesData || []).map((row: Record<string, unknown>) => ({
          id: String(row.id || ''),
          date: String(row.date_field || row.date || ''), // Usar date_field se disponível, senão date
          open_balance: parseFloat(String(row.open_balance)) || 0,
          aging_intervals: String(row.aging_intervals || ''),
          category: String(row.category || ''),
          type: 'receivables' as const
        }));

        setAllData(transformedData);

        // Extrair filtros únicos
        const uniqueAging = [...new Set(transformedData.map(d => d.aging_intervals).filter(Boolean))];
        const uniqueCategories = [...new Set(transformedData.map(d => d.category).filter(Boolean))];
        const uniqueYears = [...new Set(transformedData.map(d => d.date?.split('-')[0]).filter(Boolean))].sort((a, b) => Number(b) - Number(a));

        setAgingIntervals(uniqueAging);
        setCategories(uniqueCategories);
        setYears(uniqueYears);

        // Selecionar ano atual se existir
        const currentYear = dayjs().format('YYYY');
        if (uniqueYears.includes(currentYear)) {
          setSelectedYear(currentYear);
        } else if (uniqueYears.length > 0) {
          setSelectedYear(uniqueYears[0]);
        }

        // Inicializar filtros com "Todos" selecionado (igual ao timesheet)
        setSelectedAging(uniqueAging);
        setSelectedCategory(uniqueCategories);

        // Verificar se há apenas um mês (junho) e setar o filtro de mês
        const uniqueMonths = [...new Set(transformedData.map(d => {
          if (!d.date) return null;
          return String(Number(d.date.split('-')[1])).padStart(2, '0');
        }).filter(Boolean))];
        if (uniqueMonths.length === 1 && uniqueMonths[0]) {
          setSelectedMonth(uniqueMonths[0] as string);
        }

      } catch (error) {
        console.error('Erro ao carregar dados:', error);
      }
    };

    fetchData();
  }, []);

  // Atualizar meses disponíveis conforme ano selecionado
  useEffect(() => {
    if (!selectedYear) {
      setMonths([]);
      if (selectedMonth) setSelectedMonth('');
      return;
    }
    // Pega todos os meses únicos do ano selecionado
    const meses = [
      ...new Set(
        allData
          .filter(d => d.date && d.date.startsWith(selectedYear + '-'))
          .map(d => String(Number(d.date.split('-')[1])).padStart(2, '0'))
          .filter(Boolean)
      ),
    ].sort((a, b) => Number(a) - Number(b));
    setMonths(meses);
    // Se o mês selecionado não existir mais, resetar
    if (selectedMonth && !meses.includes(selectedMonth)) setSelectedMonth('');
  }, [selectedYear, allData]);

  // Filtrar dados exibidos (gráfico/tabela)
  useEffect(() => {
    let filtered = allData;
    if (selectedYear) filtered = filtered.filter(d => d.date && d.date.startsWith(selectedYear + '-'));
    if (selectedMonth) filtered = filtered.filter(d => d.date && String(Number(d.date.split('-')[1])).padStart(2, '0') === selectedMonth);
    if (selectedGroup !== 'all') filtered = filtered.filter(d => d.type === selectedGroup);
    if (selectedAging.length > 0) filtered = filtered.filter(d => selectedAging.includes(d.aging_intervals));
    if (selectedCategory.length > 0) filtered = filtered.filter(d => selectedCategory.includes(d.category));
    setFilteredData(filtered);
  }, [allData, selectedYear, selectedMonth, selectedGroup, selectedAging, selectedCategory]);

  // Calcular métricas
  const totalReceivable = filteredData
    .filter(d => d.type === 'receivables')
    .reduce((sum, d) => sum + d.open_balance, 0);
  
  const totalPayable = filteredData
    .filter(d => d.type === 'payables')
    .reduce((sum, d) => sum + d.open_balance, 0);
  
  const totalOutstanding = totalReceivable + totalPayable;

  // Função para calcular aging details
  const calculateAgingDetails = (type: 'receivables' | 'payables' | 'all') => {
    const relevantData = type === 'all' 
      ? filteredData 
      : filteredData.filter(d => d.type === type);
    
    const agingMap = new Map<string, number>();
    
    relevantData.forEach(row => {
      if (row.aging_intervals && row.open_balance > 0) {
        const current = agingMap.get(row.aging_intervals) || 0;
        agingMap.set(row.aging_intervals, current + row.open_balance);
      }
    });
    
    const total = Array.from(agingMap.values()).reduce((sum, value) => sum + value, 0);
    
    return Array.from(agingMap.entries()).map(([interval, value]) => ({
      interval,
      value,
      percentage: total > 0 ? (value / total) * 100 : 0
    })).sort((a, b) => {
      // Ordenar por intervalo de tempo (assumindo formato como "1-30", "31-60", etc.)
      const aStart = parseInt(a.interval.split('-')[0]) || 0;
      const bStart = parseInt(b.interval.split('-')[0]) || 0;
      return aStart - bStart;
    });
  };

  // Calcular aging details para cada métrica
  const receivablesAgingDetails = calculateAgingDetails('receivables');
  const payablesAgingDetails = calculateAgingDetails('payables');
  const outstandingAgingDetails = calculateAgingDetails('all');

  // Funções para modais
  const handleSave = async (data: Destaque | Oportunidade | PlanoAcao) => {
    try {
      if (modalData) {
        // Editar
        const { error } = await supabase
          .from(modalType === 'destaque' ? 'destaques' : modalType === 'oportunidade' ? 'oportunidades' : 'planos_acao')
          .update(data)
          .eq('id', modalData.id);
        
        if (error) throw error;
      } else {
        // Criar
        const newData = {
          ...data,
          tela_id: tela_id,
          mes: selectedMonth || dayjs().format('MM'),
          ano: selectedYear || dayjs().format('YYYY'),
        };
        
        const { error } = await supabase
          .from(modalType === 'destaque' ? 'destaques' : modalType === 'oportunidade' ? 'oportunidades' : 'planos_acao')
          .insert(newData);
        
        if (error) throw error;
      }
      
      // Recarregar dados
      window.location.reload();
    } catch (error) {
      console.error('Erro ao salvar:', error);
    }
  };

  // Preparar dados do gráfico
  const chartLabels: string[] = [];
  const chartDatasets: Array<{
    label: string;
    data: number[];
    borderColor: string;
    backgroundColor: string;
    pointBackgroundColor: string;
    pointBorderColor: string;
    pointRadius: number;
    pointHoverRadius: number;
    borderWidth: number;
    fill: boolean;
    tension: number;
  }> = [];

  if (selectedYear && selectedMonth) {
    // Gráfico dia a dia do mês selecionado
    const receivablesByDay: Record<string, number> = {};
    const payablesByDay: Record<string, number> = {};
    
    filteredData.forEach(row => {
      if (row.date && row.date.split('-').length === 3 && row.open_balance > 0) {
        const dia = String(Number(row.date.split('-')[2])).padStart(2, '0');
        if (row.type === 'receivables') {
          receivablesByDay[dia] = (receivablesByDay[dia] || 0) + row.open_balance;
        } else if (row.type === 'payables') {
          payablesByDay[dia] = (payablesByDay[dia] || 0) + row.open_balance;
        }
      }
    });

    // Só mostra os dias que realmente têm dados válidos
    const diasComDados = [
      ...new Set([
        ...Object.keys(receivablesByDay).filter(dia => receivablesByDay[dia] > 0),
        ...Object.keys(payablesByDay).filter(dia => payablesByDay[dia] > 0)
      ])
    ].sort((a, b) => Number(a) - Number(b));

    chartLabels.push(...diasComDados);

    if (separateAging && selectedGroup !== 'payables') {
      // Separar receivables por aging interval
      const agingIntervals = [...new Set(filteredData.filter(d => d.type === 'receivables' && d.open_balance > 0).map(d => d.aging_intervals).filter(Boolean))];
      const colors = ['#1bbf5c', '#2ecc71', '#27ae60', '#16a085', '#0e6655']; // Gradação de verde
      
      agingIntervals.forEach((aging, index) => {
        const data: number[] = [];
        chartLabels.forEach(dia => {
          const value = filteredData
            .filter(d => d.type === 'receivables' && d.aging_intervals === aging && d.date && String(Number(d.date.split('-')[2])).padStart(2, '0') === dia && d.open_balance > 0)
            .reduce((sum, d) => sum + d.open_balance, 0);
          data.push(value);
        });
        
        chartDatasets.push({
          label: `Receivables - ${aging}`,
          data: data,
          borderColor: colors[index % colors.length],
          backgroundColor: colors[index % colors.length],
          pointBackgroundColor: colors[index % colors.length],
          pointBorderColor: colors[index % colors.length],
          pointRadius: 4, // igual ao timesheet_analysis
          pointHoverRadius: 6, // igual ao timesheet_analysis
          borderWidth: 3,
          fill: false,
          tension: 0.25,
        });
      });
    } else if (selectedGroup !== 'payables') {
      // Gráfico normal (receivables como linha única)
      const receivablesData: number[] = [];
      chartLabels.forEach(dia => {
        receivablesData.push(receivablesByDay[dia] || 0);
      });
      
      chartDatasets.push({
        label: 'Receivables',
        data: receivablesData,
        borderColor: '#1bbf5c',
        backgroundColor: '#1bbf5c',
        pointBackgroundColor: '#1bbf5c',
        pointBorderColor: '#1bbf5c',
        pointRadius: 4, // igual ao timesheet_analysis
        pointHoverRadius: 6, // igual ao timesheet_analysis
        borderWidth: 3,
        fill: false,
        tension: 0.25,
      });
    }
    
    // Adicionar payables apenas se não estiver filtrando por receivables
    if (selectedGroup !== 'receivables') {
      const payablesData: number[] = [];
      chartLabels.forEach(dia => {
        payablesData.push(payablesByDay[dia] || 0);
      });
      
      chartDatasets.push({
        label: 'Payables',
        data: payablesData,
        borderColor: '#dc3545',
        backgroundColor: '#dc3545',
        pointBackgroundColor: '#dc3545',
        pointBorderColor: '#dc3545',
        pointRadius: 4, // igual ao timesheet_analysis
        pointHoverRadius: 6, // igual ao timesheet_analysis
        borderWidth: 3,
        fill: false,
        tension: 0.25,
      });
    }
  } else if (selectedYear) {
    // Gráfico mês a mês do ano selecionado
    const receivablesByMonth: Record<string, number> = {};
    const payablesByMonth: Record<string, number> = {};
    
    filteredData.forEach(row => {
      if (row.date && row.date.split('-').length >= 2 && row.open_balance > 0) {
        const mes = String(Number(row.date.split('-')[1])).padStart(2, '0');
        if (row.type === 'receivables') {
          receivablesByMonth[mes] = (receivablesByMonth[mes] || 0) + row.open_balance;
        } else if (row.type === 'payables') {
          payablesByMonth[mes] = (payablesByMonth[mes] || 0) + row.open_balance;
        }
      }
    });

    // Só mostra os meses que realmente têm dados válidos
    const mesesComDados = [
      ...new Set([
        ...Object.keys(receivablesByMonth).filter(mes => receivablesByMonth[mes] > 0),
        ...Object.keys(payablesByMonth).filter(mes => payablesByMonth[mes] > 0)
      ])
    ].sort((a, b) => Number(a) - Number(b));

    chartLabels.push(...mesesComDados);

    if (separateAging && selectedGroup !== 'payables') {
      // Separar receivables por aging interval
      const agingIntervals = [...new Set(filteredData.filter(d => d.type === 'receivables' && d.open_balance > 0).map(d => d.aging_intervals).filter(Boolean))];
      const colors = ['#1bbf5c', '#2ecc71', '#27ae60', '#16a085', '#0e6655']; // Gradação de verde
      
      agingIntervals.forEach((aging, index) => {
        const data: number[] = [];
        chartLabels.forEach(mes => {
          const value = filteredData
            .filter(d => d.type === 'receivables' && d.aging_intervals === aging && d.date && String(Number(d.date.split('-')[1])).padStart(2, '0') === mes && d.open_balance > 0)
            .reduce((sum, d) => sum + d.open_balance, 0);
          data.push(value);
        });
        
        chartDatasets.push({
          label: `Receivables - ${aging}`,
          data: data,
          borderColor: colors[index % colors.length],
          backgroundColor: colors[index % colors.length],
          pointBackgroundColor: colors[index % colors.length],
          pointBorderColor: colors[index % colors.length],
          pointRadius: 4, // igual ao timesheet_analysis
          pointHoverRadius: 6, // igual ao timesheet_analysis
          borderWidth: 3,
          fill: false,
          tension: 0.25,
        });
      });
    } else if (selectedGroup !== 'payables') {
      // Gráfico normal (receivables como linha única)
      const receivablesData: number[] = [];
      chartLabels.forEach(mes => {
        receivablesData.push(receivablesByMonth[mes] || 0);
      });
      
      chartDatasets.push({
        label: 'Receivables',
        data: receivablesData,
        borderColor: '#1bbf5c',
        backgroundColor: '#1bbf5c',
        pointBackgroundColor: '#1bbf5c',
        pointBorderColor: '#1bbf5c',
        pointRadius: 4, // igual ao timesheet_analysis
        pointHoverRadius: 6, // igual ao timesheet_analysis
        borderWidth: 3,
        fill: false,
        tension: 0.25,
      });
    }
    
    // Adicionar payables apenas se não estiver filtrando por receivables
    if (selectedGroup !== 'receivables') {
      const payablesData: number[] = [];
      chartLabels.forEach(mes => {
        payablesData.push(payablesByMonth[mes] || 0);
      });
      
      chartDatasets.push({
        label: 'Payables',
        data: payablesData,
        borderColor: '#dc3545',
        backgroundColor: '#dc3545',
        pointBackgroundColor: '#dc3545',
        pointBorderColor: '#dc3545',
        pointRadius: 4, // igual ao timesheet_analysis
        pointHoverRadius: 6, // igual ao timesheet_analysis
        borderWidth: 3,
        fill: false,
        tension: 0.25,
      });
    }
  }

  const chartData = {
    labels: chartLabels,
    datasets: chartDatasets,
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { 
        display: true,
        position: 'top' as const,
        labels: {
          color: textSecondary,
          usePointStyle: true,
          boxWidth: 10,
          boxHeight: 10,
        }
      },
      title: { display: false },
      tooltip: {
        backgroundColor: isDark ? '#23272f' : '#fff',
        titleColor: isDark ? '#FFD700' : accent,
        bodyColor: isDark ? '#fff' : '#222',
        borderColor: accent,
        borderWidth: 1,
        callbacks: {
          label: function(context: TooltipItem<'line'>) {
            const label = context.dataset.label || '';
            const value = context.parsed.y;
            return `${label}: ${value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`;
          }
        }
      },
    },
    scales: {
      x: {
        grid: { 
          color: textSecondary, 
          drawBorder: true,
          lineWidth: 1,
          drawOnChartArea: true,
          drawTicks: true,
        },
        ticks: { 
          color: textSecondary,
          font: { size: 12 }
        },
        title: {
          display: true,
          text: selectedYear && selectedMonth ? 'Days of Month' : 'Months',
          color: textSecondary,
          font: { weight: 600, size: 12 },
        },
      },
      y: {
        grid: { 
          color: textSecondary, 
          drawBorder: true,
          lineWidth: 1,
          drawOnChartArea: true,
          drawTicks: true,
        },
        ticks: {
          color: textSecondary,
          font: { size: 12 },
          callback: function(tickValue: string | number) {
            let n = typeof tickValue === 'number' ? tickValue : Number(tickValue);
            if (isNaN(n)) return tickValue;
            let label = '';
            if (Math.abs(n) >= 1_000_000) {
              label = `$ ${(n/1_000_000).toFixed(1)}M`;
            } else if (Math.abs(n) >= 1_000) {
              label = `$ ${(n/1_000).toFixed(0)}K`;
            } else {
              label = `$ ${n}`;
            }
            return label;
          },
        },
        beginAtZero: true,
        title: {
          display: true,
          text: 'Value ($)',
          color: textSecondary,
          font: { weight: 600, size: 12 },
        },
      },
    },
  };

  // Estilo para selects customizados (igual ao timesheet)
  const selectStyle: React.CSSProperties = {
    background: 'var(--color-background-primary)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border-divider)',
    borderRadius: 6,
    padding: '4px 8px',
    fontSize: 14,
    transition: 'background 0.3s, color 0.3s, border 0.3s',
  };

  // Função utilitária para comparar ano/mês em qualquer formato de dado
  // Função removida - não utilizada
  
  // Funções utilitárias para objetos vazios
  function emptyDestaque(mes: string, ano: string): Destaque {
    return {
      id: '',
      usuario_id: usuario_responsavel_id,
      tela_id: tela_id,
      mes,
      ano,
      criado_em: new Date().toISOString(),
      positivos: [],
      negativos: [],
    };
  }
  function emptyOportunidade(mes: string, ano: string): Oportunidade {
    return {
      id: '',
      usuario_id: usuario_responsavel_id,
      tela_id: tela_id,
      mes,
      ano,
      titulo: '',
      criado_em: new Date().toISOString(),
      desafios: [],
      melhorias: [],
    };
  }
  function emptyPlanoAcao(): PlanoAcao {
    return {
      id: '',
      usuario_id: usuario_responsavel_id,
      titulo: '',
      descricao: '',
      criado_em: new Date().toISOString(),
      data_inicio: '',
      data_fim: '',
      acoes: [],
    };
  }

  function openModal(type: 'destaque' | 'oportunidade' | 'plano', data: Destaque | Oportunidade | PlanoAcao | null = null) {
    setModalType(type);
    setModalData(data);
    setModalOpen(true);
  }

  // NOVO: Função para abrir modal de visualização
  function openViewModal(type: 'destaque' | 'oportunidade' | 'plano', data: Destaque | Oportunidade | PlanoAcao | null = null) {
    if (!data) return;
    
    // Buscar nome do responsável
    const fetchResponsavelNome = async () => {
      try {
        const { data: userData } = await supabase
          .from('usuarios')
          .select('nome_completo')
          .eq('id', data.usuario_id)
          .single();
        
        setResponsavelNome(userData?.nome_completo || 'Usuário não encontrado');
      } catch (error) {
        setResponsavelNome('Usuário não encontrado');
      }
    };
    
    fetchResponsavelNome();
    setViewModalType(type);
    setViewModalData(data);
    setViewModalOpen(true);
  }

  return (
    <div id="content" style={{ height: '100%', minHeight: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div className="d-flex flex-row justify-content-between align-items-center" style={{ padding: '10px 20px', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
        <h1 style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, flex: '0 0 auto', marginBottom: 0 }}>Accounting Indicators</h1>
        <div className="d-flex flex-row align-items-center" style={{ gap: 10, flexWrap: 'wrap', borderLeft: '1px solid var(--color-border-divider)', paddingLeft: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 500, gap: 8, display: 'flex', alignItems: 'center', color: 'var(--color-text-secondary)' }}><i className="bi bi-funnel" />Filtros</span>
          {/* Filtro de tempo (igual ao timesheet) */}
          <div className="input-group" style={{ minWidth: 193, maxWidth: 193, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 38 }}>
            <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', borderRight: '1.5px solid var(--color-border-divider)', height: 38, width: 42, padding: 0 }}>
              <i className="bi bi-calendar-range" style={{ color: 'var(--color-accent-primary)', fontSize: 16 }} />
            </span>
            <select id="year-select" name="year" value={selectedYear} onChange={e => setSelectedYear(e.target.value)} style={{ ...selectStyle, border: 'none', borderRight: '1.5px solid var(--color-border-divider)', borderRadius: 0, height: 38, width: 70, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}>
              <option value="">Todos</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select id="month-select" name="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={{ ...selectStyle, border: 'none', borderRadius: 0, height: 38, width: 75, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}>
              <option value="">Todos</option>
              {months.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          {/* Grupo de botões - Padrão do projeto */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)', height: 38 }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Type</span>
            <button 
              onClick={() => setSelectedGroup('all')} 
              style={{ 
                background: selectedGroup === 'all' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)', 
                color: selectedGroup === 'all' ? 'var(--color-brand-blue)' : 'var(--color-text-primary)', 
                border: selectedGroup === 'all' ? '1.5px solid var(--color-brand-blue)' : '1.5px solid var(--color-border-divider)', 
                borderRadius: 15, 
                padding: '4px 16px', 
                fontWeight: 500, 
                fontSize: 14, 
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                height: 26,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseEnter={(e) => {
                if (selectedGroup !== 'all') {
                  e.currentTarget.style.background = 'var(--color-background-primary)';
                  e.currentTarget.style.borderColor = 'var(--color-brand-blue)';
                  e.currentTarget.style.color = 'var(--color-brand-blue)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = selectedGroup === 'all' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)';
                e.currentTarget.style.borderColor = selectedGroup === 'all' ? 'var(--color-brand-blue)' : 'var(--color-border-divider)';
                e.currentTarget.style.color = selectedGroup === 'all' ? 'var(--color-brand-blue)' : 'var(--color-text-primary)';
              }}
            >
              All
            </button>
            <button 
              onClick={() => setSelectedGroup('receivables')} 
              style={{ 
                background: selectedGroup === 'receivables' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)', 
                color: selectedGroup === 'receivables' ? 'var(--positive-color)' : 'var(--color-text-primary)', 
                border: selectedGroup === 'receivables' ? '1.5px solid var(--positive-color)' : '1.5px solid var(--color-border-divider)', 
                borderRadius: 15, 
                padding: '4px 16px', 
                fontWeight: 500, 
                fontSize: 14, 
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                height: 26,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseEnter={(e) => {
                if (selectedGroup !== 'receivables') {
                  e.currentTarget.style.background = 'var(--color-background-primary)';
                  e.currentTarget.style.borderColor = 'var(--positive-color)';
                  e.currentTarget.style.color = 'var(--positive-color)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = selectedGroup === 'receivables' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)';
                e.currentTarget.style.borderColor = selectedGroup === 'receivables' ? 'var(--positive-color)' : 'var(--color-border-divider)';
                e.currentTarget.style.color = selectedGroup === 'receivables' ? 'var(--positive-color)' : 'var(--color-text-primary)';
              }}
            >
              Receivables
            </button>
            <button 
              style={{ 
                background: 'var(--color-background-primary)', 
                color: 'var(--color-text-secondary)', 
                border: '1.5px solid var(--color-border-divider)', 
                borderRadius: 15, 
                padding: '4px 16px', 
                fontWeight: 500, 
                fontSize: 14, 
                cursor: 'not-allowed',
                opacity: 0.5,
                height: 26,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              disabled
            >
              Payables
            </button>
          </div>
          {/* Separate by Aging Interval - Controle booleano no padrão do projeto */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)', height: 38 }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Separate by Aging</span>
            <button 
              onClick={() => setSeparateAging(!separateAging)} 
              style={{ 
                background: separateAging ? 'var(--color-accent-primary)' : 'var(--color-background-secondary)', 
                color: separateAging ? '#fff' : 'var(--color-accent-primary)', 
                border: '1.5px solid var(--color-border-divider)', 
                borderRadius: 15, 
                padding: '4px 16px', 
                fontWeight: 500, 
                fontSize: 14, 
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                height: 26,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseEnter={(e) => {
                if (!separateAging) {
                  e.currentTarget.style.background = 'var(--color-background-primary)';
                  e.currentTarget.style.borderColor = 'var(--color-accent-primary)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = separateAging ? 'var(--color-accent-primary)' : 'var(--color-background-secondary)';
                e.currentTarget.style.borderColor = 'var(--color-border-divider)';
              }}
            >
              {separateAging ? 'ON' : 'OFF'}
            </button>
          </div>
          {/* Aging Interval */}
          <div className="input-group" style={{ minWidth: 180, maxWidth: 180, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 38, zIndex: 20, display: 'flex' }}>
            <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', borderRight: '1.5px solid var(--color-border-divider)', height: 38, width: 42, padding: 0, color: 'var(--color-accent-primary)', borderTopLeftRadius: 8, borderBottomLeftRadius: 8, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
              <i className="bi bi-hourglass-split" style={{ fontSize: 17 }} />
            </span>
            <div style={{ flex: 1, minWidth: 0, zIndex: 21, borderTopRightRadius: 8, borderBottomRightRadius: 8, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, height: 38 }}>
              <MultiSelectDropdown options={agingIntervals} selected={selectedAging} setSelected={setSelectedAging} allLabel="Todos" dropdownTitle="Aging Interval" />
            </div>
          </div>
          {/* Category */}
          <div className="input-group" style={{ minWidth: 180, maxWidth: 180, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 38, zIndex: 19, display: 'flex' }}>
            <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', borderRight: '1.5px solid var(--color-border-divider)', height: 38, width: 42, padding: 0, color: 'var(--color-accent-primary)', borderTopLeftRadius: 8, borderBottomLeftRadius: 8, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
              <i className="bi bi-tags" style={{ fontSize: 17 }} />
            </span>
            <div style={{ flex: 1, minWidth: 0, zIndex: 20, borderTopRightRadius: 8, borderBottomRightRadius: 8, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, height: 38 }}>
              <MultiSelectDropdown options={categories} selected={selectedCategory} setSelected={setSelectedCategory} allLabel="Todas" dropdownTitle="Category" />
            </div>
          </div>
        </div>
      </div>
      {/* Conteúdo principal: gráfico/tabela à esquerda, partições à direita */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'row', width: '100%', minHeight: 0, minWidth: 0 }}>
        {/* Lado esquerdo: gráfico, métricas, tabela */}
        <div style={{ background:'var(--color-background-primary)', width: '65%', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--color-border-divider)' }}>
          <div>
            {/* Gráfico */}
            <h4 className='ms-4 my-2 d-flex justify-content-start align-items-center' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400, minHeight: 30 }}>
              {separateAging ? 'Outstanding Balances by Aging Interval Over Time' : 
               selectedGroup === 'all' ? 'Outstanding Balances Over Time' : 
               selectedGroup === 'receivables' ? 'Receivables Outstanding Trend' : 
               'Payables Outstanding Trend'}
            </h4>
            <div style={{ background: 'var(--color-background-primary)', borderRadius: 10, padding: '0 15px', flex: '0 0 auto', minHeight: 0, minWidth: 0 }}>
              <div style={{ width: '100%', height: '30vh', minHeight: 180, maxHeight: 400 }}>
                <Line data={chartData} options={chartOptions} />
              </div>
            </div>
            {/* Métricas centralizadas abaixo do gráfico */}
            <div className="d-flex flex-row align-items-center justify-content-between mt-2" style={{ borderBottom: '1px solid var(--color-border-divider)', borderTop: '1px solid var(--color-border-divider)' }}>
              <h4 className='d-flex justify-content-start ps-4 mb-0' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400 }}>Metric Summary</h4>
              <div className='d-flex flex-row align-items-center justify-content-center'>
                {/* Total Receivable */}
                <MetricTooltip 
                  title="Total Receivable" 
                  content="Soma total de todos os valores a receber no período selecionado. Representa o fluxo de caixa esperado da empresa."
                  agingDetails={receivablesAgingDetails}
                >
                  <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 120, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)', cursor: 'help' }}>
                    <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2 }}>Total Receivable</span>
                    <span style={{ color: 'var(--color-accent-primary)', fontWeight: 600, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>
                      {totalReceivable.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                    </span>
                  </div>
                </MetricTooltip>
                {/* Total Payable */}
                <MetricTooltip 
                  title="Total Payable" 
                  content="Soma total de todos os valores a pagar no período selecionado. Representa as obrigações financeiras da empresa."
                  agingDetails={payablesAgingDetails}
                >
                  <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 120, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)', cursor: 'help' }}>
                    <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2 }}>Total Payable</span>
                    <span style={{ color: '#dc3545', fontWeight: 600, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>
                      {totalPayable.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                    </span>
                  </div>
                </MetricTooltip>
                {/* Total em Aberto */}
                <MetricTooltip 
                  title="Total Outstanding" 
                  content="Soma total de recebíveis e pagáveis. Indica o volume total de transações pendentes no período."
                  agingDetails={outstandingAgingDetails}
                >
                  <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 120, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)', cursor: 'help' }}>
                    <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2 }}>Total Outstanding</span>
                    <span style={{ color: 'var(--color-accent-primary)', fontWeight: 600, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>
                      {totalOutstanding.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                    </span>
                  </div>
                </MetricTooltip>
              </div>
            </div>
          </div>
          {/* Tabela de dados */}
          <div style={{ background: 'var(--color-background-primary)', overflow: 'hidden', width: '100%', flex: '1 1 0%', display: 'flex', flexDirection: 'column', minHeight: 0, padding: '0 10px 10px 10px' }}>
            <h4 className='d-flex justify-content-start mb-0 mt-3' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400 }}>Data Overview</h4>
            <div style={{ flex: '1 1 0%', height: 0, overflowY: 'auto', width: '100%' }} className="custom-scrollbar">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, tableLayout: 'auto' }}>
                <thead>
                  <tr style={{ background: 'var(--color-background-secondary)' }}>
                    <th style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'left', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2 }}>Data</th>
                    <th style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'left', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2 }}>Tipo</th>
                    <th style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'left', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2 }}>Aging Interval</th>
                    <th style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'left', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2 }}>Categoria</th>
                    <th style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'right', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2 }}>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((row, index) => (
                    <tr key={row.id || index}>
                      <td style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-secondary)', textAlign: 'left' }}>
                        {dayjs(row.date).format('DD/MM/YYYY')}
                      </td>
                      <td style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-secondary)', textAlign: 'left' }}>
                        {row.type === 'receivables' ? 'Receivables' : 'Payables'}
                      </td>
                      <td style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-secondary)', textAlign: 'left' }}>
                        {row.aging_intervals}
                      </td>
                      <td style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-secondary)', textAlign: 'left' }}>
                        {row.category}
                      </td>
                      <td style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: row.type === 'receivables' ? 'var(--color-accent-primary)' : '#dc3545', textAlign: 'right' }}>
                        {row.open_balance.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        {/* Lado direito: destaques, oportunidades, planos de ação */}
        <div id="individual_data" style={{ width: '35%', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Destaques */}
          <div style={{ flex: '1 1 0%', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 0, borderBottom: '1px solid var(--color-border-divider)', padding: 10, backgroundColor: 'var(--color-background-primary)' }}>
            <div className='fw-light' style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: 5, background: 'transparent', zIndex: 2 }}>Destaques</div>
            <div className="custom-scrollbar d-flex flex-column gap-1" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {partitionLoading ? (
                <PartitionLoading />
              ) : selectedYear && selectedMonth ? (
                (() => {
                  const key = `${Number(selectedYear)}-${Number(selectedMonth)}`;
                  const destaques = highlightsByMonth[key];
                  if (!destaques || destaques.length === 0) {
                    return <PartitionCard><EmptyMessage text="Nenhum destaque encontrado para este período." /></PartitionCard>;
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
                              openViewModal('destaque', destaques[0]);
                            }}
                            aria-label="Expandir em modal"
                            title="Expandir em modal"
                          >
                            <i className="bi bi-box-arrow-up-left" />
                          </button>
                        </div>
                      </button>
                      {openDestaques === key && (
                        <div style={{ padding: 12 }}>
                          <DestaquesPartition destaque={destaques[0]} isAdmin={true} />
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : Object.keys(highlightsByMonth).length === 0 ? (
                <PartitionCard><EmptyMessage text="Nenhum destaque encontrado." /></PartitionCard>
              ) : (
                Object.entries(highlightsByMonth).sort((a, b) => b[0].localeCompare(a[0])).map(([key, destaques]) => (
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
                            openViewModal('destaque', destaques[0]);
                          }}
                          aria-label="Expandir em modal"
                          title="Expandir em modal"
                        >
                          <i className="bi bi-box-arrow-up-left" />
                        </button>
                      </div>
                    </button>
                    {openDestaques === key && (
                      <div style={{ padding: 12 }}>
                        <DestaquesPartition destaque={destaques[0]} isAdmin={true} />
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
          {/* Oportunidades */}
          <div style={{ flex: '1 1 0%', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 0, borderBottom: '1px solid var(--color-border-divider)', padding: 10, backgroundColor: 'var(--color-background-primary)' }}>
            <div className='fw-light' style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: 5, background: 'transparent', zIndex: 2 }}>Oportunidades</div>
            <div className="custom-scrollbar d-flex flex-column gap-1" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {partitionLoading ? (
                <PartitionLoading />
              ) : selectedYear && selectedMonth ? (
                (() => {
                  const key = `${Number(selectedYear)}-${Number(selectedMonth)}`;
                  const oportunidades = oportunidadesByMonth[key];
                  if (!oportunidades || oportunidades.length === 0) {
                    return <PartitionCard><EmptyMessage text="Nenhuma oportunidade encontrada para este período." /></PartitionCard>;
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
                          <i className={`bi ${openOportunidades === key ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ fontSize: 18, color: 'inherit' }} />
                          <button
                            type="button"
                            className="btn btn-link p-0 ms-1"
                            style={{ color: 'var(--color-text-secondary)', fontSize: 14, lineHeight: 1, boxShadow: 'none', border: 'none', background: 'none' }}
                            onClick={e => {
                              e.stopPropagation();
                              openViewModal('oportunidade', oportunidades[0]);
                            }}
                            aria-label="Expandir em modal"
                            title="Expandir em modal"
                          >
                            <i className="bi bi-box-arrow-up-left" />
                          </button>
                        </div>
                      </button>
                      {openOportunidades === key && (
                        <div style={{ padding: 12 }}>
                          <OportunidadesPartition oportunidades={oportunidades} isAdmin={true} />
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : Object.keys(oportunidadesByMonth).length === 0 ? (
                <PartitionCard><EmptyMessage text="Nenhuma oportunidade encontrada." /></PartitionCard>
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
                        <i className={`bi ${openOportunidades === key ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ fontSize: 18, color: 'inherit' }} />
                        <button
                          type="button"
                          className="btn btn-link p-0 ms-1"
                          style={{ color: 'var(--color-text-secondary)', fontSize: 14, lineHeight: 1, boxShadow: 'none', border: 'none', background: 'none' }}
                          onClick={e => {
                            e.stopPropagation();
                            openViewModal('oportunidade', oportunidades[0]);
                          }}
                          aria-label="Expandir em modal"
                          title="Expandir em modal"
                        >
                          <i className="bi bi-box-arrow-up-left" />
                        </button>
                      </div>
                    </button>
                    {openOportunidades === key && (
                      <div style={{ padding: 12 }}>
                        <OportunidadesPartition oportunidades={oportunidades} isAdmin={true} />
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
          {/* Plano de Ação */}
          <div style={{ flex: '1 1 0%', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 0, borderBottom: '1px solid var(--color-border-divider)', padding: 10, backgroundColor: 'var(--color-background-primary)' }}>
            <div className='fw-light' style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: 5, background: 'transparent', zIndex: 2 }}>Plano de Ação</div>
            <div className="custom-scrollbar d-flex flex-column gap-1" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {partitionLoading ? (
                <PartitionLoading />
              ) : (
                planosAbertos.length === 0 ? (
                  <PartitionCard>
                    <EmptyMessage text="No action plan found." showEdit={ofThisScreen} onEdit={() => openModal('plano', null)} />
                  </PartitionCard>
                ) : (
                  planosAbertos.map(plano => (
                    <div key={plano.id} style={{ borderRadius: 10, background: 'var(--color-background-secondary)', marginBottom: 0, border: '1px solid var(--color-border-divider)' }}>
                      <button
                        className={`btn-sidebar d-flex align-items-center justify-content-between w-100${openPlanoId === plano.id ? ' btn-sidebar-ativo' : ''}`}
                        style={{ gap: 10, padding: '8px 12px', borderRadius: 8, fontSize: 14, borderTopLeftRadius: 10, borderTopRightRadius: 10, marginBottom: 0, minHeight: 38, width: '100%', border: 'none', outline: 'none', boxShadow: 'none' }}
                        onClick={() => setOpenPlanoId(openPlanoId === plano.id ? '' : plano.id)}
                      >
                        <span style={{ fontWeight: 600, color: 'inherit', fontSize: 15 }}>{plano.titulo || 'Sem título'}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <i className={`bi ${openPlanoId === plano.id ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ fontSize: 18, color: 'inherit' }} />
                          <button
                            type="button"
                            className="btn btn-link p-0 ms-1"
                            style={{ color: 'var(--color-text-secondary)', fontSize: 14, lineHeight: 1, boxShadow: 'none', border: 'none', background: 'none' }}
                            onClick={e => {
                              e.stopPropagation();
                              openViewModal('plano', plano);
                            }}
                            aria-label="Expandir em modal"
                            title="Expandir em modal"
                          >
                            <i className="bi bi-box-arrow-up-left" />
                          </button>
                          {ofThisScreen && (
                            <div
                              style={{ color: 'var(--color-accent-primary)', fontSize: 16, lineHeight: 1, cursor: 'pointer', padding: '4px', borderRadius: '4px', transition: 'background-color 0.2s' }}
                              onClick={e => {
                                e.stopPropagation();
                                openModal('plano', plano);
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = 'rgba(46, 107, 230, 0.1)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
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
                )
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Modal de edição/criação */}
      <EditModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        type={modalType}
        data={modalData}
        onSave={handleSave}
      />
      {modalOpen && modalType && createPortal(
        <Modal
          show={modalOpen}
          onClose={() => setModalOpen(false)}
          type={modalType as 'destaque' | 'oportunidade' | 'plano'}
          data={modalData}
          anoSelecionado={selectedYear}
          mesSelecionado={selectedMonth}
          onSaved={async () => {
            // Limpar cache específico da tela para forçar refresh
            const cacheKey = `tela_${tela_id}_user_${usuario_responsavel_id}`;
            setGlobalCache(prev => {
              const newCache = { ...prev };
              delete newCache[cacheKey];
              return newCache;
            });
            
            // Recarregar dados frescos do banco
            await fetchAllIndividual();
            // Recarregar planos e ações
            const { data: planosData } = await supabase.from('planos_de_acao').select('*');
            const { data: acoesData } = await supabase.from('acoes').select('*');
            setAllPlanos(planosData || []);
            setAllAcoes(acoesData || []);
          }}
        />, 
        document.body
      )}
      
      {/* NOVO: Modal de visualização completa */}
      {viewModalOpen && viewModalType && createPortal(
        <ViewModal
          show={viewModalOpen}
          onClose={() => setViewModalOpen(false)}
          type={viewModalType as 'destaque' | 'oportunidade' | 'plano'}
          data={viewModalData}
          responsavelNome={responsavelNome}
        />, 
        document.body
      )}
    </div>
  );
} 