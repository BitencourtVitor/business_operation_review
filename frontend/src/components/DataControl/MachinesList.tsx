import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../../supabaseClient';
import type { ForecastMachines, C_Machines, ForecastData } from '../../types/dataControl';
import { useGlobalFeedback } from '../../contexts/GlobalFeedbackContext';

const CustomDropdown = ({ value, onChange, options, style, placeholder = "Select..." }: { value: string, onChange: (val: string) => void, options: { label: string, value: string }[], style?: React.CSSProperties, placeholder?: string }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const [searchTerm, setSearchTerm] = useState('');

  const filteredOptions = options.filter(option => 
    option.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width
      });
      setSearchTerm(''); // Reset search when opening
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const isInsideTrigger = dropdownRef.current && dropdownRef.current.contains(target as Node);
      const isInsideMenu = target.closest('.custom-dropdown-portal');

      if (!isInsideTrigger && !isInsideMenu) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div 
      ref={dropdownRef}
      style={{
        position: 'relative',
        fontSize: '12px',
        ...style
      }}
    >
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          height: '100%',
          border: '1px solid var(--color-border-divider)',
          borderRadius: '4px',
          padding: '0 8px',
          backgroundColor: 'var(--color-background-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          color: value ? 'var(--color-text-primary)' : 'var(--color-text-secondary)'
        }}
      >
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {value ? (options.find(o => o.value === value)?.label || value) : placeholder}
        </span>
        <i className={`bi bi-chevron-${isOpen ? 'up' : 'down'}`} style={{ fontSize: '10px' }} />
      </div>

      {isOpen && ReactDOM.createPortal(
        <div 
          className="custom-dropdown-portal"
          style={{
            position: 'absolute',
            top: position.top + 4,
            left: position.left,
            width: position.width,
            backgroundColor: 'var(--color-background-primary)',
            border: '1px solid var(--color-border-divider)',
            borderRadius: '4px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            zIndex: 9999,
            maxHeight: '200px',
            overflowY: 'auto'
          }}
        >
          {/* Search Input */}
          <div style={{ padding: '8px', borderBottom: '1px solid var(--color-border-divider)' }}>
            <input
              autoFocus
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                padding: '4px 8px',
                fontSize: '12px',
                border: '1px solid var(--color-border-divider)',
                borderRadius: '4px',
                outline: 'none',
                backgroundColor: 'var(--color-background-primary)',
                color: 'var(--color-text-primary)'
              }}
            />
          </div>

          <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
            {filteredOptions.map((option) => (
              <div
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  color: 'var(--color-text-primary)',
                  backgroundColor: value === option.value ? 'var(--color-background-secondary)' : 'var(--color-background-primary)',
                  borderBottom: '1px solid var(--color-background-secondary)'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-background-secondary)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = value === option.value ? 'var(--color-background-secondary)' : 'var(--color-background-primary)')}
              >
                {option.label}
              </div>
            ))}
            {filteredOptions.length === 0 && (
               <div style={{ padding: '8px 12px', color: 'var(--color-text-secondary)', fontSize: '12px', fontStyle: 'italic', textAlign: 'center' }}>
                  No matches found
               </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

interface MachinesListProps {
  obraId: string;
  project?: ForecastData;
  onLoadingStart?: () => void;
  onLoadingStop?: () => void;
  onSuccess?: () => void;
}

const StyledUnitInput = ({ 
  value, 
  onChange, 
  placeholder 
}: { 
  value: string, 
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void,
  placeholder?: string
}) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div 
        style={{ 
            width: '100px', 
            height: '32px',
            display: 'flex', 
            alignItems: 'center',
            padding: '0',
            borderRadius: '4px',
            border: isFocused ? '1px solid var(--color-accent-primary)' : '1px solid var(--color-border-divider)',
            backgroundColor: 'var(--color-background-primary)',
            overflow: 'hidden',
            boxShadow: isFocused ? '0 0 0 3px rgba(59, 130, 246, 0.1)' : 'none',
            transition: 'border-color 0.2s, box-shadow 0.2s'
        }}
    >
        <input
            type="text"
            value={value}
            onChange={onChange}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            style={{
                width: '100%',
                height: '100%',
                border: 'none',
                outline: 'none',
                fontSize: '12px',
                padding: '0 8px',
                backgroundColor: 'transparent',
                textAlign: 'center',
                color: 'var(--color-text-primary)'
            }}
            onClick={(e) => e.stopPropagation()}
        />
    </div>
  );
};

export default function MachinesList({ obraId, project, onLoadingStart, onLoadingStop, onSuccess }: MachinesListProps) {
  const { startLoading, stopLoading, showSuccess } = useGlobalFeedback();
  const [items, setItems] = useState<ForecastMachines[]>([]);
  const [categories, setCategories] = useState<C_Machines[]>([]);
  const [providers, setProviders] = useState<{name: string}[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Initialize provider from project data
  useEffect(() => {
    if (project?.machine_provider) {
      setSelectedProvider(project.machine_provider);
    }
  }, [project]);

  // Fetch providers from C_machine_provider
  useEffect(() => {
    const fetchProviders = async () => {
      const { data } = await supabase.from('C_machine_provider').select('name').order('name');
      if (data) setProviders(data);
    };
    fetchProviders();
  }, []);

  // Update provider
  const handleProviderChange = async (newProvider: string) => {
    startLoading();
    if (onLoadingStart) onLoadingStart();
    setSelectedProvider(newProvider);
    
    if (obraId) {
      const { error } = await supabase
        .from('forecast_data')
        .update({ machine_provider: newProvider })
        .eq('id', obraId);
        
      if (error) {
        console.error('Error updating provider:', error);
        stopLoading();
        if (onLoadingStop) onLoadingStop();
      } else {
        showSuccess();
        if (onSuccess) onSuccess();
      }
    } else {
      stopLoading();
      if (onLoadingStop) onLoadingStop();
    }
  };
  
  // Fetch data
  useEffect(() => {
    if (obraId) {
      setItems([]); // Clear items to avoid showing previous project data
      setIsLoading(true);
      Promise.all([
        fetchItems(),
        fetchCategories()
      ]).finally(() => setIsLoading(false));
    }
  }, [obraId]);

  const fetchItems = async () => {
    const { data } = await supabase
      .from('forecast_machines')
      .select('*')
      .eq('obra_id', obraId)
      .order('id', { ascending: true });
    
    if (data) setItems(data);
  };

  const fetchCategories = async () => {
    // Buscar categorias definidas em C_machines
    const { data } = await supabase.from('C_machines').select('*');
    if (data) setCategories(data);
  };

  // const fetchWorkforce = async () => {
  //   // Buscar opções de workforce
  //   const { data } = await supabase.from('C_workforce').select('name');
  //   if (data) setWorkforceOptions(data.map(d => d.name));
  // };

  // Ensure all categories exist for this project
  // useEffect(() => {
  //    if (categories.length > 0 && obraId) {
  //        syncItemsWithCategories().catch(console.error);
  //    }
  // }, [categories, items, obraId]);

  const syncItemsWithCategories = async () => {
      // Para cada categoria definida, garantir que existe um registro correspondente em forecast_machines para esta obra
      const missingItems = categories.filter(cat => 
          !items.some(item => 
             item.category === cat.category && 
             item.subcategory === cat.subcategory && 
             item.equipment_category === cat.equipment_category &&
             item.title === cat.title
          )
      );

      if (missingItems.length > 0) {
          const newItems = missingItems.map(cat => ({
              obra_id: obraId,
              category: cat.category,
              subcategory: cat.subcategory,
              equipment_category: cat.equipment_category,
              title: cat.title,
              status: false,
              unit: '',
              team: '',
              lastupdate_datetimez: new Date().toISOString()
          }));

          const { error } = await supabase.from('forecast_machines').insert(newItems);
          if (!error) {
              fetchItems(); // Reload
          }
      }
  };

  const handleUpdate = async (id: number, field: keyof ForecastMachines, value: any) => {
    startLoading();
    if (onLoadingStart) onLoadingStart();
    
    const updates: any = { [field]: value };
    // Se estiver desativando (status = false), limpa o campo unit
    if (field === 'status' && value === false) {
      updates.unit = null;
    }

    // Optimistic update
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));

    try {
      const { error } = await supabase
        .from('forecast_machines')
        .update({ ...updates, lastupdate_datetimez: new Date().toISOString() })
        .eq('id', id);
        
      if (error) {
          throw error;
      } else {
          showSuccess();
          if (onSuccess) onSuccess();
      }
    } catch (error) {
        console.error("Error updating", error);
        // If error, revert (fetch items)
        fetchItems();
        stopLoading();
        if (onLoadingStop) onLoadingStop();
    }
  };

  return (
    <div style={{ width: '100%', padding: '8px 0', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Provider Selector (Fixed at top) */}
      <div style={{ marginBottom: '12px', padding: '0 4px', flexShrink: 0 }}>
          <CustomDropdown
              value={selectedProvider}
              onChange={handleProviderChange}
              options={providers.map(p => ({ label: p.name, value: p.name }))}
              placeholder="Select Machine Provider"
              style={{
                  width: '100%',
                  height: '32px'
              }}
          />
      </div>

      {isLoading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px' }}>
            <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
            </div>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {items.map(item => (
              <div key={item.id} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center', justifyContent: 'center' }}>
                
                {/* Machine Checkbox Container */}
                <div 
                    style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between',
                        gap: '4px',
                        fontSize: '12px',
                        padding: '0 8px',
                        height: '32px',
                        borderRadius: '4px',
                        border: '1px solid var(--color-border-divider)',
                        backgroundColor: item.status ? 'rgba(59, 130, 246, 0.05)' : 'var(--color-background-primary)',
                        transition: 'all 0.2s',
                        cursor: 'pointer',
                        width: '180px' // Fixed width to match attachments style
                    }}
                    onClick={() => handleUpdate(item.id, 'status', !item.status)}
                >
                    {/* Left Group: Checkbox + Title */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                        {/* Checkbox */}
                        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                            <input 
                            type="checkbox" 
                            checked={!!item.status} 
                            readOnly
                            style={{
                                width: '16px',
                                height: '16px',
                                cursor: 'pointer',
                                accentColor: 'var(--color-accent-primary)'
                            }}
                            />
                        </div>
                        
                        {/* Machine Title */}
                        <span style={{ color: 'var(--color-text-primary)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</span>
                    </div>

                    {/* Right Group: Category */}
                    {item.equipment_category && (
                        <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}>{item.equipment_category}</span>
                    )}
                </div>

                {/* Unit Number Container */}
                <StyledUnitInput 
                    value={item.unit || ''}
                    onChange={e => handleUpdate(item.id, 'unit', e.target.value)}
                    placeholder="Unit #"
                />

              </div>
          ))}
          
          {items.length === 0 && (
              <div style={{ color: '#999', fontStyle: 'italic', fontSize: '12px' }}>No machines defined.</div>
          )}
       </div>
      )}
    </div>
  );
}
