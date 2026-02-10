import { useState, useEffect, useMemo } from 'react';
import { useOFIData } from '../hooks/useOFIData';
import OFIFilters from '../components/common/OFI/OFIFilters';
import OFIMetrics from '../components/common/OFI/OFIMetrics';
import OFICharts from '../components/common/OFI/OFICharts';
import OFITable from '../components/common/OFI/OFITable';
import 'bootstrap-icons/font/bootstrap-icons.css';

export default function OperationalForecastIndex() {
  const { data: allData, loading, error } = useOFIData();

  // Estados para filtros
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedJobSite, setSelectedJobSite] = useState<string[]>([]);

  // Opções para os filtros
  const years = useMemo(() => {
    return [...new Set(allData.map(d => d.reference_year.toString()))].sort((a, b) => b.localeCompare(a));
  }, [allData]);

  const months = useMemo(() => {
    return [...new Set(allData.map(d => d.reference_month.toString()))].sort((a, b) => Number(a) - Number(b));
  }, [allData]);

  const jobSites = useMemo(() => {
    // Retornar um array de objetos { label, value } para o dropdown
    const uniqueSites = new Map();
    allData.forEach(d => {
      if (d.obra_id && !uniqueSites.has(d.obra_id)) {
        uniqueSites.set(d.obra_id, d.project_name || d.obra_id);
      }
    });
    
    return Array.from(uniqueSites.entries())
      .map(([id, name]) => ({ label: name, value: id }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [allData]);

  // Inicializar filtros
  useEffect(() => {
    if (years.length > 0 && !selectedYear) {
      setSelectedYear(years[0]);
    }
    if (jobSites.length > 0 && selectedJobSite.length === 0) {
      setSelectedJobSite(jobSites.map(site => site.value));
    }
  }, [years, jobSites, selectedYear, selectedJobSite.length]);

  // Filtrar dados
  const filteredData = useMemo(() => {
    return allData.filter(d => {
      const matchYear = !selectedYear || d.reference_year.toString() === selectedYear;
      const matchMonth = !selectedMonth || d.reference_month.toString() === selectedMonth;
      const matchJobSite = selectedJobSite.length === 0 || (d.obra_id && selectedJobSite.includes(d.obra_id));
      return matchYear && matchMonth && matchJobSite;
    });
  }, [allData, selectedYear, selectedMonth, selectedJobSite]);

  // Garantir que um ano esteja selecionado por padrão se houver dados
  useEffect(() => {
    if (allData.length > 0) {
      if (!selectedYear && years.length > 0) {
        setSelectedYear(years[0]);
      }
    }
  }, [allData, years, selectedYear]);

  if (loading) {
    return (
      <div className="d-flex align-items-center justify-content-center h-100">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Carregando...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-danger m-4" role="alert">
        Erro ao carregar dados do OFI: {error}
      </div>
    );
  }

  return (
    <div className="custom-scrollbar" style={{ height: '100%', overflowY: 'auto', background: 'var(--color-background-primary)', display: 'flex', flexDirection: 'column' }}>
      {/* Barra superior com título e filtros - Padrão Takeoff Works */}
      <div className="d-flex flex-row justify-content-between align-items-center" style={{ padding: '10px 20px', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
        <h1 style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, flex: '0 0 auto', marginBottom: 0, display: 'flex', alignItems: 'center', gap: 12, fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif' }}>
          <span style={{ color: 'var(--color-text-primary)', fontWeight: 400, letterSpacing: '-0.5px' }}>
            Operational Forecast Index
          </span>
        </h1>
        
        <OFIFilters
          selectedYear={selectedYear}
          setSelectedYear={setSelectedYear}
          selectedMonth={selectedMonth}
          setSelectedMonth={setSelectedMonth}
          selectedJobSite={selectedJobSite}
          setSelectedJobSite={setSelectedJobSite}
          years={years}
          months={months}
          jobSites={jobSites}
        />
      </div>

      <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto' }}>
        {/* Métricas - Padrão Usuário */}
        <OFIMetrics data={filteredData} />

        {/* Gráficos */}
        <OFICharts data={filteredData} allData={allData} />

        {/* Tabela */}
        <div className="pb-2">
          <OFITable data={filteredData} />
        </div>
      </div>
    </div>
  );
}
