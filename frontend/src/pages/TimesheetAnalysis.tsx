import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import DestaqueModal from '../components/modals/DestaqueModal';
import OportunidadeModal from '../components/modals/OportunidadeModal';
import PlanoAcaoModal from '../components/modals/PlanoAcaoModal';
import DestaqueViewModal from '../components/modals/DestaqueViewModal';
import OportunidadeViewModal from '../components/modals/OportunidadeViewModal';
import PlanoAcaoViewModal from '../components/modals/PlanoAcaoViewModal';
import type { TimesheetRow } from '../types/timesheet';
import { useTimesheetData } from '../hooks/useTimesheetData';
import TimesheetFilters from '../components/common/TimesheetAnalysis/TimesheetFilters';
import TimesheetMetrics from '../components/common/TimesheetAnalysis/TimesheetMetrics';
import TimesheetTable from '../components/common/TimesheetAnalysis/TimesheetTable';
import { TimesheetChart } from '../components/common/TimesheetAnalysis/TimesheetChart';
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

interface TimesheetAnalysisProps {
  telaId: string;
  usuarioId: string;
  role: string;
  isResponsavelPelaTela: boolean;
}

export default function TimesheetAnalysis({ telaId: telaIdFromProps, usuarioId, role, isResponsavelPelaTela }: TimesheetAnalysisProps) {
  const [telaId, setTelaId] = useState<string>(telaIdFromProps);
  const [usuarioResponsavelId, setUsuarioResponsavelId] = useState<string>('');
  const [usuariosParaBuscar, setUsuariosParaBuscar] = useState<string[]>([]);

  // Estados para filtros
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedTeam, setSelectedTeam] = useState<string[]>([]);
  const [selectedCorporation, setSelectedCorporation] = useState<string[]>([]);
  const [selectedErrors, setSelectedErrors] = useState<string[]>([]);

  // Estados para opções de filtro
  const [years, setYears] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [teams, setTeams] = useState<string[]>([]);
  const [corporations, setCorporations] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  // Estados para dados
  const [timesheetData, setTimesheetData] = useState<TimesheetRow[]>([]);

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
      const { data: usuariosTelas } = await supabase
        .from('usuarios_telas')
        .select('usuario_id')
        .eq('tela_id', telaId);

      if (usuariosTelas && usuariosTelas.length > 0) {
        const responsavelId = usuariosTelas[0].usuario_id;
        setUsuarioResponsavelId(responsavelId);

        // Definir permissões de edição
        if (role === 'dev') {
          setPodeEditar(true);
        } else if (isResponsavelPelaTela) {
          setPodeEditar(true);
        } else {
          setPodeEditar(false);
        }

        // Definir quais usuários buscar dados (responsável + dev se aplicável)
        const usuariosParaBuscarArray = [responsavelId];
        if (role === 'dev' && !usuariosParaBuscarArray.includes(usuarioId)) {
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

  // Buscar dados de timesheet
  const { data: timesheetDataFromHook, error: timesheetError } = useTimesheetData();

  useEffect(() => {
    if (timesheetDataFromHook) {
      setTimesheetData(timesheetDataFromHook);
    }
  }, [timesheetDataFromHook]);

  // Carregar todos os dados para filtros e cachear (seguindo estrutura do backup)
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
      setTimesheetData(all);
      
      // Filtros globais
      const corporationsList = [...new Set(all.map((d: TimesheetRow) => typeof d.corporation === 'string' ? d.corporation : undefined).filter((v): v is string => !!v))];
      const teamsList = [...new Set(all.map((d: TimesheetRow) => typeof d.team === 'string' ? d.team : undefined).filter((v): v is string => !!v))];
      const errorsList = [...new Set(all.map((d: TimesheetRow) => typeof d.error === 'string' ? d.error : undefined).filter((v): v is string => !!v))];
      
      setCorporations(corporationsList);
      setTeams(teamsList);
      setErrors(errorsList);
      
      // Selecionar todas as opções automaticamente
      setSelectedCorporation(corporationsList);
      setSelectedTeam(teamsList);
      setSelectedErrors(errorsList);
      
      // Anos presentes nos dados
      const anos = [...new Set(all.map((d: TimesheetRow) => (typeof d.date === 'string' && d.date.split('-')[0]) || undefined).filter((v): v is string => !!v))].sort((a, b) => Number(b) - Number(a));
      setYears(anos);
      
      // Selecionar 2025 como padrão, senão ano atual, senão o mais recente
      const anoPadrao = '2025';
      const anoAtual = dayjs().format('YYYY');
      if (anos.includes(anoPadrao)) setSelectedYear(anoPadrao);
      else if (anos.includes(anoAtual)) setSelectedYear(anoAtual);
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
    // Pega todos os meses únicos do ano selecionado
    const meses = [
      ...new Set(
        timesheetData
          .filter(
            d =>
              d.date &&
              typeof d.date === 'string' &&
              d.date.startsWith(selectedYear + '-')
          )
          .map(d => d.date.split('-')[1])
          .filter((v): v is string => !!v)
      ),
    ].sort((a, b) => Number(a) - Number(b));
    setMonths(meses);
    // Se o mês selecionado não existir mais, resetar
    if (selectedMonth && !meses.includes(selectedMonth)) setSelectedMonth('');
  }, [selectedYear, selectedMonth, timesheetData]);

  // Filtrar dados
  const filteredData = useMemo(() => {
    let filtered = timesheetData;
    if (selectedYear) filtered = filtered.filter(d => d.date && typeof d.date === 'string' && d.date.startsWith(selectedYear + '-'));
    if (selectedMonth) filtered = filtered.filter(d => d.date && typeof d.date === 'string' && d.date.split('-')[1] === selectedMonth);
    if (selectedCorporation.length > 0) filtered = filtered.filter(d => selectedCorporation.includes(d.corporation));
    if (selectedTeam.length > 0) filtered = filtered.filter(d => selectedTeam.includes(d.team));
    if (selectedErrors.length > 0) filtered = filtered.filter(d => selectedErrors.includes(d.error));
    return filtered;
  }, [timesheetData, selectedYear, selectedMonth, selectedCorporation, selectedTeam, selectedErrors]);

  // Funções para modais
  const handleSave = async () => {
    // Recarregar dados das partições após salvar
    // As partições carregam seus próprios dados, então não precisamos fazer nada aqui
    setRefreshTrigger(prevTrigger => prevTrigger + 1);
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

  if (timesheetError) {
    return (
      <div className="alert alert-danger" role="alert">
        Erro ao carregar dados: {timesheetError}
      </div>
    );
  }

  return (
    <div id="content" style={{ height: '100%', minHeight: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Barra superior com título e filtros */}
      <div className="d-flex flex-row justify-content-between align-items-center" style={{ padding: '10px 20px', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
        <h1 style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, flex: '0 0 auto', marginBottom: 0 }}>Timesheet Analysis</h1>
        <TimesheetFilters
          selectedYear={selectedYear}
          setSelectedYear={setSelectedYear}
          selectedMonth={selectedMonth}
          setSelectedMonth={setSelectedMonth}
          selectedCorporation={selectedCorporation}
          setSelectedCorporation={setSelectedCorporation}
          selectedTeam={selectedTeam}
          setSelectedTeam={setSelectedTeam}
          selectedErrors={selectedErrors}
          setSelectedErrors={setSelectedErrors}
          years={years}
          months={months}
          corporations={corporations}
          teams={teams}
          errors={errors}
        />
      </div>

      {/* Conteúdo principal: gráfico/tabela à esquerda, partições à direita */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'row', width: '100%', minHeight: 0, minWidth: 0 }}>
        <div style={{ background:'var(--color-background-primary)', width: '70%', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--color-border-divider)' }}>
          <div>
            {/* Gráfico */}
            <TimesheetChart
              filteredData={filteredData}
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
            />
            {/* Métricas */}
            <TimesheetMetrics filteredData={filteredData} />
          </div>
          {/* Tabela */}
          <TimesheetTable filteredData={filteredData} years={years} />
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
                .eq('tela_id', telaId)
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
            onView={async (oportunidade) => {
              setModalType('oportunidade');
              
              // Buscar todas as oportunidades do período para permitir navegação
              const { data: todasOportunidades } = await supabase
                .from('oportunidades')
                .select('*')
                .eq('usuario_id', usuarioResponsavelId)
                .eq('tela_id', telaId)
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
                acoes: acoes || [],
              });
              setModalOpen(true);
            }}
            onAdd={async () => {
              setModalType('plano');
              setModalData({
                id: '',
                usuario_id: usuarioResponsavelId,
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
              setModalData(plano);
              setViewModalOpen(true);
            }}
            refreshTrigger={refreshTrigger}
          />
        </div>
      </div>

      {/* Modais */}
      {modalOpen && modalType === 'destaque' && modalData && (
        <DestaqueModal
          key={`destaque-modal-${modalData.id || 'new'}`}
          show={modalOpen}
          onClose={() => setModalOpen(false)}
          data={modalData as Destaque}
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