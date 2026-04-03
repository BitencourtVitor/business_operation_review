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
import type { PermitRow } from '../types/permit';
import { usePermitData } from '../hooks/usePermitData';
import PermitFilters from '../components/common/PermitControl/PermitFilters';
import PermitMetrics from '../components/common/PermitControl/PermitMetrics';
import PermitCarousel from '../components/common/PermitControl/PermitCarousel';
import { PermitChart } from '../components/common/PermitControl/PermitChart';
import DestaquesPartition from '../components/partitions/DestaquesPartition';
import OportunidadesPartition from '../components/partitions/OportunidadesPartition';
import PlanoAcaoPartition from '../components/partitions/PlanoAcaoPartition';

import type { PlanoAcao } from '../types/planoAcao';

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

interface PermitControlProps {
  telaId: string;
  usuarioId: string;
  role: string;
  isResponsavelPelaTela: boolean;
}

export default function PermitControl({ telaId: telaIdFromProps, usuarioId, role, isResponsavelPelaTela }: PermitControlProps) {
  const [telaId, setTelaId] = useState<string>(telaIdFromProps);
  const [usuarioResponsavelId, setUsuarioResponsavelId] = useState<string>('');
  const [usuariosParaBuscar, setUsuariosParaBuscar] = useState<string[]>([]);

  // Log para debug
  

  // Estados para filtros
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string[]>([]);
  const [selectedSituation, setSelectedSituation] = useState<string[]>([]);
  const [selectedJobsite, setSelectedJobsite] = useState<string[]>([]);

  // Estados para opções de filtro
  const [years, setYears] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [jobsites, setJobsites] = useState<string[]>([]);

  // Estados para dados
  const [permitData, setPermitData] = useState<PermitRow[]>([]);

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

  // Buscar dados de permit control
  const { data: permitDataFromHook, error: permitError } = usePermitData();

  // Aplicar os três efeitos solicitados aos dados carregados
  useEffect(() => {
    if (permitDataFromHook) {
      // Efeito 1: Unificar por Modelo, Jobsite e Lot Address (remover duplicatas)
      let processedData = permitDataFromHook.reduce((acc: PermitRow[], current) => {
        const existingIndex = acc.findIndex(item => 
          item.model === current.model && 
          item.jobsite === current.jobsite && 
          item.lot_address === current.lot_address
        );
        
        if (existingIndex === -1) {
          acc.push(current);
        }
        return acc;
      }, []);
      
      // Efeito 2: Adicionar um dia a todas as datas
      processedData = processedData.map(row => {
        const addOneDay = (dateStr: string) => {
          try {
            const date = new Date(dateStr);
            date.setDate(date.getDate() + 1);
            return date.toISOString().split('T')[0];
          } catch {
            return dateStr;
          }
        };
        
        return {
          ...row,
          solicitacao: addOneDay(row.solicitacao),
          aplicacao: addOneDay(row.aplicacao),
          emissao: addOneDay(row.emissao),
          vencimento: row.vencimento ? addOneDay(row.vencimento) : undefined
        };
      });
      
      // Efeito 3: Reorganizar formato das datas (primeiro mês, depois dia)
      processedData = processedData.map(row => {
        const reformatDate = (dateStr: string) => {
          try {
            const [year, month, day] = dateStr.split('-');
            if (year && month && day) {
              return `${year}-${month}-${day}`;
            }
            return dateStr;
          } catch {
            return dateStr;
          }
        };
        
        return {
          ...row,
          solicitacao: reformatDate(row.solicitacao),
          aplicacao: reformatDate(row.aplicacao),
          emissao: reformatDate(row.emissao),
          vencimento: row.vencimento ? reformatDate(row.vencimento) : undefined
        };
      });
      
      setPermitData(processedData);
    }
  }, [permitDataFromHook]);

  // Função para obter a data relevante baseada na situação
  const getRelevantDate = (row: PermitRow): string | null => {
    if (row.situacao === 'Not Applied') {
      return row.solicitacao;
    } else if (row.situacao === 'Applied') {
      return row.aplicacao;
    } else if (row.situacao === 'Issued') {
      return row.emissao;
    }
    return null;
  };

  // Carregar todos os dados para filtros e cachear
  useEffect(() => {
    const fetchAll = async () => {
      let all: PermitRow[] = [];
      const cache = sessionStorage.getItem('permit_control');
      if (cache) {
        try {
          all = JSON.parse(cache);
        } catch {
          all = [];
        }
      } else {
        const { data: dbData, error: err } = await supabase.from('permit_control').select('*');
        if (!err && dbData) {
          all = dbData as PermitRow[];
          sessionStorage.setItem('permit_control', JSON.stringify(all));
        }
      }
      setPermitData(all);
      
      // Filtros globais
      const modelsList = [...new Set(all.map((d: PermitRow) => typeof d.model === 'string' ? d.model : undefined).filter((v): v is string => !!v))];
      const jobsitesList = [...new Set(all.map((d: PermitRow) => typeof d.jobsite === 'string' ? d.jobsite : undefined).filter((v): v is string => !!v))];
      
      setModels(modelsList);
      setJobsites(jobsitesList);
      
      // Selecionar todas as opções automaticamente
      setSelectedModel(modelsList);
      setSelectedJobsite(jobsitesList);
      
      // Anos presentes nos dados (usando data relevante)
      const anos = [...new Set(
        all
          .map((d: PermitRow) => {
            const relevantDate = getRelevantDate(d);
            return relevantDate && typeof relevantDate === 'string' ? relevantDate.split('-')[0] : undefined;
          })
          .filter((v): v is string => !!v)
      )].sort((a, b) => Number(b) - Number(a));
      setYears(anos);
      
      // Selecionar ano atual se existir, senão o mais recente
      const anoAtual = dayjs().format('YYYY');
      if (anos.includes(anoAtual)) {
        setSelectedYear(anoAtual);
        // Selecionar mês atual automaticamente
        const mesAtual = dayjs().format('MM');
        setSelectedMonth(mesAtual);
      } else if (anos.length > 0 && typeof anos[0] === 'string') {
        setSelectedYear(anos[0]);
        // Selecionar primeiro mês disponível
        setSelectedMonth('01');
      }
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
        permitData
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
    
    // Se não há mês selecionado, selecionar o mês atual ou o primeiro disponível
    if (!selectedMonth && mesesComAtual.length > 0) {
      const mesAtual = dayjs().format('MM');
      if (mesesComAtual.includes(mesAtual)) {
        setSelectedMonth(mesAtual);
      } else {
        setSelectedMonth(mesesComAtual[0]);
      }
    }
  }, [selectedYear, permitData]);

  // Filtrar dados
  const filteredData = useMemo(() => {
    let filtered = permitData;
    
    if (selectedYear) {
      filtered = filtered.filter(d => {
        const relevantDate = getRelevantDate(d);
        return relevantDate && typeof relevantDate === 'string' && relevantDate.split('-')[0] === selectedYear;
      });
    }
    
    if (selectedMonth) {
      filtered = filtered.filter(d => {
        const relevantDate = getRelevantDate(d);
        return relevantDate && typeof relevantDate === 'string' && relevantDate.split('-')[1] === selectedMonth;
      });
    }
    
    if (selectedModel.length > 0) filtered = filtered.filter(d => selectedModel.includes(d.model));
    if (selectedSituation.length > 0) filtered = filtered.filter(d => selectedSituation.includes(d.situacao));
    if (selectedJobsite.length > 0) filtered = filtered.filter(d => selectedJobsite.includes(d.jobsite));
    
    return filtered;
  }, [permitData, selectedYear, selectedMonth, selectedModel, selectedSituation, selectedJobsite]);

  // Funções para modais
  const handleSave = async () => {
    // Recarregar dados das partições após salvar
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

  if (permitError) {
    return (
      <div className="alert alert-danger" role="alert">
        Erro ao carregar dados: {permitError}
      </div>
    );
  }

  return (
    <div id="content" style={{ height: '100%', minHeight: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Barra superior com título e filtros */}
      <div className="d-flex flex-row justify-content-between align-items-center" style={{ padding: '10px 20px', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
        <h1 style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, flex: '0 0 auto', marginBottom: 0 }}>Permit Control</h1>
        <PermitFilters
          selectedYear={selectedYear}
          setSelectedYear={setSelectedYear}
          selectedMonth={selectedMonth}
          setSelectedMonth={setSelectedMonth}
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          selectedSituation={selectedSituation}
          setSelectedSituation={setSelectedSituation}
          selectedJobsite={selectedJobsite}
          setSelectedJobsite={setSelectedJobsite}
          years={years}
          months={months}
          models={models}
          jobsites={jobsites}
        />
      </div>

      {/* Conteúdo principal: gráfico/tabela à esquerda, partições à direita */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'row', width: '100%', minHeight: 0, minWidth: 0 }}>
        <div style={{ background:'var(--color-background-primary)', width: '70%', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--color-border-divider)' }}>
          <div>
            {/* Gráfico */}
            <PermitChart
              filteredData={filteredData}
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
              selectedSituation={selectedSituation}
            />
            {/* Métricas */}
            <PermitMetrics allData={filteredData} />
          </div>
          {/* Carrossel de Cards */}
          <PermitCarousel filteredData={filteredData} selectedSituation={selectedSituation} />
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
            onEdit={async (mesRef, anoRef, idUsuario) => {
              setModalType('destaque');
              // Buscar destaques existentes usando o usuarioId específico
              const { data: destaques } = await supabase
                .from('destaques')
                .select('*')
                .eq('tela_id', telaId)
                .eq('mes', mesRef?.toString())
                .eq('ano', anoRef?.toString())
                .eq('usuario_id', idUsuario || usuarioId);
              
              if (destaques && destaques.length > 0) {
                setModalData(destaques[0]);
              } else {
                setModalData({
                  id: '',
                  usuario_id: idUsuario || usuarioId || '',
                  tela_id: telaId,
                  mes: mesRef?.toString() || '',
                  ano: anoRef?.toString() || '',
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
            selectedYear={Number(selectedYear)}
            selectedMonth={Number(selectedMonth)}
            isAdmin={podeEditar}
            usuarioLogadoId={usuarioId}
            onEdit={async (mesRef, anoRef) => {
              setModalType('oportunidade');
              
              const usuariosParaBuscarDados = usuarioId ? [usuarioId] : usuariosParaBuscar;
              
              if (!usuariosParaBuscarDados || usuariosParaBuscarDados.length === 0) {
                console.error('Nenhum usuário disponível para buscar dados');
                setModalData(null);
                setModalOpen(true);
                return;
              }
              
              // Buscar dados existentes usando o usuarioId específico
              
              const { data: oportunidades } = await supabase
                .from('oportunidades')
                .select('*')
                .eq('tela_id', telaId) // Adicionar filtro por tela_id
                .eq('mes', Number(mesRef))
                .eq('ano', Number(anoRef))
                .eq('usuario_id', usuariosParaBuscarDados[0]);
              
              
              
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
                // Para novos registros, usar o usuário LOGADO como criador
                setModalData({
                  id: '',
                  usuario_id: usuarioId || '', // Usuário logado será o criador
                  tela_id: telaId,
                  mes: mesRef.toString(),
                  ano: anoRef.toString(),
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
                .eq('usuario_id', oportunidade.usuario_id)
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
              } as PlanoAcao);
              setModalOpen(true);
            }}
                         onAdd={async () => {
               setModalType('plano');
               setModalData({
                 id: '',
                 usuario_id: usuarioId, // Usuário logado será o criador
                 tela_id: telaId,
                 titulo: '',
                 descricao: '',
                 criado_em: new Date().toISOString(),
                 data_inicio: '',
                 data_fim: '',
                 status: 'open',
                 acoes: [],
               } as PlanoAcao);
               setModalOpen(true);
             }}
            onView={async (plano) => {
              setModalType('plano');
              setModalData({
                ...plano,
                tela_id: telaId,
              } as PlanoAcao);
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
           usuarioId={usuarioId}
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
           usuarioId={usuarioId}
         />
       )}

             {modalOpen && modalType === 'plano' && (
         <PlanoAcaoModal
           show={modalOpen}
           onClose={() => setModalOpen(false)}
           data={modalType === 'plano' ? modalData as PlanoAcao : null}
           onSaved={handleSave}
           usuarioId={usuarioId}
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