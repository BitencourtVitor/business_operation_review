import React, { useEffect, useState, useRef, useLayoutEffect } from 'react';
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
import isBetween from 'dayjs/plugin/isBetween';
import { createPortal } from 'react-dom';
import type { TooltipItem } from 'chart.js';
import Modal from './modal';

dayjs.extend(isBetween);

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface TimesheetRow {
  id: string;
  date: string;
  nome: string;
  error: string;
  team: string;
  corporation: string;
  payrate: string;
  add_time_hour: string;
  remove_time_hour: string;
  add_dollar: string;
  remove_dollar: string;
  total: string;
}

// Dropdown customizado para seleção múltipla com checkboxes
function MultiSelectDropdown({ options, selected, setSelected, allLabel = 'Todos', dropdownTitle }: {
  options: string[];
  selected: string[];
  setSelected: (v: string[]) => void;
  allLabel?: string;
  dropdownTitle?: string;
}) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{top: number, left: number, width: number}>({top: 0, left: 0, width: 0});
  const [hasPreRendered, setHasPreRendered] = useState(false);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
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

  // Calcula posição do dropdown ao abrir ou ao pré-renderizar
  useEffect(() => {
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
  // Dropdown JSX (usado para pré-render e para exibir)
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
      {/* Pré-renderiza o dropdown invisível ao montar, e visível ao abrir */}
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

// Componente de mensagem centralizada
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

// Card base para partições
function PartitionCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--color-background-primary)', minHeight: 120, position: 'relative', display: 'flex', flexDirection: 'column', flex: '1 1 0%', borderRadius: 10 }}>
      <div style={{ flex: 1, minHeight: 60, width: '100%' }}>{children}</div>
    </div>
  );
}

// Destaques: positivos e negativos lado a lado
type PartitionProps = { destaque?: Destaque; oportunidades?: Oportunidade[]; plano?: PlanoAcao; isAdmin: boolean; onEdit?: () => void; year?: string; month?: string };
function DestaquesPartition({ destaque, isAdmin, onEdit }: PartitionProps) {
  if (!destaque) {
    return <PartitionCard><EmptyMessage text="Nenhum destaque encontrado para este período." showEdit={isAdmin} onEdit={onEdit} /></PartitionCard>;
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
  return (
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
  );
}

// Oportunidades: desafios e melhorias
function OportunidadesPartition({ oportunidades = [], isAdmin, onEdit }: PartitionProps) {
  if (!oportunidades || oportunidades.length === 0) {
    return <PartitionCard><EmptyMessage text="No opportunities found for this period." showEdit={isAdmin} onEdit={onEdit} /></PartitionCard>;
  }
  return (
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
                {op.desafios.length > 0 ? op.desafios.map((t, i) => (
                  <div key={i} style={{ color: '#e67e22', fontSize: 14, marginBottom: 2, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                    <span style={{ fontSize: 18, lineHeight: 1, marginRight: 4, display: 'inline-block' }}>•</span>
                    <span style={{ textAlign: 'left', flex: 1 }}>{parseAsterisksFormatting(t)}</span>
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
                    <span style={{ textAlign: 'left', flex: 1 }}>{parseAsterisksFormatting(t)}</span>
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

// Utilitário para obter o mês mais recente
function getMostRecentMonthKey<T>(obj: Record<string, T>) {
  return Object.keys(obj).sort((a, b) => b.localeCompare(a))[0] || '';
}

// No topo do arquivo:
interface TimesheetAnalysisProps {
  usuario_responsavel_id: string; // responsável pela tela
  tela_id: string;
  user_role: string;
  user_setor_id: string;
  isAdmin: boolean;
  ofThisScreen: boolean;
  planos_iniciais?: PlanoAcao[];
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

export default function TimesheetAnalysis({ usuario_responsavel_id, tela_id, user_role, user_setor_id, isAdmin, ofThisScreen, planos_iniciais = [] }: TimesheetAnalysisProps) {
  // Log de depuração para permissões
  console.log(
    'DEBUG PERMISSAO:',
    'user_role:', user_role,
    'user_setor_id:', user_setor_id,
    'tela_id:', tela_id,
    'isAdmin:', isAdmin,
    'ofThisScreen:', ofThisScreen
  );
  const [allData, setAllData] = useState<TimesheetRow[]>([]); // cache de todos os dados
  const [data, setData] = useState<TimesheetRow[]>([]);
  const [corporation, setCorporation] = useState<string[]>([]);
  const [team, setTeam] = useState<string[]>([]);
  const [error, setError] = useState<string[]>([]);
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');

  // Filtros únicos
  const [corporations, setCorporations] = useState<string[]>([]);
  const [teams, setTeams] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [years, setYears] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);

  // Tema
  const isDark = document.documentElement.classList.contains('dark');
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--color-accent-primary').trim() || '#2E6BE6';
  const textSecondary = getComputedStyle(document.documentElement).getPropertyValue('--color-text-secondary').trim() || '#888';
  const [borderDivider, setBorderDivider] = useState(getComputedStyle(document.documentElement).getPropertyValue('--color-border-divider').trim() || '#e0e0e0');

  // Atualiza a cor do grid do gráfico ao trocar o tema
  useEffect(() => {
    const updateBorderDivider = () => {
      setBorderDivider(getComputedStyle(document.documentElement).getPropertyValue('--color-border-divider').trim() || '#e0e0e0');
    };
    // Detecta troca de tema por classe 'dark' (MutationObserver)
    const observer = new MutationObserver(updateBorderDivider);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    // Também escuta evento customizado (caso use)
    window.addEventListener('themechange', updateBorderDivider);
    // Atualiza imediatamente
    updateBorderDivider();
    return () => {
      observer.disconnect();
      window.removeEventListener('themechange', updateBorderDivider);
    };
  }, []);

  // Carregar todos os dados para filtros e cachear
  useEffect(() => {
    const fetchAll = async () => {
      let all: TimesheetRow[] = [];
      const cache = sessionStorage.getItem('timesheet_analysis');
      if (cache) {
        try {
          all = JSON.parse(cache);
        } catch {
          all = [];
        }
      } else {
        const { data: dbData, error: err } = await supabase.from('timesheet_analysis').select('*');
        if (!err && dbData) {
          all = dbData as TimesheetRow[];
          sessionStorage.setItem('timesheet_analysis', JSON.stringify(all));
        }
      }
      setAllData(all);
      // Filtros globais
      setCorporations([...new Set(all.map((d: TimesheetRow) => typeof d.corporation === 'string' ? d.corporation : undefined).filter((v): v is string => !!v))]);
      setTeams([...new Set(all.map((d: TimesheetRow) => typeof d.team === 'string' ? d.team : undefined).filter((v): v is string => !!v))]);
      setErrors([...new Set(all.map((d: TimesheetRow) => typeof d.error === 'string' ? d.error : undefined).filter((v): v is string => !!v))]);
      // Anos presentes nos dados
      const anos = [...new Set(all.map((d: TimesheetRow) => (typeof d.date === 'string' && d.date.split('-')[0]) || undefined).filter((v): v is string => !!v))].sort((a, b) => Number(b) - Number(a));
      setYears(anos);
      // Selecionar ano atual se existir, senão o mais recente
      const anoAtual = dayjs().format('YYYY');
      if (anos.includes(anoAtual)) setYear(anoAtual);
      else if (anos.length > 0 && typeof anos[0] === 'string') setYear(anos[0]);
    };
    fetchAll();
  }, []);

  // Atualizar meses disponíveis conforme ano selecionado
  useEffect(() => {
    if (!year) {
      setMonths([]);
      if (month) setMonth('');
      return;
    }
    // Pega todos os meses únicos do ano selecionado
    const meses = [
      ...new Set(
        allData
          .filter(
            d =>
              d.date &&
              typeof d.date === 'string' &&
              d.date.startsWith(year + '-')
          )
          .map(d => d.date.split('-')[1])
          .filter((v): v is string => !!v)
      ),
    ].sort((a, b) => Number(a) - Number(b));
    setMonths(meses);
    // Se o mês selecionado não existir mais, resetar
    if (month && !meses.includes(month)) setMonth('');
  }, [year, allData]);

  // dados em memória (sem nova requisição)
  useEffect(() => {
    let filtered = allData;
    if (year) filtered = filtered.filter(d => d.date && typeof d.date === 'string' && d.date.startsWith(year + '-'));
    if (month) filtered = filtered.filter(d => d.date && typeof d.date === 'string' && d.date.split('-')[1] === month);
    if (corporation.length > 0) filtered = filtered.filter(d => corporation.includes(d.corporation));
    if (team.length > 0) filtered = filtered.filter(d => team.includes(d.team));
    if (error.length > 0) filtered = filtered.filter(d => error.includes(d.error));
    setData(filtered);
  }, [allData, year, month, corporation, team, error]);

  // --- GRÁFICO: lógica dinâmica para labels ---
  let chartLabels: string[] = [];
  let chartValues: number[] = [];
  let xAxisTitle = 'Month';
  if (year && month) {
    // Gráfico dia a dia do mês selecionado
    const errorCountByDay: Record<string, number> = {};
    data.forEach(row => {
      if (row.error && row.date && typeof row.date === 'string' && row.date.split('-').length === 3) {
        const dia = row.date.split('-')[2];
        errorCountByDay[dia] = (errorCountByDay[dia] || 0) + 1;
      }
    });
    chartLabels = Object.keys(errorCountByDay).sort((a, b) => Number(a) - Number(b));
    chartValues = chartLabels.map(dia => errorCountByDay[dia]);
    // Nome do mês por extenso
    const nomeMes = dayjs(`${year}-${month}-01`).format('MMMM');
    xAxisTitle = `Days of ${nomeMes}`;
  } else if (year) {
    // Gráfico mês a mês do ano selecionado
    const errorCountByMonth: Record<string, number> = {};
    data.forEach(row => {
      if (row.error && row.date && typeof row.date === 'string' && row.date.split('-').length >= 2) {
        const mes = row.date.split('-')[1];
        errorCountByMonth[mes] = (errorCountByMonth[mes] || 0) + 1;
      }
    });
    chartLabels = Object.keys(errorCountByMonth).sort((a, b) => Number(a) - Number(b));
    chartValues = chartLabels.map(mes => errorCountByMonth[mes]);
    xAxisTitle = 'Month';
  } else {
    // Gráfico ano a ano (caso queira expandir)
    const errorCountByYear: Record<string, number> = {};
    data.forEach(row => {
      if (row.error && row.date && typeof row.date === 'string' && row.date.split('-').length >= 1) {
        const ano = row.date.split('-')[0];
        errorCountByYear[ano] = (errorCountByYear[ano] || 0) + 1;
      }
    });
    chartLabels = Object.keys(errorCountByYear).sort((a, b) => Number(a) - Number(b));
    chartValues = chartLabels.map(ano => errorCountByYear[ano]);
    xAxisTitle = 'Year';
  }

  const chartData = {
    labels: chartLabels,
    datasets: [
      {
        label: 'Contagem de Erros',
        data: chartValues,
        borderColor: accent,
        backgroundColor: accent,
        pointBackgroundColor: accent,
        pointBorderColor: accent,
        pointRadius: 6,
        pointHoverRadius: 8,
        borderWidth: 3,
        fill: false,
        tension: 0.25,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: { display: false },
      tooltip: {
        backgroundColor: isDark ? '#23272f' : '#fff',
        titleColor: isDark ? '#FFD700' : accent,
        bodyColor: isDark ? '#fff' : '#222',
        borderColor: accent,
        borderWidth: 1,
        callbacks: {
          label: function(context: TooltipItem<'line'>) {
            // Valor principal (contagem)
            const label = context.label;
            const count = context.parsed.y;
            let add = 0;
            let rem = 0;
            // Descobrir o agrupamento (dia, mês ou ano)
            if (year && month) {
              // Por dia
              const dia = label.padStart(2, '0');
              const rows = data.filter(row => row.date && typeof row.date === 'string' && row.date.split('-')[2] === dia);
              add = rows.reduce((sum, row) => sum + (parseFloat(row.add_dollar) || 0), 0);
              rem = rows.reduce((sum, row) => sum + (parseFloat(row.remove_dollar) || 0), 0);
            } else if (year) {
              // Por mês
              const mes = label.padStart(2, '0');
              const rows = data.filter(row => row.date && typeof row.date === 'string' && row.date.split('-')[1] === mes);
              add = rows.reduce((sum, row) => sum + (parseFloat(row.add_dollar) || 0), 0);
              rem = rows.reduce((sum, row) => sum + (parseFloat(row.remove_dollar) || 0), 0);
            } else {
              // Por ano
              const ano = label;
              const rows = data.filter(row => row.date && typeof row.date === 'string' && row.date.split('-')[0] === ano);
              add = rows.reduce((sum, row) => sum + (parseFloat(row.add_dollar) || 0), 0);
              rem = rows.reduce((sum, row) => sum + (parseFloat(row.remove_dollar) || 0), 0);
            }
            return [
              `Count: ${count}`,
              `Added: ${add.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`,
              `Removed: ${rem.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`
            ];
          }
        }
      },
      background: {
        color: getComputedStyle(document.documentElement).getPropertyValue('--color-background-secondary').trim() || '#f5f6fa',
      },
    },
    scales: {
      x: {
        grid: { color: borderDivider, drawBorder: true },
        ticks: { color: textSecondary },
        title: {
          display: true,
          text: xAxisTitle,
          color: textSecondary,
          font: { weight: 600, size: 12 },
        },
      },
      y: {
        grid: { color: borderDivider, drawBorder: true },
        ticks: {
          color: textSecondary,
          callback: function(tickValue: string | number) {
            if (typeof tickValue === 'number') return Math.round(tickValue);
            const n = Number(tickValue);
            return isNaN(n) ? tickValue : Math.round(n);
          },
        },
        beginAtZero: true,
        suggestedMin: 0,
        suggestedMax: Math.max(...chartValues, 1),
        precision: 0,
        stepSize: 1,
        title: {
          display: true,
          text: 'Count',
          color: textSecondary,
          font: { weight: 600, size: 12 },
        },
      },
    },
  };

  // Estilo para selects customizados
  const selectStyle: React.CSSProperties = {
    background: 'var(--color-background-primary)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border-divider)',
    borderRadius: 6,
    padding: '4px 8px',
    fontSize: 14,
    transition: 'background 0.3s, color 0.3s, border 0.3s',
  };

  // Sempre selecionar todas as opções ao carregar/atualizar as listas de opções
  useEffect(() => {
    setCorporation(corporations);
  }, [corporations]);
  useEffect(() => {
    setTeam(teams);
  }, [teams]);
  useEffect(() => {
    setError(errors);
  }, [errors]);

  const [allHighlights, setAllHighlights] = useState<Destaque[]>([]);
  const [allOportunidades, setAllOportunidades] = useState<Oportunidade[]>([]);
  // const [allPlanos, setAllPlanos] = useState<PlanoAcao[]>([]);

  // Função reutilizável para buscar todos os dados individuais
  const fetchAllIndividual = async () => {
    let highlights: Destaque[] = [];
    let oportunidades: Oportunidade[] = [];
    // let planos: PlanoAcao[] = [];
    const cache = sessionStorage.getItem('individual_data_cache');
    if (cache) {
      try {
        const parsed = JSON.parse(cache);
        highlights = parsed.highlights || [];
        oportunidades = parsed.oportunidades || [];
        // planos = parsed.planos || [];
      } catch { /* ignore */ }
    } else {
      // Destaques
      const { data: destaques } = await supabase.from('destaques').select('*').eq('usuario_id', usuario_responsavel_id).eq('tela_id', tela_id);
      highlights = destaques || [];
      // Destaques positivos/negativos
      const { data: positivos } = await supabase.from('destaques_positivos').select('*');
      const { data: negativos } = await supabase.from('destaques_negativos').select('*');
      highlights = highlights.map(d => ({
        ...d,
        positivos: (positivos || []).filter((p: { destaque_id: string; texto: string }) => p.destaque_id === d.id).map((p: { texto: string }) => p.texto),
        negativos: (negativos || []).filter((n: { destaque_id: string; texto: string }) => n.destaque_id === d.id).map((n: { texto: string }) => n.texto),
      }));
      // Oportunidades
      const { data: ops } = await supabase.from('oportunidades').select('*').eq('usuario_id', usuario_responsavel_id).eq('tela_id', tela_id);
      const { data: desafios } = await supabase.from('desafios').select('*');
      const { data: melhorias } = await supabase.from('melhorias').select('*');
      oportunidades = (ops || []).map((op: Oportunidade) => ({
        ...op,
        desafios: (desafios || []).filter((d: { oportunidade_id: string; texto: string }) => d.oportunidade_id === op.id).map((d: { texto: string }) => d.texto),
        melhorias: (melhorias || []).filter((m: { oportunidade_id: string; texto: string }) => m.oportunidade_id === op.id).map((m: { texto: string }) => m.texto),
      }));
      sessionStorage.setItem('individual_data_cache', JSON.stringify({ highlights, oportunidades }));
    }
    setAllHighlights(highlights);
    setAllOportunidades(oportunidades);
  };

  // useEffect para carregar ao montar
  useEffect(() => {
    fetchAllIndividual();
  }, []);

  // Corrigir o useEffect para buscar destaques e oportunidades sempre que usuario_responsavel_id ou tela_id mudar
  useEffect(() => {
    if (usuario_responsavel_id && tela_id) {
      setPartitionLoading(true);
      sessionStorage.removeItem('individual_data_cache');
      Promise.resolve(fetchAllIndividual()).finally(() => setPartitionLoading(false));
    }
  }, [usuario_responsavel_id, tela_id]);

  // Agrupar dados por mês/ano
  const highlightsByMonth = groupByMonthYear(allHighlights);
  const oportunidadesByMonth = groupByMonthYear(allOportunidades);
  // Para planos de ação, agrupar por mês/ano do plano (criado_em) e também dos subplanos
  // function planosByMonth(planos: PlanoAcao[]): Record<string, PlanoAcao[]> {
  //   const result: Record<string, PlanoAcao[]> = {};
  //   if (!planos || planos.length === 0) return result;
  //   planos.forEach(plano => {
  //     let keys: string[] = [];
  //     if (plano.acoes && plano.acoes.length > 0) {
  //       keys = plano.acoes.map(a => {
  //         const ano = a.data_limite.slice(0, 4);
  //         const mes = a.data_limite.slice(5, 7);
  //         return `${ano}-${mes}`;
  //       });
  //     } else if (plano.criado_em) {
  //       const ano = plano.criado_em.slice(0, 4);
  //       const mes = plano.criado_em.slice(5, 7);
  //       keys = [`${ano}-${mes}`];
  //     }
  //     keys.forEach(key => {
  //       if (!result[key]) result[key] = [];
  //       if (!result[key].includes(plano)) result[key].push(plano);
  //     });
  //   });
  //   return result;
  // }
  // const planosByMonthMap = planosByMonth(allPlanos);

  // Função para formatar título do card
  function formatMonthYear(key: string) {
    const [ano, mes] = key.split('-');
    const nomeMes = mes ? dayjs(`${ano}-${mes}-01`).format('MMMM') : '';
    return `${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)} / ${ano}`;
  }

  // Estados de expansão para cada partição
  const [openDestaques, setOpenDestaques] = React.useState(() => getMostRecentMonthKey(highlightsByMonth));
  const [openOportunidades, setOpenOportunidades] = React.useState(() => getMostRecentMonthKey(oportunidadesByMonth));

  // --- Agrupamento dinâmico da tabela ---
  const [groupBy, setGroupBy] = useState<'team' | 'error'>('team');
  // --- Ordenação ---
  const [sortBy, setSortBy] = useState<'key' | 'count' | 'add' | 'rem'>('key');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Função para agrupar os dados
  const groupedData = React.useMemo(() => {
    const key = groupBy;
    const groups: Record<string, { count: number; add: number; rem: number }> = {};
    data.forEach(row => {
      const groupValue = row[key] || 'N/A';
      if (!groups[groupValue]) {
        groups[groupValue] = { count: 0, add: 0, rem: 0 };
      }
      groups[groupValue].count++;
      groups[groupValue].add += parseFloat(row.add_dollar) || 0;
      groups[groupValue].rem += parseFloat(row.remove_dollar) || 0;
    });
    // Ordenação
    const entries = Object.entries(groups);
    entries.sort((a, b) => {
      let vA, vB;
      if (sortBy === 'key') {
        vA = a[0];
        vB = b[0];
        if (!isNaN(Number(vA)) && !isNaN(Number(vB))) {
          vA = Number(vA);
          vB = Number(vB);
        }
      } else {
        vA = a[1][sortBy];
        vB = b[1][sortBy];
      }
      if (vA < vB) return sortDir === 'asc' ? -1 : 1;
      if (vA > vB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return Object.fromEntries(entries);
  }, [data, groupBy, sortBy, sortDir]);

  // --- NO FINAL DO COMPONENTE ---
  // refs para sincronização de largura
  const thRefs = useRef<(HTMLTableCellElement | null)[]>([]);
  const tdRefs = useRef<(HTMLTableCellElement | null)[]>([]);

  useLayoutEffect(() => {
    if (!thRefs.current.length) return;
    const widths = thRefs.current.map(th => th ? th.getBoundingClientRect().width : 0);
    thRefs.current.forEach((th, i) => {
      if (th) th.style.width = widths[i] + 'px';
    });
    if (tdRefs.current[0]) {
      tdRefs.current.forEach((td, i) => {
        if (td) td.style.width = widths[i] + 'px';
      });
    }
  }, [groupedData, groupBy]);

  useEffect(() => {
    function handleResize() {
      if (!thRefs.current.length) return;
      const widths = thRefs.current.map(th => th ? th.getBoundingClientRect().width : 0);
      thRefs.current.forEach((th, i) => {
        if (th) th.style.width = widths[i] + 'px';
      });
      if (tdRefs.current[0]) {
        tdRefs.current.forEach((td, i) => {
          if (td) td.style.width = widths[i] + 'px';
        });
      }
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Estado do modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'destaque' | 'oportunidade' | 'plano' | null>(null);
  const [modalData, setModalData] = useState<Destaque | Oportunidade | PlanoAcao | null>(null);

  // Funções utilitárias para objetos vazios
  function emptyDestaque(mes: string, ano: string): Destaque {
    return {
      id: '',
      usuario_id: usuario_responsavel_id,
      tela_id,
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
      tela_id,
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
      usuario_id: usuario_responsavel_id, // Corrigido: usar usuario_responsavel_id
      titulo: '',
      descricao: '',
      criado_em: new Date().toISOString(),
      data_inicio: '',
      data_fim: '',
      acoes: [],
    };
  }

  function openModal(type: 'destaque' | 'oportunidade' | 'plano', data: Destaque | Oportunidade | PlanoAcao | null = null) {
    let modalData = data;
    if (!data) {
      if (type === 'destaque') modalData = emptyDestaque(month || '', year || '');
      if (type === 'oportunidade') modalData = emptyOportunidade(month || '', year || '');
      if (type === 'plano') modalData = emptyPlanoAcao();
    }
    // Se for oportunidade e já existe, buscar desafios e melhorias do banco
    if (type === 'oportunidade' && modalData && (modalData as Oportunidade).id) {
      const oportunidade = modalData as Oportunidade;
      (async () => {
        const { data: desafiosData } = await supabase.from('desafios').select('texto').eq('oportunidade_id', oportunidade.id);
        const { data: melhoriasData } = await supabase.from('melhorias').select('texto').eq('oportunidade_id', oportunidade.id);
        setModalType(type);
        setModalData({
          ...oportunidade,
          desafios: (desafiosData || []).map(d => d.texto),
          melhorias: (melhoriasData || []).map(m => m.texto),
        });
        setModalOpen(true);
      })();
      return;
    }
    setModalType(type);
    setModalData(modalData);
    setModalOpen(true);
  }

  // --- NOVO MODELO DE PLANOS DE AÇÃO ---
  // --- PLANOS DE AÇÃO NOVO MODELO ---
  const [planosAbertos, setPlanosAbertos] = useState<PlanoAcao[]>(planos_iniciais);

  // Novo: Estado de expansão para subplanos
  // const [openSubplanoId, setOpenSubplanoId] = useState<string>('');

  // Estado global para todos os planos e ações
  const [allPlanos, setAllPlanos] = useState<PlanoAcao[]>([]);
  const [allAcoes, setAllAcoes] = useState<Acao[]>([]);

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

  // Estado de expansão para planos de ação (por id do plano)
  const [openPlanoId, setOpenPlanoId] = useState<string>('');

  const [partitionLoading, setPartitionLoading] = useState(false);

  return (
    <div id="content" style={{ height: '100%', minHeight: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div className="d-flex flex-row justify-content-between align-items-center" style={{ padding: '10px 20px', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
        <h1 style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, flex: '0 0 auto', marginBottom: 0 }}>Timesheet Analysis</h1>
        <div className="d-flex flex-row align-items-center" style={{ gap: 10, flexWrap: 'wrap', borderLeft: '1px solid var(--color-border-divider)', paddingLeft: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 500, gap: 8, display: 'flex', alignItems: 'center', color: 'var(--color-text-secondary)' }}><i className="bi bi-funnel" />
          Filters</span>
          <div className="input-group" style={{ minWidth: 193, maxWidth: 193, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 38 }}>
            <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', borderRight: '1.5px solid var(--color-border-divider)', height: 38, width: 42, padding: 0 }}>
              <i className="bi bi-calendar-range" style={{ color: 'var(--color-accent-primary)', fontSize: 16 }} />
            </span>
            <select id="year-select" name="year" value={year} onChange={e => setYear(e.target.value)} style={{ ...selectStyle, border: 'none', borderRight: '1.5px solid var(--color-border-divider)', borderRadius: 0, height: 38, width: 70, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}>
              <option value="">Todos</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select id="month-select" name="month" value={month} onChange={e => setMonth(e.target.value)} style={{ ...selectStyle, border: 'none', borderRadius: 0, height: 38, width: 75, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}>
              <option value="">Todos</option>
              {months.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          {/* Corporation */}
          <div className="input-group" style={{ minWidth: 180, maxWidth: 180, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 38, zIndex: 20, display: 'flex' }}>
            <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', borderRight: '1.5px solid var(--color-border-divider)', height: 38, width: 42, padding: 0, color: 'var(--color-accent-primary)', borderTopLeftRadius: 8, borderBottomLeftRadius: 8, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
              <i className="bi bi-building" style={{ fontSize: 17 }} />
            </span>
            <div style={{ flex: 1, minWidth: 0, zIndex: 21, borderTopRightRadius: 8, borderBottomRightRadius: 8, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, height: 38 }}>
              <MultiSelectDropdown options={corporations} selected={corporation} setSelected={setCorporation} allLabel="Todas" dropdownTitle="Corporation" />
            </div>
          </div>
          {/* Team */}
          <div className="input-group" style={{ minWidth: 180, maxWidth: 180, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 38, zIndex: 19, display: 'flex' }}>
            <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', borderRight: '1.5px solid var(--color-border-divider)', height: 38, width: 42, padding: 0, color: 'var(--color-accent-primary)', borderTopLeftRadius: 8, borderBottomLeftRadius: 8, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
              <i className="bi bi-people" style={{ fontSize: 17 }} />
            </span>
            <div style={{ flex: 1, minWidth: 0, zIndex: 20, borderTopRightRadius: 8, borderBottomRightRadius: 8, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, height: 38 }}>
              <MultiSelectDropdown options={teams} selected={team} setSelected={setTeam} allLabel="Todos" dropdownTitle="Teams" />
            </div>
          </div>
          {/* Error */}
          <div className="input-group" style={{ minWidth: 180, maxWidth: 180, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 38, zIndex: 18, display: 'flex' }}>
            <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', borderRight: '1.5px solid var(--color-border-divider)', height: 38, width: 42, padding: 0, color: 'var(--color-danger, #dc3545)', borderTopLeftRadius: 8, borderBottomLeftRadius: 8, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
              <i className="bi bi-exclamation-circle" style={{ fontSize: 17, color: 'var(--color-danger, #dc3545)' }} />
            </span>
            <div style={{ flex: 1, minWidth: 0, zIndex: 19, borderTopRightRadius: 8, borderBottomRightRadius: 8, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, height: 38 }}>
              <MultiSelectDropdown options={errors} selected={error} setSelected={setError} allLabel="Todos" dropdownTitle="Errors" />
            </div>
          </div>
        </div>
      </div>
      {/* Conteúdo principal: gráfico/tabela à esquerda, dale à direita */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'row', width: '100%', minHeight: 0, minWidth: 0 }}>
        <div style={{ background:'var(--color-background-primary)', width: '65%', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--color-border-divider)' }}>
          <div>
            {/* Gráfico */}
            <h4 className='ms-4 my-2 d-flex justify-content-start align-items-center' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400, minHeight: 30 }}>
              Error Count Over Time
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
                {/* Total */}
                <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 90, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)' }}>
                  <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2, textAlign: 'center' }}>Count</span>
                  <span style={{ color: 'var(--color-accent-primary)', fontWeight: 600, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>{Array.isArray(data) ? data.length : 0}</span>
                </div>
                {/* Added Value */}
                <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 120, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)' }}>
                  <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2 }}>Added Value</span>
                  <span style={{ color: '#1bbf5c', fontWeight: 400, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>
                    {Array.isArray(data) ? data.reduce((sum, row) => sum + (parseFloat(row.add_dollar) || 0), 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '$0.00'}
                  </span>
                </div>
                {/* Removed Value */}
                <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 120, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)' }}>
                  <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2 }}>Removed Value</span>
                  <span style={{ width: '100%', color: '#dc3545', fontWeight: 400, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>
                    {Array.isArray(data) ? data.reduce((sum, row) => sum + (parseFloat(row.remove_dollar) || 0), 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '$0.00'}
                  </span>
                </div>
                {/* Total Value */}
                <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 120, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)' }}>
                  <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2 }}>Total Value</span>
                  <span style={{ color: 'var(--color-accent-primary)', fontWeight: 600, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>
                    {Array.isArray(data)
                      ? (() => {
                          const add = data.reduce((sum, row) => sum + (parseFloat(row.add_dollar) || 0), 0);
                          const rem = data.reduce((sum, row) => sum + (parseFloat(row.remove_dollar) || 0), 0);
                          return (add + rem).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
                        })()
                      : '$0.00'}
                  </span>
                </div>
              </div>
            </div>
          </div>
          {/* Controle de agrupamento fora do overflow da tabela */}
          <div style={{ display: 'flex', alignItems: 'center' }} className='ms-4 me-3 my-2 justify-content-between'>
            <h4 className='d-flex justify-content-start mb-0' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400 }}>
                Data Overview
            </h4>
            <div className='d-flex flex-row align-items-center justify-content-center gap-2'>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)' }} className='justify-content-between'>
                <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Group by</span>
                <button onClick={() => setGroupBy('team')} style={{ background: groupBy === 'team' ? 'var(--color-accent-primary)' : 'var(--color-background-secondary)', color: groupBy === 'team' ? '#fff' : 'var(--color-accent-primary)', border: '1.5px solid var(--color-border-divider)', borderRadius: 15, padding: '4px 16px', fontWeight: 500, fontSize: 14, cursor: 'pointer' }}>Teams</button>
                <button onClick={() => setGroupBy('error')} style={{ background: groupBy === 'error' ? 'var(--color-accent-primary)' : 'var(--color-background-secondary)', color: groupBy === 'error' ? '#fff' : 'var(--color-accent-primary)', border: '1.5px solid var(--color-border-divider)', borderRadius: 15, padding: '4px 16px', fontWeight: 500, fontSize: 14, cursor: 'pointer' }}>Errors</button>
              </div>
              {/* Ordenação */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)' }}>
                <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Sort by</span>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <select value={sortBy} onChange={e => setSortBy(e.target.value as 'key' | 'count' | 'add' | 'rem')}
                    style={{
                      background: 'var(--color-background-primary)',
                      color: 'var(--color-text-primary)',
                      border: '1.5px solid var(--color-border-divider)',
                      borderRadius: 8,
                      padding: '4px 32px 4px 8px', // padding-right maior para a seta
                      fontSize: 14,
                      appearance: 'none',
                      WebkitAppearance: 'none',
                      MozAppearance: 'none',
                      minWidth: 110,
                    }}>
                    <option value="key">{groupBy === 'team' ? 'Team' : 'Error'}</option>
                    <option value="count">Error Count</option>
                    <option value="add">Added Value</option>
                    <option value="rem">Removed Value</option>
                  </select>
                  <i
                    className="bi bi-chevron-down"
                    style={{
                      position: 'absolute',
                      right: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      pointerEvents: 'none',
                      color: 'var(--color-accent-primary)',
                      fontSize: 16,
                    }}
                  />
                </div>
                <button onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')} style={{ background: 'var(--color-background-primary)', color: 'var(--color-accent-primary)', border: '1px solid var(--color-border-divider)', borderRadius: 15, padding: '4px 10px', fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                  {sortDir === 'asc' ? (
                    sortBy === 'key' ? <i className="bi bi-sort-alpha-down" /> : <i className="bi bi-sort-numeric-down" />
                  ) : (
                    sortBy === 'key' ? <i className="bi bi-sort-alpha-up" /> : <i className="bi bi-sort-numeric-up" />
                  )}
                </button>
              </div>
            </div>
          </div>
          <div style={{ background: 'var(--color-background-primary)', overflow: 'hidden', width: '100%', flex: '1 1 0%', display: 'flex', flexDirection: 'column', minHeight: 0, padding: '0 10px 10px 10px' }}>
            <div style={{ flex: '1 1 0%', height: 0, overflowY: 'auto', width: '100%' }} className="custom-scrollbar">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, tableLayout: 'auto' }}>
                <thead>
                  <tr style={{ background: 'var(--color-background-secondary)' }}>
                    <th style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'left', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2 }}>{groupBy === 'team' ? 'Team' : 'Error'}</th>
                    <th style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'center', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2 }}>Error Count</th>
                    <th style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'right', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2 }}>Added Value</th>
                    <th style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'right', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2 }}>Removed Value</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(groupedData).map(([key, val]) => (
                    <tr key={key}>
                      <td style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-secondary)', textAlign: 'left' }}>{key}</td>
                      <td style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-secondary)', textAlign: 'center' }}>{val.count}</td>
                      <td style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: '#1bbf5c', textAlign: 'right' }}>{val.add.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</td>
                      <td style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: '#dc3545', textAlign: 'right' }}>{val.rem.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div id="individual_data" style={{ width: '35%', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Destaques */}
          <div style={{ flex: '1 1 0%', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 0, borderBottom: '1px solid var(--color-border-divider)', padding: 10, backgroundColor: 'var(--color-background-primary)' }}>
            <div className='fw-light' style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: 5, background: 'transparent', zIndex: 2 }}>Destaques</div>
            <div className="custom-scrollbar d-flex flex-column gap-1" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {partitionLoading ? (
                <PartitionLoading />
              ) : year && month ? (
                (() => {
                  const key = `${Number(year)}-${Number(month)}`;
                  const destaques = highlightsByMonth[key];
                  if (!destaques || destaques.length === 0) {
                    return (
                      <PartitionCard>
                        <EmptyMessage text="No highlights found for this period." showEdit={true} onEdit={() => openModal('destaque', null)} />
                      </PartitionCard>
                    );
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
                          {ofThisScreen && (
                            <button
                              type="button"
                              className="btn btn-link p-0 ms-2"
                              style={{ color: 'var(--color-accent-primary)', fontSize: 18, lineHeight: 1, boxShadow: 'none', border: 'none', background: 'none' }}
                              onClick={e => {
                                e.stopPropagation();
                                openModal('destaque', destaques[0]);
                              }}
                              aria-label="Editar"
                            >
                              <i className="bi bi-pencil" />
                            </button>
                          )}
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
                <PartitionCard>
                  <EmptyMessage text="Nenhum destaque encontrado." showEdit={true} />
                </PartitionCard>
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
                        {ofThisScreen && (
                          <button
                            type="button"
                            className="btn btn-link p-0 ms-2"
                            style={{ color: 'var(--color-accent-primary)', fontSize: 18, lineHeight: 1, boxShadow: 'none', border: 'none', background: 'none' }}
                            onClick={e => {
                              e.stopPropagation();
                              openModal('destaque', destaques[0]);
                            }}
                            aria-label="Editar"
                          >
                            <i className="bi bi-pencil" />
                          </button>
                        )}
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
              ) : year && month ? (
                (() => {
                  const key = `${Number(year)}-${Number(month)}`;
                  const oportunidades = oportunidadesByMonth[key];
                  if (!oportunidades || oportunidades.length === 0) {
                    return (
                      <PartitionCard>
                        <EmptyMessage text="No opportunities found for this period." showEdit={ofThisScreen} onEdit={() => openModal('oportunidade', null)} />
                      </PartitionCard>
                    );
                  }
                  return (
                    <div key={key} style={{ borderRadius: 10, background: 'var(--color-background-secondary)', marginBottom: 0, border: '1px solid var(--color-border-divider)' }}>
                      <button
                        className={`btn-sidebar d-flex align-items-center justify-content-between w-100`}
                        style={{ gap: 10, padding: '8px 12px', borderRadius: 8, fontSize: 14, borderTopLeftRadius: 10, borderTopRightRadius: 10, marginBottom: 0, minHeight: 38, width: '100%', border: 'none', outline: 'none', boxShadow: 'none' }}
                        onClick={() => setOpenOportunidades(openOportunidades === key ? '' : key)}
                      >
                        <span style={{ fontWeight: 600, color: 'inherit', fontSize: 15 }}>{formatMonthYear(key)}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <i className={`bi ${openOportunidades === key ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ fontSize: 18, color: 'inherit' }} />
                          {ofThisScreen && (
                            <button
                              type="button"
                              className="btn btn-link p-0 ms-2"
                              style={{ color: 'var(--color-accent-primary)', fontSize: 18, lineHeight: 1, boxShadow: 'none', border: 'none', background: 'none' }}
                              onClick={e => {
                                e.stopPropagation();
                                openModal('oportunidade', oportunidades[0]);
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
                          <OportunidadesPartition oportunidades={oportunidades} isAdmin={true} />
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : Object.keys(oportunidadesByMonth).length === 0 ? (
                <PartitionCard>
                  <EmptyMessage text="Nenhuma oportunidade encontrada." showEdit={ofThisScreen} />
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
                        <i className={`bi ${openOportunidades === key ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ fontSize: 18, color: 'inherit' }} />
                        {ofThisScreen && (
                          <button
                            type="button"
                            className="btn btn-link p-0 ms-2"
                            style={{ color: 'var(--color-accent-primary)', fontSize: 18, lineHeight: 1, boxShadow: 'none', border: 'none', background: 'none' }}
                            onClick={e => {
                              e.stopPropagation();
                              openModal('oportunidade', oportunidades[0]);
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
                        <OportunidadesPartition oportunidades={oportunidades} isAdmin={true} />
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
          {/* Plano de Ação - NOVO MODELO */}
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
                          {ofThisScreen && (
                            <button
                              type="button"
                              className="btn btn-link p-0 ms-2"
                              style={{ color: 'var(--color-accent-primary)', fontSize: 18, lineHeight: 1, boxShadow: 'none', border: 'none', background: 'none' }}
                              onClick={e => {
                                e.stopPropagation();
                                openModal('plano', plano);
                              }}
                              aria-label="Editar"
                            >
                              <i className="bi bi-pencil" />
                            </button>
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
      {/* Modal global */}
      {modalOpen && modalType && createPortal(
        <Modal
          show={modalOpen}
          onClose={() => setModalOpen(false)}
          type={modalType as 'destaque' | 'oportunidade' | 'plano'}
          data={modalData}
          anoSelecionado={year}
          mesSelecionado={month}
          onSaved={async () => {
            sessionStorage.removeItem('individual_data_cache');
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
    </div>
  );
}