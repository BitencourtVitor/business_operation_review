import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useGlobalFeedback } from '../../contexts/GlobalFeedbackContext';

type TableType = 'C_workforce' | 'C_fieldwire' | 'C_machines' | 'C_contracted_steps' | 'C_machine_provider';

const tableOptions: { label: string; value: TableType }[] = [
  { label: 'Workforce', value: 'C_workforce' },
  { label: 'Fieldwire Documents', value: 'C_fieldwire' },
  { label: 'Machines & Attachments', value: 'C_machines' },
  { label: 'Contract Steps', value: 'C_contracted_steps' },
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
    const { data: result, error } = await supabase.from(selectedTable).select('*').order('id', { ascending: true });
    if (result) setData(result);
    setLoading(false);
  };

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
    } catch (error: any) {
      console.error('Error adding item:', error);
      alert('Error adding item: ' + (error.message || 'Unknown error'));
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
    } catch (error: any) {
      console.error('Error deleting item:', error);
      stopLoading();
    }
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
            />
          </div>
        );
      case 'C_contracted_steps':
        return (
          <div className="d-flex gap-2">
            <input 
              className="form-control" 
              placeholder="Step Description" 
              value={formData.step || ''} 
              onChange={e => setFormData({ ...formData, step: e.target.value })} 
            />
          </div>
        );
      case 'C_fieldwire':
        return (
          <div className="d-grid gap-2" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
            <input className="form-control" placeholder="Category" value={formData.category || ''} onChange={e => setFormData({ ...formData, category: e.target.value })} />
            <input className="form-control" placeholder="Document" value={formData.document || ''} onChange={e => setFormData({ ...formData, document: e.target.value })} />
            <input className="form-control" placeholder="Where" value={formData.where_location || ''} onChange={e => setFormData({ ...formData, where_location: e.target.value })} />
            <input className="form-control" placeholder="Notes" value={formData.notes || ''} onChange={e => setFormData({ ...formData, notes: e.target.value })} />
          </div>
        );
      case 'C_machines':
        return (
          <div className="d-grid gap-2" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
            <input className="form-control" placeholder="Category" value={formData.category || ''} onChange={e => setFormData({ ...formData, category: e.target.value })} />
            <input className="form-control" placeholder="Subcategory" value={formData.subcategory || ''} onChange={e => setFormData({ ...formData, subcategory: e.target.value })} />
            <input className="form-control" placeholder="Equip. Cat." value={formData.equipment_category || ''} onChange={e => setFormData({ ...formData, equipment_category: e.target.value })} />
            <input className="form-control" placeholder="Title" value={formData.title || ''} onChange={e => setFormData({ ...formData, title: e.target.value })} />
          </div>
        );
      default:
        return null;
    }
  };

  const renderTableHeaders = () => {
    switch (selectedTable) {
      case 'C_workforce':
      case 'C_machine_provider':
        return <th>Name</th>;
      case 'C_contracted_steps':
        return <th>Step</th>;
      case 'C_fieldwire':
        return (
          <>
            <th>Category</th>
            <th>Document</th>
            <th>Where</th>
            <th>Notes</th>
          </>
        );
      case 'C_machines':
        return (
          <>
            <th>Category</th>
            <th>Subcategory</th>
            <th>Equip. Cat.</th>
            <th>Title</th>
          </>
        );
      default:
        return null;
    }
  };

  const renderRow = (item: any) => {
    switch (selectedTable) {
      case 'C_workforce':
      case 'C_machine_provider':
        return <td>{item.name}</td>;
      case 'C_contracted_steps':
        return <td>{item.step}</td>;
      case 'C_fieldwire':
        return (
          <>
            <td>{item.category}</td>
            <td>{item.document}</td>
            <td>{item.where_location}</td>
            <td>{item.notes}</td>
          </>
        );
      case 'C_machines':
        return (
          <>
            <td>{item.category}</td>
            <td>{item.subcategory}</td>
            <td>{item.equipment_category}</td>
            <td>{item.title}</td>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '24px' }}>Categorization Management</h2>
      
      <div className="mb-4">
        <label className="form-label">Select Table to Manage</label>
        <select 
          className="form-select" 
          value={selectedTable} 
          onChange={e => setSelectedTable(e.target.value as TableType)}
          style={{ maxWidth: '300px' }}
        >
          {tableOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      </div>

      <div className="card mb-4">
        <div className="card-header bg-light">Add New Item</div>
        <div className="card-body">
          {renderForm()}
          <button className="btn btn-success mt-3" onClick={handleAdd} disabled={loading}>
            <i className="bi bi-plus-lg"></i> Add Item
          </button>
        </div>
      </div>

      <div className="table-responsive">
        <table className="table table-hover table-bordered">
          <thead className="table-light">
            <tr>
              <th style={{ width: '60px' }}>ID</th>
              {renderTableHeaders()}
              <th style={{ width: '80px' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {data.map(item => (
              <tr key={item.id}>
                <td>{item.id}</td>
                {renderRow(item)}
                <td>
                  <button 
                    style={{
                      height: '30px',
                      width: '30px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '6px',
                      border: '1px solid var(--negative-color)',
                      backgroundColor: 'var(--negative-background)',
                      color: 'var(--negative-color)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    onClick={() => handleDelete(item.id)}
                  >
                    <i className="bi bi-trash"></i>
                  </button>
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-muted">No items found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
