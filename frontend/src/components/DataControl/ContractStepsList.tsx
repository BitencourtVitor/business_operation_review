import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../../supabaseClient';
import type { ForecastContractSteps, C_ContractedSteps, C_Workforce, ForecastContract } from '../../types/dataControl';
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

interface ContractStepsListProps {
  obraId: string;
}

export default function ContractStepsList({ obraId }: ContractStepsListProps) {
  const { startLoading, stopLoading, showSuccess } = useGlobalFeedback();
  const [teams, setTeams] = useState<string[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  
  const [items, setItems] = useState<ForecastContractSteps[]>([]);
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState<C_ContractedSteps[]>([]);
  const [workforce, setWorkforce] = useState<C_Workforce[]>([]);
  const [isAddingContract, setIsAddingContract] = useState(false);
  const [newWorkforceSelection, setNewWorkforceSelection] = useState<string>('');

  // Load initial data
  useEffect(() => {
    if (obraId) {
      setItems([]);
      setSelectedTeam(null);
      setTeams([]);
      fetchTeams().catch(console.error);
      fetchSteps().catch(console.error);
      fetchWorkforce().catch(console.error);
    }
  }, [obraId]);

  // Fetch active teams (workforces) from forecast_contract_steps
  const fetchTeams = async () => {
    const { data } = await supabase
      .from('forecast_contract_steps')
      .select('team')
      .eq('obra_id', obraId);
    
    if (data) {
      // Get unique team names from steps
      const uniqueTeams = Array.from(new Set(data.map(d => d.team).filter(Boolean)));
      setTeams(uniqueTeams);
    }
  };

  // Auto-select workforce if only one exists
  useEffect(() => {
    if (teams.length === 1 && !selectedTeam) {
       setSelectedTeam(teams[0]);
    }
  }, [teams]); 

  // When a team is selected, load its steps
  useEffect(() => {
    if (selectedTeam) {
      setItems([]); // Clear previous items
      fetchItems(selectedTeam).catch(console.error);
    } else {
      setItems([]);
    }
  }, [selectedTeam]);

  // Sync steps for the selected team
  useEffect(() => {
    if (selectedTeam && steps.length > 0 && !loading) {
      syncItemsWithSteps(selectedTeam).catch(console.error);
    }
  }, [selectedTeam, steps, items.length, loading]);

  const handleWorkforceSelect = async (workforceName: string) => {
      // Check if team is already in the list
      if (teams.includes(workforceName)) {
        setSelectedTeam(workforceName);
        return;
      }

      if (!obraId) {
        console.error('No obraId provided');
        alert('Erro: ID da obra não encontrado.');
        return;
      }

      // If it's a new team, create steps for it
      try {
        startLoading();
        setLoading(true);
        
        let currentSteps = steps;
        
        // Se steps estiver vazio, tenta buscar novamente
         if (currentSteps.length === 0) {
             const { data } = await supabase.from('C_contract_steps').select('*');
             if (data && data.length > 0) {
                 currentSteps = data;
                 setSteps(data);
             } else {
                 console.warn('No steps found in C_contract_steps');
                 alert('Atenção: Nenhuma etapa encontrada em "C_contract_steps". O workforce não será salvo permanentemente até que existam etapas configuradas.');
                 // Ainda permitimos adicionar localmente para UX, mas avisamos
             }
         }
         
         // Prepare new items based on C_contract_steps
         const newItems = currentSteps.map(step => ({
          obra_id: obraId,
          step: step.step,
          status: false,
          team: workforceName,
          lastupdate_datetimez: new Date().toISOString()
        }));

        if (newItems.length > 0) {
          const { error } = await supabase
            .from('forecast_contract_steps')
            .insert(newItems);

          if (error) {
              console.error('Supabase insert error:', error);
              throw error;
          }
          
          // Sucesso: recarrega os times do servidor para garantir consistência
          await fetchTeams();
        }

        // Update local state (redundante se fetchTeams funcionar, mas bom para UX instantânea)
        setTeams(prev => {
            if (prev.includes(workforceName)) return prev;
            return [...prev, workforceName];
        });
        setSelectedTeam(workforceName);
        showSuccess();
        
      } catch (error: any) {
        console.error('Error creating steps for new workforce:', error);
        alert(`Erro ao adicionar workforce: ${error.message || JSON.stringify(error)}`);
        stopLoading();
      } finally {
        setLoading(false);
      }
  };

  const fetchItems = async (teamName: string) => {
    setLoading(true);
    try {
      // 1. Fetch items directly linked to obra_id and team (Denormalized)
      const { data: directData, error: directError } = await supabase
        .from('forecast_contract_steps')
        .select('*')
        .eq('obra_id', obraId)
        .eq('team', teamName);
      
      if (directError) throw directError;

      // 2. Fetch contract_id from forecast_contracts (Normalized parent)
      const { data: contractData, error: contractError } = await supabase
        .from('forecast_contracts')
        .select('id')
        .eq('obra_id', obraId)
        .eq('name', teamName)
        .maybeSingle(); // Use maybeSingle to avoid error if not found

      let linkedData: ForecastContractSteps[] = [];
      if (contractData) {
        // 3. Fetch items linked via contract_id
        const { data: indirectData, error: indirectError } = await supabase
          .from('forecast_contract_steps')
          .select('*')
          .eq('contract_id', contractData.id);
        
        if (indirectError) console.error('Error fetching linked steps:', indirectError);
        if (indirectData) linkedData = indirectData;
      }

      // 4. Merge data (prefer status=true if duplicates exist for same step)
      // We use a map keyed by step name
      const mergedMap = new Map<string, ForecastContractSteps>();
      
      const allItems = [...(directData || []), ...linkedData];
      
      allItems.forEach(item => {
        if (!item.step) return;
        const existing = mergedMap.get(item.step);
        
        if (!existing) {
          mergedMap.set(item.step, item);
        } else {
          // If we have a duplicate, prefer the one with status=true
          // If both are true or both false, prefer the one with most recent update? 
          // Or prefer the one with direct link?
          // Let's prioritize status=true
          if (!existing.status && item.status) {
            mergedMap.set(item.step, item);
          }
        }
      });

      // Convert map back to array and sort by ID (or step order if available)
      // Since ID sort might be mixed, we might want to sort by step name or custom order
      // For now, let's sort by ID of the chosen item
      const finalItems = Array.from(mergedMap.values()).sort((a, b) => a.id - b.id);
      
      setItems(finalItems);

    } catch (error) {
      console.error('Error fetching items:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSteps = async () => {
    const { data } = await supabase.from('C_contract_steps').select('*');
    if (data) setSteps(data);
  };

  const fetchWorkforce = async () => {
    const { data } = await supabase.from('C_workforce').select('*').order('name');
    if (data) setWorkforce(data);
  };

  const syncItemsWithSteps = async (teamName: string) => {
    // Ensure we don't duplicate steps for this team
    const missingSteps = steps.filter(step => 
      !items.some(item => item.step === step.step)
    );

    if (missingSteps.length > 0) {
      const newItems = missingSteps.map(step => ({
        obra_id: obraId,
        step: step.step,
        status: false,
        team: teamName,
        lastupdate_datetimez: new Date().toISOString()
      }));

      const { error } = await supabase.from('forecast_contract_steps').insert(newItems);
      if (!error) {
        fetchItems(teamName);
        fetchTeams(); // Refresh teams list just in case
      } else {
        console.error('Error syncing steps:', error);
      }
    } else {
        // Even if no new steps, we should refresh teams just in case
        fetchTeams();
    }
  };

  const updateLocal = (id: number, field: keyof ForecastContractSteps, value: any) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const handleUpdate = async (id: number, field: keyof ForecastContractSteps, value: any) => {
    startLoading();
    // Optimistic update
    updateLocal(id, field, value);

    try {
      const { error } = await supabase
        .from('forecast_contract_steps')
        .update({ 
          [field]: value,
          lastupdate_datetimez: new Date().toISOString()
        })
        .eq('id', id);

      if (error) {
        throw error;
      } else {
        showSuccess();
      }
    } catch (error) {
      console.error('Error updating step:', error);
      // Revert if needed
      if (selectedTeam) fetchItems(selectedTeam);
      stopLoading();
    }
  };

  const handleDeleteWorkforce = async () => {
    if (!selectedTeam || !obraId) return;

    // Check if any step is true/checked
    const hasActiveSteps = items.some(item => item.status === true);
    if (hasActiveSteps) {
      alert('Não é possível deletar este workforce pois existem etapas concluídas (marcadas). Desmarque todas as etapas antes de deletar.');
      return;
    }

    if (!window.confirm(`Tem certeza que deseja remover o workforce "${selectedTeam}"? Esta ação não pode ser desfeita.`)) {
      return;
    }

    try {
      startLoading();
      setLoading(true);
      const { error } = await supabase
        .from('forecast_contract_steps')
        .delete()
        .eq('obra_id', obraId)
        .eq('team', selectedTeam);

      if (error) throw error;

      // Update local state
      setTeams(prev => prev.filter(t => t !== selectedTeam));
      setSelectedTeam(null);
      setItems([]);
      showSuccess();
      
    } catch (error: any) {
      console.error('Error deleting workforce:', error);
      alert(`Erro ao deletar workforce: ${error.message || 'Erro desconhecido'}`);
      stopLoading();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '20px', width: '100%', height: '100%' }}>
      {/* Left Sidebar: Workforce List */}
      <div style={{ width: '250px', borderRight: '1px solid var(--color-border-divider)', paddingRight: '15px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', textAlign: 'center', marginBottom: '2px' }}>Workforce</div>
        
        {/* List of Active Teams */}
        <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
          {teams.length === 0 && (
            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>No active contracts</div>
          )}
          {teams.map(teamName => {
            const isSelected = selectedTeam === teamName;
            // Só podemos deletar se for o time selecionado (temos os items carregados), não estiver carregando,
            // tiver items e nenhum deles estiver com status true.
            const canDelete = isSelected && !loading && items.length > 0 && !items.some(i => i.status);

            return (
              <div key={teamName} style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <div
                    onClick={() => setSelectedTeam(teamName)}
                    style={{
                      flex: 1,
                      height: '30px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0 12px',
                      borderRadius: '6px',
                      backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'var(--color-background-secondary)',
                      border: `1px solid ${isSelected ? 'var(--color-accent-primary)' : 'var(--color-border-divider)'}`,
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: isSelected ? 600 : 400,
                      color: isSelected ? 'var(--color-accent-primary)' : 'var(--color-text-primary)',
                      transition: 'all 0.2s',
                      overflow: 'hidden'
                    }}
                >
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{teamName}</span>
                    {isSelected && !canDelete && <i className="bi bi-chevron-right" style={{ fontSize: '10px' }}></i>}
                </div>
                
                {canDelete && (
                    <button
                        onClick={handleDeleteWorkforce}
                        title="Delete Workforce"
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
                            flexShrink: 0
                        }}
                    >
                        <i className="bi bi-trash" style={{ fontSize: '12px' }}></i>
                    </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Add Contract Section */}
        <div style={{ borderTop: '1px solid var(--color-border-divider)', paddingTop: '10px' }}>
            {!isAddingContract ? (
                <button 
                    onClick={() => setIsAddingContract(true)}
                    style={{
                        width: '100%',
                        height: '30px',
                        padding: '0 12px',
                        backgroundColor: 'var(--color-background-primary)',
                        border: '1px dashed var(--color-border-divider)',
                        borderRadius: '4px',
                        color: 'var(--color-text-secondary)',
                        fontSize: '11px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                    }}
                >
                    <i className="bi bi-plus-circle"></i>
                    Add Workforce
                </button>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <CustomDropdown 
                        value={newWorkforceSelection}
                        onChange={setNewWorkforceSelection}
                        options={workforce
                            .filter(w => !teams.includes(w.name))
                            .map(w => ({ label: w.name, value: w.name }))
                        }
                        placeholder="Select workforce..."
                        style={{ height: '30px' }}
                    />
                    
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button 
                            onClick={() => {
                                setIsAddingContract(false);
                                setNewWorkforceSelection('');
                            }}
                            style={{
                                flex: 1,
                                height: '26px',
                                fontSize: '11px',
                                color: 'var(--color-text-secondary)',
                                backgroundColor: 'var(--color-background-primary)',
                                border: '1px solid var(--color-border-divider)',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={() => {
                                if (newWorkforceSelection) {
                                    handleWorkforceSelect(newWorkforceSelection);
                                    setIsAddingContract(false);
                                    setNewWorkforceSelection('');
                                }
                            }}
                            style={{
                                flex: 1,
                                height: '26px',
                                fontSize: '11px',
                                color: '#fff',
                                backgroundColor: newWorkforceSelection ? 'var(--color-accent-primary)' : '#ccc',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: newWorkforceSelection ? 'pointer' : 'not-allowed',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                            disabled={!newWorkforceSelection}
                        >
                            OK
                        </button>
                    </div>
                </div>
            )}
        </div>
      </div>

      {/* Right Area: Steps List */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>

        {!selectedTeam ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
            Select a workforce to view steps
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
            
            <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', paddingRight: '4px' }}>
             {loading ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px' }}>
                    <div className="spinner-border text-primary" role="status">
                        <span className="visually-hidden">Loading...</span>
                    </div>
                </div>
             ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {items.map(item => (
                    <div 
                      key={item.id} 
                      style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          padding: '0 8px',
                          height: '30px',
                          borderRadius: '4px',
                          backgroundColor: 'var(--color-background-primary)',
                          border: '1px solid var(--color-border-divider)',
                          gap: '12px',
                          fontSize: '11px'
                      }}
                    >
                      {/* Checkbox */}
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                          <input 
                            type="checkbox" 
                            checked={!!item.status} 
                            onChange={e => handleUpdate(item.id, 'status', e.target.checked)}
                            style={{
                                width: '16px',
                                height: '16px',
                                cursor: 'pointer',
                                accentColor: 'var(--color-accent-primary)'
                            }}
                          />
                      </div>

                      {/* Step Name */}
                      <div style={{ flex: 1, color: 'var(--color-text-primary)', fontWeight: 500 }}>
                          {item.step}
                      </div>
                    </div>
                  ))}
                  
                  {items.length === 0 && !loading && (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
                      {items.length === 0 ? 'No steps found. Syncing...' : 'No steps found.'}
                    </div>
                  )}
                </div>
             )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
