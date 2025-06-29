import { useMemo } from 'react';
import type { AccountingData, ChartData } from '../types/accounting';
import type { TimesheetRow, TimesheetChartData } from '../types/timesheet';

export function useAccountingChartData(data: AccountingData[], selectedYear: number, selectedMonth: number) {
  const chartData = useMemo((): ChartData => {
    if (!data.length) {
      return {
        labels: [],
        datasets: []
      };
    }

    const filteredData = data.filter(item => {
      const itemDate = new Date(item.date);
      return itemDate.getFullYear() === selectedYear && itemDate.getMonth() + 1 === selectedMonth;
    });

    const labels = filteredData.map(item => {
      const date = new Date(item.date);
      return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    });

    const receivablesData = filteredData.map(item => item.receivables);
    const payablesData = filteredData.map(item => item.payables);
    const cashFlowData = filteredData.map(item => item.cash_flow);

    return {
      labels,
      datasets: [
        {
          label: 'Recebíveis',
          data: receivablesData,
          borderColor: '#28a745',
          backgroundColor: 'rgba(40, 167, 69, 0.1)',
          tension: 0.4
        },
        {
          label: 'Pagáveis',
          data: payablesData,
          borderColor: '#dc3545',
          backgroundColor: 'rgba(220, 53, 69, 0.1)',
          tension: 0.4
        },
        {
          label: 'Fluxo de Caixa',
          data: cashFlowData,
          borderColor: '#007bff',
          backgroundColor: 'rgba(0, 123, 255, 0.1)',
          tension: 0.4
        }
      ]
    };
  }, [data, selectedYear, selectedMonth]);

  return chartData;
}

export function useTimesheetChartData(data: TimesheetRow[], selectedYear: number, selectedMonth: number) {
  const chartData = useMemo((): TimesheetChartData => {
    if (!data.length) {
      return {
        labels: [],
        datasets: []
      };
    }

    const filteredData = data.filter(item => {
      return Number(item.ano) === selectedYear && Number(item.mes) === selectedMonth;
    });

    const labels = filteredData.map(item => {
      const date = new Date(item.data);
      return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    });

    const horasTrabalhadasData = filteredData.map(item => item.horas_trabalhadas);
    const horasExtraData = filteredData.map(item => item.horas_extra);
    const horasAusenciaData = filteredData.map(item => item.horas_ausencia);

    return {
      labels,
      datasets: [
        {
          label: 'Horas Trabalhadas',
          data: horasTrabalhadasData,
          borderColor: '#28a745',
          backgroundColor: 'rgba(40, 167, 69, 0.1)',
          tension: 0.4
        },
        {
          label: 'Horas Extra',
          data: horasExtraData,
          borderColor: '#ffc107',
          backgroundColor: 'rgba(255, 193, 7, 0.1)',
          tension: 0.4
        },
        {
          label: 'Horas Ausência',
          data: horasAusenciaData,
          borderColor: '#dc3545',
          backgroundColor: 'rgba(220, 53, 69, 0.1)',
          tension: 0.4
        }
      ]
    };
  }, [data, selectedYear, selectedMonth]);

  return chartData;
} 