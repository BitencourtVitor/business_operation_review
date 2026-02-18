import React, { useState, useEffect } from 'react';
import type { ForecastData } from '../../types/dataControl';
import { supabase } from '../../supabaseClient';
import MultiSelectDropdown from '../common/MultiSelectDropdown';

interface ProjectFormProps {
  initialData?: Partial<ForecastData>;
  onSubmit: (data: Partial<ForecastData>) => void;
  onCancel?: () => void;
  loading: boolean;
  existingJobSites?: string[];
  existingTypes?: string[];
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '6px',
  border: '1px solid var(--color-border-divider)',
  backgroundColor: 'var(--color-background-primary)',
  color: 'var(--color-text-primary)',
  fontSize: '14px',
  outline: 'none',
  transition: 'border-color 0.2s ease'
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '6px',
  fontSize: '13px',
  fontWeight: 500,
  color: 'var(--color-text-secondary)'
};

const checkboxContainerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  cursor: 'pointer',
  padding: '8px',
  border: '1px solid var(--color-border-divider)',
  borderRadius: '6px',
  backgroundColor: 'var(--color-background-secondary)'
};

export default function ProjectForm({ initialData, onSubmit, onCancel, loading, existingJobSites = [], existingTypes = [] }: ProjectFormProps) {
  const [formData, setFormData] = useState<Partial<ForecastData>>({
    cliente: '',
    job_site: '',
    type: '',
    lote_bld: '',
    status: 'not started',
    address: '',
    previous_beams_date: '',
    previous_start_date: '',
    previous_end_date: '',
    obs: '',
    hvac: false,
    buildertrend: false,
    machine_provider: '',
    storage: false,
    qbtime: false,
    ...initialData
  });

  const [machineProviders, setMachineProviders] = useState<string[]>([]);

  useEffect(() => {
    // Carregar machine providers
    const fetchData = async () => {
      const { data: providers } = await supabase.from('C_machine_provider').select('name');
      if (providers) {
        setMachineProviders(providers.map(d => d.name));
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (initialData) {
      setFormData(prev => ({ ...prev, ...initialData }));
    }
  }, [initialData]);

  const handleChange = (field: keyof ForecastData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const availableTypes = [...existingTypes];
  ['House', 'Building', 'Lot'].forEach(t => {
    if (!availableTypes.includes(t)) availableTypes.push(t);
  });

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '20px' }}>
      
      {/* 1. Client Name */}
      <div style={{ gridColumn: '1 / -1' }}>
        <label style={labelStyle}>Client Name *</label>
        <input 
          type="text" 
          style={inputStyle} 
          required 
          value={formData.cliente || ''} 
          onChange={e => handleChange('cliente', e.target.value)} 
          placeholder="Enter client name"
        />
      </div>

      {/* 2. Job Site (Creatable) */}
      <div>
        <label style={labelStyle}>Job Site *</label>
        <MultiSelectDropdown
          options={existingJobSites}
          selectedValues={formData.job_site ? [formData.job_site] : []}
          onChange={(vals) => handleChange('job_site', vals[0] || '')}
          isSingleSelect={true}
          allowCustomValue={true}
          placeholder="Select or type new job site"
          style={{
            width: '100%',
            height: '40px',
            borderRadius: '6px',
            border: '1px solid var(--color-border-divider)',
            backgroundColor: 'var(--color-background-primary)',
            color: 'var(--color-text-primary)',
            fontWeight: 400,
            fontSize: '14px'
          }}
        />
      </div>

      {/* 3. Type (Creatable) */}
      <div>
        <label style={labelStyle}>Type</label>
        <MultiSelectDropdown
          options={availableTypes}
          selectedValues={formData.type ? [formData.type] : []}
          onChange={(vals) => handleChange('type', vals[0] || '')}
          isSingleSelect={true}
          allowCustomValue={true}
          placeholder="Select or type new type"
          style={{
            width: '100%',
            height: '40px',
            borderRadius: '6px',
            border: '1px solid var(--color-border-divider)',
            backgroundColor: 'var(--color-background-primary)',
            color: 'var(--color-text-primary)',
            fontWeight: 400,
            fontSize: '14px'
          }}
        />
      </div>

      {/* 4. Address */}
      <div style={{ gridColumn: '1 / -1' }}>
        <label style={labelStyle}>Address</label>
        <input 
          type="text" 
          style={inputStyle} 
          value={formData.address || ''} 
          onChange={e => handleChange('address', e.target.value)} 
          placeholder="Enter project address"
        />
      </div>

      {/* 5. Dates */}
      <div style={{ gridColumn: '1 / -1', marginTop: '8px' }}>
        <h5 style={{ margin: '0 0 16px 0', borderBottom: '1px solid var(--color-border-divider)', paddingBottom: '8px', fontSize: '14px', color: 'var(--color-text-secondary)' }}>Schedule</h5>
      </div>

      <div>
        <label style={labelStyle}>Previous Beams Date</label>
        <input 
          type="date" 
          style={inputStyle} 
          value={formData.previous_beams_date || ''} 
          onChange={e => handleChange('previous_beams_date', e.target.value)} 
        />
      </div>

      <div>
        <label style={labelStyle}>Previous Start Date</label>
        <input 
          type="date" 
          style={inputStyle} 
          value={formData.previous_start_date || ''} 
          onChange={e => handleChange('previous_start_date', e.target.value)} 
        />
      </div>

      <div>
        <label style={labelStyle}>Previous End Date</label>
        <input 
          type="date" 
          style={inputStyle} 
          value={formData.previous_end_date || ''} 
          onChange={e => handleChange('previous_end_date', e.target.value)} 
        />
      </div>

      {/* 6. Observations */}
      <div style={{ gridColumn: '1 / -1' }}>
        <label style={labelStyle}>Observations</label>
        <textarea 
          style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} 
          value={formData.obs || ''} 
          onChange={e => handleChange('obs', e.target.value)} 
          placeholder="Add any additional notes here..."
        />
      </div>

      {/* 7. Booleans (HVAC, Buildertrend, Storage, QBTime) */}
      <div style={{ gridColumn: '1 / -1', marginTop: '8px' }}>
        <h5 style={{ margin: '0 0 16px 0', borderBottom: '1px solid var(--color-border-divider)', paddingBottom: '8px', fontSize: '14px', color: 'var(--color-text-secondary)' }}>Additional Info</h5>
      </div>

      <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
        <label style={checkboxContainerStyle}>
          <input type="checkbox" checked={!!formData.hvac} onChange={e => handleChange('hvac', e.target.checked)} />
          <span>HVAC</span>
        </label>
        <label style={checkboxContainerStyle}>
          <input type="checkbox" checked={!!formData.buildertrend} onChange={e => handleChange('buildertrend', e.target.checked)} />
          <span>BuilderTrend</span>
        </label>
        <label style={checkboxContainerStyle}>
          <input type="checkbox" checked={!!formData.storage} onChange={e => handleChange('storage', e.target.checked)} />
          <span>Storage</span>
        </label>
        <label style={checkboxContainerStyle}>
          <input type="checkbox" checked={!!formData.qbtime} onChange={e => handleChange('qbtime', e.target.checked)} />
          <span>QBTime</span>
        </label>
      </div>

      {/* 8. Machine Provider (Creatable) */}
      <div style={{ gridColumn: '1 / -1' }}>
        <label style={labelStyle}>Machine Provider</label>
        <MultiSelectDropdown
          options={machineProviders}
          selectedValues={formData.machine_provider ? [formData.machine_provider] : []}
          onChange={(vals) => handleChange('machine_provider', vals[0] || '')}
          isSingleSelect={true}
          allowCustomValue={true}
          placeholder="Select or type new provider"
          style={{
            width: '100%',
            height: '40px',
            borderRadius: '6px',
            border: '1px solid var(--color-border-divider)',
            backgroundColor: 'var(--color-background-primary)',
            color: 'var(--color-text-primary)',
            fontWeight: 400,
            fontSize: '14px'
          }}
        />
      </div>

      {/* Hidden/Less prominent fields but kept for data integrity */}
      <div style={{ display: 'none' }}>
        <input type="text" value={formData.lote_bld || ''} onChange={e => handleChange('lote_bld', e.target.value)} />
        <select value={formData.status || 'not started'} onChange={e => handleChange('status', e.target.value)}>
           <option value="not started">Not Started</option>
           <option value="open">Open</option>
           <option value="closed">Closed</option>
        </select>
      </div>

      <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
        {onCancel && (
          <button 
            type="button" 
            onClick={onCancel}
            style={{ padding: '10px 20px', backgroundColor: 'transparent', border: '1px solid var(--color-border-divider)', borderRadius: '6px', cursor: 'pointer', color: 'var(--color-text-primary)' }}
          >
            Cancel
          </button>
        )}
        <button 
          type="submit" 
          disabled={loading}
          style={{ padding: '10px 20px', backgroundColor: 'var(--color-accent-primary)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', opacity: loading ? 0.7 : 1 }}
        >
          {loading ? 'Saving...' : 'Save Project'}
        </button>
      </div>

    </form>
  );
}