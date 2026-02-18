import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import type { ForecastFieldwire, C_Fieldwire } from '../../types/dataControl';
import { useGlobalFeedback } from '../../contexts/GlobalFeedbackContext';

interface FieldwireListProps {
  obraId: string;
  onLoadingStart?: () => void;
  onLoadingStop?: () => void;
  onSuccess?: () => void;
}

export default function FieldwireList({ obraId, onLoadingStart, onLoadingStop, onSuccess }: FieldwireListProps) {
  const { startLoading, stopLoading, showSuccess } = useGlobalFeedback();
  const [items, setItems] = useState<ForecastFieldwire[]>([]);
  const [categories, setCategories] = useState<C_Fieldwire[]>([]);
  const [workforceOptions, setWorkforceOptions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Fetch data
  useEffect(() => {
    if (obraId) {
      setItems([]); // Clear items to avoid showing previous project data
      setIsLoading(true);
      Promise.all([
        fetchItems(),
        fetchCategories(),
        fetchWorkforce()
      ]).finally(() => setIsLoading(false));
    }
  }, [obraId]);

  const fetchItems = async () => {
    const { data } = await supabase
      .from('forecast_fieldwire')
      .select('*')
      .eq('obra_id', obraId)
      .order('id', { ascending: true });
    
    if (data) setItems(data);
  };

  const fetchCategories = async () => {
    // Buscar categorias definidas em C_fieldwire
    const { data } = await supabase.from('C_fieldwire').select('*');
    if (data) setCategories(data);
  };

  const fetchWorkforce = async () => {
      // Buscar opções de workforce
      const { data } = await supabase.from('C_workforce').select('name');
      if (data) setWorkforceOptions(data.map(d => d.name));
  };

  // Ensure all categories exist for this project
  // useEffect(() => {
  //    if (categories.length > 0 && obraId) {
  //        syncItemsWithCategories().catch(console.error);
  //    }
  // }, [categories, items, obraId]);

  const syncItemsWithCategories = async () => {
      const missingItems = categories.filter(cat => 
          !items.some(item => item.category === cat.category && item.document === cat.document)
      );

      if (missingItems.length > 0) {
          const newItems = missingItems.map(cat => ({
              obra_id: obraId,
              category: cat.category,
              document: cat.document,
              status: false,
              team: '',
              lastupdate_datetimez: new Date().toISOString()
          }));

          const { error } = await supabase.from('forecast_fieldwire').insert(newItems);
          if (!error) {
              fetchItems(); // Reload
          }
      }
  };

  const handleUpdate = async (id: number, field: keyof ForecastFieldwire, value: any) => {
    startLoading();
    if (onLoadingStart) onLoadingStart();
    // Optimistic update
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));

    try {
      const { error } = await supabase
        .from('forecast_fieldwire')
        .update({ [field]: value, lastupdate_datetimez: new Date().toISOString() })
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
    <div style={{ width: '100%', padding: '8px 0', maxWidth: '600px', height: '100%', display: 'flex', flexDirection: 'column' }}>
       {isLoading ? (
         <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px' }}>
             <div className="spinner-border text-primary" role="status">
                 <span className="visually-hidden">Loading...</span>
             </div>
         </div>
       ) : (
         <div style={{ flex: 1, overflowY: 'auto' }}>
           {items.map(item => (
               <div 
                 key={item.id} 
                 style={{ 
                     display: 'flex', 
                     alignItems: 'center', 
                     marginBottom: '8px',
                     gap: '8px',
                     fontSize: '12px',
                     padding: '0 8px',
                     height: '30px',
                     borderRadius: '4px',
                     border: '1px solid var(--color-border-divider)',
                     backgroundColor: 'var(--color-background-primary)'
                 }}
               >
                  {/* Checkbox */}
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
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
  
                  {/* Document Name (Etapa) */}
                  <div style={{ flex: 1, color: 'var(--color-text-primary)', fontWeight: 500 }}>
                      {item.document}
                  </div>
               </div>
           ))}
           
           {items.length === 0 && (
               <div style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic', fontSize: '12px' }}>No steps defined.</div>
           )}
         </div>
       )}
    </div>
  );
}
