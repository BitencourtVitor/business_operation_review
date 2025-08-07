import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { addCurrentMonthIfMissing } from '../utils/dataUtils';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import DestaqueModal from '../components/modals/DestaqueModal';
import OportunidadeModal from '../components/modals/OportunidadeModal';
import PlanoAcaoModal from '../components/modals/PlanoAcaoModal';
import DestaqueViewModal from '../components/modals/DestaqueViewModal';
import OportunidadeViewModal from '../components/modals/OportunidadeViewModal';
import PlanoAcaoViewModal from '../components/modals/PlanoAcaoViewModal';
import type { ProjectMonitoringHvacRow } from '../types/projectMonitoringHvac';
import { useProjectMonitoringHvacData, type ProjectMonitoringHvacData } from '../hooks/useProjectMonitoringHvacData';
import ProjectMonitoringFilters from '../components/common/ProjectMonitoring/ProjectMonitoringFilters';
import ProjectMonitoringMetrics from '../components/common/ProjectMonitoring/ProjectMonitoringMetrics';
import ProjectMonitoringCarousel from '../components/common/ProjectMonitoring/ProjectMonitoringCarousel';
import { ProjectMonitoringChart } from '../components/common/ProjectMonitoring/ProjectMonitoringChart';
import DestaquesPartition from '../components/partitions/DestaquesPartition';
import OportunidadesPartition from '../components/partitions/OportunidadesPartition';
import PlanoAcaoPartition from '../components/partitions/PlanoAcaoPartition';
import sublogoHvac from '../assets/submenu/sublogo_hvac.png';
import sublogoFraming from '../assets/submenu/sublogo_framing.png';
import sublogoPcg from '../assets/submenu/sublogo_pcg.png';

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

interface ProjectMonitoringProps {
  telaId: string;
  usuarioId: string;
  role: string;
  isResponsavelPelaTela: boolean;
  selectedType?: string;
}

export default function ProjectMonitoring({ telaId: telaIdFromProps, usuarioId, role, isResponsavelPelaTela, selectedType = 'HVAC' }: ProjectMonitoringProps) {
  const [telaId, setTelaId] = useState<string>(telaIdFromProps);
  const [usuarioResponsavelId, setUsuarioResponsavelId] = useState<string>('');
  const [usuariosParaBuscar, setUsuariosParaBuscar] = useState<string[]>([]);

  // Mapeamento de ícones das empresas
  const empresaIcones: { [empresa: string]: string } = {
    'HVAC': sublogoHvac,
    'Framing': sublogoFraming,
    'PCG': sublogoPcg,
  };

  // Estados para filtros
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedProject, setSelectedProject] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string[]>(['completed', 'in_progress', 'no_started']);
  const [selectedTeam, setSelectedTeam] = useState<string[]>([]);

  // Estados para opções de filtro
  const [years, setYears] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [teams, setTeams] = useState<string[]>([]);

  // Estados para dados
  const [projectMonitoringData, setProjectMonitoringData] = useState<ProjectMonitoringHvacData[]>([]);

  // Estados para modais
  const [modalOpen, setModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'destaque' | 'oportunidade' | 'plano'>('destaque');
  const [modalData, setModalData] = useState<Destaque | Oportunidade | PlanoAcao | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Estado para controle de edição
  const [podeEditar, setPodeEditar] = useState(false);

  // Atualizar telaId quando props mudarem
  useEffect(() => {
    setTelaId(telaIdFromProps);
  }, [telaIdFromProps]);

  // Buscar usuário responsável pela tela e definir permissões
  useEffect(() => {
    const fetchResponsavelData = async () => {
      if (!telaId) return;

      // Buscar usuário responsável pela tela
      const { data: usuariosTelas, error: errorUsuariosTelas } = await supabase
        .from('usuarios_telas')
        .select('usuario_id')
        .eq('tela_id', telaId);

      if (errorUsuariosTelas) {
        console.error('❌ Erro ao buscar usuário responsável:', errorUsuariosTelas);
      }

      if (usuariosTelas && usuariosTelas.length > 0) {
        const responsavelId = usuariosTelas[0].usuario_id;
        setUsuarioResponsavelId(responsavelId);

        // Definir permissões de edição
        if (role === 'dev' || role === 'manager' || role === 'gestor') {
          setPodeEditar(true);
        } else if (isResponsavelPelaTela) {
          setPodeEditar(true);
        } else {
          setPodeEditar(false);
        }

        // Definir quais usuários buscar dados (responsável + dev/manager/gestor se aplicável)
        const usuariosParaBuscarArray = [responsavelId];
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

  // Buscar dados de project monitoring
  const { data: projectMonitoringDataFromHook, error: projectMonitoringError } = useProjectMonitoringHvacData();

  useEffect(() => {
    if (projectMonitoringDataFromHook) {
      setProjectMonitoringData(projectMonitoringDataFromHook);
    }
  }, [projectMonitoringDataFromHook]);

  // Função para obter a data relevante baseada no percentual de conclusão
  const getRelevantDate = (row: ProjectMonitoringHvacData): string | null => {
    if (!row.start_date || !row.finish_date) return null;
    
    // Calcular status baseado nos stages (mesma lógica usada em outros lugares)
    const stages = [
      row.s1_rough,
      row.s2_machines, 
      row.s3_condenser,
      row.s4_finish
    ];

    // Se não há stages definidos, considerar como não iniciado
    if (stages.every(stage => !stage)) {
      return row.start_date; // Data de início para projetos não iniciados
    }

    const completedCount = stages.filter(stage => stage === 'Completed').length;
    const noStartedCount = stages.filter(stage => stage === 'Not Started' || stage === 'No started').length;

    // Se todas as 4 colunas são completed, o projeto está completo
    if (completedCount === 4) {
      return row.finish_date; // Data de fim para projetos concluídos
    } else if (noStartedCount === 4) {
      // Se todas as 4 colunas são no started, o projeto não foi iniciado
      return row.start_date; // Data de início para projetos não iniciados
    } else {
      // Qualquer outra combinação = projeto em progresso
      return row.start_date; // Data de início para projetos em andamento
    }
  };

  // Carregar todos os dados para filtros e cachear
  useEffect(() => {
    const fetchAll = async () => {
      let all: ProjectMonitoringHvacRow[] = [];
      const cache = sessionStorage.getItem('project_monitoring_hvac');
      if (cache) {
        try {
          all = JSON.parse(cache);
        } catch {
          all = [];
        }
      } else {
        const { data: dbData, error: err } = await supabase.from('project_monitoring_hvac').select('*');
        if (!err && dbData) {
          all = dbData as ProjectMonitoringHvacRow[];
          sessionStorage.setItem('project_monitoring_hvac', JSON.stringify(all));
        }
      }
      setProjectMonitoringData(all);
      
      // Filtros globais
      const projectsList = [...new Set(all.map((d: ProjectMonitoringHvacData) => d.job_site).filter((v): v is string => !!v))];
      const teamsList = [...new Set(all.map((d: ProjectMonitoringHvacData) => d.team).filter((v): v is string => !!v))];
      
      setProjects(projectsList);
      setTeams(teamsList);
      
      // Selecionar todas as opções automaticamente
      setSelectedProject(projectsList);
      setSelectedTeam(teamsList);
      
      // Anos presentes nos dados (usando data relevante)
      const anos = [...new Set(
        all
          .map((d: ProjectMonitoringHvacRow) => {
            const relevantDate = getRelevantDate(d);
            return relevantDate && typeof relevantDate === 'string' ? relevantDate.split('-')[0] : undefined;
          })
          .filter((v): v is string => !!v)
      )].sort((a, b) => Number(b) - Number(a));
      setYears(anos);
      
      // Selecionar ano atual se existir, senão o mais recente
      const anoAtual = dayjs().format('YYYY');
      if (anos.includes(anoAtual)) setSelectedYear(anoAtual);
      else if (anos.length > 0 && typeof anos[0] === 'string') setSelectedYear(anos[0]);
    };

    fetchAll();
  }, []);

  // Atualizar meses disponíveis conforme ano selecionado
  useEffect(() => {
    if (!selectedYear) {
      setMonths([]);
      if (selectedMonth) setSelectedMonth('');
      return;
    }
    
    // Pega todos os meses únicos do ano selecionado usando data relevante
    const meses = [
      ...new Set(
        projectMonitoringData
          .filter(d => {
            const relevantDate = getRelevantDate(d);
            return relevantDate && 
                   typeof relevantDate === 'string' && 
                   relevantDate.split('-')[0] === selectedYear;
          })
          .map(d => {
            const relevantDate = getRelevantDate(d);
            return relevantDate && typeof relevantDate === 'string' ? relevantDate.split('-')[1] : undefined;
          })
          .filter((v): v is string => !!v)
      ),
    ].sort((a, b) => Number(a) - Number(b));
    
    // Adicionar mês atual se não estiver presente
    const mesesComAtual = addCurrentMonthIfMissing(meses, selectedYear);
    setMonths(mesesComAtual);
    
    // Se o mês selecionado não existir mais, resetar
    if (selectedMonth && !mesesComAtual.includes(selectedMonth)) setSelectedMonth('');
  }, [selectedYear, projectMonitoringData]);

  // Filtrar dados
  const filteredData = useMemo(() => {
    let filtered = projectMonitoringData;
    
    if (selectedYear) {
      filtered = filtered.filter(d => {
        const relevantDate = getRelevantDate(d);
        // Se não há data relevante (projetos no started), incluir apenas se não há filtros de data
        if (!relevantDate) {
          return !selectedMonth; // Incluir projetos sem data apenas se não há filtro de mês
        }
        return relevantDate && typeof relevantDate === 'string' && relevantDate.split('-')[0] === selectedYear;
      });
    }
    
    if (selectedMonth) {
      filtered = filtered.filter(d => {
        const relevantDate = getRelevantDate(d);
        // Se não há data relevante (projetos no started), excluir da filtragem por mês
        if (!relevantDate) {
          return false;
        }
        return relevantDate && typeof relevantDate === 'string' && relevantDate.split('-')[1] === selectedMonth;
      });
    }
    
    if (selectedProject.length > 0) filtered = filtered.filter(d => d.job_site && selectedProject.includes(d.job_site));
    if (selectedStatus.length > 0) filtered = filtered.filter(d => {
      // Calcular status baseado nos stages
      const stages = [
        d.s1_rough,
        d.s2_machines, 
        d.s3_condenser,
        d.s4_finish
      ];

      // Se não há stages definidos, considerar como no_started
      if (stages.every(stage => !stage)) {
        return selectedStatus.includes('no_started');
      }

      const completedCount = stages.filter(stage => stage === 'Completed').length;
      const noStartedCount = stages.filter(stage => stage === 'Not Started' || stage === 'No started').length;

      let projectStatus: string;
      
      // Se todas as 4 colunas são completed, o projeto está completo
      if (completedCount === 4) {
        projectStatus = 'completed';
      } else if (noStartedCount === 4) {
        // Se todas as 4 colunas são no started, o projeto não foi iniciado
        projectStatus = 'no_started';
      } else {
        // Qualquer outra combinação (anômala) = projeto em progresso
        projectStatus = 'in_progress';
      }

      return selectedStatus.includes(projectStatus);
    });
    if (selectedTeam.length > 0) filtered = filtered.filter(d => d.team && selectedTeam.includes(d.team));
    
    return filtered;
  }, [projectMonitoringData, selectedYear, selectedMonth, selectedProject, selectedStatus, selectedTeam]);

  // Funções para modais
  const handleSave = async () => {
    // Recarregar dados das partições após salvar
    setRefreshTrigger(prevTrigger => prevTrigger + 1);
  };

  if (!telaId) {
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
          Carregando usuário responsável...
        </p>
        <p style={{ 
          margin: '8px 0 0 0', 
          fontSize: '12px',
          color: 'var(--color-text-secondary)'
        }}>
          telaId: {telaId || 'não definido'}, usuarioResponsavelId: {usuarioResponsavelId || 'não definido'}
        </p>
      </div>
    );
  }



  if (projectMonitoringError) {
    return (
      <div className="alert alert-danger" role="alert">
        Erro ao carregar dados: {projectMonitoringError}
      </div>
    );
  }

  return (
    <div id="content" style={{ height: '100%', minHeight: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Barra superior com título e filtros */}
      <div className="d-flex flex-row justify-content-between align-items-center" style={{ padding: '10px 20px', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
        <h1 style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, flex: '0 0 auto', marginBottom: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
          <img 
            src={empresaIcones[selectedType] || ''} 
            alt={selectedType} 
            style={{ 
              width: 24, 
              height: 24, 
              objectFit: 'contain'
            }}
          />
          <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
            {selectedType}
          </span>
          <span style={{ color: 'var(--color-text-secondary)', fontWeight: 400 }}>
            Project Monitoring
          </span>
        </h1>
        <ProjectMonitoringFilters
          selectedYear={selectedYear}
          setSelectedYear={setSelectedYear}
          selectedMonth={selectedMonth}
          setSelectedMonth={setSelectedMonth}
          selectedProject={selectedProject}
          setSelectedProject={setSelectedProject}
          selectedTeam={selectedTeam}
          setSelectedTeam={setSelectedTeam}
          selectedStatus={selectedStatus}
          setSelectedStatus={setSelectedStatus}
          years={years}
          months={months}
          projects={projects}
          teams={teams}
          projectMonitoringData={projectMonitoringData}
          dropdownWidth={180}
          cityJobsiteDropdownWidth={300}
          teamDropdownWidth={150}
        />
      </div>

      {/* Conteúdo principal: gráfico/tabela à esquerda, partições à direita */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'row', width: '100%', minHeight: 0, minWidth: 0 }}>
        <div style={{ background:'var(--color-background-primary)', width: '70%', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--color-border-divider)' }}>
          <div>
            {/* Gráfico */}
            <ProjectMonitoringChart
              filteredData={filteredData}
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
            />
            {/* Métricas */}
            <ProjectMonitoringMetrics allData={filteredData} />
          </div>
          {/* Carrossel de Cards */}
          <ProjectMonitoringCarousel filteredData={filteredData} selectedStatus={selectedStatus} />
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
            onEdit={async (mes, ano) => {
              setModalType('destaque');
              // Se mes/ano não vierem do card, usa o filtro
              const mesRef = (typeof mes === 'string' || typeof mes === 'number') ? mes : selectedMonth;
              const anoRef = (typeof ano === 'string' || typeof ano === 'number') ? ano : selectedYear;
              if (!mesRef || !anoRef) {
                setModalData(null);
                setModalOpen(true);
                return;
              }
              // Buscar dados existentes para o período
              const { data: destaques } = await supabase
                .from('destaques')
                .select('*')
                .eq('usuario_id', usuarioResponsavelId)
                .eq('mes', Number(mesRef))
                .eq('ano', Number(anoRef));
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
            onView={async (oportunidade) => {
              setModalType('oportunidade');
              
              // Buscar todas as oportunidades do período para permitir navegação
              const { data: todasOportunidades } = await supabase
                .from('oportunidades')
                .select('*')
                .eq('usuario_id', usuarioResponsavelId)
                .eq('mes', Number(oportunidade.mes))
                .eq('ano', Number(oportunidade.ano));
              
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
