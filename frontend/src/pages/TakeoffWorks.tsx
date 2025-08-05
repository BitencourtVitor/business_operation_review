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
import type { TakeoffRow } from '../types/takeoff';
import { useTakeoffData } from '../hooks/useTakeoffData';
import TakeoffFilters from '../components/common/TakeoffWorks/TakeoffFilters';
import TakeoffMetrics from '../components/common/TakeoffWorks/TakeoffMetrics';
import TakeoffCarousel from '../components/common/TakeoffWorks/TakeoffCarousel';
import { TakeoffChart } from '../components/common/TakeoffWorks/TakeoffChart';
import DestaquesPartition from '../components/partitions/DestaquesPartition';
import OportunidadesPartition from '../components/partitions/OportunidadesPartition';
import PlanoAcaoPartition from '../components/partitions/PlanoAcaoPartition';

dayjs.extend(isBetween);

// Interfaces para os dados das partições (iguais ao PermitControl)
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

interface TakeoffWorksProps {
  telaId: string;
  usuarioId: string;
  role: string;
  isResponsavelPelaTela: boolean;
}

export default function TakeoffWorks({ telaId: telaIdFromProps, usuarioId, role, isResponsavelPelaTela }: TakeoffWorksProps) {
  const [telaId, setTelaId] = useState<string>(telaIdFromProps);
  const [usuarioResponsavelId, setUsuarioResponsavelId] = useState<string>('');
  const [usuariosParaBuscar, setUsuariosParaBuscar] = useState<string[]>([]);

  // Estados para filtros
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedSituation, setSelectedSituation] = useState<string[]>([]);
  const [years, setYears] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);

  // Estados para dados
  const [takeoffData, setTakeoffData] = useState<TakeoffRow[]>([]);

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
      const { data: usuariosTelas } = await supabase
        .from('usuarios_telas')
        .select('usuario_id')
        .eq('tela_id', telaId);
      if (usuariosTelas && usuariosTelas.length > 0) {
        const responsavelId = usuariosTelas[0].usuario_id;
        setUsuarioResponsavelId(responsavelId);
        if (role === 'dev' || role === 'manager' || role === 'gestor') {
          setPodeEditar(true);
        } else if (isResponsavelPelaTela) {
          setPodeEditar(true);
        } else {
          setPodeEditar(false);
        }
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

  // Buscar dados de takeoff works
  const { data: takeoffDataFromHook, error: takeoffError } = useTakeoffData();
  useEffect(() => {
    if (takeoffDataFromHook) {
      setTakeoffData(takeoffDataFromHook);
    }
  }, [takeoffDataFromHook]);

  // Função para obter a data relevante baseada na situação
  // Para Takeoff, a data relevante é a data de solicitação
  const getRelevantDate = (row: TakeoffRow): string => {
    return row.data_solicitacao;
  };

  // Carregar todos os dados para filtros e cachear
  useEffect(() => {
    const fetchAll = async () => {
      let all: TakeoffRow[] = [];
      const cache = sessionStorage.getItem('takeoff_works');
      if (cache) {
        try {
          all = JSON.parse(cache);
        } catch {
          all = [];
        }
      } else {
        const { data: dbData, error: err } = await supabase.from('takeoff_works').select('*');
        if (!err && dbData) {
          all = dbData as TakeoffRow[];
          sessionStorage.setItem('takeoff_works', JSON.stringify(all));
        }
      }
      setTakeoffData(all);
      const anos = [...new Set(
        all
          .map((d: TakeoffRow) => {
            const relevantDate = getRelevantDate(d);
            return relevantDate && typeof relevantDate === 'string' ? relevantDate.split('-')[0] : undefined;
          })
          .filter((v): v is string => !!v)
      )].sort((a, b) => Number(b) - Number(a));
      setYears(anos);
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
    const meses = [
      ...new Set(
        takeoffData
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
    const mesesComAtual = addCurrentMonthIfMissing(meses, selectedYear);
    setMonths(mesesComAtual);
    if (selectedMonth && !mesesComAtual.includes(selectedMonth)) setSelectedMonth('');
  }, [selectedYear, takeoffData]);

  // Função para determinar o status baseado nas datas
  const getProjectStatus = (row: TakeoffRow): string => {
    const hasSolicitacao = !!row.data_solicitacao;
    const hasInicio = !!row.data_inicio;
    const hasEntrega = !!row.entrega_real;

    if (hasSolicitacao && hasInicio && hasEntrega) {
      return 'Completed';
    } else if (hasSolicitacao && hasInicio && !hasEntrega) {
      return 'In Progress';
    } else if (hasSolicitacao && !hasInicio && !hasEntrega) {
      return 'Not Started';
    } else {
      return 'Pending';
    }
  };

  // Filtrar dados
  const filteredData = useMemo(() => {
    let filtered = takeoffData;
    
    // Filtro por ano
    if (selectedYear) {
      filtered = filtered.filter(d => {
        const relevantDate = getRelevantDate(d);
        return relevantDate && typeof relevantDate === 'string' && relevantDate.split('-')[0] === selectedYear;
      });
    }
    
    // Filtro por mês
    if (selectedMonth) {
      filtered = filtered.filter(d => {
        const relevantDate = getRelevantDate(d);
        return relevantDate && typeof relevantDate === 'string' && relevantDate.split('-')[1] === selectedMonth;
      });
    }
    
    // Filtro por situação/status
    if (selectedSituation.length > 0) {
      filtered = filtered.filter(d => {
        const status = getProjectStatus(d);
        return selectedSituation.includes(status);
      });
    }
    
    return filtered;
  }, [takeoffData, selectedYear, selectedMonth, selectedSituation]);

  // Funções para modais
  const handleSave = async () => {
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

  if (takeoffError) {
    return (
      <div className="alert alert-danger" role="alert">
        Erro ao carregar dados: {takeoffError}
      </div>
    );
  }

  return (
    <div id="content" style={{ height: '100%', minHeight: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div className="d-flex flex-row justify-content-between align-items-center" style={{ padding: '10px 20px', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
        <h1 style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, flex: '0 0 auto', marginBottom: 0 }}>Takeoff Works</h1>
        <TakeoffFilters
          selectedYear={selectedYear}
          setSelectedYear={setSelectedYear}
          selectedMonth={selectedMonth}
          setSelectedMonth={setSelectedMonth}
          selectedSituation={selectedSituation}
          setSelectedSituation={setSelectedSituation}
          years={years}
          months={months}
        />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'row', width: '100%', minHeight: 0, minWidth: 0 }}>
        <div style={{ background:'var(--color-background-primary)', width: '70%', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--color-border-divider)' }}>
          <div>
            <TakeoffChart
              filteredData={filteredData}
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
            />
            <TakeoffMetrics allData={filteredData} />
          </div>
          <TakeoffCarousel filteredData={filteredData} />
        </div>
        <div id="individual_data" style={{ width: '30%', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <DestaquesPartition
            usuarioResponsavelId={usuarioResponsavelId}
            usuariosParaBuscar={usuariosParaBuscar}
            telaId={telaId}
            selectedYear={selectedYear}
            selectedMonth={selectedMonth}
            isAdmin={podeEditar}
            onEdit={async (mes, ano) => {
              setModalType('destaque');
              const mesRef = (typeof mes === 'string' || typeof mes === 'number') ? mes : selectedMonth;
              const anoRef = (typeof ano === 'string' || typeof ano === 'number') ? ano : selectedYear;
              if (!mesRef || !anoRef) {
                setModalData(null);
                setModalOpen(true);
                return;
              }
              const { data: destaques } = await supabase
                .from('destaques')
                .select('*')
                .eq('usuario_id', usuarioResponsavelId)
                .eq('tela_id', telaId)
                .eq('mes', Number(mesRef))
                .eq('ano', Number(anoRef));
              console.log('Destaques Takeoff:', destaques, usuarioResponsavelId, mesRef, anoRef);
              if (destaques && destaques.length > 0) {
                const destaque = destaques[0];
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
              const mesRef = (typeof mes === 'string' || typeof mes === 'number') ? mes : selectedMonth;
              const anoRef = (typeof ano === 'string' || typeof ano === 'number') ? ano : selectedYear;
              if (!mesRef || !anoRef) {
                setModalData(null);
                setModalOpen(true);
                return;
              }
              const { data: oportunidades } = await supabase
                .from('oportunidades')
                .select('*')
                .eq('usuario_id', usuarioResponsavelId)
                .eq('tela_id', telaId)
                .eq('mes', Number(mesRef))
                .eq('ano', Number(anoRef));
              console.log('Oportunidades Takeoff:', oportunidades, usuarioResponsavelId, mesRef, anoRef);
              if (oportunidades && oportunidades.length > 0) {
                const oportunidade = oportunidades[0];
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
              const { data: todasOportunidades } = await supabase
                .from('oportunidades')
                .select('*')
                .eq('usuario_id', usuarioResponsavelId)
                .eq('tela_id', telaId)
                .eq('mes', Number(oportunidade.mes))
                .eq('ano', Number(oportunidade.ano));
              console.log('Todas Oportunidades Takeoff:', todasOportunidades, usuarioResponsavelId, oportunidade.mes, oportunidade.ano);
              if (todasOportunidades && todasOportunidades.length > 0) {
                const { data: todosDesafios } = await supabase.from('desafios').select('*');
                const { data: todasMelhorias } = await supabase.from('melhorias').select('*');
                const oportunidadesCompletas = todasOportunidades.map(op => ({
                  ...op,
                  mes: op.mes.toString(),
                  ano: op.ano.toString(),
                  desafios: (todosDesafios || []).filter((d: { oportunidade_id: string; texto: string }) => d.oportunidade_id === op.id).map((d: { texto: string }) => d.texto),
                  melhorias: (todasMelhorias || []).filter((m: { oportunidade_id: string; texto: string }) => m.oportunidade_id === op.id).map((m: { texto: string }) => m.texto),
                }));
                const currentIndex = oportunidadesCompletas.findIndex(op => op.id === oportunidade.id);
                setModalData({
                  ...oportunidade,
                  oportunidadesList: oportunidadesCompletas,
                  initialIndex: currentIndex >= 0 ? currentIndex : 0
                } as Oportunidade & { oportunidadesList?: Oportunidade[]; initialIndex?: number });
              } else {
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
