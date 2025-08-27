import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import { useServiceRequestData } from '../hooks/useServiceRequestData';
import DestaqueModal from '../components/modals/DestaqueModal';
import OportunidadeModal from '../components/modals/OportunidadeModal';
import PlanoAcaoModal from '../components/modals/PlanoAcaoModal';
import DestaqueViewModal from '../components/modals/DestaqueViewModal';
import OportunidadeViewModal from '../components/modals/OportunidadeViewModal';
import PlanoAcaoViewModal from '../components/modals/PlanoAcaoViewModal';
import ServiceFilters from '../components/common/ServiceRequests/ServiceFilters';
import ServiceMetrics from '../components/common/ServiceRequests/ServiceMetrics';
import ServiceCarousel from '../components/common/ServiceRequests/ServiceCarousel';
import { ServiceChart } from '../components/common/ServiceRequests/ServiceChart';
import DestaquesPartition from '../components/partitions/DestaquesPartition';
import OportunidadesPartition from '../components/partitions/OportunidadesPartition';
import PlanoAcaoPartition from '../components/partitions/PlanoAcaoPartition';

dayjs.extend(isBetween);

// Interfaces para os dados das partições
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

interface ServiceRequestsProps {
  telaId: string;
  usuarioId: string;
  role: string;
  isResponsavelPelaTela: boolean;
}

export default function ServiceRequests({ telaId: telaIdFromProps, usuarioId, role, isResponsavelPelaTela }: ServiceRequestsProps) {
  const [telaId] = useState<string>(telaIdFromProps);
  const [usuarioResponsavelId, setUsuarioResponsavelId] = useState<string>('');
  const [usuariosParaBuscar, setUsuariosParaBuscar] = useState<string[]>([]);

  // Estados para filtros
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState<string>('Todos');
  const [selectedContractor, setSelectedContractor] = useState<string[]>([]);
  const [selectedJobsite, setSelectedJobsite] = useState<string[]>([]);
  const [selectedCity, setSelectedCity] = useState<string[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<string[]>([]);
  const [selectedWarranty, setSelectedWarranty] = useState<'all' | 'warranty' | 'non-warranty'>('all');

  // Estados para opções de filtro
  const [years, setYears] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [contractors, setContractors] = useState<string[]>([]);
  const [jobsites, setJobsites] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [issues, setIssues] = useState<string[]>([]);

  // Hook para buscar dados de service requests
  const { data: serviceData, loading: serviceLoading, error: serviceError, refetch: refetchServiceData } = useServiceRequestData();

  // Estados para modais
  const [modalOpen, setModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'destaque' | 'oportunidade' | 'plano'>('destaque');
  const [modalData, setModalData] = useState<Destaque | Oportunidade | PlanoAcao | null>(null);
  const [refreshTrigger] = useState(0);

  // Verificar se pode editar
  const podeEditar = isResponsavelPelaTela || role === 'dev' || role === 'manager' || role === 'gestor';

  // Buscar dados do responsável
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

        // Definir quais usuários buscar dados (responsáveis + dev/manager/gestor se aplicável)
        const usuariosParaBuscarArray = [...responsaveisIds];
        if ((role === 'dev' || role === 'manager' || role === 'gestor') && !usuariosParaBuscarArray.includes(usuarioId)) {
          usuariosParaBuscarArray.push(usuarioId);
        }
        setUsuariosParaBuscar(usuariosParaBuscarArray);
      } else {
        setUsuarioResponsavelId('');
        setUsuariosParaBuscar([]);
      }
    };

    fetchResponsavelData();
  }, [telaId, usuarioId, role]);

  // Processar dados quando serviceData mudar
  useEffect(() => {
    if (serviceData && serviceData.length > 0) {
      // Extrair anos únicos
      const uniqueYears = [...new Set(serviceData.map(item => {
        const date = item.date_received ? new Date(item.date_received) : null;
        return date ? date.getFullYear().toString() : '';
      }).filter(year => year))];
      setYears(uniqueYears.sort((a, b) => b.localeCompare(a)));

      // Extrair contractors únicos
      const uniqueContractors = [...new Set(serviceData.map(item => item.contractor).filter(contractor => contractor))];
      setContractors(uniqueContractors.sort());

      // Extrair jobsites únicos
      const uniqueJobsites = [...new Set(serviceData.map(item => item.job_site).filter(jobsite => jobsite))];
      setJobsites(uniqueJobsites.sort());

      // Extrair cities únicas
      const uniqueCities = [...new Set(serviceData.map(item => item.city).filter(city => city))];
      setCities(uniqueCities.sort());

      // Extrair issues únicas
      const uniqueIssues = [...new Set(serviceData.map(item => item.issue).filter(issue => issue))];
      setIssues(uniqueIssues.sort());
    }
  }, [serviceData]);

  // Função para obter meses disponíveis baseado no ano selecionado
  const getAvailableMonths = useMemo(() => {
    if (!serviceData || serviceData.length === 0) return [];
    
    const monthsInYear = new Set<string>();
    
    serviceData.forEach(item => {
      if (item.date_received) {
        const date = new Date(item.date_received);
        const itemYear = date.getFullYear().toString();
        
        // Se não há ano selecionado ou se o item é do ano selecionado
        if (!selectedYear || selectedYear === 'Todos' || itemYear === selectedYear) {
          const month = (date.getMonth() + 1).toString().padStart(2, '0');
          monthsInYear.add(month);
        }
      }
    });
    
    return Array.from(monthsInYear).sort();
  }, [serviceData, selectedYear]);

  // Atualizar meses quando o ano mudar
  useEffect(() => {
    setMonths(getAvailableMonths);
  }, [getAvailableMonths]);

  // Dados filtrados
  const filteredData = useMemo(() => {
    if (!serviceData || serviceData.length === 0) return [];

    return serviceData.filter(item => {
      // Filtro por ano
      if (selectedYear && selectedYear !== 'Todos') {
        const itemYear = item.date_received ? new Date(item.date_received).getFullYear().toString() : '';
        if (itemYear !== selectedYear) return false;
      }

      // Filtro por mês
      if (selectedMonth && selectedMonth !== 'Todos') {
        const itemMonth = item.date_received ? (new Date(item.date_received).getMonth() + 1).toString().padStart(2, '0') : '';
        if (itemMonth !== selectedMonth) return false;
      }

      // Filtro por contractor
      const shouldApplyContractorFilter = selectedContractor.length > 0 && selectedContractor.length < contractors.length;
      if (shouldApplyContractorFilter) {
        if (!selectedContractor.includes(item.contractor)) return false;
      }

      // Filtro por jobsite
      const shouldApplyJobsiteFilter = selectedJobsite.length > 0 && selectedJobsite.length < jobsites.length;
      if (shouldApplyJobsiteFilter) {
        if (!selectedJobsite.includes(item.job_site)) return false;
      }

      // Filtro por city
      const shouldApplyCityFilter = selectedCity.length > 0 && selectedCity.length < cities.length;
      if (shouldApplyCityFilter) {
        if (!selectedCity.includes(item.city)) return false;
      }

      // Filtro por issue
      const shouldApplyIssueFilter = selectedIssue.length > 0 && selectedIssue.length < issues.length;
      if (shouldApplyIssueFilter) {
        if (!selectedIssue.includes(item.issue)) return false;
      }

      // Filtro por warranty
      if (selectedWarranty !== 'all') {
        if (selectedWarranty === 'warranty' && !item.warranty) return false;
        if (selectedWarranty === 'non-warranty' && item.warranty) return false;
      }

      return true;
    });
  }, [serviceData, selectedYear, selectedMonth, selectedContractor, selectedJobsite, selectedCity, selectedIssue, selectedWarranty, contractors, jobsites, cities, issues]);

  // Função para resetar filtros para "Todos"
  const resetFiltersToAll = useCallback(() => {
    // Inicializar com todos os valores disponíveis = "Todos" selecionado
    if (contractors.length > 0) {
      setSelectedContractor(contractors);
    }
    if (jobsites.length > 0) {
      setSelectedJobsite(jobsites);
    }
    if (cities.length > 0) {
      setSelectedCity(cities);
    }
    if (issues.length > 0) {
      setSelectedIssue(issues);
    }
  }, [contractors, jobsites, cities, issues]);

  // Resetar filtros quando os dados mudarem
  useEffect(() => {
    resetFiltersToAll();
  }, [serviceData, resetFiltersToAll]);

  const handleSave = async () => {
    setModalOpen(false);
    setViewModalOpen(false);
    refetchServiceData();
  };

  if (!usuarioResponsavelId || serviceLoading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
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
          Carregando dados de Service Requests...
        </p>
      </div>
    );
  }

  if (serviceError) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--color-background-primary)',
        color: 'var(--color-text-secondary)'
      }}>
        <p style={{ 
          margin: 0, 
          fontSize: '14px',
          fontWeight: 500,
          color: 'var(--color-negative-color)'
        }}>
          Erro ao carregar dados: {serviceError}
        </p>
      </div>
    );
  }

  return (
    <div id="content" style={{ height: '100%', minHeight: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Barra superior com título e filtros */}
      <div className="d-flex flex-row justify-content-between align-items-center" style={{ padding: '10px 20px', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
        <h1 style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, flex: '0 0 auto', marginBottom: 0 }}>Service Requests</h1>
        <ServiceFilters
          selectedYear={selectedYear}
          setSelectedYear={setSelectedYear}
          selectedMonth={selectedMonth}
          setSelectedMonth={setSelectedMonth}
          selectedContractor={selectedContractor}
          setSelectedContractor={setSelectedContractor}
          selectedJobsite={selectedJobsite}
          setSelectedJobsite={setSelectedJobsite}
          selectedCity={selectedCity}
          setSelectedCity={setSelectedCity}
          selectedIssue={selectedIssue}
          setSelectedIssue={setSelectedIssue}
          selectedWarranty={selectedWarranty}
          setSelectedWarranty={setSelectedWarranty}
          years={years}
          months={months}
          contractors={contractors}
          jobsites={jobsites}
          cities={cities}
          issues={issues}
        />
      </div>

      {/* Conteúdo principal: gráfico/tabela à esquerda, partições à direita */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'row', width: '100%', minHeight: 0, minWidth: 0 }}>
        <div style={{ background:'var(--color-background-primary)', width: '70%', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--color-border-divider)' }}>
          <div style={{ flex: '0 0 auto' }}>
            {/* Gráfico */}
            <ServiceChart
              filteredData={filteredData}
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
              selectedStatus={selectedIssue}
            />
            {/* Métricas */}
            <ServiceMetrics 
              allData={filteredData} 
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
            />
          </div>
          {/* Carrossel de Cards */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <ServiceCarousel filteredData={filteredData} />
          </div>
        </div>
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
              
              setModalData({
                id: '',
                usuario_id: usuariosParaBuscarDados[0],
                tela_id: telaId,
                mes: mesRef,
                ano: anoRef,
                criado_em: new Date().toISOString(),
                positivos: [],
                negativos: [],
              });
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
            onEdit={async (mes, ano) => {
              setModalType('oportunidade');
              const mesRef = (typeof mes === 'string' || typeof mes === 'number') ? mes : selectedMonth;
              const anoRef = (typeof ano === 'string' || typeof ano === 'number') ? ano : selectedYear;
              if (!mesRef || !anoRef) {
                setModalData(null);
                setModalOpen(true);
                return;
              }
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
              setModalOpen(true);
            }}
            onView={async (oportunidade) => {
              setModalType('oportunidade');
              setModalData(oportunidade);
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

      {/* Modais */}
      {modalOpen && modalType === 'destaque' && (
        <DestaqueModal
          show={modalOpen}
          onClose={() => setModalOpen(false)}
          data={modalType === 'destaque' ? modalData as Destaque : null}
          onSaved={handleSave}
        />
      )}

      {modalOpen && modalType === 'oportunidade' && (
        <OportunidadeModal
          show={modalOpen}
          onClose={() => setModalOpen(false)}
          data={modalType === 'oportunidade' ? modalData as Oportunidade : null}
          onSaved={handleSave}
          anoSelecionado={selectedYear?.toString()}
          mesSelecionado={selectedMonth?.toString()}
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
    </div>
  );
}
