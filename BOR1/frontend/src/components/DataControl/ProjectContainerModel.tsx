import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../supabaseClient';
import type { ForecastData } from '../../types/dataControl';
import FieldwireList from './FieldwireList';
import MachinesList from './MachinesList';
import ContractStepsList from './ContractStepsList';
import MultiSelectDropdown from '../common/MultiSelectDropdown';

import iconFieldwire from '../../assets/fieldwire.png';
import iconForecastHvac from '../../assets/icon_forecast_hvac.png';
import iconForecastHvacDark from '../../assets/icon_forecast_hvac_darkmode.png';
import iconBuildertrend from '../../assets/buildertrend.png';
import iconBuildertrendDark from '../../assets/buildertrend_darkmode.png';
import iconQBTime from '../../assets/qbtime_logo.png';
import iconQBTimeDark from '../../assets/qbtime_darkmode.png';

interface ProjectContainerModelProps {
  status?: 'open' | 'closed' | 'not started' | 'overdue';
  project?: ForecastData;
  onUpdate?: () => void;
  availableTypes?: string[];
  forcedTab?: string;
  isCreationMode?: boolean;
  onCreate?: (data: Partial<ForecastData>) => Promise<void>;
  availableJobSites?: string[];
  availableClients?: string[];
  theme?: 'light' | 'dark';
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'open': return '#28a745';
    case 'closed': return '#6c757d';
    case 'not started': return '#3b82f6';
    case 'overdue': return '#e04b4b';
    default: return '#ccc';
  }
};

const DateInput = ({ dateValue, style, onBlur }: { dateValue?: string, style?: React.CSSProperties, onBlur?: (val: string) => void }) => {
  const [displayValue, setDisplayValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  
  useEffect(() => {
    // Convert YYYY-MM-DD to MM/DD/YYYY for initial display
    if (dateValue) {
      const parts = dateValue.split('-');
      if (parts.length === 3) {
        setDisplayValue(`${parts[1]}/${parts[2]}/${parts[0]}`);
      } else {
        setDisplayValue(dateValue);
      }
    } else {
      setDisplayValue('');
    }
  }, [dateValue]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    const oldVal = displayValue;
    const isDeleting = val.length < oldVal.length;

    // Allow deletion always
    if (isDeleting) {
      setDisplayValue(val);
      return;
    }

    const cleanVal = val.replace(/\D/g, '');

    // Month Validation
    if (cleanVal.length >= 1) {
       const firstDigit = parseInt(cleanVal[0]);
       // Auto-format single digit months > 1 (e.g. typing "2" becomes "02/")
       if (cleanVal.length === 1 && firstDigit > 1) {
          setDisplayValue('0' + firstDigit + '/');
          return;
       }
    }

    if (cleanVal.length >= 2) {
       const month = parseInt(cleanVal.slice(0, 2));
       if (month === 0 || month > 12) {
         // Block invalid month input
         return; 
       }
    }
    
    // Day Validation
    if (cleanVal.length >= 4) {
       const day = parseInt(cleanVal.slice(2, 4));
       if (day === 0 || day > 31) {
          return;
       }
    }

    // Formatting logic
    let formattedVal = cleanVal;
    if (cleanVal.length > 2) {
      formattedVal = cleanVal.slice(0, 2) + '/' + cleanVal.slice(2);
    }
    if (cleanVal.length > 4) {
      formattedVal = formattedVal.slice(0, 5) + '/' + cleanVal.slice(4);
    }
    
    if (formattedVal.length > 10) {
      formattedVal = formattedVal.slice(0, 10);
    }

    setDisplayValue(formattedVal);
  };

  const handleBlur = () => {
      setIsFocused(false);
      if (onBlur) {
          // Convert MM/DD/YYYY to YYYY-MM-DD
          if (displayValue.length === 10) {
              const parts = displayValue.split('/');
              if (parts.length === 3) {
                  const isoDate = `${parts[2]}-${parts[0]}-${parts[1]}`;
                  onBlur(isoDate);
              }
          } else if (displayValue === '') {
              onBlur('');
          }
      }
  };

  const finalStyle: React.CSSProperties = {
      ...style,
      outline: 'none',
      transition: 'border-color 0.2s, box-shadow 0.2s',
      border: isFocused ? '1px solid var(--color-accent-primary)' : (style?.border || '1px solid var(--color-border-divider)'),
      boxShadow: isFocused ? '0 0 0 3px rgba(59, 130, 246, 0.1)' : 'none', // Soft focus ring
      backgroundColor: style?.backgroundColor || 'var(--color-background-primary)',
      color: style?.color || 'var(--color-text-primary)'
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        type="text"
        value={displayValue}
        onChange={handleChange}
        onFocus={() => setIsFocused(true)}
        onBlur={handleBlur}
        placeholder="mm/dd/yyyy"
        style={finalStyle}
        maxLength={10}
      />
    </div>
  );
};

const StyledInput = ({ 
  value, 
  onChange, 
  onBlur, 
  style, 
  type = 'text', 
  placeholder,
  ...props
}: {
  value: string | number,
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void,
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void,
  style?: React.CSSProperties,
  type?: string,
  placeholder?: string,
  [key: string]: any
}) => {
  const [isFocused, setIsFocused] = useState(false);

  const finalStyle: React.CSSProperties = {
      ...style,
      outline: 'none',
      transition: 'border-color 0.2s, box-shadow 0.2s',
      border: isFocused ? '1px solid var(--color-accent-primary)' : (style?.border || '1px solid var(--color-border-divider)'),
      boxShadow: isFocused ? '0 0 0 3px rgba(59, 130, 246, 0.1)' : 'none',
      backgroundColor: style?.backgroundColor || 'var(--color-background-primary)',
      color: style?.color || 'var(--color-text-primary)'
  };

  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      onFocus={() => setIsFocused(true)}
      onBlur={(e) => {
        setIsFocused(false);
        if (onBlur) onBlur(e);
      }}
      style={finalStyle}
      placeholder={placeholder}
      {...props}
    />
  );
};

const StyledTextarea = ({ 
  value, 
  onChange, 
  onBlur, 
  style, 
  placeholder,
  className,
  ...props
}: {
  value: string,
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void,
  onBlur?: (e: React.FocusEvent<HTMLTextAreaElement>) => void,
  style?: React.CSSProperties,
  placeholder?: string,
  className?: string,
  [key: string]: any
}) => {
  const [isFocused, setIsFocused] = useState(false);

  const finalStyle: React.CSSProperties = {
      ...style,
      outline: 'none',
      transition: 'border-color 0.2s, box-shadow 0.2s',
      border: isFocused ? '1px solid var(--color-accent-primary)' : (style?.border || '1px solid var(--color-border-divider)'),
      boxShadow: isFocused ? '0 0 0 3px rgba(59, 130, 246, 0.1)' : 'none',
      backgroundColor: style?.backgroundColor || 'var(--color-background-primary)',
      color: style?.color || 'var(--color-text-primary)'
  };

  return (
    <textarea
      value={value}
      onChange={onChange}
      onFocus={() => setIsFocused(true)}
      onBlur={(e) => {
        setIsFocused(false);
        if (onBlur) onBlur(e);
      }}
      style={finalStyle}
      placeholder={placeholder}
      className={className}
      {...props}
    />
  );
};

export default function ProjectContainerModel({ 
  status = 'open', 
  project, 
  onUpdate, 
  availableTypes = [], 
  forcedTab, 
  isCreationMode = false, 
  onCreate, 
  availableJobSites = [], 
  availableClients = [],
  theme
}: ProjectContainerModelProps) {
  const isDarkMode = theme !== undefined ? theme === 'dark' : document.documentElement.classList.contains('dark');
  const [activeTab, setActiveTab] = useState('Info & Dates');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteCountDown, setDeleteCountDown] = useState(5);
  const [canDelete, setCanDelete] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(project?.status || status);
  
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (deleteModalOpen) {
      setDeleteCountDown(5);
      setCanDelete(false);
      timer = setInterval(() => {
        setDeleteCountDown((prev) => {
          if (prev <= 1) {
            setCanDelete(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [deleteModalOpen]);

  const handleDelete = async () => {
    if (!project?.id) return;
    
    try {
      startLoading();
      const { error } = await supabase
        .from('forecast_data')
        .delete()
        .eq('id', project.id);

      if (error) throw error;
      
      setDeleteModalOpen(false);
      showSuccess();
      if (onUpdate) onUpdate(); // Trigger refresh on parent
    } catch (error) {
      console.error('Error deleting project:', error);
      stopLoading();
    }
  };
  const statusColor = getStatusColor(currentStatus);
  const tabs = isCreationMode 
    ? ['Info & Dates', 'Optionals'] 
    : ['Info & Dates', 'Fieldwire', 'Machines', 'Contract', 'Optionals'];

  // Sync activeTab with forcedTab when it changes
  useEffect(() => {
    if (forcedTab) {
      setActiveTab(forcedTab);
    }
  }, [forcedTab]);

  // Map tabs to icons or Bootstrap class names
  // Info & Dates: Info icon (Bootstrap: bi-info-circle-fill)
  // Fieldwire: Fieldwire Logo (Image)
  // Machines: Car/Truck icon (Bootstrap: bi-truck)
  // Contract: Document icon (Bootstrap: bi-file-earmark-text)
  // Optionals: HVAC icon (Image)
  
  const getTabIcon = (tab: string, isActive: boolean) => {
    const iconStyle = {
      fontSize: '16px',
      marginRight: '6px',
      color: isActive ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)'
    };

    switch (tab) {
      case 'Info & Dates':
        return <i className="bi bi-info-circle" style={iconStyle}></i>;
      case 'Fieldwire':
        // TODO: Add fieldwire_darkmode.png to assets when available
        return <img src={iconFieldwire} alt="Fieldwire" style={{ width: '16px', height: '16px', objectFit: 'contain', marginRight: '6px', filter: isActive ? 'none' : 'grayscale(100%) opacity(0.7)' }} />;
      case 'Machines':
         return <i className="bi bi-truck" style={iconStyle}></i>;
      case 'Contract':
        return <i className="bi bi-file-earmark-text" style={iconStyle}></i>;
      case 'Optionals':
        return <i className="bi bi-ui-checks-grid" style={iconStyle}></i>;
      default:
        return null;
    }
  };

  // Update local state if prop changes
  useEffect(() => {
    if (project?.status) setCurrentStatus(project.status);
  }, [project?.status]);

  // Local state for editable fields
  const [clientName, setClientName] = useState(project?.cliente || '');
  const [jobSite, setJobSite] = useState(project?.job_site || '');
  const [type, setType] = useState(project?.type || '');
  const [loteBld, setLoteBld] = useState(project?.lote_bld || '');
  const [address, setAddress] = useState(project?.address || '');
  const [obs, setObs] = useState(project?.obs || '');
  const [prevBeamsDate, setPrevBeamsDate] = useState(project?.previous_beams_date || '');
  const [prevStartDate, setPrevStartDate] = useState(project?.previous_start_date || '');
  const [prevEndDate, setPrevEndDate] = useState(project?.previous_end_date || '');

  // Sync local state when project prop changes (only on ID change to avoid overwriting typed data during updates)
  useEffect(() => {
    if (project) {
        setClientName(project.cliente || '');
        setJobSite(project.job_site || '');
        setType(project.type || '');
        setLoteBld(project.lote_bld || '');
        setAddress(project.address || '');
        setObs(project.obs || '');
        setPrevBeamsDate(project.previous_beams_date || '');
        setPrevStartDate(project.previous_start_date || '');
        setPrevEndDate(project.previous_end_date || '');
    }
  }, [project?.id]);

  // Optionals State
  const [hvac, setHvac] = useState(project?.hvac || false);
  const [buildertrend, setBuildertrend] = useState(project?.buildertrend || false);
  const [storage, setStorage] = useState(project?.storage || false);
  const [qbtime, setQbtime] = useState(project?.qbtime || false);

  useEffect(() => {
    if (project) {
        setHvac(project.hvac || false);
        setBuildertrend(project.buildertrend || false);
        setStorage(project.storage || false);
        setQbtime(project.qbtime || false);
    }
  }, [project]);

  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const startLoading = () => {
    setIsLoading(true);
    setIsSuccess(false);
  };

  const stopLoading = () => {
    setIsLoading(false);
  };

  const showSuccess = () => {
    setIsLoading(false);
    setIsSuccess(true);
    setTimeout(() => {
      setIsSuccess(false);
    }, 2000);
  };

  const handleCreate = async () => {
    if (!onCreate) return;

    try {
        startLoading();
        await onCreate({
            cliente: clientName,
            job_site: jobSite,
            type: type,
            lote_bld: loteBld,
            status: currentStatus,
            address: address,
            obs: obs,
            previous_beams_date: prevBeamsDate,
            previous_start_date: prevStartDate,
            previous_end_date: prevEndDate,
            hvac,
            buildertrend,
            storage,
            qbtime
        });
        
        showSuccess();
        
        // Clear specific fields for next entry as requested
        setLoteBld('');
        setAddress('');
        setPrevBeamsDate('');
        setPrevStartDate('');
        setPrevEndDate('');
        
    } catch (error) {
        console.error('Error creating project in component:', error);
        stopLoading();
    }
  };

  const handleUpdateProject = async (field: keyof ForecastData, value: any) => {
    if (isCreationMode) {
      if (field === 'cliente') setClientName(value);
      if (field === 'job_site') setJobSite(value);
      if (field === 'type') setType(value);
      if (field === 'lote_bld') setLoteBld(value);
      if (field === 'address') setAddress(value);
      if (field === 'obs') setObs(value);
      if (field === 'previous_beams_date') setPrevBeamsDate(value);
      if (field === 'previous_start_date') setPrevStartDate(value);
      if (field === 'previous_end_date') setPrevEndDate(value);
      if (field === 'status') setCurrentStatus(value);
      return;
    }

    if (!project?.id) return;
    
    // Don't update if value hasn't changed (simple check)
    if (project[field] === value) return;

    try {
        startLoading();
        
        // Prepare update object
        const updateData: any = { [field]: value, lastupdate_datetimez: new Date().toISOString() };
        
        // If reopening a closed project, we should clear the performance End date
        if (field === 'status' && value === 'open' && project.status === 'closed') {
            // Also clear previous_end_date in forecast_data
            updateData.previous_end_date = null;
            setPrevEndDate('');
            
            const { error: deleteError } = await supabase
                .from('subcontractor_performance')
                .delete()
                .eq('obra_id', project.id)
                .eq('estimated_date_type', 'End');
            
            if (deleteError) {
                console.error('Error deleting end date performance record:', deleteError);
            }
        }

        const { error } = await supabase
            .from('forecast_data')
            .update(updateData)
            .eq('id', project.id);

        if (error) throw error;
        
        showSuccess();
        if (onUpdate) onUpdate();

    } catch (error) {
        console.error(`Error updating ${field}:`, error);
        stopLoading();
    }
  };

  const handleUpdateOptional = async (field: 'hvac' | 'buildertrend' | 'storage' | 'qbtime', value: boolean) => {
    if (isCreationMode) {
        if (field === 'hvac') setHvac(value);
        if (field === 'buildertrend') setBuildertrend(value);
        if (field === 'storage') setStorage(value);
        if (field === 'qbtime') setQbtime(value);
        return;
    }

    if (!project?.id) return;

    try {
        startLoading();
        // Optimistic update
        if (field === 'hvac') setHvac(value);
        if (field === 'buildertrend') setBuildertrend(value);
        if (field === 'storage') setStorage(value);
        if (field === 'qbtime') setQbtime(value);

        const { error } = await supabase
            .from('forecast_data')
            .update({ [field]: value, lastupdate_datetimez: new Date().toISOString() })
            .eq('id', project.id);

        if (error) throw error;
        
        showSuccess();
        if (onUpdate) onUpdate();

    } catch (error) {
        console.error('Error updating optional:', error);
        // Revert on error
        if (field === 'hvac') setHvac(!value);
        if (field === 'buildertrend') setBuildertrend(!value);
        if (field === 'storage') setStorage(!value);
        if (field === 'qbtime') setQbtime(!value);
        stopLoading();
    }
  };

  return (
    <div style={{ width: '100%', marginBottom: '16px', fontFamily: 'Inter, sans-serif', position: 'relative' }}>
      
      {/* Loading/Success Indicator - Absolute positioned to the left of the container */}
      <div style={{ 
        position: 'absolute', 
        top: '0', 
        left: '0', 
        display: 'flex', 
        alignItems: 'center',
        height: '35px', // Same height as tab
        zIndex: 10,
        paddingLeft: '12px'
      }}>
        {isLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(255,255,255,0.9)', padding: '4px 8px', borderRadius: '12px' }}>
            <div style={{
              width: '14px',
              height: '14px',
              border: '2px solid #e0e0e0',
              borderTop: '2px solid var(--color-accent-primary, #3b82f6)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}></div>
            <span style={{ fontSize: '11px', color: '#666', fontWeight: 500 }}>Saving...</span>
          </div>
        )}
        {!isLoading && isSuccess && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(255,255,255,0.9)', padding: '4px 8px', borderRadius: '12px' }}>
            <i className="bi bi-check-circle-fill" style={{ fontSize: '14px', color: '#10B981' }}></i>
            <span style={{ fontSize: '11px', color: '#10B981', fontWeight: 500 }}>Saved!</span>
          </div>
        )}
      </div>

      {/* Navigation Cell (Trapezoid Tab) - Aligned to Right */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: '0' }}>
        <div 
          style={{
            position: 'relative',
            height: '35px', // Ajustado para 35px conforme solicitado
            marginBottom: '-1px', // Merge with bottom container
            zIndex: 2,
            minWidth: '550px', // Aumentado significativamente para dar respiro
            marginRight: '0' // Encostado na quina direita
          }}
        >
          {/* CSS Transform Shape (The "Behind" one) */}
          <div
            style={{
              position: 'absolute',
              height: '46px', // Altura aumentada para compensar a perda visual da perspectiva (de ~40px para ~30px = fator 0.75. Para ter 35px visual: 35/0.75 = ~46px)
              left: 0, right: 0, bottom: 0,
              backgroundColor: 'var(--color-background-primary)',
              border: '1px solid var(--color-border-divider)',
              borderBottom: '1px solid var(--color-background-primary)', // Hide bottom border to merge
              // Trapezoid shape with rounded corners
              transform: 'perspective(50px) rotateX(10deg)', 
              transformOrigin: 'bottom',
              borderRadius: '16px 16px 0 0',
              boxShadow: '0 -1px 2px rgba(0,0,0,0.02)'
            }}
          />
          
          {/* Content Wrapper */}
          <div
            style={{
              height: '100%',
              position: 'relative',
              zIndex: 3,
              display: 'flex',
              alignItems: 'center', // Alinhado ao centro na altura
              justifyContent: 'center',
              padding: '0 48px', // Aumentado padding lateral
              paddingBottom: '0' // Removido padding inferior para centralizar
            }}
          >
             <div style={{ display: 'flex', gap: '24px', fontSize: '12px', fontWeight: 400, color: 'var(--color-text-secondary)' }}>
              {tabs.map((tab) => (
                <div 
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{ 
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    color: activeTab === tab ? 'var(--color-accent-primary)' : 'inherit', 
                    fontWeight: activeTab === tab ? 600 : 400, 
                    cursor: 'pointer',
                    opacity: activeTab === tab ? 1 : 0.7,
                    transition: 'opacity 0.2s'
                  }}
                >
                  {getTabIcon(tab, activeTab === tab)}
                  <span>{tab}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && createPortal(
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            backgroundColor: 'var(--color-background-secondary)',
            padding: '24px',
            borderRadius: '12px',
            width: '400px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            border: '1px solid var(--color-border-divider)'
          }}>
            <h3 style={{ margin: '0 0 16px 0', color: 'var(--color-text-primary)', fontSize: '18px', fontWeight: 600 }}>Delete Project?</h3>
            <p style={{ margin: '0 0 24px 0', color: 'var(--color-text-secondary)', fontSize: '14px' }}>
              Are you sure you want to delete this project? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                onClick={() => setDeleteModalOpen(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border-divider)',
                  backgroundColor: 'transparent',
                  color: 'var(--color-text-primary)',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={!canDelete}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: canDelete ? '#ef4444' : '#fee2e2',
                  color: canDelete ? '#ffffff' : '#ef4444',
                  cursor: canDelete ? 'pointer' : 'not-allowed',
                  transition: 'all 0.2s',
                  fontWeight: 500
                }}
              >
                {canDelete ? 'Yes, Delete' : `Wait ${deleteCountDown}s`}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Main Container */}
      <div 
        style={{
          width: '100%',
          height: '220px',
          backgroundColor: 'var(--color-background-primary)',
          border: '1px solid var(--color-border-divider)',
          borderLeft: `6px solid ${statusColor}`,
          // 3 Rounded Corners, Top-Right Sharp
          borderRadius: '8px 0 8px 8px', 
          display: 'flex',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
          position: 'relative',
          zIndex: 1,
          overflow: 'hidden' // Garantir bordas arredondadas
        }}
      >
        {/* Lado Esquerdo - 40% Fixo */}
        <div style={{ 
          width: '40%', 
          height: '100%', 
          borderRight: '1px solid var(--color-border-divider)',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          textAlign: 'left',
          gap: '8px' // Espaçamento entre as linhas
        }}>
           {/* Linha 1: Client Name e Job Site */}
             <div style={{ display: 'flex', gap: '8px' }}>
               <div style={{ width: '30%', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                 <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '2px' }}>Client Name</span>
                 <MultiSelectDropdown
                    options={availableClients}
                    selectedValues={clientName ? [clientName] : []}
                    onChange={(vals) => {
                        const val = vals[0] || '';
                        setClientName(val);
                        handleUpdateProject('cliente', val);
                    }}
                    isSingleSelect={true}
                    allowCustomValue={true}
                    placeholder="Client Name"
                    style={{
                        width: '100%',
                        height: '30px',
                        fontSize: '12px',
                        border: '1px solid var(--color-border-divider)',
                        borderRadius: '4px',
                        padding: '0 8px',
                        backgroundColor: 'var(--color-background-primary)',
                        color: 'var(--color-text-primary)',
                        fontWeight: 400
                    }}
                 />
               </div>
               <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                 <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '2px' }}>Job Site</span>
                 <MultiSelectDropdown
                    options={availableJobSites}
                    selectedValues={jobSite ? [jobSite] : []}
                    onChange={(vals) => {
                        const val = vals[0] || '';
                        setJobSite(val);
                        handleUpdateProject('job_site', val);
                    }}
                    isSingleSelect={true}
                    allowCustomValue={true}
                    placeholder="Job Site"
                    style={{
                        width: '100%',
                        height: '30px',
                        fontSize: '12px',
                        border: '1px solid var(--color-border-divider)',
                        borderRadius: '4px',
                        padding: '0 8px',
                        backgroundColor: 'var(--color-background-primary)',
                        color: 'var(--color-text-primary)',
                        fontWeight: 400
                    }}
                 />
               </div>
             </div>
  
             {/* Linha 2: Type, Lote/Bld, Status */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ width: '33.33%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '2px' }}>Type</span>
                <div style={{ width: '100%' }}>
                  <MultiSelectDropdown
                    selectedValues={type ? [type] : []}
                    onChange={(vals) => {
                        const val = vals[0] || '';
                        setType(val);
                        handleUpdateProject('type', val);
                    }}
                    options={availableTypes.map(t => ({ label: t, value: t }))}
                    isSingleSelect={true}
                    placeholder="Select Type"
                    style={{
                      width: '100%',
                      height: '30px',
                      fontSize: '12px',
                      border: '1px solid var(--color-border-divider)',
                      borderRadius: '4px',
                      padding: '0 8px',
                      backgroundColor: 'var(--color-background-primary)',
                      color: 'var(--color-text-primary)',
                      fontWeight: 400
                    }}
                  />
                </div>
              </div>
              <div style={{ width: '33.33%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '2px' }}>Number #</span>
                <StyledInput 
                  value={loteBld}
                   onChange={(e) => setLoteBld(e.target.value)}
                   onBlur={() => handleUpdateProject('lote_bld', loteBld)}
                   style={{
                     width: '100%',
                     height: '30px',
                     fontSize: '12px',
                     border: '1px solid var(--color-border-divider)',
                     borderRadius: '4px',
                     padding: '0 8px',
                     backgroundColor: 'var(--color-background-primary)'
                   }}
                 />
               </div>
               <div style={{ width: '33.33%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                 <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '2px' }}>Status</span>
                 <div style={{ width: '100%' }}>
                    <MultiSelectDropdown
                      selectedValues={currentStatus ? [currentStatus] : []}
                      onChange={(vals) => {
                          const val = vals[0] || '';
                          setCurrentStatus(val);
                          handleUpdateProject('status', val);
                      }}
                      options={[
                        { label: 'Not Started', value: 'not started', disabled: currentStatus === 'closed' },
                        { label: 'Open', value: 'open' },
                        { label: 'Closed', value: 'closed', disabled: currentStatus === 'not started' }
                      ]}
                      isSingleSelect={true}
                      placeholder="Select Status"
                      style={{
                        width: '100%',
                        height: '30px',
                        fontSize: '12px',
                        border: '1px solid var(--color-border-divider)',
                        borderRadius: '4px',
                        padding: '0 8px',
                        backgroundColor: 'var(--color-background-primary)',
                        color: 'var(--color-text-primary)',
                        fontWeight: 400
                      }}
                    />
                  </div>
               </div>
             </div>
 
            {/* Linha 3: Address */}
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '2px' }}>Address</span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <StyledInput 
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    onBlur={() => handleUpdateProject('address', address)}
                    style={{
                      width: '100%',
                      height: '30px',
                      fontSize: '12px',
                      border: '1px solid var(--color-border-divider)',
                      borderRadius: '4px',
                      padding: '0 8px',
                      backgroundColor: 'var(--color-background-primary)'
                    }}
                  />
                </div>
                {!isCreationMode && (
                  <button
                    onClick={() => setDeleteModalOpen(true)}
                    style={{
                      height: '30px',
                      width: '30px',
                      flex: '0 0 30px',
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                      borderRadius: '4px',
                      color: '#ef4444',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      margin: 0
                    }}
                    title="Delete Project"
                  >
                    <i className="bi bi-trash"></i>
                  </button>
                )}
              </div>
            </div>
         </div>

         {/* Lado Direito - 60% Dinâmico */}
         <div style={{ 
           width: '60%', 
           height: '100%', 
           padding: '16px',
           display: 'flex',
           flexDirection: 'column',
           overflowY: 'auto'
         }}>
            {activeTab === 'Info & Dates' && (
               <div style={{ display: 'flex', gap: '16px', height: '100%' }}>
                 {/* Left: Observations */}
                 <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Observations</span>
                    <StyledTextarea
                      className="custom-scrollbar"
                      value={obs}
                      onChange={(e) => setObs(e.target.value)}
                      placeholder="Type observations here..."
                      onBlur={() => handleUpdateProject('obs', obs)}
                      style={{
                        flex: 1,
                        width: '100%',
                        resize: 'none',
                        border: '1px solid var(--color-border-divider)',
                        borderRadius: '4px',
                        padding: '8px',
                        fontSize: '12px',
                        backgroundColor: 'var(--color-background-primary)',
                        fontFamily: 'inherit'
                      }}
                    />
                 </div>
 
                 {/* Right: Dates Stack */}
                 <div style={{ width: '140px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                       <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginBottom: '2px' }}>Previous Beams</span>
                       <DateInput 
                         dateValue={prevBeamsDate ? prevBeamsDate.split('T')[0] : ''}
                         onBlur={(val) => handleUpdateProject('previous_beams_date', val)}
                         style={{ height: '30px', fontSize: '12px', border: '1px solid var(--color-border-divider)', borderRadius: '4px', padding: '0 8px', width: '100%', backgroundColor: 'var(--color-background-primary)' }} 
                       />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                       <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginBottom: '2px' }}>Previous Start</span>
                       <DateInput 
                         dateValue={prevStartDate ? prevStartDate.split('T')[0] : ''}
                         onBlur={(val) => handleUpdateProject('previous_start_date', val)}
                         style={{ height: '30px', fontSize: '12px', border: '1px solid var(--color-border-divider)', borderRadius: '4px', padding: '0 8px', width: '100%', backgroundColor: 'var(--color-background-primary)' }} 
                       />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                       <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginBottom: '2px' }}>Previous End</span>
                       <DateInput 
                         dateValue={prevEndDate ? prevEndDate.split('T')[0] : ''}
                         onBlur={(val) => handleUpdateProject('previous_end_date', val)}
                         style={{ height: '30px', fontSize: '12px', border: '1px solid var(--color-border-divider)', borderRadius: '4px', padding: '0 8px', width: '100%', backgroundColor: 'var(--color-background-primary)' }} 
                       />
                    </div>

                    {isCreationMode && (
                        <button 
                            onClick={handleCreate}
                            style={{
                                marginTop: 'auto',
                                alignSelf: 'flex-end',
                                width: '100%',
                                padding: '8px 0',
                                backgroundColor: 'var(--color-accent-primary)',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '13px',
                                fontWeight: 500,
                                cursor: 'pointer',
                                transition: 'background-color 0.2s',
                                boxShadow: '0 2px 4px rgba(59, 130, 246, 0.2)'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--color-accent-hover, #2563eb)'}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'var(--color-accent-primary)'}
                        >
                            Create Project
                        </button>
                    )}
                 </div>
               </div>
             )}
            
            {activeTab !== 'Info & Dates' && (
              <div style={{ height: '100%', overflowY: 'auto' }}>
                 {/* Fieldwire */}
                 {activeTab === 'Fieldwire' && project?.id && (
                    <FieldwireList 
                        obraId={project.id} 
                        onLoadingStart={startLoading}
                        onLoadingStop={stopLoading}
                        onSuccess={showSuccess}
                    />
                 )}

                 {/* Machines */}
                 {activeTab === 'Machines' && project?.id && (
                    <MachinesList 
                        obraId={project.id} 
                        project={project}
                        onLoadingStart={startLoading}
                        onLoadingStop={stopLoading}
                        onSuccess={showSuccess}
                    />
                 )}

                 {/* Contract */}
                 {activeTab === 'Contract' && project?.id && (
                    <ContractStepsList 
                        obraId={project.id} 
                        onLoadingStart={startLoading}
                        onLoadingStop={stopLoading}
                        onSuccess={showSuccess}
                    />
                 )}

                 {/* Optionals (Grid 2 columns) */}
                 {activeTab === 'Optionals' && (
                    <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: '1fr 1fr', 
                        gap: '12px',
                        padding: '8px',
                        height: '100%',
                        alignItems: 'center'
                    }}>
                        {/* Column 1: HVAC */}
                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>

                            <div 
                               onClick={() => handleUpdateOptional('hvac', !hvac)}
                               style={{
                                   border: `1px solid ${hvac ? 'var(--color-accent-primary)' : 'var(--color-border-divider)'}`,
                                   borderRadius: '4px',
                                   backgroundColor: hvac ? 'rgba(59, 130, 246, 0.05)' : 'var(--color-background-primary)',
                                   display: 'flex',
                                   alignItems: 'center',
                                   padding: '0 12px',
                                   cursor: 'pointer',
                                   transition: 'all 0.2s',
                                   gap: '12px',
                                   height: '30px'
                               }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    <input 
                                        type="checkbox" 
                                        checked={hvac} 
                                        readOnly 
                                        style={{ 
                                            cursor: 'pointer',
                                            accentColor: 'var(--color-accent-primary)',
                                            width: '16px',
                                            height: '16px'
                                        }} 
                                    />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px' }}>
                                    <img src={isDarkMode ? iconForecastHvacDark : iconForecastHvac} alt="HVAC" style={{ width: '16px', height: '16px', objectFit: 'contain' }} />
                                </div>
                                <span style={{ fontSize: '13px', fontWeight: hvac ? 600 : 400, color: 'var(--color-text-primary)' }}>HVAC</span>
                            </div>
                        </div>

                        {/* Column 2: Systems List */}
                        <div>
                            <div style={{ 
                                fontSize: '11px', 
                                color: 'var(--color-text-secondary)', 
                                marginBottom: '2px',
                                textAlign: 'left'
                            }}>
                                Systems
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {/* Buildertrend */}
                                <div 
                                   onClick={() => handleUpdateOptional('buildertrend', !buildertrend)}
                                   style={{
                                       border: `1px solid ${buildertrend ? 'var(--color-accent-primary)' : 'var(--color-border-divider)'}`,
                                       borderRadius: '4px',
                                       backgroundColor: buildertrend ? 'rgba(59, 130, 246, 0.05)' : 'var(--color-background-primary)',
                                       display: 'flex',
                                       alignItems: 'center',
                                       padding: '0 12px',
                                       cursor: 'pointer',
                                       transition: 'all 0.2s',
                                       gap: '12px',
                                       height: '30px'
                                   }}
                                >
                                <div style={{ 
                                    width: '16px', 
                                    height: '16px', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center',
                                    flexShrink: 0
                                }}>
                                    <img src={isDarkMode ? iconBuildertrendDark : iconBuildertrend} alt="Buildertrend" style={{ width: '16px', height: '16px', objectFit: 'contain' }} />
                                </div>
                                <span style={{ 
                                    fontSize: '13px',
                                    color: 'var(--color-text-primary)',
                                    fontWeight: 500
                                }}>Buildertrend</span>
                                </div>

                                {/* Storage */}
                                <div 
                                   onClick={() => handleUpdateOptional('storage', !storage)}
                                   style={{
                                       border: `1px solid ${storage ? 'var(--color-accent-primary)' : 'var(--color-border-divider)'}`,
                                       borderRadius: '4px',
                                       backgroundColor: storage ? 'rgba(59, 130, 246, 0.05)' : 'var(--color-background-primary)',
                                       display: 'flex',
                                       alignItems: 'center',
                                       padding: '0 12px',
                                       cursor: 'pointer',
                                       transition: 'all 0.2s',
                                       gap: '12px',
                                       height: '30px'
                                   }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                        <input 
                                            type="checkbox" 
                                            checked={storage} 
                                            readOnly 
                                            style={{ 
                                                cursor: 'pointer',
                                                accentColor: 'var(--color-accent-primary)',
                                                width: '16px',
                                                height: '16px'
                                            }} 
                                        />
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px' }}>
                                        <i className="bi bi-box-seam" style={{ fontSize: '16px', color: storage ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)' }} />
                                    </div>
                                    <span style={{ fontSize: '13px', fontWeight: storage ? 600 : 400, color: 'var(--color-text-primary)' }}>Storage</span>
                                </div>

                                {/* QBTime */}
                            <div 
                               onClick={() => handleUpdateOptional('qbtime', !qbtime)}
                               style={{
                                   border: `1px solid ${qbtime ? 'var(--color-accent-primary)' : 'var(--color-border-divider)'}`,
                                   borderRadius: '4px',
                                   backgroundColor: qbtime ? 'rgba(59, 130, 246, 0.05)' : 'var(--color-background-primary)',
                                   display: 'flex',
                                   alignItems: 'center',
                                   padding: '0 12px',
                                   cursor: 'pointer',
                                   transition: 'all 0.2s',
                                   gap: '12px',
                                   height: '30px'
                               }}
                            >
                                <div style={{ 
                                    width: '16px', 
                                    height: '16px', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center',
                                    flexShrink: 0
                                }}>
                                    <img src={isDarkMode ? iconQBTimeDark : iconQBTime} alt="QBTime" style={{ width: '16px', height: '16px', objectFit: 'contain' }} />
                                </div>
                                <span style={{ 
                                    fontSize: '13px',
                                    color: 'var(--color-text-primary)',
                                    fontWeight: 500
                                }}>QBTime</span>
                            </div>
                            </div>
                        </div>
                    </div>
                 )}
              </div>
            )}
         </div>
      </div>
    </div>
  );
}
