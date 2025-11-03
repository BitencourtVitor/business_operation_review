import React, { useState, useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import { createPortal } from 'react-dom';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

interface ServiceRequestItem {
  date_received?: string;
  date_completed?: string;
  warranty?: boolean;
  contractor?: string;
  job_site?: string;
  issue?: string;
  tech?: string;
}

interface ServiceChartTooltipExternalProps {
  tooltip: unknown;
  chartLabels: string[];
  chartDatasets: Array<{ label: string; data: number[]; borderColor: string }>;
  selectedMonth: string;
  canvas?: HTMLCanvasElement | null;
  data: ServiceRequestItem[];
  dateType: 'received' | 'completed';
}

const ServiceChartTooltipExternal = React.memo(function ServiceChartTooltipExternal({ 
  tooltip, 
  chartLabels, 
  chartDatasets, 
  selectedMonth, 
  canvas, 
  data, 
  dateType
}: ServiceChartTooltipExternalProps) {
  const tooltipRef = React.useRef<HTMLDivElement>(null);
  const [realWidth, setRealWidth] = React.useState<number>(320);

  let dataIndex: number = 0;
  let count: number = 0;
  let warrantyCount: number = 0;
  let nonWarrantyCount: number = 0;
  let periodo: string = '';
  let caretX: number = 0;
  let caretY: number = 0;

  const safeTooltip = tooltip as {
    opacity?: number;
    dataPoints?: Array<{ dataIndex: number }>;
    caretX?: number;
    caretY?: number;
  };
  const opacity = safeTooltip.opacity;
  const dataPoints = safeTooltip.dataPoints;
  const caretXVal = safeTooltip.caretX;
  const caretYVal = safeTooltip.caretY;
  
  // Medir largura real do tooltip após renderizar
  React.useLayoutEffect(() => {
    if (tooltipRef.current) {
      setRealWidth(tooltipRef.current.offsetWidth);
    }
  }, [periodo, count, warrantyCount, nonWarrantyCount]);
  
  if (!opacity || !dataPoints || dataPoints.length === 0) return null;
  dataIndex = dataPoints[0].dataIndex;
  count = chartDatasets[0]?.data[dataIndex] || 0;
  const label = chartLabels[dataIndex];
  
  // Calcular dados para o período específico
  const periodData = data.filter(item => {
    const dateField = dateType === 'received' ? item.date_received : item.date_completed;
    if (!dateField) return false;
    
    const itemDate = new Date(dateField);
    let itemPeriod: string;
    
    if (selectedMonth && selectedMonth !== 'Todos') {
      itemPeriod = itemDate.getDate().toString().padStart(2, '0');
    } else {
      itemPeriod = (itemDate.getMonth() + 1).toString().padStart(2, '0');
    }
    
    return itemPeriod === label;
  });

  warrantyCount = periodData.filter(item => item.warranty === true).length;
  nonWarrantyCount = periodData.filter(item => item.warranty === false).length;

  periodo = selectedMonth && selectedMonth !== 'Todos' ? `Day ${label}` : `Month ${label}`;
  caretX = typeof caretXVal === 'number' ? caretXVal : 0;
  caretY = typeof caretYVal === 'number' ? caretYVal : 0;

  let absLeft = caretX;
  let absTop = caretY;
  let side: 'left' | 'right' = 'right';
  const offsetX = 16;
  const tooltipHeight = 140;
  const padding = 12;
  if (canvas) {
    const rect = canvas.getBoundingClientRect();
    const canvasMidX = rect.left + rect.width / 2;
    const pointAbsX = rect.left + caretX;
    side = pointAbsX < canvasMidX ? 'right' : 'left';
    absTop = rect.top + caretY - tooltipHeight / 2;
    if (side === 'right') {
      absLeft = rect.left + caretX + offsetX;
    } else {
      absLeft = rect.left + caretX - realWidth - offsetX;
    }
    if (absTop < rect.top + padding) absTop = rect.top + padding;
    if (absTop + tooltipHeight > rect.bottom - padding) absTop = rect.bottom - tooltipHeight - padding;
  }

  return createPortal(
    <div
      ref={tooltipRef}
      style={{
        position: 'fixed',
        left: absLeft,
        top: absTop,
        transform: 'none',
        background: 'var(--color-background-secondary)',
        color: 'var(--color-text-primary)',
        border: '1.5px solid var(--color-border-divider)',
        borderRadius: 10,
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        padding: 16,
        minWidth: 220,
        maxWidth: 320,
        zIndex: 9999,
        opacity: 0.9,
        pointerEvents: 'none',
        fontSize: 14,
        fontFamily: 'inherit',
        userSelect: 'none',
      }}
    >
      {periodo && <div style={{ fontWeight: 600, color: 'var(--color-accent-primary)', marginBottom: 8, fontSize: 15 }}>{periodo}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 15, marginBottom: 2 }}>
          <span style={{ color: 'var(--color-text-secondary)' }}>Total</span>
          <span style={{ color: 'var(--color-accent-primary)', fontWeight: 600 }}>{count}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 15, marginBottom: 2 }}>
          <span style={{ color: 'var(--color-text-secondary)' }}>Warranty</span>
          <span style={{ color: '#fd7e14', fontWeight: 500 }}>{warrantyCount}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 15, marginBottom: 2 }}>
          <span style={{ color: 'var(--color-text-secondary)' }}>Non-Warranty</span>
          <span style={{ color: '#28a745', fontWeight: 500 }}>{nonWarrantyCount}</span>
        </div>
      </div>
    </div>,
    document.body
  );
});

interface ServiceChartProps {
  filteredData: ServiceRequestItem[];
  selectedYear: string;
  selectedMonth: string;
  selectedStatus: string[];
}



function NoDataMessage({ title, message, icon }: { title: string, message: string, icon?: string }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: 300,
      color: 'var(--color-text-secondary)',
      textAlign: 'center',
      padding: '20px'
    }}>
      {icon && <i className={`bi ${icon}`} style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }} />}
      <h4 style={{ margin: '0 0 8px 0', fontSize: 18, fontWeight: 500 }}>{title}</h4>
      <p style={{ margin: 0, fontSize: 14, opacity: 0.8 }}>{message}</p>
    </div>
  );
}

export function ServiceChart({ 
  filteredData, 
  selectedMonth
}: ServiceChartProps) {
  const [externalTooltip, setExternalTooltip] = useState<null | Partial<ServiceChartTooltipExternalProps>>(null);
  const [contractorTooltip, setContractorTooltip] = useState<{ show: boolean; x: number; y: number }>({ show: false, x: 0, y: 0 });
  const [contractorSortOrder, setContractorSortOrder] = useState<'desc' | 'asc'>('desc');
  const [jobSiteTooltip, setJobSiteTooltip] = useState<{ show: boolean; x: number; y: number }>({ show: false, x: 0, y: 0 });
  const [jobSiteSortOrder, setJobSiteSortOrder] = useState<'desc' | 'asc'>('desc');
  const [issueTooltip, setIssueTooltip] = useState<{ show: boolean; x: number; y: number }>({ show: false, x: 0, y: 0 });
  const [issueSortOrder, setIssueSortOrder] = useState<'desc' | 'asc'>('desc');
  const [techTooltip, setTechTooltip] = useState<{ show: boolean; x: number; y: number }>({ show: false, x: 0, y: 0 });
  const [techSortOrder, setTechSortOrder] = useState<'desc' | 'asc'>('desc');
  const [dateType, setDateType] = useState<'received' | 'completed'>('received');

  // Funções para calcular os principais itens
  const getTopContractor = () => {
    const contractorCounts = filteredData.reduce((acc, item) => {
      if (item.contractor) {
        acc[item.contractor] = (acc[item.contractor] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);
    
    const sorted = Object.entries(contractorCounts).sort(([,a], [,b]) => b - a);
    return sorted.length > 0 ? sorted[0][0] : 'N/A';
  };

  const getTopJobSite = () => {
    const jobSiteCounts = filteredData.reduce((acc, item) => {
      if (item.job_site) {
        acc[item.job_site] = (acc[item.job_site] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);
    
    const sorted = Object.entries(jobSiteCounts).sort(([,a], [,b]) => b - a);
    return sorted.length > 0 ? sorted[0][0] : 'N/A';
  };

  const getTopIssue = () => {
    const issueCounts = filteredData.reduce((acc, item) => {
      if (item.issue) {
        acc[item.issue] = (acc[item.issue] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);
    
    const sorted = Object.entries(issueCounts).sort(([,a], [,b]) => b - a);
    return sorted.length > 0 ? sorted[0][0] : 'N/A';
  };

  const getTopTech = () => {
    const techCounts = filteredData.reduce((acc, item) => {
      if (item.tech) {
        acc[item.tech] = (acc[item.tech] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);
    
    const sorted = Object.entries(techCounts).sort(([,a], [,b]) => b - a);
    return sorted.length > 0 ? sorted[0][0] : 'N/A';
  };

  // Preparar dados para gráfico de linha - apenas contagem por data de recebimento
  const lineChartData = useMemo(() => {
    if (!filteredData || filteredData.length === 0) return null;

    const dataByPeriod: { [key: string]: number } = {};
    
    filteredData.forEach(item => {
      const dateField = dateType === 'received' ? item.date_received : item.date_completed;
      if (dateField) {
        const date = new Date(dateField);
        let periodKey: string;
        
        if (selectedMonth && selectedMonth !== 'Todos') {
          // Mostrar por dia quando mês específico selecionado
          periodKey = date.getDate().toString().padStart(2, '0');
        } else {
          // Mostrar por mês quando ano selecionado
          periodKey = (date.getMonth() + 1).toString().padStart(2, '0');
        }
        
        // Contagem simples
        dataByPeriod[periodKey] = (dataByPeriod[periodKey] || 0) + 1;
      }
    });

    const labels = Object.keys(dataByPeriod).sort();
    const data = labels.map(label => dataByPeriod[label]);

    // Obter cores CSS como no Timesheet
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--color-accent-primary').trim() || '#2E6BE6';

    return {
      labels,
      datasets: [
        {
          label: dateType === 'received' ? 'Service Requests Recebidos' : 'Service Requests Completados',
          data: data,
          borderColor: accent,
          backgroundColor: accent,
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 3,
          fill: false,
          tension: 0.25,
        }
      ]
    };
  }, [filteredData, selectedMonth, dateType]);

  const lineChartOptions = useMemo(() => {
    const borderDivider = getComputedStyle(document.documentElement).getPropertyValue('--color-border-divider').trim() || '#e0e0e0';
    
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: false,
          external: (context: Record<string, unknown>) => {
            if (!context.tooltip || (context.tooltip as { opacity: number }).opacity === 0) {
              setExternalTooltip(null);
              return;
            }
            if (lineChartData) {
              setExternalTooltip({
                tooltip: context.tooltip,
                chartLabels: lineChartData.labels,
                chartDatasets: lineChartData.datasets,
                selectedMonth,
                canvas: (context.chart && (context.chart as { canvas?: HTMLCanvasElement }).canvas) ? (context.chart as { canvas: HTMLCanvasElement }).canvas : undefined,
                data: filteredData,
                dateType
              });
            }
          }
        },
      },
             scales: {
         x: {
           grid: { color: borderDivider },
           ticks: { color: '#6c757d' },
           title: {
             display: true,
             text: selectedMonth && selectedMonth !== 'Todos' ? 'Days of Month' : 'Months',
             color: '#6c757d',
             font: { weight: 600, size: 12 },
             padding: { top: 10, bottom: 10 }
           },
         },
         y: {
           grid: { color: borderDivider },
           ticks: { 
             color: '#6c757d',
             stepSize: 1,
             callback: function(value) {
               if (Number.isInteger(value)) {
                 return value;
               }
               return null;
             }
           },
           beginAtZero: true,
           title: {
             display: true,
             text: 'Requests Count',
             color: '#6c757d',
             font: { weight: 600, size: 12 },
             padding: { top: 10, bottom: 10 }
           },
         },
       },
    };
  }, [lineChartData, selectedMonth, filteredData, dateType]);

  if (!filteredData || filteredData.length === 0) {
    return (
      <>
        <h4 className='ms-4 my-2 d-flex justify-content-start align-items-center' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400, minHeight: 30 }}>
          Análise de Service Requests
        </h4>
        <div style={{ background: 'var(--color-background-primary)', borderRadius: 10, flex: '0 0 auto', minHeight: 0, minWidth: 0 }}>
          <div style={{ width: '100%', height: '40vh', minHeight: 320, maxHeight: 500 }}>
            <NoDataMessage 
              title="Sem dados para exibir"
              message="Não há service requests para o período selecionado."
              icon="bi-graph-up"
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', height: '40vh', minHeight: 320, maxHeight: 500 }}>
        {/* DIV ESQUERDA: Título + Gráfico */}
        <div style={{ 
           width: '80%', 
           background: 'var(--color-background-primary)', 
           borderRadius: 10, 
           padding: '16px',
           display: 'flex',
           flexDirection: 'column'
         }}>
           <h4 className='mb-3 d-flex justify-content-between align-items-center' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400, minHeight: 30 }}>
             <span>Service Requests ao Longo do Tempo</span>
             <div style={{ 
               display: 'flex', 
               alignItems: 'center', 
               background: 'var(--color-background-secondary)', 
               borderRadius: 25, 
               padding: '6px 6px 6px 15px', 
               border: '1px solid var(--color-border-divider)', 
               height: 38 
             }}>
               {/* Date Type Control */}
               <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                 <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>
                   Date Type
                 </span>
                 <button
                   onClick={() => setDateType(dateType === 'received' ? 'completed' : 'received')}
                   style={{
                     background: dateType === 'completed' ? 'var(--color-accent-primary)' : 'var(--color-background-primary)',
                     color: dateType === 'completed' ? '#fff' : 'var(--color-accent-primary)',
                     border: '1px solid var(--color-border-divider)',
                     borderRadius: 15,
                     padding: '4px 16px',
                     fontWeight: 500,
                     fontSize: 14,
                     cursor: 'pointer',
                     transition: 'all 0.2s ease',
                     height: 26,
                     display: 'flex',
                     alignItems: 'center',
                     justifyContent: 'center',
                     minWidth: 80
                   }}
                   onMouseEnter={(e) => {
                     if (dateType === 'received') {
                       e.currentTarget.style.background = 'var(--color-background-primary)';
                       e.currentTarget.style.borderColor = 'var(--color-accent-primary)';
                     }
                   }}
                   onMouseLeave={(e) => {
                     e.currentTarget.style.background = dateType === 'completed' ? 'var(--color-accent-primary)' : 'var(--color-background-primary)';
                     e.currentTarget.style.borderColor = 'var(--color-border-divider)';
                   }}
                 >
                  {dateType === 'received' ? 'Received' : 'Completed'}
                </button>
              </div>
            </div>
          </h4>
                       <div style={{ flex: 1, position: 'relative', width: '100%', height: '100%' }}>
              {lineChartData && lineChartOptions ? (
                <Line data={lineChartData} options={lineChartOptions} />
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Carregando gráfico...</span>
                </div>
              )}
            </div>
         </div>
         
                 {/* DIV DIREITA: Cards de Métricas */}
         <div style={{ 
            width: '20%', 
            background: 'var(--color-background-secondary)', 
            borderRadius: 10, 
            padding: '0px', 
            display: 'flex', 
            flexDirection: 'column'
          }}>
                     {/* Card 1: Top Contractor */}
           <div style={{
             background: 'var(--color-background-primary)',
             borderRadius: 0,
             padding: '12px',
             border: 'none',
             borderLeft: '1px solid var(--color-border-divider)',
             flex: 1,
             display: 'flex',
             flexDirection: 'column',
             justifyContent: 'center',
             alignItems: 'center',
             minHeight: 0,
             position: 'relative'
           }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4, textAlign: 'center' }}>
              Top Contractor
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-accent-primary)', textAlign: 'center' }}>
              {getTopContractor()}
            </div>
            <button
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const newShow = !contractorTooltip.show;
                setContractorTooltip({
                  show: newShow,
                  x: rect.right + 10,
                  y: rect.top
                });
                // Fechar outros tooltips quando este for aberto
                if (newShow) {
                  setJobSiteTooltip({ show: false, x: 0, y: 0 });
                  setIssueTooltip({ show: false, x: 0, y: 0 });
                  setTechTooltip({ show: false, x: 0, y: 0 });
                }
              }}
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                background: 'none',
                border: 'none',
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
                fontSize: '14px',
                padding: '4px',
                borderRadius: '4px',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--color-accent-primary)';
                e.currentTarget.style.background = 'var(--color-background-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--color-text-secondary)';
                e.currentTarget.style.background = 'none';
              }}
            >
              <i className="bi bi-eye"></i>
            </button>
          </div>
          
          {/* Linha separadora 1 */}
          <div style={{ 
            height: '1px', 
            background: 'var(--color-border-divider)',
            width: '100%'
          }} />
         
                   {/* Card 2: Top Job Site */}
          <div style={{
            background: 'var(--color-background-primary)',
            borderRadius: 0,
            padding: '12px',
            border: 'none',
            borderLeft: '1px solid var(--color-border-divider)',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: 0,
            position: 'relative'
          }}>
           <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4, textAlign: 'center' }}>
             Top Job Site
           </div>
           <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-accent-primary)', textAlign: 'center' }}>
             {getTopJobSite()}
           </div>
           <button
             onClick={(e) => {
               const rect = e.currentTarget.getBoundingClientRect();
               const newShow = !jobSiteTooltip.show;
               setJobSiteTooltip({
                 show: newShow,
                 x: rect.right + 10,
                 y: rect.top
               });
               // Fechar outros tooltips quando este for aberto
               if (newShow) {
                 setContractorTooltip({ show: false, x: 0, y: 0 });
                 setIssueTooltip({ show: false, x: 0, y: 0 });
                 setTechTooltip({ show: false, x: 0, y: 0 });
               }
             }}
             style={{
               position: 'absolute',
               top: '8px',
               right: '8px',
               background: 'none',
               border: 'none',
               color: 'var(--color-text-secondary)',
               cursor: 'pointer',
               fontSize: '14px',
               padding: '4px',
               borderRadius: '4px',
               transition: 'all 0.2s ease'
             }}
             onMouseEnter={(e) => {
               e.currentTarget.style.color = 'var(--color-accent-primary)';
               e.currentTarget.style.background = 'var(--color-background-primary)';
             }}
             onMouseLeave={(e) => {
               e.currentTarget.style.color = 'var(--color-text-secondary)';
               e.currentTarget.style.background = 'none';
             }}
           >
             <i className="bi bi-eye"></i>
           </button>
         </div>
         
         {/* Linha separadora 2 */}
         <div style={{ 
           height: '1px', 
           background: 'var(--color-border-divider)',
           width: '100%'
         }} />
         
                   {/* Card 3: Top Issue */}
          <div style={{
            background: 'var(--color-background-primary)',
            borderRadius: 0,
            padding: '12px',
            border: 'none',
            borderLeft: '1px solid var(--color-border-divider)',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: 0,
            position: 'relative'
          }}>
           <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4, textAlign: 'center' }}>
             Top Issue
           </div>
           <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-accent-primary)', textAlign: 'center' }}>
             {getTopIssue()}
           </div>
           <button
             onClick={(e) => {
               const rect = e.currentTarget.getBoundingClientRect();
               const newShow = !issueTooltip.show;
               setIssueTooltip({
                 show: newShow,
                 x: rect.right + 10,
                 y: rect.top
               });
               // Fechar outros tooltips quando este for aberto
               if (newShow) {
                 setContractorTooltip({ show: false, x: 0, y: 0 });
                 setJobSiteTooltip({ show: false, x: 0, y: 0 });
                 setTechTooltip({ show: false, x: 0, y: 0 });
               }
             }}
             style={{
               position: 'absolute',
               top: '8px',
               right: '8px',
               background: 'none',
               border: 'none',
               color: 'var(--color-text-secondary)',
               cursor: 'pointer',
               fontSize: '14px',
               padding: '4px',
               borderRadius: '4px',
               transition: 'all 0.2s ease'
             }}
             onMouseEnter={(e) => {
               e.currentTarget.style.color = 'var(--color-accent-primary)';
               e.currentTarget.style.background = 'var(--color-background-primary)';
             }}
             onMouseLeave={(e) => {
               e.currentTarget.style.color = 'var(--color-text-secondary)';
               e.currentTarget.style.background = 'none';
             }}
           >
             <i className="bi bi-eye"></i>
           </button>
         </div>
         
         {/* Linha separadora 3 */}
         <div style={{ 
           height: '1px', 
           background: 'var(--color-border-divider)',
           width: '100%'
         }} />
         
                   {/* Card 4: Top Tech */}
          <div style={{
            background: 'var(--color-background-primary)',
            borderRadius: 0,
            padding: '12px',
            border: 'none',
            borderLeft: '1px solid var(--color-border-divider)',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: 0,
            position: 'relative'
          }}>
           <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4, textAlign: 'center' }}>
             Top Tech
           </div>
           <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-accent-primary)', textAlign: 'center' }}>
             {getTopTech()}
           </div>
           <button
             onClick={(e) => {
               const rect = e.currentTarget.getBoundingClientRect();
               const newShow = !techTooltip.show;
               setTechTooltip({
                 show: newShow,
                 x: rect.right + 10,
                 y: rect.top
               });
               // Fechar outros tooltips quando este for aberto
               if (newShow) {
                 setContractorTooltip({ show: false, x: 0, y: 0 });
                 setJobSiteTooltip({ show: false, x: 0, y: 0 });
                 setIssueTooltip({ show: false, x: 0, y: 0 });
               }
             }}
             style={{
               position: 'absolute',
               top: '8px',
               right: '8px',
               background: 'none',
               border: 'none',
               color: 'var(--color-text-secondary)',
               cursor: 'pointer',
               fontSize: '14px',
               padding: '4px',
               borderRadius: '4px',
               transition: 'all 0.2s ease'
             }}
             onMouseEnter={(e) => {
               e.currentTarget.style.color = 'var(--color-accent-primary)';
               e.currentTarget.style.background = 'var(--color-background-primary)';
             }}
             onMouseLeave={(e) => {
               e.currentTarget.style.color = 'var(--color-text-secondary)';
               e.currentTarget.style.background = 'none';
             }}
           >
             <i className="bi bi-eye"></i>
           </button>
         </div>
       </div>
     </div>

             {/* Tooltip externo */}
       {externalTooltip && (() => {
         const tooltip = externalTooltip as NonNullable<typeof externalTooltip>;
         return (
          <ServiceChartTooltipExternal
            {...tooltip}
            tooltip={tooltip.tooltip ? tooltip.tooltip as Record<string, unknown> : {} as Record<string, unknown>}
            chartLabels={tooltip.chartLabels || []}
            chartDatasets={tooltip.chartDatasets || []}
            selectedMonth={tooltip.selectedMonth || ''}
            canvas={tooltip.canvas || null}
            data={tooltip.data || []}
            dateType={tooltip.dateType || 'received'}
          />
         );
       })()}

                               {/* Tooltip de Contractors */}
         {contractorTooltip.show && (
           <div
             style={{
               position: 'fixed',
               left: contractorTooltip.x,
               top: contractorTooltip.y,
               background: 'var(--color-background-secondary)',
               color: 'var(--color-text-primary)',
               border: '1.5px solid var(--color-border-divider)',
               borderRadius: 10,
               boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
               padding: 0,
               minWidth: 280,
               maxWidth: 350,
               zIndex: 9999,
               fontSize: 14,
               fontFamily: 'inherit',
               userSelect: 'none',
             }}
           >
             <div style={{ 
               display: 'flex', 
               justifyContent: 'space-between', 
               alignItems: 'center', 
               padding: '16px 16px 12px 16px',
               borderBottom: '1px solid var(--color-border-divider)',
               margin: '0 0 0 0'
             }}>
               <span style={{ fontWeight: 600, color: 'var(--color-accent-primary)', fontSize: 15 }}>
                 Contractors by Count
               </span>
               <button
                 onClick={() => setContractorSortOrder(contractorSortOrder === 'desc' ? 'asc' : 'desc')}
                 style={{
                   background: 'none',
                   border: '1px solid var(--color-accent-primary)',
                   color: 'var(--color-accent-primary)',
                   cursor: 'pointer',
                   fontSize: 12,
                   padding: '4px 8px',
                   borderRadius: 4
                 }}
               >
                 {contractorSortOrder === 'desc' ? '↓ Desc' : '↑ Asc'}
               </button>
             </div>
             <div style={{ 
               maxHeight: 200, 
               overflowY: 'auto',
               padding: '0 16px 16px 16px',
               scrollbarWidth: 'thin',
               scrollbarColor: 'var(--color-border-divider) transparent'
             }}>
               {(() => {
                 const contractorCounts = filteredData.reduce((acc, item) => {
                   if (item.contractor) {
                     acc[item.contractor] = (acc[item.contractor] || 0) + 1;
                   }
                   return acc;
                 }, {} as Record<string, number>);

                 const totalContractors = Object.values(contractorCounts).reduce((sum, count) => sum + count, 0);
                 const sortedContractors = Object.entries(contractorCounts)
                   .sort(([,a], [,b]) => contractorSortOrder === 'desc' ? b - a : a - b);

                 return sortedContractors.map(([contractor, count], index) => {
                   const percentage = totalContractors > 0 ? ((count / totalContractors) * 100).toFixed(1) : '0.0';
                   return (
                     <div key={contractor} style={{
                       display: 'flex',
                       justifyContent: 'space-between',
                       alignItems: 'center',
                       padding: '8px 0',
                       borderBottom: index < sortedContractors.length - 1 ? '1px solid var(--color-border-divider)' : 'none'
                     }}>
                       <span style={{ color: 'var(--color-text-primary)', fontSize: 13 }}>
                         {contractor}
                       </span>
                       <div style={{ 
                         display: 'flex',
                         alignItems: 'center',
                         gap: '8px'
                       }}>
                         <span style={{ 
                           color: 'var(--color-accent-primary)', 
                           fontWeight: 600, 
                           fontSize: 13,
                           background: 'var(--color-background-primary)',
                           padding: '4px 10px',
                           borderRadius: 16,
                           minWidth: 35,
                           textAlign: 'center',
                           boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                         }}>
                           {count}
                         </span>
                         <span style={{ 
                           color: 'var(--color-text-secondary)', 
                           fontSize: 12,
                           fontWeight: 500,
                           background: 'var(--color-background-primary)',
                           padding: '2px 6px',
                           borderRadius: 8,
                           border: '1px solid var(--color-border-divider)'
                         }}>
                           {percentage}%
                         </span>
                       </div>
                     </div>
                   );
                 });
               })()}
             </div>
           </div>
         )}

        {/* Tooltip de Job Sites */}
        {jobSiteTooltip.show && (
          <div
            style={{
              position: 'fixed',
              left: jobSiteTooltip.x,
              top: jobSiteTooltip.y,
              background: 'var(--color-background-secondary)',
              color: 'var(--color-text-primary)',
              border: '1.5px solid var(--color-border-divider)',
              borderRadius: 10,
              boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
              padding: 0,
              minWidth: 280,
              maxWidth: 350,
              zIndex: 9999,
              fontSize: 14,
              fontFamily: 'inherit',
              userSelect: 'none',
            }}
          >
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              padding: '16px 16px 12px 16px',
              borderBottom: '1px solid var(--color-border-divider)',
              margin: '0 0 0 0'
            }}>
              <span style={{ fontWeight: 600, color: 'var(--color-accent-primary)', fontSize: 15 }}>
                Job Sites by Count
              </span>
              <button
                onClick={() => setJobSiteSortOrder(jobSiteSortOrder === 'desc' ? 'asc' : 'desc')}
                style={{
                  background: 'none',
                  border: '1px solid var(--color-accent-primary)',
                  color: 'var(--color-accent-primary)',
                  cursor: 'pointer',
                  fontSize: 12,
                  padding: '4px 8px',
                  borderRadius: 4
                }}
              >
                {jobSiteSortOrder === 'desc' ? '↓ Desc' : '↑ Asc'}
              </button>
            </div>
            <div style={{ 
              maxHeight: 200, 
              overflowY: 'auto',
              padding: '0 16px 16px 16px',
              scrollbarWidth: 'thin',
              scrollbarColor: 'var(--color-border-divider) transparent'
            }}>
              {(() => {
                const jobSiteCounts = filteredData.reduce((acc, item) => {
                  if (item.job_site) {
                    acc[item.job_site] = (acc[item.job_site] || 0) + 1;
                  }
                  return acc;
                }, {} as Record<string, number>);

                const totalJobSites = Object.values(jobSiteCounts).reduce((sum, count) => sum + count, 0);
                const sortedJobSites = Object.entries(jobSiteCounts)
                  .sort(([,a], [,b]) => jobSiteSortOrder === 'desc' ? b - a : a - b);

                                 return sortedJobSites.map(([jobSite, count], index) => {
                   const percentage = totalJobSites > 0 ? ((count / totalJobSites) * 100).toFixed(1) : '0.0';
                   return (
                     <div key={jobSite} style={{
                       display: 'flex',
                       justifyContent: 'space-between',
                       alignItems: 'center',
                       padding: '8px 0',
                       borderBottom: index < sortedJobSites.length - 1 ? '1px solid var(--color-border-divider)' : 'none'
                     }}>
                       <span style={{ color: 'var(--color-text-primary)', fontSize: 13 }}>
                         {jobSite}
                       </span>
                       <div style={{ 
                         display: 'flex',
                         alignItems: 'center',
                         gap: '8px'
                       }}>
                         <span style={{ 
                           color: 'var(--color-accent-primary)', 
                           fontWeight: 600, 
                           fontSize: 13,
                           background: 'var(--color-background-primary)',
                           padding: '4px 10px',
                           borderRadius: 16,
                           minWidth: 35,
                           textAlign: 'center',
                           boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                         }}>
                           {count}
                         </span>
                         <span style={{ 
                           color: 'var(--color-text-secondary)', 
                           fontSize: 12,
                           fontWeight: 500,
                           background: 'var(--color-background-primary)',
                           padding: '2px 6px',
                           borderRadius: 8,
                           border: '1px solid var(--color-border-divider)'
                         }}>
                           {percentage}%
                         </span>
                       </div>
                     </div>
                   );
                 });
              })()}
            </div>
          </div>
        )}

                 {/* Tooltip de Issues */}
         {issueTooltip.show && (
           <div
             style={{
               position: 'fixed',
               left: issueTooltip.x,
               top: issueTooltip.y,
               background: 'var(--color-background-secondary)',
               color: 'var(--color-text-primary)',
               border: '1.5px solid var(--color-border-divider)',
               borderRadius: 10,
               boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
               padding: 0,
               minWidth: 280,
               maxWidth: 350,
               zIndex: 9999,
               fontSize: 14,
               fontFamily: 'inherit',
               userSelect: 'none',
             }}
           >
             <div style={{ 
               display: 'flex', 
               justifyContent: 'space-between', 
               alignItems: 'center', 
               padding: '16px 16px 12px 16px',
               borderBottom: '1px solid var(--color-border-divider)',
               margin: '0 0 0 0'
             }}>
               <span style={{ fontWeight: 600, color: 'var(--color-accent-primary)', fontSize: 15 }}>
                 Issues by Count
               </span>
               <button
                 onClick={() => setIssueSortOrder(issueSortOrder === 'desc' ? 'asc' : 'desc')}
                 style={{
                   background: 'none',
                   border: '1px solid var(--color-accent-primary)',
                   color: 'var(--color-accent-primary)',
                   cursor: 'pointer',
                   fontSize: 12,
                   padding: '4px 8px',
                   borderRadius: 4
                 }}
               >
                 {issueSortOrder === 'desc' ? '↓ Desc' : '↑ Asc'}
               </button>
             </div>
             <div style={{ 
               maxHeight: 200, 
               overflowY: 'auto',
               padding: '0 16px 16px 16px',
               scrollbarWidth: 'thin',
               scrollbarColor: 'var(--color-border-divider) transparent'
             }}>
               {(() => {
                 const issueCounts = filteredData.reduce((acc, item) => {
                   if (item.issue) {
                     acc[item.issue] = (acc[item.issue] || 0) + 1;
                   }
                   return acc;
                 }, {} as Record<string, number>);

                 const totalIssues = Object.values(issueCounts).reduce((sum, count) => sum + count, 0);
                 const sortedIssues = Object.entries(issueCounts)
                   .sort(([,a], [,b]) => issueSortOrder === 'desc' ? b - a : a - b);

                 return sortedIssues.map(([issue, count], index) => {
                   const percentage = totalIssues > 0 ? ((count / totalIssues) * 100).toFixed(1) : '0.0';
                   return (
                     <div key={issue} style={{
                       display: 'flex',
                       justifyContent: 'space-between',
                       alignItems: 'center',
                       padding: '8px 0',
                       borderBottom: index < sortedIssues.length - 1 ? '1px solid var(--color-border-divider)' : 'none'
                     }}>
                       <span style={{ color: 'var(--color-text-primary)', fontSize: 13 }}>
                         {issue}
                       </span>
                       <div style={{ 
                         display: 'flex',
                         alignItems: 'center',
                         gap: '8px'
                       }}>
                         <span style={{ 
                           color: 'var(--color-accent-primary)', 
                           fontWeight: 600, 
                           fontSize: 13,
                           background: 'var(--color-background-primary)',
                           padding: '4px 10px',
                           borderRadius: 16,
                           minWidth: 35,
                           textAlign: 'center',
                           boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                         }}>
                           {count}
                         </span>
                         <span style={{ 
                           color: 'var(--color-text-secondary)', 
                           fontSize: 12,
                           fontWeight: 500,
                           background: 'var(--color-background-primary)',
                           padding: '2px 6px',
                           borderRadius: 8,
                           border: '1px solid var(--color-border-divider)'
                         }}>
                           {percentage}%
                         </span>
                       </div>
                     </div>
                   );
                 });
               })()}
             </div>
           </div>
         )}

                 {/* Tooltip de Techs */}
         {techTooltip.show && (
           <div
             style={{
               position: 'fixed',
               left: techTooltip.x,
               top: techTooltip.y,
               background: 'var(--color-background-secondary)',
               color: 'var(--color-text-primary)',
               border: '1.5px solid var(--color-border-divider)',
               borderRadius: 10,
               boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
               padding: 0,
               minWidth: 280,
               maxWidth: 350,
               zIndex: 9999,
               fontSize: 14,
               fontFamily: 'inherit',
               userSelect: 'none',
             }}
           >
             <div style={{ 
               display: 'flex', 
               justifyContent: 'space-between', 
               alignItems: 'center', 
               padding: '16px 16px 12px 16px',
               borderBottom: '1px solid var(--color-border-divider)',
               margin: '0 0 0 0'
             }}>
               <span style={{ fontWeight: 600, color: 'var(--color-accent-primary)', fontSize: 15 }}>
                 Techs by Count
               </span>
               <button
                 onClick={() => setTechSortOrder(techSortOrder === 'desc' ? 'asc' : 'desc')}
                 style={{
                   background: 'none',
                   border: '1px solid var(--color-accent-primary)',
                   color: 'var(--color-accent-primary)',
                   cursor: 'pointer',
                   fontSize: 12,
                   padding: '4px 8px',
                   borderRadius: 4
                 }}
               >
                 {techSortOrder === 'desc' ? '↓ Desc' : '↑ Asc'}
               </button>
             </div>
             <div style={{ 
               maxHeight: 200, 
               overflowY: 'auto',
               padding: '0 16px 16px 16px',
               scrollbarWidth: 'thin',
               scrollbarColor: 'var(--color-border-divider) transparent'
             }}>
               {(() => {
                 const techCounts = filteredData.reduce((acc, item) => {
                   if (item.tech) {
                     acc[item.tech] = (acc[item.tech] || 0) + 1;
                   }
                   return acc;
                 }, {} as Record<string, number>);

                 const totalTechs = Object.values(techCounts).reduce((sum, count) => sum + count, 0);
                 const sortedTechs = Object.entries(techCounts)
                   .sort(([,a], [,b]) => techSortOrder === 'desc' ? b - a : a - b);

                 return sortedTechs.map(([tech, count], index) => {
                   const percentage = totalTechs > 0 ? ((count / totalTechs) * 100).toFixed(1) : '0.0';
                   return (
                     <div key={tech} style={{
                       display: 'flex',
                       justifyContent: 'space-between',
                       alignItems: 'center',
                       padding: '8px 0',
                       borderBottom: index < sortedTechs.length - 1 ? '1px solid var(--color-border-divider)' : 'none'
                     }}>
                       <span style={{ color: 'var(--color-text-primary)', fontSize: 13 }}>
                         {tech}
                       </span>
                       <div style={{ 
                         display: 'flex',
                         alignItems: 'center',
                         gap: '8px'
                       }}>
                         <span style={{ 
                           color: 'var(--color-accent-primary)', 
                           fontWeight: 600, 
                           fontSize: 13,
                           background: 'var(--color-background-primary)',
                           padding: '4px 10px',
                           borderRadius: 16,
                           minWidth: 35,
                           textAlign: 'center',
                           boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                         }}>
                           {count}
                         </span>
                         <span style={{ 
                           color: 'var(--color-text-secondary)', 
                           fontSize: 12,
                           fontWeight: 500,
                           background: 'var(--color-background-primary)',
                           padding: '2px 6px',
                           borderRadius: 8,
                           border: '1px solid var(--color-border-divider)'
                         }}>
                           {percentage}%
                         </span>
                       </div>
                     </div>
                   );
                 });
               })()}
             </div>
           </div>
         )}
     </>
   );
 }
