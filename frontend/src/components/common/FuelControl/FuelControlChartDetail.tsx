import React, { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import wexLogo from '../../../assets/wex_logo.png';
import samsaraLogo from '../../../assets/samsara_logo.png';
import dayjs from 'dayjs';
import type { SamsaraEvent, WexTransaction, EmployeeName } from '../../../types/fuelControl';
import { getDriverColorManager } from '../../../utils/driverColorManager';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

// Registrar plugin customizado para badges dos motoristas
ChartJS.register({
  id: 'driverBadgePlugin',
  afterDraw: (chart: any) => {
    const ctx = chart.ctx;
    
    // Verificar se é um gráfico válido
    if (!chart.data || !chart.data.datasets || chart.data.datasets.length === 0) return;
    
    // Verificar se é um gráfico com datasets que têm labels (não é um gráfico simples)
    const firstDataset = chart.data.datasets[0];
    if (!firstDataset || !firstDataset.label) return;
    
    // Verificar se é um gráfico de motoristas (deve ter múltiplos datasets com nomes de motoristas)
    if (chart.data.datasets.length === 1 && firstDataset.label === 'Miles per Gallon') return; // Primeiro gráfico Samsara
    if (chart.data.datasets.length === 1 && firstDataset.label === 'Idle Consumption Impact (%)') return; // Segundo gráfico Samsara
    
    // Mostrar badges apenas se alguns motoristas estiverem selecionados (não todos)
    const allDrivers = new Set(chart.data.datasets.map((ds: any) => ds.label));
    const selectedDrivers = chart.options?.selectedDrivers || [];
    
    // Mostrar badges apenas se alguns motoristas estiverem selecionados (não todos e não nenhum)
    if (!selectedDrivers || selectedDrivers.length === 0 || selectedDrivers.length >= Array.from(allDrivers).length) {
      return; // Não mostrar badges se todos estiverem selecionados ou se nenhum estiver selecionado
    }
    
    // Encontrar o último ponto de cada linha para posicionar as badges
    chart.data.datasets.forEach((dataset: any, datasetIndex: number) => {
      const driverName = dataset.label;
      if (!driverName) return; // Pular se não tiver label
      
      const isDriverSelected = selectedDrivers.some((selectedDriver: string) => 
        selectedDriver.toLowerCase() === driverName.toLowerCase()
      );
      
      if (!isDriverSelected) return; // Apenas mostrar badges para motoristas selecionados
      
      const meta = chart.getDatasetMeta(datasetIndex);
      if (!meta || !meta.data || meta.data.length === 0) return;
      
      // Pegar o último ponto da linha
      const lastPoint = meta.data[meta.data.length - 1];
      if (!lastPoint) return;
      
      const x = lastPoint.x;
      const y = lastPoint.y;
      
      // Configurar estilo da badge
      ctx.save();
      ctx.font = '12px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      
      // Medir o texto para criar o fundo
      const textMetrics = ctx.measureText(driverName);
      const textWidth = textMetrics.width;
      const textHeight = 12;
      const padding = 6;
      
      // Calcular posição da badge
      let badgeX = x;
      let badgeY = y - textHeight - padding - 20;
      
      // Verificar se a badge ultrapassa os limites do canvas
      const chartArea = chart.chartArea;
      if (!chartArea) return;
      
      const badgeLeft = badgeX - (textWidth / 2) - padding;
      const badgeRight = badgeX + (textWidth / 2) + padding;
      const badgeTop = badgeY;
      const badgeBottom = badgeY + textHeight + (padding * 2);
      
      // Ajustar posição horizontal se necessário
      if (badgeLeft < chartArea.left) {
        badgeX = chartArea.left + (textWidth / 2) + padding;
      } else if (badgeRight > chartArea.right) {
        badgeX = chartArea.right - (textWidth / 2) - padding;
      }
      
      // Ajustar posição vertical se necessário
      if (badgeTop < chartArea.top) {
        badgeY = chartArea.top + textHeight + padding;
      } else if (badgeBottom > chartArea.bottom) {
        badgeY = chartArea.bottom - padding;
      }
      
      // Verificar se a cor da borda existe
      const borderColor = dataset.borderColor;
      if (!borderColor || typeof borderColor !== 'string') return;
      
      // Desenhar fundo da badge com border radius
      ctx.save();
      ctx.fillStyle = borderColor;
      
      // Criar path com border radius
      const radius = 4;
      const badgeWidth = textWidth + (padding * 2);
      const badgeHeight = textHeight + (padding * 2);
      
      ctx.beginPath();
      ctx.moveTo(badgeX - (badgeWidth / 2) + radius, badgeY);
      ctx.lineTo(badgeX + (badgeWidth / 2) - radius, badgeY);
      ctx.quadraticCurveTo(badgeX + (badgeWidth / 2), badgeY, badgeX + (badgeWidth / 2), badgeY + radius);
      ctx.lineTo(badgeX + (badgeWidth / 2), badgeY + badgeHeight - radius);
      ctx.quadraticCurveTo(badgeX + (badgeWidth / 2), badgeY + badgeHeight, badgeX + (badgeWidth / 2) - radius, badgeY + badgeHeight);
      ctx.lineTo(badgeX - (badgeWidth / 2) + radius, badgeY + badgeHeight);
      ctx.quadraticCurveTo(badgeX - (badgeWidth / 2), badgeY + badgeHeight, badgeX - (badgeWidth / 2), badgeY + badgeHeight - radius);
      ctx.lineTo(badgeX - (badgeWidth / 2), badgeY + radius);
      ctx.quadraticCurveTo(badgeX - (badgeWidth / 2), badgeY, badgeX - (badgeWidth / 2) + radius, badgeY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      
      // Desenhar texto da badge
      ctx.fillStyle = '#ffffff';
      ctx.fillText(driverName, badgeX, badgeY + textHeight + padding);
      
      ctx.restore();
    });
  }
});

interface FuelControlChartDetailProps {
  filteredWex?: WexTransaction[];
  filteredSamsara?: SamsaraEvent[];
  selectedYear: string;
  selectedMonth: string;
  selectedDrivers: string[];
  driverNames: EmployeeName[];
}

const FuelControlChartDetail: React.FC<FuelControlChartDetailProps> = ({
  filteredWex = [],
  filteredSamsara = [],
  selectedYear,
  selectedMonth,
  selectedDrivers,
  driverNames
}) => {
  // Função para normalizar nomes de motoristas
  const normalizeName = React.useCallback((name: string): string => {
    if (!name || !driverNames || driverNames.length === 0) return name || '';
    const found = driverNames.find(d => d.wex_name === name || d.samsara_name === name);
    if (found) return found.normalized_name;
    return name;
  }, [driverNames]);

         // Dados para o primeiro gráfico: Performance por galão (Samsara)
       const performancePerGallonData = useMemo(() => {
         if (!filteredSamsara || !filteredSamsara.length) return null;
 
         const shouldGroupByMonth = !selectedMonth;
         
         if (shouldGroupByMonth) {
           // Agrupar por MÊS
           const monthlyDriverData = new Map<string, Map<string, { miles: number; gallons: number }>>();
           
           filteredSamsara.forEach(event => {
             if (event.type !== 'trip') return; // Apenas viagens para calcular milhas
             
             const dateOnly = event.event_date.split('T')[0];
             const dateParts = dateOnly.split('-');
             const year = dateParts[0];
             const month = dateParts[1];
             
             if (selectedYear && year !== selectedYear) return;
             
             const monthKey = `${year}-${month}`;
             const driverName = normalizeName(event.nome as unknown as string);
             
             if (!monthlyDriverData.has(monthKey)) {
               monthlyDriverData.set(monthKey, new Map());
             }
             
             const monthData = monthlyDriverData.get(monthKey)!;
             if (!monthData.has(driverName)) {
               monthData.set(driverName, { miles: 0, gallons: 0 });
             }
             
             const driverData = monthData.get(driverName)!;
             driverData.miles += event.distancia;
             driverData.gallons += event.units;
           });
 
           const sortedMonths = Array.from(monthlyDriverData.keys()).sort();
           let fullMonths = sortedMonths;
           
           if (!selectedYear && sortedMonths.length > 0) {
             const start = dayjs(`${sortedMonths[0]}-01`);
             const end = dayjs(`${sortedMonths[sortedMonths.length - 1]}-01`);
             const range: string[] = [];
             for (let d = start; d.isBefore(end) || d.isSame(end); d = d.add(1, 'month')) {
               range.push(d.format('YYYY-MM'));
             }
             fullMonths = range;
           }
 
           const allDrivers = new Set<string>();
           monthlyDriverData.forEach(monthData => {
             monthData.forEach((_, driver) => allDrivers.add(driver));
           });
 
           const datasets = Array.from(allDrivers).map((driver) => {
             const allDriversSelected = selectedDrivers.length === 0 || selectedDrivers.length === Array.from(allDrivers).length;
             const isDriverSelected = !allDriversSelected && selectedDrivers.some(selectedDriver => 
               selectedDriver.toLowerCase() === driver.toLowerCase()
             );
        
        const colorManager = getDriverColorManager();
        const baseColor = colorManager.getDriverColor(driver);
        
        let color: string;
        let borderWidth: number;
        let pointRadius: number;
        let pointHoverRadius: number;
        
        if (isDriverSelected) {
          color = baseColor;
          borderWidth = 3;
          pointRadius = 4;
          pointHoverRadius = 6;
        } else {
          color = colorManager.getDriverColorWithOpacity(driver, 0.3);
          borderWidth = 1;
          pointRadius = 2;
          pointHoverRadius = 4;
        }
       
        return {
          label: driver,
          data: fullMonths.map(monthKey => {
            const monthData = monthlyDriverData.get(monthKey);
            if (!monthData || !monthData.has(driver)) return 0;
            const driverData = monthData.get(driver)!;
            if (driverData.gallons === 0) return 0;
            return Math.round((driverData.miles / driverData.gallons) * 100) / 100;
          }),
          borderColor: color,
          backgroundColor: color,
          pointRadius: pointRadius,
          pointHoverRadius: pointHoverRadius,
          borderWidth: borderWidth,
          fill: false,
          tension: 0.25,
        };
      });
      
      return {
        labels: fullMonths.map(monthKey => {
          const [, month] = monthKey.split('-');
          return selectedYear ? month : monthKey;
        }),
        datasets
      };
         } else {
       // Agrupar por DIA
       const dailyDriverData = new Map<string, Map<string, { miles: number; gallons: number }>>();
       
       filteredSamsara.forEach(event => {
         if (event.type !== 'trip') return;
         
         const dateOnly = event.event_date.split('T')[0];
         const dateParts = dateOnly.split('-');
         const year = dateParts[0];
         const month = dateParts[1];
         const day = dateParts[2];
         
         if (selectedYear && year !== selectedYear) return;
         
         const dateKey = `${year}-${month}-${day}`;
         const driverName = normalizeName(event.nome as unknown as string);
         
         if (!dailyDriverData.has(dateKey)) {
           dailyDriverData.set(dateKey, new Map());
         }
         
         const dayData = dailyDriverData.get(dateKey)!;
         if (!dayData.has(driverName)) {
           dayData.set(driverName, { miles: 0, gallons: 0 });
         }
         
         const driverData = dayData.get(driverName)!;
         driverData.miles += event.distancia;
         driverData.gallons += event.units;
       });

       const sortedDates = Array.from(dailyDriverData.keys()).sort((a, b) => a.localeCompare(b));

       const allDrivers = new Set<string>();
       dailyDriverData.forEach(dayData => {
         dayData.forEach((_, driver) => allDrivers.add(driver));
       });

       const datasets = Array.from(allDrivers).map((driver) => {
         const allDriversSelected = selectedDrivers.length === 0 || selectedDrivers.length === Array.from(allDrivers).length;
         const isDriverSelected = !allDriversSelected && selectedDrivers.some(selectedDriver => 
           selectedDriver.toLowerCase() === driver.toLowerCase()
         );
         
         const colorManager = getDriverColorManager();
         const baseColor = colorManager.getDriverColor(driver);
         
         let color: string;
         let borderWidth: number;
         let pointRadius: number;
         let pointHoverRadius: number;
         
         if (isDriverSelected) {
           color = baseColor;
           borderWidth = 3;
           pointRadius = 4;
           pointHoverRadius = 6;
         } else {
           color = colorManager.getDriverColorWithOpacity(driver, 0.3);
           borderWidth = 1;
           pointRadius = 2;
           pointHoverRadius = 4;
         }
         
         return {
           label: driver,
           data: sortedDates.map(dateKey => {
             const dayData = dailyDriverData.get(dateKey);
             if (!dayData || !dayData.has(driver)) return 0;
             const driverData = dayData.get(driver)!;
             if (driverData.gallons === 0) return 0;
             return Math.round((driverData.miles / driverData.gallons) * 100) / 100;
           }),
           borderColor: color,
           backgroundColor: color,
           pointRadius: pointRadius,
           pointHoverRadius: pointHoverRadius,
           borderWidth: borderWidth,
           fill: false,
           tension: 0.25,
         };
       });
      
      return {
        labels: sortedDates.map(date => {
          const [, , day] = date.split('-');
          return day;
        }),
        datasets
      };
    }
  }, [filteredSamsara, selectedMonth, selectedYear, selectedDrivers, normalizeName]);

         // Dados para o segundo gráfico: Idle consumption impact (Samsara)
       const idleConsumptionData = useMemo(() => {
         if (!filteredSamsara || !filteredSamsara.length) return null;
 
         const shouldGroupByMonth = !selectedMonth;
         
         if (shouldGroupByMonth) {
           // Agrupar por MÊS
           const monthlyDriverData = new Map<string, Map<string, { idleGallons: number; totalGallons: number }>>();
           
           filteredSamsara.forEach(event => {
             const dateOnly = event.event_date.split('T')[0];
             const dateParts = dateOnly.split('-');
             const year = dateParts[0];
             const month = dateParts[1];
             
             if (selectedYear && year !== selectedYear) return;
             
             const monthKey = `${year}-${month}`;
             const driverName = normalizeName(event.nome as unknown as string);
             
             if (!monthlyDriverData.has(monthKey)) {
               monthlyDriverData.set(monthKey, new Map());
             }
             
             const monthData = monthlyDriverData.get(monthKey)!;
             if (!monthData.has(driverName)) {
               monthData.set(driverName, { idleGallons: 0, totalGallons: 0 });
             }
             
             const driverData = monthData.get(driverName)!;
             driverData.totalGallons += event.units;
             
             if (event.type === 'idle') {
               driverData.idleGallons += event.units;
             }
           });
 
           const sortedMonths = Array.from(monthlyDriverData.keys()).sort();
           let fullMonths = sortedMonths;
           
           if (!selectedYear && sortedMonths.length > 0) {
             const start = dayjs(`${sortedMonths[0]}-01`);
             const end = dayjs(`${sortedMonths[sortedMonths.length - 1]}-01`);
             const range: string[] = [];
             for (let d = start; d.isBefore(end) || d.isSame(end); d = d.add(1, 'month')) {
               range.push(d.format('YYYY-MM'));
             }
             fullMonths = range;
           }
 
           const allDrivers = new Set<string>();
           monthlyDriverData.forEach(monthData => {
             monthData.forEach((_, driver) => allDrivers.add(driver));
           });
 
           const datasets = Array.from(allDrivers).map((driver) => {
             const allDriversSelected = selectedDrivers.length === 0 || selectedDrivers.length === Array.from(allDrivers).length;
             const isDriverSelected = !allDriversSelected && selectedDrivers.some(selectedDriver => 
               selectedDriver.toLowerCase() === driver.toLowerCase()
             );
        
        const colorManager = getDriverColorManager();
        const baseColor = colorManager.getDriverColor(driver);
        
        let color: string;
        let borderWidth: number;
        let pointRadius: number;
        let pointHoverRadius: number;
        
        if (isDriverSelected) {
          color = baseColor;
          borderWidth = 3;
          pointRadius = 4;
          pointHoverRadius = 6;
        } else {
          color = colorManager.getDriverColorWithOpacity(driver, 0.3);
          borderWidth = 1;
          pointRadius = 2;
          pointHoverRadius = 4;
        }
       
        return {
          label: driver,
          data: fullMonths.map(monthKey => {
            const monthData = monthlyDriverData.get(monthKey);
            if (!monthData || !monthData.has(driver)) return 0;
            const driverData = monthData.get(driver);
            if (!driverData || driverData.totalGallons === 0) return 0;
            return Math.round((driverData.idleGallons / driverData.totalGallons) * 100 * 100) / 100;
          }),
          borderColor: color,
          backgroundColor: color,
          pointRadius: pointRadius,
          pointHoverRadius: pointHoverRadius,
          borderWidth: borderWidth,
          fill: false,
          tension: 0.25,
        };
      });
      
      return {
        labels: fullMonths.map(monthKey => {
          const [, month] = monthKey.split('-');
          return selectedYear ? month : monthKey;
        }),
        datasets
      };
    } else {
      // Agrupar por DIA
      const dailyDriverData = new Map<string, Map<string, { idleGallons: number; totalGallons: number }>>();
      
      filteredSamsara.forEach(event => {
        const dateOnly = event.event_date.split('T')[0];
        const dateParts = dateOnly.split('-');
        const year = dateParts[0];
        const month = dateParts[1];
        const day = dateParts[2];
        
        if (selectedYear && year !== selectedYear) return;
        
        const dateKey = `${year}-${month}-${day}`;
        const driverName = normalizeName(event.nome as unknown as string);
        
        if (!dailyDriverData.has(dateKey)) {
          dailyDriverData.set(dateKey, new Map());
        }
        
        const dayData = dailyDriverData.get(dateKey)!;
        if (!dayData.has(driverName)) {
          dayData.set(driverName, { idleGallons: 0, totalGallons: 0 });
        }
        
        const driverData = dayData.get(driverName)!;
        driverData.totalGallons += event.units;
        
        if (event.type === 'idle') {
          driverData.idleGallons += event.units;
        }
      });

      const sortedDates = Array.from(dailyDriverData.keys()).sort((a, b) => a.localeCompare(b));

      const allDrivers = new Set<string>();
      dailyDriverData.forEach(dayData => {
        dayData.forEach((_, driver) => allDrivers.add(driver));
      });

              const datasets = Array.from(allDrivers).map((driver) => {
          const allDriversSelected = selectedDrivers.length === 0 || selectedDrivers.length === Array.from(allDrivers).length;
          const isDriverSelected = !allDriversSelected && selectedDrivers.some(selectedDriver => 
            selectedDriver.toLowerCase() === driver.toLowerCase()
          );
          
          const colorManager = getDriverColorManager();
          const baseColor = colorManager.getDriverColor(driver);
          
          let color: string;
          let borderWidth: number;
          let pointRadius: number;
          let pointHoverRadius: number;
          
          if (isDriverSelected) {
            color = baseColor;
            borderWidth = 3;
            pointRadius = 4;
            pointHoverRadius = 6;
          } else {
            color = colorManager.getDriverColorWithOpacity(driver, 0.3);
            borderWidth = 1;
            pointRadius = 2;
            pointHoverRadius = 4;
          }
          
          return {
            label: driver,
            data: sortedDates.map(dateKey => {
              const dayData = dailyDriverData.get(dateKey);
              if (!dayData || !dayData.has(driver)) return 0;
              const driverData = dayData.get(driver);
              if (!driverData || driverData.totalGallons === 0) return 0;
              return Math.round((driverData.idleGallons / driverData.totalGallons) * 100 * 100) / 100;
            }),
            borderColor: color,
            backgroundColor: color,
            pointRadius: pointRadius,
            pointHoverRadius: pointHoverRadius,
            borderWidth: borderWidth,
            fill: false,
            tension: 0.25,
          };
        });
      
      return {
        labels: sortedDates.map(date => {
          const [, , day] = date.split('-');
          return day;
        }),
        datasets
      };
    }
  }, [filteredSamsara, selectedMonth, selectedYear, selectedDrivers, normalizeName]);

         // Dados para o terceiro gráfico: Consumo por motorista (igual ao segundo do principal)
       const driverConsumptionData = useMemo(() => {
         if (!filteredWex || !filteredWex.length) return null;
 
         const shouldGroupByMonth = !selectedMonth;
         
         if (shouldGroupByMonth) {
           // Agrupar por MÊS
           const monthlyDriverData = new Map<string, Map<string, number>>();
           
           filteredWex.forEach(transaction => {
             const dateOnly = transaction.transaction_date.split('T')[0];
             const dateParts = dateOnly.split('-');
             const year = dateParts[0];
             const month = dateParts[1];
             
             if (selectedYear && year !== selectedYear) return;
             
             const monthKey = `${year}-${month}`;
             const driverName = normalizeName(transaction.nome as unknown as string);
             
             if (!monthlyDriverData.has(monthKey)) {
               monthlyDriverData.set(monthKey, new Map());
             }
             
             const monthData = monthlyDriverData.get(monthKey)!;
             monthData.set(driverName, (monthData.get(driverName) || 0) + transaction.valor);
           });
 
           const sortedMonths = Array.from(monthlyDriverData.keys()).sort();
           let fullMonths = sortedMonths;
           
           if (!selectedYear && sortedMonths.length > 0) {
             const start = dayjs(`${sortedMonths[0]}-01`);
             const end = dayjs(`${sortedMonths[sortedMonths.length - 1]}-01`);
             const range: string[] = [];
             for (let d = start; d.isBefore(end) || d.isSame(end); d = d.add(1, 'month')) {
               range.push(d.format('YYYY-MM'));
             }
             fullMonths = range;
           }
 
           const allDrivers = new Set<string>();
           monthlyDriverData.forEach(monthData => {
             monthData.forEach((_, driver) => allDrivers.add(driver));
           });
 
           const datasets = Array.from(allDrivers).map((driver) => {
             const allDriversSelected = selectedDrivers.length === 0 || selectedDrivers.length === Array.from(allDrivers).length;
             const isDriverSelected = !allDriversSelected && selectedDrivers.some(selectedDriver => 
               selectedDriver.toLowerCase() === driver.toLowerCase()
             );
        
        const colorManager = getDriverColorManager();
        const baseColor = colorManager.getDriverColor(driver);
        
        let color: string;
        let borderWidth: number;
        let pointRadius: number;
        let pointHoverRadius: number;
        
        if (isDriverSelected) {
          color = baseColor;
          borderWidth = 3;
          pointRadius = 4;
          pointHoverRadius = 6;
        } else {
          color = colorManager.getDriverColorWithOpacity(driver, 0.3);
          borderWidth = 1;
          pointRadius = 2;
          pointHoverRadius = 4;
        }
       
        return {
          label: driver,
          data: fullMonths.map(monthKey => {
            const monthData = monthlyDriverData.get(monthKey);
            return monthData ? Math.round((monthData.get(driver) || 0) * 100) / 100 : 0;
          }),
          borderColor: color,
          backgroundColor: color,
          pointRadius: pointRadius,
          pointHoverRadius: pointHoverRadius,
          borderWidth: borderWidth,
          fill: false,
          tension: 0.25,
        };
      });
      
      return {
        labels: fullMonths.map(monthKey => {
          const [, month] = monthKey.split('-');
          return selectedYear ? month : monthKey;
        }),
        datasets
      };
    } else {
      // Agrupar por DIA
      const dailyDriverData = new Map<string, Map<string, number>>();
      
      filteredWex.forEach(transaction => {
        const dateOnly = transaction.transaction_date.split('T')[0];
        const dateParts = dateOnly.split('-');
        const year = dateParts[0];
        const month = dateParts[1];
        const day = dateParts[2];
        
        if (selectedYear && year !== selectedYear) return;
        
        const dateKey = `${year}-${month}-${day}`;
        const driverName = normalizeName(transaction.nome as unknown as string);
        
        if (!dailyDriverData.has(dateKey)) {
          dailyDriverData.set(dateKey, new Map());
        }
        
        const dayData = dailyDriverData.get(dateKey)!;
        dayData.set(driverName, (dayData.get(driverName) || 0) + transaction.valor);
      });

      const sortedDates = Array.from(dailyDriverData.keys()).sort((a, b) => a.localeCompare(b));

      const allDrivers = new Set<string>();
      dailyDriverData.forEach(dayData => {
        dayData.forEach((_, driver) => allDrivers.add(driver));
      });

              const datasets = Array.from(allDrivers).map((driver) => {
          const allDriversSelected = selectedDrivers.length === 0 || selectedDrivers.length === Array.from(allDrivers).length;
          const isDriverSelected = !allDriversSelected && selectedDrivers.some(selectedDriver => 
            selectedDriver.toLowerCase() === driver.toLowerCase()
          );
          
          const colorManager = getDriverColorManager();
          const baseColor = colorManager.getDriverColor(driver);
          
          let color: string;
          let borderWidth: number;
          let pointRadius: number;
          let pointHoverRadius: number;
          
          if (isDriverSelected) {
            color = baseColor;
            borderWidth = 3;
            pointRadius = 4;
            pointHoverRadius = 6;
          } else {
            color = colorManager.getDriverColorWithOpacity(driver, 0.3);
            borderWidth = 1;
            pointRadius = 2;
            pointHoverRadius = 4;
          }
          
          return {
            label: driver,
            data: sortedDates.map(dateKey => {
              const dayData = dailyDriverData.get(dateKey);
              return dayData ? Math.round((dayData.get(driver) || 0) * 100) / 100 : 0;
            }),
            borderColor: color,
            backgroundColor: color,
            pointRadius: pointRadius,
            pointHoverRadius: pointHoverRadius,
            borderWidth: borderWidth,
            fill: false,
            tension: 0.25,
          };
        });
      
      return {
        labels: sortedDates.map(date => {
          const [, , day] = date.split('-');
          return day;
        }),
        datasets
      };
    }
  }, [filteredWex, selectedMonth, selectedYear, normalizeName, selectedDrivers]);

  // Opções comuns para os gráficos
  const commonChartOptions = useMemo(() => {
    let borderDivider = '#e0e0e0';
    try {
      if (typeof document !== 'undefined' && document.documentElement) {
        borderDivider = getComputedStyle(document.documentElement).getPropertyValue('--color-border-divider').trim() || '#e0e0e0';
      }
    } catch {
      // noop
    }

    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true }
      },
      scales: {
        x: {
          grid: { color: borderDivider },
          ticks: {
            color: '#6c757d',
            maxRotation: 45,
            minRotation: 0,
            autoSkip: true,
            maxTicksLimit: selectedMonth ? 15 : 12,
          }
        },
        y: {
          type: 'linear' as const,
          display: true,
          position: 'left' as const,
          grid: { color: borderDivider },
          ticks: { color: '#6c757d' },
          beginAtZero: true,
          title: {
            display: true,
            text: 'Value',
            color: '#6c757d',
            font: { weight: 600, size: 12 },
            padding: { top: 10, bottom: 10 },
          },
        },
      },
      layout: { padding: { top: 40, bottom: 20, left: 10, right: 10 } }, // Aumentar padding top para as badges
      // Passar selectedDrivers para o plugin global
      selectedDrivers: selectedDrivers
    };
  }, [selectedYear, selectedMonth, selectedDrivers]);

  return (
    <>
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'row', minHeight: 0 }}>
        {/* Primeiro gráfico: Performance por galão (Samsara) - 33% da largura */}
        <div style={{ 
          flex: 1, 
          minWidth: 0,
          background: 'var(--color-background-primary)',
          padding: '6px',
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid var(--color-border-divider)'
        }}>
          <h5 className='mx-3 my-1 d-flex justify-content-between align-items-center' style={{ color: 'var(--color-text-secondary)', fontSize: 16, fontWeight: 400, minHeight: 30 }}>
            <div style={{ display: 'flex', gap: 6}}>
              <span style={{ fontWeight: 600}}>SAMSARA</span><span>Performance per Gallon</span>
            </div>
            <img src={samsaraLogo} alt="Samsara Logo" style={{ height: '25px', width: 'auto' }} onError={(e) => console.error('Erro ao carregar logo Samsara:', e)} onLoad={() => console.log('Logo Samsara carregada com sucesso:', samsaraLogo)} />
          </h5>
          <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            {performancePerGallonData ? (
              <Line data={performancePerGallonData} options={commonChartOptions} />
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  textAlign: 'center',
                  padding: '16px'
                }}>
                  <div style={{ 
                    fontSize: 36, 
                    color: 'var(--color-text-secondary)',
                    opacity: 0.5,
                    marginBottom: 12
                  }}>
                    <i className="bi bi-speedometer2"></i>
                  </div>
                  <div style={{ 
                    fontSize: 16, 
                    fontWeight: 500, 
                    color: 'var(--color-text-secondary)',
                    marginBottom: 4
                  }}>
                    Sem dados de performance
                  </div>
                  <div style={{ 
                    fontSize: 12, 
                    color: 'var(--color-text-secondary)',
                    opacity: 0.8,
                    maxWidth: 200
                  }}>
                    Nenhum evento Samsara encontrado
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Segundo gráfico: Idle consumption impact (Samsara) - 33% da largura */}
        <div style={{ 
          flex: 1, 
          minWidth: 0,
          background: 'var(--color-background-primary)',
          padding: '6px',
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid var(--color-border-divider)'
        }}>
          <h5 className='mx-3 my-1 d-flex justify-content-between align-items-center' style={{ color: 'var(--color-text-secondary)', fontSize: 16, fontWeight: 400, minHeight: 30 }}>
            <div style={{ display: 'flex', gap: 6}}>
              <span style={{ fontWeight: 600}}>SAMSARA</span><span>Idle Consumption Impact</span>
            </div>
            <img src={samsaraLogo} alt="Samsara Logo" style={{ height: '25px', width: 'auto' }} onError={(e) => console.error('Erro ao carregar logo Samsara:', e)} onLoad={() => console.log('Logo Samsara carregada com sucesso:', samsaraLogo)} />
          </h5>
          <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            {idleConsumptionData ? (
              <Line data={idleConsumptionData} options={commonChartOptions} />
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  textAlign: 'center',
                  padding: '16px'
                }}>
                  <div style={{ 
                    fontSize: 36, 
                    color: 'var(--color-text-secondary)',
                    opacity: 0.5,
                    marginBottom: 12
                  }}>
                    <i className="bi bi-pause-circle"></i>
                  </div>
                  <div style={{ 
                    fontSize: 16, 
                    fontWeight: 500, 
                    color: 'var(--color-text-secondary)',
                    marginBottom: 4
                  }}>
                    Sem dados de idle
                  </div>
                  <div style={{ 
                    fontSize: 12, 
                    color: 'var(--color-text-secondary)',
                    opacity: 0.8,
                    maxWidth: 200
                  }}>
                    Nenhum evento Samsara encontrado
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Terceiro gráfico: Consumo por motorista (WEX) - 33% da largura */}
        <div style={{ 
          flex: 1, 
          minWidth: 0,
          background: 'var(--color-background-primary)',
          padding: '6px',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <h5 className='mx-3 my-1 d-flex justify-content-between align-items-center' style={{ color: 'var(--color-text-secondary)', fontSize: 16, fontWeight: 400, minHeight: 30 }}>
            <div style={{ display: 'flex', gap: 6}}>
              <span style={{ fontWeight: 600}}>WEX</span><span>Cost by Driver</span>
            </div>
            <img src={wexLogo} alt="WEX Logo" style={{ height: '25px', width: 'auto' }} />
          </h5>
          <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            {driverConsumptionData ? (
              <Line data={driverConsumptionData} options={commonChartOptions} />
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  textAlign: 'center',
                  padding: '16px'
                }}>
                  <div style={{ 
                    fontSize: 36, 
                    color: 'var(--color-text-secondary)',
                    opacity: 0.5,
                    marginBottom: 12
                  }}>
                    <i className="bi bi-people"></i>
                  </div>
                  <div style={{ 
                    fontSize: 16, 
                    fontWeight: 500, 
                    color: 'var(--color-text-secondary)',
                    marginBottom: 4
                  }}>
                    Sem dados por motorista
                  </div>
                  <div style={{ 
                    fontSize: 12, 
                    color: 'var(--color-text-secondary)',
                    opacity: 0.8,
                    maxWidth: 200
                  }}>
                    Nenhuma transação WEX encontrada
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default FuelControlChartDetail;
