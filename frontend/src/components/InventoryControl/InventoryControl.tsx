import React, { useState, useMemo } from 'react';
import { usePremiumStorageData } from '../../hooks/usePremiumStorageData';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  BarChart, 
  Bar 
} from 'recharts';
import { format, parseISO, startOfYear, endOfYear, eachMonthOfInterval } from 'date-fns';
import InventoryControlFilters from './InventoryControlFilters';

export const InventoryControl: React.FC = () => {
  const { historicoSaldo, detalhesExcesso, gastosUsuario, loading, error } = usePremiumStorageData();
  
  // State for Filters
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);

  // Generate Year/Month options
  const years = useMemo(() => {
    const uniqueYears = new Set(historicoSaldo.map(h => format(parseISO(h.mes), 'yyyy')));
    return Array.from(uniqueYears).sort().reverse();
  }, [historicoSaldo]);

  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => format(new Date(2024, i, 1), 'MMMM'));
  }, []);

  // --- DATA PROCESSING ---

  // 1. Stock Adherence Month-by-Month (Service Level)
  const adherenceData = useMemo(() => {
    const grouped = new Map<string, { total: number, below: number }>();
    
    historicoSaldo.forEach(h => {
      const date = parseISO(h.mes);
      const year = format(date, 'yyyy');
      const monthName = format(date, 'MMMM');

      // Filter by Year if selected
      if (selectedYear && year !== selectedYear) return;

      const monthKey = format(date, 'yyyy-MM');
      if (!grouped.has(monthKey)) {
        grouped.set(monthKey, { total: 0, below: 0 });
      }
      const current = grouped.get(monthKey)!;
      current.total++;
      if (h.abaixo_minimo) current.below++;
    });

    return Array.from(grouped.entries())
      .map(([monthKey, data]) => ({
        fullDate: monthKey,
        displayDate: format(parseISO(monthKey + '-01'), 'MMM'),
        adherence: ((data.total - data.below) / data.total) * 100,
        total: data.total,
        below: data.below
      }))
      .sort((a, b) => a.fullDate.localeCompare(b.fullDate));
  }, [historicoSaldo, selectedYear]);

  // 2. Product Variation Data
  const productVariationData = useMemo(() => {
    if (!selectedProduct) return [];
    
    return historicoSaldo
      .filter(h => h.product_nome === selectedProduct)
      .filter(h => {
        const date = parseISO(h.mes);
        const year = format(date, 'yyyy');
        return !selectedYear || year === selectedYear;
      })
      .map(h => ({
        mes: format(parseISO(h.mes), 'MMM'),
        fullDate: h.mes,
        saldo: h.saldo_acumulado,
        minimo: h.saldo_minimo
      }))
      .sort((a, b) => a.fullDate.localeCompare(b.fullDate));
  }, [historicoSaldo, selectedProduct, selectedYear]);

  // Unique Products for Dropdown
  const uniqueProducts = useMemo(() => {
    return Array.from(new Set(historicoSaldo.map(h => h.product_nome))).sort();
  }, [historicoSaldo]);

  // 3. Excess Projects Data (Filtered)
  const filteredExcess = useMemo(() => {
    return detalhesExcesso
      .filter(d => {
        const date = parseISO(d.movement_date);
        const year = format(date, 'yyyy');
        const monthName = format(date, 'MMMM');
        
        if (selectedYear && year !== selectedYear) return false;
        if (selectedMonth && monthName !== selectedMonth) return false;
        return true;
      })
      .sort((a, b) => new Date(b.movement_date).getTime() - new Date(a.movement_date).getTime());
  }, [detalhesExcesso, selectedYear, selectedMonth]);

  // 4. Spending Data (Filtered)
  const spendingData = useMemo(() => {
    // Filter raw spending data first if possible, but 'gastosUsuario' might be pre-aggregated. 
    // Assuming 'gastosUsuario' is a summary, we might need to filter raw movements if we want time-based filtering here.
    // For now, let's use the provided view data but limit to top 10.
    return gastosUsuario
      .map(u => ({
        name: u.usuario_nome,
        value: u.valor_total_retirado,
        role: u.role
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [gastosUsuario]);

  // Current Metrics (based on latest available month or filtered selection)
  const latestAdherence = adherenceData.length > 0 ? adherenceData[adherenceData.length - 1].adherence : 100;
  const totalExcessCount = filteredExcess.length;
  
  if (loading) return <div className="p-4 text-center" style={{ color: 'var(--color-text-primary)' }}>Loading Inventory Data...</div>;
  if (error) return <div className="p-4 text-center text-red-600">Error loading data: {error}</div>;

  const cardStyle = {
    background: 'var(--color-background-primary)',
    border: '1px solid var(--color-border-divider)',
    color: 'var(--color-text-primary)'
  };

  const cardHeaderStyle = {
    background: 'var(--color-background-primary)',
    borderBottom: '1px solid var(--color-border-divider)',
    color: 'var(--color-text-primary)'
  };

  return (
    <div className="d-flex flex-column" style={{ height: '100%', overflowY: 'auto', background: 'var(--color-background-primary)' }}>
      {/* Header & Filters */}
      <div className="d-flex justify-content-between align-items-center p-3 sticky-top z-10" 
           style={{ background: 'var(--color-background-primary)', borderBottom: '1px solid var(--color-border-divider)' }}>
        <div className="d-flex align-items-center gap-3">
          <h2 className="m-0 fs-5 fw-bold" style={{ color: 'var(--color-text-primary)' }}>Inventory Control Index</h2>
          <InventoryControlFilters 
            selectedYear={selectedYear}
            setSelectedYear={setSelectedYear}
            selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth}
            years={years}
            months={months}
          />
        </div>
      </div>

      <div className="p-4 container-fluid">
        {/* KPI Cards Row */}
        <div className="row g-4 mb-4">
          <div className="col-md-4">
            <div className="card h-100 shadow-sm" style={cardStyle}>
              <div className="card-body">
                <h6 className="card-subtitle mb-2" style={{ color: 'var(--color-text-secondary)' }}>Stock Service Level (Adherence)</h6>
                <h2 className="card-title fw-bold" style={{ color: 'var(--color-accent-primary)' }}>{latestAdherence.toFixed(1)}%</h2>
                <p className="card-text small" style={{ color: 'var(--color-text-secondary)' }}>
                  Percentage of products above minimum stock level.
                </p>
              </div>
            </div>
          </div>
          <div className="col-md-4">
            <div className="card h-100 shadow-sm" style={cardStyle}>
              <div className="card-body">
                <h6 className="card-subtitle mb-2" style={{ color: 'var(--color-text-secondary)' }}>Projects Exceeding Limits</h6>
                <h2 className="card-title fw-bold text-danger">{totalExcessCount}</h2>
                <p className="card-text small" style={{ color: 'var(--color-text-secondary)' }}>
                  Number of withdrawals that exceeded the template limit in the selected period.
                </p>
              </div>
            </div>
          </div>
          <div className="col-md-4">
            <div className="card h-100 shadow-sm" style={cardStyle}>
              <div className="card-body">
                <h6 className="card-subtitle mb-2" style={{ color: 'var(--color-text-secondary)' }}>Total Excess Cost</h6>
                <h2 className="card-title fw-bold text-warning">
                  ${filteredExcess.reduce((acc, curr) => acc + (curr.quantidade_retirada * 10), 0).toFixed(2)}
                </h2>
                <p className="card-text small" style={{ color: 'var(--color-text-secondary)' }}>Estimated cost of excess withdrawals.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Chart Row 1: Adherence Over Time */}
        <div className="row mb-4">
          <div className="col-12">
            <div className="card shadow-sm" style={cardStyle}>
              <div className="card-header py-3" style={cardHeaderStyle}>
                <h5 className="m-0 fw-bold fs-6">Stock Adherence Evolution (Month by Month)</h5>
              </div>
              <div className="card-body" style={{ height: '350px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={adherenceData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border-divider)" />
                    <XAxis dataKey="displayDate" axisLine={false} tickLine={false} tick={{ fill: 'var(--color-text-secondary)' }} />
                    <YAxis domain={[0, 100]} axisLine={false} tickLine={false} unit="%" tick={{ fill: 'var(--color-text-secondary)' }} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: '1px solid var(--color-border-divider)', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}
                    />
                    <Legend wrapperStyle={{ color: 'var(--color-text-primary)' }} />
                    <Line 
                      type="monotone" 
                      dataKey="adherence" 
                      name="% Adherence" 
                      stroke="var(--color-accent-primary)" 
                      strokeWidth={3}
                      dot={{ r: 4, fill: 'var(--color-accent-primary)', strokeWidth: 2, stroke: '#fff' }}
                      activeDot={{ r: 6 }} 
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        {/* Chart Row 2: Product Variation */}
        <div className="row mb-4">
          <div className="col-12">
            <div className="card shadow-sm" style={cardStyle}>
              <div className="card-header py-3 d-flex justify-content-between align-items-center" style={cardHeaderStyle}>
                <h5 className="m-0 fw-bold fs-6">Product Stock Variation vs Minimum</h5>
                <div style={{ width: '250px' }}>
                  <select 
                    className="form-select form-select-sm"
                    value={selectedProduct || ''}
                    onChange={(e) => setSelectedProduct(e.target.value)}
                    style={{ background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', borderColor: 'var(--color-border-divider)' }}
                  >
                    <option value="">Select a product to view history...</option>
                    {uniqueProducts.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="card-body" style={{ height: '350px' }}>
                {selectedProduct ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={productVariationData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border-divider)" />
                      <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: 'var(--color-text-secondary)' }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--color-text-secondary)' }} />
                      <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid var(--color-border-divider)', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }} />
                      <Legend wrapperStyle={{ color: 'var(--color-text-primary)' }} />
                      <Line type="monotone" dataKey="saldo" name="Current Stock" stroke="#8884d8" strokeWidth={2} />
                      <Line type="step" dataKey="minimo" name="Minimum Required" stroke="#ff0000" strokeDasharray="5 5" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="d-flex align-items-center justify-content-center h-100" style={{ color: 'var(--color-text-secondary)' }}>
                    <div className="text-center">
                      <i className="bi bi-box-seam fs-1 mb-2 d-block"></i>
                      Select a product above to visualize its stock history
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Row 3: Split View - Excess Table & Spending Chart */}
        <div className="row g-4">
          {/* Left Column: Excess Details */}
          <div className="col-lg-7">
            <div className="card shadow-sm h-100" style={cardStyle}>
              <div className="card-header py-3" style={cardHeaderStyle}>
                <h5 className="m-0 fw-bold fs-6">Projects Exceeding Template Limits</h5>
              </div>
              <div className="card-body p-0">
                <div className="table-responsive" style={{ maxHeight: '400px' }}>
                  <table className="table table-hover align-middle mb-0" style={{ color: 'var(--color-text-primary)', backgroundColor: 'transparent' }}>
                    <thead className="sticky-top" style={{ background: 'var(--color-background-secondary)' }}>
                      <tr>
                        <th className="border-0 small fw-bold px-3 py-2" style={{ color: 'var(--color-text-secondary)', background: 'var(--color-background-secondary)' }}>Date</th>
                        <th className="border-0 small fw-bold px-3 py-2" style={{ color: 'var(--color-text-secondary)', background: 'var(--color-background-secondary)' }}>Project</th>
                        <th className="border-0 small fw-bold px-3 py-2" style={{ color: 'var(--color-text-secondary)', background: 'var(--color-background-secondary)' }}>Product</th>
                        <th className="border-0 small fw-bold px-3 py-2" style={{ color: 'var(--color-text-secondary)', background: 'var(--color-background-secondary)' }}>Resp.</th>
                        <th className="border-0 small fw-bold px-3 py-2 text-end" style={{ color: 'var(--color-text-secondary)', background: 'var(--color-background-secondary)' }}>Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredExcess.length > 0 ? (
                        filteredExcess.map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--color-border-divider)' }}>
                            <td className="px-3 py-2 small" style={{ color: 'var(--color-text-primary)', background: 'transparent' }}>{format(parseISO(item.movement_date), 'dd/MM/yyyy')}</td>
                            <td className="px-3 py-2 small fw-medium" style={{ color: 'var(--color-text-primary)', background: 'transparent' }}>{item.project_nome}</td>
                            <td className="px-3 py-2 small text-truncate" style={{ maxWidth: '150px', color: 'var(--color-text-primary)', background: 'transparent' }} title={item.product_nome}>{item.product_nome}</td>
                            <td className="px-3 py-2 small" style={{ color: 'var(--color-text-primary)', background: 'transparent' }}>{item.usuario_responsavel?.split(' ')[0]}</td>
                            <td className="px-3 py-2 small text-end fw-bold" style={{ color: 'var(--negative-color)', background: 'transparent' }}>{item.quantidade_retirada}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="text-center py-4" style={{ color: 'var(--color-text-secondary)', background: 'transparent' }}>
                            No excesses recorded for the selected period.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Spending Chart */}
          <div className="col-lg-5">
            <div className="card shadow-sm h-100" style={cardStyle}>
              <div className="card-header py-3" style={cardHeaderStyle}>
                <h5 className="m-0 fw-bold fs-6">Top Spending Teams/Users</h5>
              </div>
              <div className="card-body" style={{ height: '400px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={spendingData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--color-border-divider)" />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }} />
                    <Tooltip 
                      cursor={{ fill: 'transparent' }}
                      contentStyle={{ borderRadius: '8px', border: '1px solid var(--color-border-divider)', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}
                      formatter={(value: any) => [`$${Number(value).toFixed(2)}`, 'Total Value']}
                    />
                    <Bar dataKey="value" fill="var(--positive-color)" radius={[0, 4, 4, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
