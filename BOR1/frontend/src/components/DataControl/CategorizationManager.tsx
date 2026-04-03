import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useGlobalFeedback } from '../../contexts/GlobalFeedbackContext';
import MultiSelectDropdown from '../common/MultiSelectDropdown';

type TableType = 'C_workforce' | 'C_fieldwire' | 'C_machines' | 'C_contract_steps' | 'C_machine_provider';

const tableOptions: { label: string; value: TableType }[] = [
  { label: 'Workforce', value: 'C_workforce' },
  { label: 'Fieldwire Documents', value: 'C_fieldwire' },
  { label: 'Machines & Attachments', value: 'C_machines' },
  { label: 'Contract Steps', value: 'C_contract_steps' },
  { label: 'Machine Providers', value: 'C_machine_provider' },
];

export default function CategorizationManager() {
  const { startLoading, stopLoading, showSuccess } = useGlobalFeedback();
  const [selectedTable, setSelectedTable] = useState<TableType>('C_workforce');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Dynamic form state
  const [formData, setFormData] = useState<any>({});

  const fetchData = async () => {
    setLoading(true);
    const { data: result } = await supabase.from(selectedTable).select('*').order('id', { ascending: true });
    if (result) setData(result);
    setLoading(false);
  };

  useEffect(() => {
    // Validate selectedTable
    if (selectedTable === 'C_contracted_steps' as string) {
       setSelectedTable('C_contract_steps');
    }
  }, [selectedTable]);

  useEffect(() => {
    fetchData();
    setFormData({}); // Reset form
  }, [selectedTable]);

  const handleAdd = async () => {
    try {
      startLoading();
      setLoading(true);
      const { error } = await supabase.from(selectedTable).insert([formData]);
      if (error) {
        throw error;
      } else {
        setFormData({});
        fetchData();
        showSuccess();
      }
    } catch (error) {
      console.error('Error adding item:', error);
      alert('Error adding item: ' + ((error as Error).message || 'Unknown error'));
      stopLoading();
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure?')) return;
    try {
      startLoading();
      const { error } = await supabase.from(selectedTable).delete().eq('id', id);
      if (error) {
        throw error;
      } else {
        fetchData();
        showSuccess();
      }
    } catch (error) {
      console.error('Error deleting item:', error);
      stopLoading();
    }
  };

  const inputStyle = {
    backgroundColor: 'var(--color-background-primary)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border-divider)',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '14px'
  };

  const renderForm = () => {
    switch (selectedTable) {
      case 'C_workforce':
      case 'C_machine_provider':
        return (
          <div className="d-flex gap-2">
            <input 
              className="form-control" 
              placeholder="Name" 
              value={formData.name || ''} 
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              style={inputStyle}
            />
          </div>
        );
      case 'C_contract_steps':
        return (
          <div className="d-flex gap-2">
            <input 
              className="form-control" 
              placeholder="Step Description" 
              value={formData.step || ''} 
              onChange={e => setFormData({ ...formData, step: e.target.value })}
              style={inputStyle}
            />
          </div>
        );
      case 'C_fieldwire':
        return (
          <div className="d-grid gap-2" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
            <input className="form-control" placeholder="Category" value={formData.category || ''} onChange={e => setFormData({ ...formData, category: e.target.value })} style={inputStyle} />
            <input className="form-control" placeholder="Document" value={formData.document || ''} onChange={e => setFormData({ ...formData, document: e.target.value })} style={inputStyle} />
            <input className="form-control" placeholder="Where" value={formData.where_location || ''} onChange={e => setFormData({ ...formData, where_location: e.target.value })} style={inputStyle} />
            <input className="form-control" placeholder="Notes" value={formData.notes || ''} onChange={e => setFormData({ ...formData, notes: e.target.value })} style={inputStyle} />
          </div>
        );
      case 'C_machines':
        return (
          <div className="d-grid gap-2" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
            <input className="form-control" placeholder="Category" value={formData.category || ''} onChange={e => setFormData({ ...formData, category: e.target.value })} style={inputStyle} />
            <input className="form-control" placeholder="Subcategory" value={formData.subcategory || ''} onChange={e => setFormData({ ...formData, subcategory: e.target.value })} style={inputStyle} />
            <input className="form-control" placeholder="Equip. Cat." value={formData.equipment_category || ''} onChange={e => setFormData({ ...formData, equipment_category: e.target.value })} style={inputStyle} />
            <input className="form-control" placeholder="Title" value={formData.title || ''} onChange={e => setFormData({ ...formData, title: e.target.value })} style={inputStyle} />
          </div>
        );
      default:
        return null;
    }
  };

  const thStyle = {
    backgroundColor: 'var(--color-background-secondary)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border-divider)',
    padding: '12px',
    fontWeight: 600,
    fontSize: '14px'
  };

  const tdStyle = {
    backgroundColor: 'var(--color-background-primary)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border-divider)',
    padding: '12px',
    fontSize: '14px',
    verticalAlign: 'middle'
  };

  const renderTableHeaders = () => {
    switch (selectedTable) {
      case 'C_workforce':
      case 'C_machine_provider':
        return <th style={thStyle}>Name</th>;
      case 'C_contract_steps':
        return <th style={thStyle}>Step</th>;
      case 'C_fieldwire':
        return (
          <>
            <th style={thStyle}>Category</th>
            <th style={thStyle}>Document</th>
            <th style={thStyle}>Where</th>
            <th style={thStyle}>Notes</th>
          </>
        );
      case 'C_machines':
        return (
          <>
            <th style={thStyle}>Category</th>
            <th style={thStyle}>Subcategory</th>
            <th style={thStyle}>Equip. Cat.</th>
            <th style={thStyle}>Title</th>
          </>
        );
      default:
        return null;
    }
  };

  const renderRow = (item: Record<string, any>) => {
    switch (selectedTable) {
      case 'C_workforce':
      case 'C_machine_provider':
        return <td style={tdStyle}>{item.name}</td>;
      case 'C_contract_steps':
        return <td style={tdStyle}>{item.step}</td>;
      case 'C_fieldwire':
        return (
          <>
            <td style={tdStyle}>{item.category}</td>
            <td style={tdStyle}>{item.document}</td>
            <td style={tdStyle}>{item.where_location}</td>
            <td style={tdStyle}>{item.notes}</td>
          </>
        );
      case 'C_machines':
        return (
          <>
            <td style={tdStyle}>{item.category}</td>
            <td style={tdStyle}>{item.subcategory}</td>
            <td style={tdStyle}>{item.equipment_category}</td>
            <td style={tdStyle}>{item.title}</td>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      
      {/* Header Bar */}
      <div className="d-flex flex-row justify-content-between align-items-center" style={{ padding: '10px 20px', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
        <h1 style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, flex: '0 0 auto', marginBottom: 0 }}>Categorization</h1>
        
        {/* Right Side Controls */}
        <div className="d-flex flex-row align-items-center" style={{ gap: 16, borderLeft: '1px solid var(--color-border-divider)', paddingLeft: 16 }}>
            <span style={{ fontSize: 14, fontWeight: 500, gap: 8, display: 'flex', alignItems: 'center', color: 'var(--color-text-secondary)' }}>
                <i className="bi bi-table" />
                Table
            </span>
            
            <div style={{ width: 250 }}>
              <MultiSelectDropdown 
                options={tableOptions}
                selectedValues={[selectedTable]}
                onChange={(vals) => {
                  if (vals[0]) setSelectedTable(vals[0] as TableType);
                }}
                placeholder="Select Table"
                isSingleSelect={true}
                variant="default"
                style={{
                  border: '1px solid var(--color-border-divider)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  backgroundColor: 'var(--color-background-primary)',
                  color: 'var(--color-text-primary)',
                  fontWeight: 400
                }}
              />
            </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div id="categorization-content" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '24px' }}>
        
        {/* Add Form */}
        <div className="card mb-3 flex-shrink-0" style={{ backgroundColor: 'var(--color-background-primary)', border: '1px solid var(--color-border-divider)', borderRadius: '8px' }}>
          <div className="card-header py-2" style={{ backgroundColor: 'var(--color-background-secondary)', borderBottom: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', borderTopLeftRadius: '8px', borderTopRightRadius: '8px' }}>
            <span style={{ fontWeight: 600 }}>Add New Item</span>
          </div>
          <div className="card-body py-3" style={{ backgroundColor: 'var(--color-background-primary)', color: 'var(--color-text-primary)', borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px' }}>
            {renderForm()}
            <button className="btn btn-success mt-3 btn-sm" onClick={handleAdd} disabled={loading} style={{ fontWeight: 500, borderRadius: '6px' }}>
              <i className="bi bi-plus-lg me-1"></i> Add Item
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="flex-grow-1 custom-scrollbar" style={{ overflowY: 'auto', backgroundColor: 'var(--color-background-primary)', border: '1px solid var(--color-border-divider)', borderRadius: '8px' }}>
          <table className="table table-hover table-bordered mb-0" style={{ color: 'var(--color-text-primary)', borderColor: 'var(--color-border-divider)' }}>
            <thead className="sticky-top" style={{ zIndex: 1, backgroundColor: 'var(--color-background-secondary)' }}>
              <tr>
                <th style={{ ...thStyle, width: '60px', textAlign: 'center' }}>ID</th>
                {(() => {
                  const headers = renderTableHeaders();
                  return headers; 
                })()}
                <th style={{ ...thStyle, width: '80px', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {data.map(item => (
                <tr key={item.id}>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>{item.id}</td>
                  {renderRow(item)} 
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <button 
                      className="btn btn-sm btn-outline-danger d-inline-flex align-items-center justify-content-center"
                      style={{
                        height: '30px',
                        width: '30px',
                        padding: 0,
                        borderRadius: '6px'
                      }}
                      onClick={() => handleDelete(item.id)}
                      title="Delete"
                    >
                      <i className="bi bi-trash"></i>
                    </button>
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-muted py-4" style={{ backgroundColor: 'var(--color-background-primary)', color: 'var(--color-text-secondary)', borderColor: 'var(--color-border-divider)' }}>No items found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
