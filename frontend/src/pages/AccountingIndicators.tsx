import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';

import sublogoHvac from '../assets/submenu/sublogo_hvac.png';
import sublogoFraming from '../assets/submenu/sublogo_framing.png';
import sublogoPcg from '../assets/submenu/sublogo_pcg.png';


// Componentes modulares
import AccountingFilters from '../components/common/AccountingIndicators/AccountingFilters';
import AccountingMetrics from '../components/common/AccountingIndicators/AccountingMetrics';
import AccountingTable from '../components/common/AccountingIndicators/AccountingTable';
import { AccountingChart } from '../components/common/AccountingIndicators/AccountingChart';

// Partições modulares (igual ao TimesheetAnalysis)
import DestaquesPartition from '../components/partitions/DestaquesPartition';
import OportunidadesPartition from '../components/partitions/OportunidadesPartition';
import PlanoAcaoPartition from '../components/partitions/PlanoAcaoPartition';

// Modais (igual ao TimesheetAnalysis)
import DestaqueModal from '../components/modals/DestaqueModal';
import OportunidadeModal from '../components/modals/OportunidadeModal';
import PlanoAcaoModal from '../components/modals/PlanoAcaoModal';
import DestaqueViewModal from '../components/modals/DestaqueViewModal';
import OportunidadeViewModal from '../components/modals/OportunidadeViewModal';
import PlanoAcaoViewModal from '../components/modals/PlanoAcaoViewModal';
import AccountingTableModal from '../components/modals/AccountingTableModal';

// Hooks
import { useAccountingDataCached } from '../hooks/useAccountingDataCached';

// Interfaces para os dados das partições (igual ao TimesheetAnalysis)
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
  tela_id: string;
  titulo: string;
  descricao: string;
  criado_em: string;
  data_inicio: string;
  data_fim: string;
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

interface AccountingIndicatorsProps {
  telaId: string;
  usuarioId: string;
  role: string;
  isResponsavelPelaTela: boolean;
  onBackToProjects?: () => void;
  selectedCompany?: string;
}

const AccountingIndicators: React.FC<AccountingIndicatorsProps> = ({ telaId: telaIdFromProps, usuarioId, role, isResponsavelPelaTela, onBackToProjects, selectedCompany = 'HVAC' }) => {
  // Mapeamento de ícones das empresas
  const empresaIcones: { [empresa: string]: string } = {
    'HVAC': sublogoHvac,
    'Framing': sublogoFraming,
    'PCG': sublogoPcg,
  };
  const [telaId, setTelaId] = useState<string>(telaIdFromProps);
  const [usuarioResponsavelId, setUsuarioResponsavelId] = useState<string>('');
  const [podeEditar, setPodeEditar] = useState(false);
  const [usuariosParaBuscar, setUsuariosParaBuscar] = useState<string[]>([]);

  // Estados para filtros
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedGroup, setSelectedGroup] = useState<'all' | 'receivables' | 'payables'>('all');
  const [separateAging, setSeparateAging] = useState<boolean>(false);
  const [selectedAging, setSelectedAging] = useState<string[]>([]);
  const [selectedReceivablesCategories, setSelectedReceivablesCategories] = useState<string[]>([]);
  const [selectedPayablesCategories, setSelectedPayablesCategories] = useState<string[]>([]);

  // Estados para modais (igual ao TimesheetAnalysis)
  const [modalOpen, setModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'destaque' | 'oportunidade' | 'plano'>('destaque');
  const [modalData, setModalData] = useState<Destaque | Oportunidade | PlanoAcao | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [accountingTableModalOpen, setAccountingTableModalOpen] = useState(false);

  // Adicionar estado para selectedDay
  const [selectedDay, setSelectedDay] = useState('');
  
  // Estado para métricas de comparação
  const [comparisonMetrics, setComparisonMetrics] = useState<{ filteredValue: number; totalValue: number; percentage: number } | null>(null);

  // Estado para controlar se o separateAging está forçado pelo Pie Chart
  const [forceSeparateAging, setForceSeparateAging] = useState(false);
  
  // Estado para controlar se o usuário selecionou "Todos" no mês manualmente
  const [userSelectedAllMonth, setUserSelectedAllMonth] = useState(false);

    // Efeito para ativar automaticamente o separateAging quando forçado pelo Pie Chart
  useEffect(() => {
    if (forceSeparateAging && !separateAging) {
      setSeparateAging(true);
    }
  }, [forceSeparateAging, separateAging]);

  // Hook para dados de accounting
  const { 
    data: accountingData, 
    loading: dataLoading, 
    error: accountingError,
    years, 
    agingIntervals, 
    receivablesCategories, 
    payablesCategories 
  } = useAccountingDataCached(selectedCompany);

  // Estado local para os meses disponíveis
  const [months, setMonths] = useState<string[]>([]);

  // Atualizar meses disponíveis conforme ano selecionado
  useEffect(() => {
    // Se "Todos" for selecionado no ano, limpar os meses
    if (!selectedYear || selectedYear.trim() === '' || !accountingData) {
      setMonths([]);
      return;
    }
    // Pega todos os meses únicos do ano selecionado que possuem dados
    const meses = [
      ...new Set(
        accountingData
          .filter(d => d.date && d.date.startsWith(selectedYear + '-'))
          .map(d => String(Number(d.date.split('-')[1])).padStart(2, '0'))
          .filter(Boolean)
      ),
    ].sort((a, b) => Number(a) - Number(b));
    setMonths(meses);
    // Se o mês selecionado não existir mais, resetar
    if (selectedMonth && !meses.includes(selectedMonth)) {
      setSelectedMonth('');
    }
  }, [selectedYear, accountingData, selectedMonth]);

  // Atualizar telaId quando props mudarem
  useEffect(() => {
    setTelaId(telaIdFromProps);
  }, [telaIdFromProps]);

  // Recarregar dados quando a empresa mudar
  useEffect(() => {
    // Resetar filtros quando mudar de empresa
    setSelectedYear('');
    setSelectedMonth('');
    setSelectedGroup('all');
    setSeparateAging(false);
    setSelectedAging([]);
    setSelectedReceivablesCategories([]);
    setSelectedPayablesCategories([]);
    setSelectedDay('');
  }, [selectedCompany]);

  // Buscar usuário responsável pela tela e definir permissões (igual ao TimesheetAnalysis)
  useEffect(() => {
    const fetchResponsavelData = async () => {
      if (!telaId) return;

      // Buscar usuários responsáveis pela tela
      const { data: usuariosTelas } = await supabase
        .from('usuarios_telas')
        .select('usuario_id')
        .eq('tela_id', telaId);

      if (usuariosTelas && usuariosTelas.length > 0) {
        const responsaveisIds = usuariosTelas.map(ut => ut.usuario_id);
        const responsavelPrincipalId = responsaveisIds[0]; // Para compatibilidade
        setUsuarioResponsavelId(responsavelPrincipalId);

        // Definir permissões de edição
        if (role === 'dev' || role === 'manager' || role === 'gestor') {
          setPodeEditar(true);
        } else if (isResponsavelPelaTela) {
          setPodeEditar(true);
        } else {
          setPodeEditar(false);
        }

        // Definir quais usuários buscar dados (responsáveis + dev/manager/gestor se aplicável)
        const usuariosParaBuscarArray = [...responsaveisIds];
        if ((role === 'dev' || role === 'manager' || role === 'gestor') && !usuariosParaBuscarArray.includes(usuarioId)) {
          usuariosParaBuscarArray.push(usuarioId);
        }
        setUsuariosParaBuscar(usuariosParaBuscarArray);
      } else {
        setUsuarioResponsavelId('');
        setPodeEditar(false);
        setUsuariosParaBuscar([]);
      }
    };

    fetchResponsavelData();
  }, [telaId, usuarioId, role, isResponsavelPelaTela]);

  // Inicializar filtros quando os dados carregarem
  useEffect(() => {
    if (years.length > 0 && !selectedYear) {
      // Sempre selecionar 2025 se existir, senão ano atual
      const targetYear = '2025';
      if (years.includes(targetYear)) {
        setSelectedYear(targetYear);
      } else {
        const currentYear = new Date().getFullYear().toString();
        if (years.includes(currentYear)) {
          setSelectedYear(currentYear);
        } else if (years.length > 0) {
          setSelectedYear(years[0]);
        }
      }
    }
  }, [years, selectedYear]);

  // Inicializar mês quando meses estiverem disponíveis
  useEffect(() => {
    // Se "Todos" for selecionado no ano, resetar o mês
    if (!selectedYear || selectedYear.trim() === '') {
      setSelectedMonth('');
      setUserSelectedAllMonth(false);
      return;
    }
    
    // Manter mês como "Todos" (string vazia) por padrão
    // Só selecionar mês automaticamente se o usuário não selecionou "Todos" manualmente
    if (months.length > 0 && selectedMonth === '' && selectedYear && selectedYear.trim() !== '' && !userSelectedAllMonth) {
      // Manter como "Todos" (string vazia) em vez de selecionar o mês mais recente
      setSelectedMonth('');
      setUserSelectedAllMonth(true);
    }
  }, [months, selectedMonth, selectedYear, userSelectedAllMonth]);

  // Inicializar filtros apenas uma vez quando os dados carregarem pela primeira vez
  useEffect(() => {
    if (agingIntervals.length > 0 && selectedAging.length === 0) {
      setSelectedAging(agingIntervals);
    }
    if (receivablesCategories.length > 0 && selectedReceivablesCategories.length === 0) {
      setSelectedReceivablesCategories(receivablesCategories);
    }
    if (payablesCategories.length > 0 && selectedPayablesCategories.length === 0) {
      setSelectedPayablesCategories(payablesCategories);
    }
  }, [agingIntervals, receivablesCategories, payablesCategories]); // Sem selectedAging.length, etc.



  // Calcular dados filtrados
  const filteredData = useMemo(() => {
    if (!accountingData || !Array.isArray(accountingData)) {
      return [];
    }
    
    let filtered = accountingData;
    // Só filtra por ano se selectedYear estiver preenchido (não vazio)
    if (selectedYear && selectedYear.trim() !== '') {
      filtered = filtered.filter(d => d.date && d.date.startsWith(selectedYear + '-'));
    }
    // Só filtra por mês se selectedMonth estiver preenchido (não vazio)
    if (selectedMonth && selectedMonth.trim() !== '') {
      filtered = filtered.filter(d => d.date && String(Number(d.date.split('-')[1])).padStart(2, '0') === selectedMonth);
    }
    if (selectedGroup !== 'all') {
      filtered = filtered.filter(d => d.type === selectedGroup);
    }
    if (selectedAging.length > 0) {
      filtered = filtered.filter(d => selectedAging.includes(d.aging_intervals));
    }
    
    // Filtrar por categorias baseado no tipo
    if (selectedGroup === 'receivables' || selectedGroup === 'all') {
      if (selectedReceivablesCategories.length > 0) {
        filtered = filtered.filter(d => 
          d.type === 'receivables' ? selectedReceivablesCategories.includes(d.category) : true
        );
      }
    }
    if (selectedGroup === 'payables' || selectedGroup === 'all') {
      if (selectedPayablesCategories.length > 0) {
        filtered = filtered.filter(d => 
          d.type === 'payables' ? selectedPayablesCategories.includes(d.category) : true
        );
      }
    }
    
    
    return filtered;
  }, [accountingData, selectedYear, selectedMonth, selectedGroup, selectedAging, selectedReceivablesCategories, selectedPayablesCategories]);

  // Dados não filtrados por categoria/aging para cálculo do total no gráfico
  const unfilteredDataForChart = useMemo(() => {
    if (!accountingData || !Array.isArray(accountingData)) {
      return [];
    }
    
    let unfiltered = accountingData;
    // Só filtra por ano se selectedYear estiver preenchido (não vazio)
    if (selectedYear && selectedYear.trim() !== '') {
      unfiltered = unfiltered.filter(d => d.date && d.date.startsWith(selectedYear + '-'));
    }
    // Só filtra por mês se selectedMonth estiver preenchido (não vazio)
    if (selectedMonth && selectedMonth.trim() !== '') {
      unfiltered = unfiltered.filter(d => d.date && String(Number(d.date.split('-')[1])).padStart(2, '0') === selectedMonth);
    }
    if (selectedGroup !== 'all') unfiltered = unfiltered.filter(d => d.type === selectedGroup);
    
    // NÃO filtrar por aging nem categorias aqui - isso será feito no gráfico
    
    return unfiltered;
  }, [accountingData, selectedYear, selectedMonth, selectedGroup]);

  // Calcular métricas
  const metrics = useMemo(() => {
    if (!filteredData.length) {
      return {
        lastReceivable: 0,
        lastPayable: 0,
        receivablesAgingDetails: [],
        payablesAgingDetails: []
      };
    }

    // Função para pegar o valor do ponto mais tardio para cada grupo
    function getLastValue(type: 'receivables' | 'payables', selectedDay: string) {
      // Filtrar só o tipo
      const groupData = filteredData.filter(d => d.type === type && d.open_balance > 0 && d.date);
      if (!groupData.length) return 0;
      // Se dia selecionado
      if (selectedDay) {
        const rows = groupData.filter(d => d.date && d.date.split('-')[2] === selectedDay);
        const byTrans: Record<string, number> = {};
        rows.forEach(row => {
          const key = type === 'receivables' ? row.inv_num : row.bill_num;
          if (!key) return;
          if (!(key in byTrans)) byTrans[key] = row.open_balance;
          else byTrans[key] = Math.min(byTrans[key], row.open_balance);
        });
        return Object.values(byTrans).reduce((sum, v) => sum + v, 0);
      }
      // Se filtrando por ano e mês: pegar o último dia do mês
      if (selectedYear && selectedMonth) {
        // Pega o maior dia
        const lastDay = Math.max(...groupData.map(d => Number(d.date.split('-')[2])));
        const last = groupData.filter(d => Number(d.date.split('-')[2]) === lastDay);
        const byTrans: Record<string, number> = {};
        last.forEach(row => {
          const key = type === 'receivables' ? row.inv_num : row.bill_num;
          if (!key) return;
          if (!(key in byTrans)) byTrans[key] = row.open_balance;
          else byTrans[key] = Math.min(byTrans[key], row.open_balance);
        });
        return Object.values(byTrans).reduce((sum, v) => sum + v, 0);
      }
      // Se filtrando só por ano: pegar o último mês do ano
      if (selectedYear && !selectedMonth) {
        // Pega o maior mês
        const lastMonth = Math.max(...groupData.map(d => Number(d.date.split('-')[1])));
        const lastMonthData = groupData.filter(d => Number(d.date.split('-')[1]) === lastMonth);
        // Dentro do mês, pega o maior dia
        const lastDay = Math.max(...lastMonthData.map(d => Number(d.date.split('-')[2])));
        const last = lastMonthData.filter(d => Number(d.date.split('-')[2]) === lastDay);
        const byTrans: Record<string, number> = {};
        last.forEach(row => {
          const key = type === 'receivables' ? row.inv_num : row.bill_num;
          if (!key) return;
          if (!(key in byTrans)) byTrans[key] = row.open_balance;
          else byTrans[key] = Math.min(byTrans[key], row.open_balance);
        });
        return Object.values(byTrans).reduce((sum, v) => sum + v, 0);
      }
      // Se não filtrar nada: pega o último valor disponível
      // (maior ano, maior mês, maior dia)
      const lastDate = groupData.map(d => d.date).sort().pop();
      const last = groupData.filter(d => d.date === lastDate);
      const byTrans: Record<string, number> = {};
      last.forEach(row => {
        const key = type === 'receivables' ? row.inv_num : row.bill_num;
        if (!key) return;
        if (!(key in byTrans)) byTrans[key] = row.open_balance;
        else byTrans[key] = Math.min(byTrans[key], row.open_balance);
      });
      return Object.values(byTrans).reduce((sum, v) => sum + v, 0);
    }

    // Calcular aging details do último dia
    const calculateAgingDetails = (type: 'receivables' | 'payables' | 'all') => {
      // Função para pegar os dados do último dia
      function getLastDayData(type: 'receivables' | 'payables') {
        const groupData = filteredData.filter(d => d.type === type && d.open_balance > 0 && d.date);
        if (!groupData.length) return [];
        
        // Se filtrando por ano e mês: pegar o último dia do mês
        if (selectedYear && selectedMonth) {
          const lastDay = Math.max(...groupData.map(d => Number(d.date.split('-')[2])));
          return groupData.filter(d => Number(d.date.split('-')[2]) === lastDay);
        }
        // Se filtrando só por ano: pegar o último mês do ano
        if (selectedYear && !selectedMonth) {
          const lastMonth = Math.max(...groupData.map(d => Number(d.date.split('-')[1])));
          const lastMonthData = groupData.filter(d => Number(d.date.split('-')[1]) === lastMonth);
          const lastDay = Math.max(...lastMonthData.map(d => Number(d.date.split('-')[2])));
          return lastMonthData.filter(d => Number(d.date.split('-')[2]) === lastDay);
        }
        // Se não filtrar nada: pega o último valor disponível
        const lastDate = groupData.map(d => d.date).sort().pop();
        return groupData.filter(d => d.date === lastDate);
      }

      // Pegar dados do último dia baseado no tipo
      let lastDayData: typeof filteredData;
      if (type === 'all') {
        const receivablesData = getLastDayData('receivables');
        const payablesData = getLastDayData('payables');
        lastDayData = [...receivablesData, ...payablesData];
      } else {
        lastDayData = getLastDayData(type);
      }

      // Calcular aging details apenas do último dia - usar lógica de transação única
      const agingByTransaction: Record<string, Record<string, number>> = {};
      
      lastDayData.forEach(row => {
        if (row.aging_intervals && row.open_balance > 0) {
          const transactionKey = row.type === 'receivables' ? row.inv_num : row.bill_num;
          if (!transactionKey) return;
          
          if (!agingByTransaction[row.aging_intervals]) {
            agingByTransaction[row.aging_intervals] = {};
          }
          
          // Para cada transação, pegar o menor open_balance
          if (!agingByTransaction[row.aging_intervals][transactionKey] || 
              row.open_balance < agingByTransaction[row.aging_intervals][transactionKey]) {
            agingByTransaction[row.aging_intervals][transactionKey] = row.open_balance;
          }
        }
      });
      
      // Calcular totais por aging
      const agingMap = new Map<string, number>();
      Object.keys(agingByTransaction).forEach(aging => {
        const total = Object.values(agingByTransaction[aging]).reduce((sum, val) => sum + val, 0);
        agingMap.set(aging, total);
      });
      
      const total = Array.from(agingMap.values()).reduce((sum, value) => sum + value, 0);
      return Array.from(agingMap.entries()).map(([interval, value]) => ({
        interval,
        value,
        percentage: total > 0 ? (value / total) * 100 : 0
      })).sort((a, b) => {
        const aStart = parseInt(a.interval.split('-')[0]) || 0;
        const bStart = parseInt(b.interval.split('-')[0]) || 0;
        return aStart - bStart;
      });
    };

    const lastReceivable = getLastValue('receivables', selectedDay);
    const lastPayable = getLastValue('payables', selectedDay);

    return {
      lastReceivable,
      lastPayable,
      receivablesAgingDetails: calculateAgingDetails('receivables'),
      payablesAgingDetails: calculateAgingDetails('payables')
    };
  }, [filteredData, selectedYear, selectedMonth, selectedDay]);

  // Função para salvar dados (igual ao TimesheetAnalysis)
  const handleSave = async () => {
    setRefreshTrigger(prev => prev + 1);
  };



  if (!telaId || !usuarioResponsavelId) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        width: '100%',
        background: 'var(--color-background-primary)',
        color: 'var(--color-text-secondary)'
      }}>
        <div className="spinner-border" role="status" style={{ 
          width: 40, 
          height: 40, 
          color: 'var(--color-accent-primary)',
          marginBottom: '16px'
        }}>
          <span className="visually-hidden">Carregando...</span>
        </div>
        <p style={{ 
          margin: 0, 
          fontSize: '14px',
          fontWeight: 500,
          color: 'var(--color-text-secondary)'
        }}>
          Carregando...
        </p>
      </div>
    );
  }

  if (dataLoading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        width: '100%',
        background: 'var(--color-background-primary)',
        color: 'var(--color-text-secondary)'
      }}>
        <div className="spinner-border" role="status" style={{ 
          width: 40, 
          height: 40, 
          color: 'var(--color-accent-primary)',
          marginBottom: '16px'
        }}>
          <span className="visually-hidden">Carregando dados...</span>
        </div>
        <p style={{ 
          margin: 0, 
          fontSize: '14px',
          fontWeight: 500,
          color: 'var(--color-text-secondary)'
        }}>
          Carregando dados de Accounting...
        </p>
      </div>
    );
  }

  if (accountingError) {
    return (
      <div className="alert alert-danger" role="alert" style={{
        margin: '20px',
        padding: '16px',
        borderRadius: '8px',
        border: '1px solid #dc3545',
        backgroundColor: '#f8d7da',
        color: '#721c24'
      }}>
        <strong>Erro ao carregar dados:</strong> {accountingError}
      </div>
    );
  }

  // Verificação adicional para dados vazios
  if (!accountingData || accountingData.length === 0) {
    // Se for Framing ou PCG e não há dados, redirecionar automaticamente para Projects
    if ((selectedCompany === 'Framing' || selectedCompany === 'PCG') && onBackToProjects) {
      // Usar setTimeout para garantir que o componente seja montado antes do redirecionamento
      setTimeout(() => {
        onBackToProjects();
      }, 100);
      return null; // Retornar null para não renderizar nada
    }

    return (
      <div id="content" style={{ height: '100%', minHeight: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Barra superior com título e filtros */}
        <div className="d-flex flex-row justify-content-between align-items-center" style={{ padding: '10px 20px', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
          <h1 style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, flex: '0 0 auto', marginBottom: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
            <img 
              src={empresaIcones[selectedCompany] || ''} 
              alt={selectedCompany} 
              style={{ 
                width: 24, 
                height: 24, 
                objectFit: 'contain'
              }}
            />
            <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
              {selectedCompany}
            </span>
            <span style={{ color: 'var(--color-text-secondary)', fontWeight: 400 }}>
              Outstanding Indicators
            </span>
          </h1>
        </div>
        
        {/* Mensagem de dados vazios */}
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          background: 'var(--color-background-primary)'
        }}>
          <div style={{ 
            textAlign: 'center',
            color: 'var(--color-text-secondary)'
          }}>
            <i className="bi bi-database-x" style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }} />
            <h4 style={{ marginBottom: 8, color: 'var(--color-text-primary)' }}>
              Nenhum dado encontrado
            </h4>
            <p style={{ margin: 0, fontSize: 14 }}>
              Não há dados de accounting disponíveis para {selectedCompany}.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="content" style={{ height: '100%', minHeight: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Barra superior com título e filtros */}
      <div className="d-flex flex-row justify-content-between align-items-center" style={{ padding: '10px 20px', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
        <h1 style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, flex: '0 0 auto', marginBottom: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
          <img 
            src={empresaIcones[selectedCompany] || ''} 
            alt={selectedCompany} 
            style={{ 
              width: 24, 
              height: 24, 
              objectFit: 'contain'
            }}
          />
          <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
            {selectedCompany}
          </span>
          <span style={{ color: 'var(--color-text-secondary)', fontWeight: 400 }}>
            Outstanding Indicators
          </span>
        </h1>
                 <AccountingFilters
           selectedYear={selectedYear}
           setSelectedYear={setSelectedYear}
           selectedMonth={selectedMonth}
           setSelectedMonth={setSelectedMonth}
           selectedGroup={selectedGroup}
           setSelectedGroup={setSelectedGroup}
           separateAging={separateAging}
           setSeparateAging={setSeparateAging}
           selectedAging={selectedAging}
           setSelectedAging={setSelectedAging}
           selectedReceivablesCategories={selectedReceivablesCategories}
           setSelectedReceivablesCategories={setSelectedReceivablesCategories}
           selectedPayablesCategories={selectedPayablesCategories}
           setSelectedPayablesCategories={setSelectedPayablesCategories}
           years={years}
           months={months}
           agingIntervals={agingIntervals}
           receivablesCategories={receivablesCategories}
           payablesCategories={payablesCategories}
           forceSeparateAging={forceSeparateAging}
           onUserSelectAllMonth={setUserSelectedAllMonth}
         />
      </div>

      {/* Conteúdo principal: gráfico/tabela à esquerda, partições à direita (igual ao backup e TimesheetAnalysis) */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'row', width: '100%', minHeight: 0, minWidth: 0 }}>
        {/* Lado esquerdo: gráfico, métricas, tabela */}
        <div style={{ background:'var(--color-background-primary)', width: '70%', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--color-border-divider)' }}>
          <div>
            {/* Gráfico */}
            <AccountingChart 
              filteredData={filteredData} 
              selectedYear={selectedYear} 
              selectedMonth={selectedMonth} 
              selectedGroup={selectedGroup} 
              separateAging={separateAging}
              selectedDay={selectedDay}
              setSelectedDay={setSelectedDay}
              onComparisonMetricsChange={setComparisonMetrics}
              onForceSeparateAging={setForceSeparateAging}
              selectedReceivablesCategories={selectedReceivablesCategories}
              selectedPayablesCategories={selectedPayablesCategories}
              selectedAging={selectedAging}
              unfilteredDataForChart={unfilteredDataForChart}
              onBackToProjects={onBackToProjects}
            />
            {/* Métricas centralizadas abaixo do gráfico */}
            <div className="d-flex flex-row align-items-center justify-content-between" style={{ borderBottom: '1px solid var(--color-border-divider)', borderTop: '1px solid var(--color-border-divider)' }}>
              <AccountingMetrics
                lastReceivable={metrics.lastReceivable}
                lastPayable={metrics.lastPayable}
                receivablesAgingDetails={metrics.receivablesAgingDetails}
                payablesAgingDetails={metrics.payablesAgingDetails}
                selectedGroup={selectedGroup}
                comparisonMetrics={comparisonMetrics}
              />
            </div>
          </div>
          {/* Tabela de dados */}
          <AccountingTable 
            filteredData={filteredData} 
            selectedGroup={selectedGroup} 
            onView={() => setAccountingTableModalOpen(true)}
          />
        </div>
        {/* Lado direito: partições (igual ao TimesheetAnalysis) */}
        <div id="individual_data" style={{ width: '30%', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Partições */}
          <DestaquesPartition
            usuarioResponsavelId={usuarioResponsavelId}
            usuariosParaBuscar={usuariosParaBuscar}
            telaId={telaId}
            selectedYear={selectedYear}
            selectedMonth={selectedMonth}
            isAdmin={podeEditar}
            usuarioLogadoId={usuarioId}
            onEdit={async (mes, ano, usuarioId) => {
              setModalType('destaque');
              // Se mes/ano não vierem do card, usa o filtro
              const mesRef = (typeof mes === 'string' || typeof mes === 'number') ? mes : selectedMonth;
              const anoRef = (typeof ano === 'string' || typeof ano === 'number') ? ano : selectedYear;
              if (!mesRef || !anoRef) {
                setModalData(null);
                setModalOpen(true);
                return;
              }
              // Se temos um usuarioId específico, usar apenas ele para buscar dados
              const usuariosParaBuscarDados = usuarioId ? [usuarioId] : 
                (usuariosParaBuscar && usuariosParaBuscar.length > 0 
                  ? usuariosParaBuscar 
                  : (Array.isArray(usuarioResponsavelId) ? usuarioResponsavelId : [usuarioResponsavelId]));
              
              if (!usuariosParaBuscarDados || usuariosParaBuscarDados.length === 0) {
                console.error('Nenhum usuário disponível para buscar dados');
                setModalData(null);
                setModalOpen(true);
                return;
              }
              
              // Buscar dados existentes usando o usuarioId específico
              const { data: destaques } = await supabase
                .from('destaques')
                .select('*')
                .eq('tela_id', telaId) // Adicionar filtro por tela_id
                .eq('mes', Number(mesRef))
                .eq('ano', Number(anoRef))
                .eq('usuario_id', usuariosParaBuscarDados[0]);
              if (destaques && destaques.length > 0) {
                const destaque = destaques[0];
                // Buscar positivos e negativos
                const { data: positivos } = await supabase.from('destaques_positivos').select('*').eq('destaque_id', destaque.id);
                const { data: negativos } = await supabase.from('destaques_negativos').select('*').eq('destaque_id', destaque.id);
                setModalData({
                  ...destaque,
                  mes: destaque.mes.toString(),
                  ano: destaque.ano.toString(),
                  positivos: (positivos || []).map((p: { texto: string }) => p.texto),
                  negativos: (negativos || []).map((n: { texto: string }) => n.texto),
                });
              } else {
                setModalData({
                  id: '',
                  usuario_id: usuarioResponsavelId,
                  tela_id: telaId,
                  mes: mesRef,
                  ano: anoRef,
                  criado_em: new Date().toISOString(),
                  positivos: [],
                  negativos: [],
                });
              }
              setModalOpen(true);
            }}
            onView={async (destaque) => {
              setModalType('destaque');
              setModalData(destaque);
              setViewModalOpen(true);
            }}
            refreshTrigger={refreshTrigger}
          />
          <OportunidadesPartition
            usuarioResponsavelId={usuarioResponsavelId}
            usuariosParaBuscar={usuariosParaBuscar}
            telaId={telaId}
            selectedYear={selectedYear}
            selectedMonth={selectedMonth}
            isAdmin={podeEditar}
            usuarioLogadoId={usuarioId}
            onEdit={async (mes, ano) => {
              setModalType('oportunidade');
              // Se mes/ano não vierem do card, usa o filtro
              const mesRef = (typeof mes === 'string' || typeof mes === 'number') ? mes : selectedMonth;
              const anoRef = (typeof ano === 'string' || typeof ano === 'number') ? ano : selectedYear;
              if (!mesRef || !anoRef) {
                setModalData(null);
                setModalOpen(true);
                return;
              }
              // Buscar dados existentes para o período
              const { data: oportunidades } = await supabase
                .from('oportunidades')
                .select('*')
                .eq('usuario_id', usuarioResponsavelId)
                .eq('tela_id', telaId)
                .eq('mes', Number(mesRef))
                .eq('ano', Number(anoRef));
              if (oportunidades && oportunidades.length > 0) {
                const oportunidade = oportunidades[0];
                // Buscar desafios e melhorias
                const { data: desafios } = await supabase.from('desafios').select('*').eq('oportunidade_id', oportunidade.id);
                const { data: melhorias } = await supabase.from('melhorias').select('*').eq('oportunidade_id', oportunidade.id);
                setModalData({
                  ...oportunidade,
                  mes: oportunidade.mes.toString(),
                  ano: oportunidade.ano.toString(),
                  desafios: (desafios || []).map((d: { texto: string }) => d.texto),
                  melhorias: (melhorias || []).map((m: { texto: string }) => m.texto),
                });
              } else {
                setModalData({
                  id: '',
                  usuario_id: usuarioResponsavelId,
                  tela_id: telaId,
                  mes: mesRef,
                  ano: anoRef,
                  titulo: '',
                  criado_em: new Date().toISOString(),
                  desafios: [],
                  melhorias: [],
                });
              }
              setModalOpen(true);
            }}
            onView={async (oportunidade, mes, ano) => {
              setModalType('oportunidade');
              
              // Buscar todas as oportunidades do período para permitir navegação
              const { data: todasOportunidades } = await supabase
                .from('oportunidades')
                .select('*')
                .eq('usuario_id', oportunidade.usuario_id)
                .eq('tela_id', telaId)
                .eq('mes', Number(mes))
                .eq('ano', Number(ano));
              
              if (todasOportunidades && todasOportunidades.length > 0) {
                // Buscar desafios e melhorias para todas as oportunidades
                const { data: todosDesafios } = await supabase.from('desafios').select('*');
                const { data: todasMelhorias } = await supabase.from('melhorias').select('*');
                
                const oportunidadesCompletas = todasOportunidades.map(op => ({
                  ...op,
                  mes: op.mes.toString(),
                  ano: op.ano.toString(),
                  desafios: (todosDesafios || []).filter((d: { oportunidade_id: string; texto: string }) => d.oportunidade_id === op.id).map((d: { texto: string }) => d.texto),
                  melhorias: (todasMelhorias || []).filter((m: { oportunidade_id: string; texto: string }) => m.oportunidade_id === op.id).map((m: { texto: string }) => m.texto),
                }));
                
                // Encontrar o índice da oportunidade atual na lista
                const currentIndex = oportunidadesCompletas.findIndex(op => op.id === oportunidade.id);
                
                // Passar a lista completa e o índice atual para o modal
                setModalData({
                  ...oportunidade,
                  oportunidadesList: oportunidadesCompletas,
                  initialIndex: currentIndex >= 0 ? currentIndex : 0
                } as Oportunidade & { oportunidadesList?: Oportunidade[]; initialIndex?: number });
              } else {
                // Fallback: passar apenas a oportunidade individual
                setModalData(oportunidade);
              }
              
              setViewModalOpen(true);
            }}
            refreshTrigger={refreshTrigger}
          />
          <PlanoAcaoPartition
            usuarioResponsavelId={usuarioResponsavelId}
            usuariosParaBuscar={usuariosParaBuscar}
            telaId={telaId}
            isAdmin={podeEditar}
            onEdit={async (plano) => {
              setModalType('plano');
              // Buscar ações do plano específico
              const { data: acoes } = await supabase
                .from('acoes')
                .select('*')
                .eq('plano_id', plano.id);
              
              setModalData({
                ...plano,
                tela_id: telaId,
                acoes: acoes || [],
              });
              setModalOpen(true);
            }}
            onAdd={async () => {
              setModalType('plano');
              setModalData({
                id: '',
                usuario_id: usuarioResponsavelId,
                tela_id: telaId,
                titulo: '',
                descricao: '',
                criado_em: new Date().toISOString(),
                data_inicio: '',
                data_fim: '',
                acoes: [],
              });
              setModalOpen(true);
            }}
            onView={async (plano) => {
              setModalType('plano');
              setModalData({
                ...plano,
                tela_id: telaId,
              });
              setViewModalOpen(true);
            }}
            refreshTrigger={refreshTrigger}
          />
        </div>
      </div>

      {/* Modais (igual ao TimesheetAnalysis) */}
      {modalOpen && modalType === 'destaque' && modalData && (
        <DestaqueModal
          key={`destaque-modal-${modalData.id || 'new'}`}
          show={modalOpen}
          onClose={() => setModalOpen(false)}
          data={modalData as Destaque}
          onSaved={handleSave}
          usuarioId={usuarioId}
        />
      )}

      {modalOpen && modalType === 'oportunidade' && modalData && (
        <OportunidadeModal
          key={`oportunidade-modal-${modalData.id || 'new'}`}
          show={modalOpen}
          onClose={() => setModalOpen(false)}
          data={modalData as Oportunidade}
          onSaved={handleSave}
          anoSelecionado={selectedYear?.toString()}
          mesSelecionado={selectedMonth?.toString()}
          usuarioId={usuarioId}
        />
      )}

      {modalOpen && modalType === 'plano' && (
        <PlanoAcaoModal
          show={modalOpen}
          onClose={() => setModalOpen(false)}
          data={modalType === 'plano' ? modalData as PlanoAcao : null}
          onSaved={handleSave}
        />
      )}

      {viewModalOpen && modalType === 'destaque' && (
        <DestaqueViewModal
          visible={viewModalOpen}
          onClose={() => setViewModalOpen(false)}
          data={modalData as Destaque}
        />
      )}

      {viewModalOpen && modalType === 'oportunidade' && (
        <OportunidadeViewModal
          show={viewModalOpen}
          onClose={() => setViewModalOpen(false)}
          data={modalData as Oportunidade}
        />
      )}

      {viewModalOpen && modalType === 'plano' && (
        <PlanoAcaoViewModal
          show={viewModalOpen}
          onClose={() => setViewModalOpen(false)}
          data={modalData as PlanoAcao}
        />
      )}

      {/* Modal da Tabela de Accounting */}
      <AccountingTableModal
        show={accountingTableModalOpen}
        onClose={() => setAccountingTableModalOpen(false)}
        data={filteredData}
        years={years}
      />
    </div>
  );
};

export default AccountingIndicators; 