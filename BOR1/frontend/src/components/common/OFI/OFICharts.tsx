import { useMemo, useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import type { OFIData } from '../../../hooks/useOFIData';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface OFIChartsProps {
  data: OFIData[];
  allData: OFIData[];
}

export default function OFICharts({ data, allData }: OFIChartsProps) {
  // Estado para cores do tema resolvidas
  const [themeColors, setThemeColors] = useState({
    accent: '#2e6be6',
    positive: '#1bbf5c',
    challenges: '#e67e22',
    negative: '#dc3545',
    improvements: '#2e86de',
    textSecondary: '#6c757d',
    border: '#dee2e6'
  });

  // Resolver variáveis CSS quando o tema mudar
  useEffect(() => {
    const root = document.documentElement;
    const style = getComputedStyle(root);
    
    setThemeColors({
      accent: style.getPropertyValue('--color-accent-primary').trim() || '#2e6be6',
      positive: style.getPropertyValue('--positive-color').trim() || '#1bbf5c',
      challenges: style.getPropertyValue('--challenges-color').trim() || '#e67e22',
      negative: style.getPropertyValue('--negative-color').trim() || '#dc3545',
      improvements: style.getPropertyValue('--improvements-color').trim() || '#2e86de',
      textSecondary: style.getPropertyValue('--color-text-secondary').trim() || '#6c757d',
      border: style.getPropertyValue('--color-border-divider').trim() || '#dee2e6'
    });
    
    // Opcional: Observar mudanças na classe 'dark'
    const observer = new MutationObserver(() => {
      const updatedStyle = getComputedStyle(root);
      setThemeColors({
        accent: updatedStyle.getPropertyValue('--color-accent-primary').trim(),
        positive: updatedStyle.getPropertyValue('--positive-color').trim(),
        challenges: updatedStyle.getPropertyValue('--challenges-color').trim(),
        negative: updatedStyle.getPropertyValue('--negative-color').trim(),
        improvements: updatedStyle.getPropertyValue('--improvements-color').trim(),
        textSecondary: updatedStyle.getPropertyValue('--color-text-secondary').trim(),
        border: updatedStyle.getPropertyValue('--color-border-divider').trim()
      });
    });

    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Gráfico Histórico (Total Score ao longo do tempo)
  const historyChartData = useMemo(() => {
    // Agrupar todos os dados por mês/ano para o histórico
    const grouped = allData.reduce((acc, curr) => {
      const key = `${curr.reference_year}-${curr.reference_month.toString().padStart(2, '0')}`;
      if (!acc[key]) acc[key] = { sum: 0, count: 0 };
      acc[key].sum += curr.total_score;
      acc[key].count += 1;
      return acc;
    }, {} as Record<string, { sum: number, count: number }>);

    const sortedKeys = Object.keys(grouped).sort();
    const labels = sortedKeys.map(key => {
      const [year, month] = key.split('-');
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${monthNames[parseInt(month) - 1]} ${year}`;
    });

    const values = sortedKeys.map(key => (grouped[key].sum / grouped[key].count).toFixed(1));

    return {
      labels,
      datasets: [
        {
          label: 'Média OFI (0-7)',
          data: values,
          borderColor: themeColors.accent,
          backgroundColor: `${themeColors.accent}15`,
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: themeColors.accent,
        }
      ]
    };
  }, [allData, themeColors.accent]);

  // Gráfico por Aspecto (Médias do período selecionado em %)
  const aspectChartData = useMemo(() => {
    if (data.length === 0) return null;

    const averages = {
      Fieldwire: (data.reduce((acc, curr) => acc + curr.fieldwire_score, 0) / data.length),
      Machines: (data.reduce((acc, curr) => acc + curr.machines_score, 0) / data.length),
      Contract: (data.reduce((acc, curr) => acc + curr.contract_score, 0) / data.length),
      Systems: (data.reduce((acc, curr) => acc + curr.systems_score, 0) / data.length),
    };

    // Converter para porcentagem: FW, MC, CT (max 2) e SY (max 1)
    const percentages = {
      Fieldwire: (averages.Fieldwire / 2) * 100,
      Machines: (averages.Machines / 2) * 100,
      Contract: (averages.Contract / 2) * 100,
      Systems: (averages.Systems / 1) * 100,
    };

    return {
      labels: Object.keys(percentages),
      datasets: [
        {
          label: 'Média por Aspecto (%)',
          data: Object.values(percentages).map(v => v.toFixed(1)),
          backgroundColor: themeColors.accent,
          borderRadius: 4,
        }
      ],
      rawValues: averages
    }
  }, [data, themeColors]);

  // Opções comuns para os gráficos
  const commonOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        titleFont: { size: 14, weight: 'bold' as const },
        bodyFont: { size: 13 },
        cornerRadius: 8,
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: themeColors.border,
        },
        ticks: {
          color: themeColors.textSecondary,
          font: { size: 11 }
        }
      },
      x: {
        grid: {
          display: false,
        },
        ticks: {
          color: themeColors.textSecondary,
          font: { size: 11 }
        }
      }
    }
  }), [themeColors]);

  // Opções específicas para o gráfico de histórico total (0-7)
  const historyChartOptions = useMemo(() => ({
    ...commonOptions,
    scales: {
      ...commonOptions.scales,
      y: {
        ...commonOptions.scales.y,
        max: 7,
        ticks: {
          ...commonOptions.scales.y.ticks,
          stepSize: 1
        }
      }
    }
  }), [commonOptions]);

  // Opções específicas para o gráfico de barras (porcentagem)
  const aspectBarOptions = useMemo(() => ({
    ...commonOptions,
    plugins: {
      ...commonOptions.plugins,
      tooltip: {
        ...commonOptions.plugins.tooltip,
        callbacks: {
          label: function(context: any) {
            const label = context.dataset.label || '';
            const value = context.parsed.y;
            const aspect = context.label;
            
            let rawValue = 0;
            if (aspect === 'Fieldwire' || aspect === 'Machines' || aspect === 'Contract') {
              rawValue = (value / 100) * 2;
            } else if (aspect === 'Systems') {
              rawValue = (value / 100) * 1;
            }
            
            return `${label}: ${value}% (${rawValue.toFixed(2)})`;
          }
        }
      }
    },
    scales: {
      ...commonOptions.scales,
      y: {
        ...commonOptions.scales.y,
        max: 100,
        ticks: {
          ...commonOptions.scales.y.ticks,
          stepSize: 20,
          callback: (value: any) => `${value}%`
        }
      }
    }
  }), [commonOptions]);

  // Gráficos Históricos por Aspecto
  const aspectHistoryCharts = useMemo(() => {
    const aspects = [
      { key: 'fieldwire_score', label: 'Fieldwire', color: themeColors.accent, max: 2 },
      { key: 'machines_score', label: 'Machines', color: themeColors.accent, max: 2 },
      { key: 'contract_score', label: 'Contract', color: themeColors.accent, max: 2 },
      { key: 'systems_score', label: 'Systems', color: themeColors.accent, max: 1 },
    ];

    const grouped = allData.reduce((acc, curr) => {
      const key = `${curr.reference_year}-${curr.reference_month.toString().padStart(2, '0')}`;
      if (!acc[key]) acc[key] = { 
        fieldwire_score: { sum: 0, count: 0 },
        machines_score: { sum: 0, count: 0 },
        contract_score: { sum: 0, count: 0 },
        systems_score: { sum: 0, count: 0 },
      };
      
      acc[key].fieldwire_score.sum += curr.fieldwire_score;
      acc[key].fieldwire_score.count += 1;
      acc[key].machines_score.sum += curr.machines_score;
      acc[key].machines_score.count += 1;
      acc[key].contract_score.sum += curr.contract_score;
      acc[key].contract_score.count += 1;
      acc[key].systems_score.sum += curr.systems_score;
      acc[key].systems_score.count += 1;
      
      return acc;
    }, {} as Record<string, Record<string, { sum: number, count: number }>>);

    const sortedKeys = Object.keys(grouped).sort();
    const labels = sortedKeys.map(key => {
      const [year, month] = key.split('-');
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${monthNames[parseInt(month) - 1]} ${year}`;
    });

    return aspects.map(aspect => ({
      label: aspect.label,
      color: aspect.color,
      max: aspect.max,
      data: {
        labels,
        datasets: [
          {
            label: aspect.label,
            data: sortedKeys.map(key => (grouped[key][aspect.key].sum / grouped[key][aspect.key].count).toFixed(1)),
            borderColor: aspect.color,
            backgroundColor: `${aspect.color}15`,
            fill: true,
            tension: 0.4,
            pointRadius: 3,
            pointBackgroundColor: aspect.color,
          }
        ]
      }
    }));
  }, [allData, themeColors]);

  return (
    <div className="row g-0 m-0 pb-4">
      {/* Gráfico Histórico */}
      <div className="col-12 col-xl-8">
        <div className="h-100" style={{ 
          background: 'var(--color-background-primary)',
          borderBottom: '1.5px solid var(--color-border-divider)',
          borderRight: '1.5px solid var(--color-border-divider)',
          borderRadius: 0,
          padding: '20px 0'
        }}>
          <h4 className='ms-4 my-2 d-flex justify-content-start align-items-center' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400, minHeight: 30 }}>
            Histórico OFI Total
          </h4>
          <div style={{ height: 320, padding: '0 20px' }}>
            <Line data={historyChartData} options={historyChartOptions} />
          </div>
        </div>
      </div>

      {/* Gráfico por Aspecto */}
      <div className="col-12 col-xl-4">
        <div className="h-100" style={{ 
          background: 'var(--color-background-primary)',
          borderBottom: '1.5px solid var(--color-border-divider)',
          borderRadius: 0,
          padding: '20px 0'
        }}>
          <h4 className='ms-4 my-2 d-flex justify-content-start align-items-center' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400, minHeight: 30 }}>
            Média por Aspecto
          </h4>
          <div style={{ height: 320, padding: '0 20px' }}>
            {aspectChartData && <Bar data={aspectChartData} options={aspectBarOptions} />}
          </div>
        </div>
      </div>

      {/* Histórico Detalhado por Aspecto */}
      <div className="col-12">
        <div style={{ borderBottom: '1.5px solid var(--color-border-divider)', padding: '20px 0' }}>
          <h4 className='ms-4 my-2 d-flex justify-content-start align-items-center' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400, minHeight: 30 }}>
            Histórico por Aspecto
          </h4>
          <div className="row g-0">
            {aspectHistoryCharts.map((chart, index) => (
              <div key={index} className="col-12 col-md-6 col-xxl-3">
                <div className="h-100" style={{ 
                  background: 'var(--color-background-primary)',
                  borderRight: index < aspectHistoryCharts.length - 1 ? '1.5px solid var(--color-border-divider)' : 'none',
                  borderRadius: 0,
                  padding: '16px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '12px', paddingLeft: '8px' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: chart.color }} />
                    <h6 style={{ color: 'var(--color-text-primary)', fontWeight: 600, margin: 0 }}>{chart.label}</h6>
                  </div>
                  <div style={{ height: 180 }}>
                    <Line 
                      data={chart.data} 
                      options={{
                        ...commonOptions,
                        scales: {
                          ...commonOptions.scales,
                          y: {
                            ...commonOptions.scales.y,
                            max: chart.max,
                            ticks: {
                              ...commonOptions.scales.y.ticks,
                              font: { size: 10 },
                              stepSize: chart.max === 1 ? 0.5 : 1
                            }
                          },
                          x: {
                            ...commonOptions.scales.x,
                            ticks: {
                              font: { size: 10 }
                            }
                          }
                        }
                      }} 
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
