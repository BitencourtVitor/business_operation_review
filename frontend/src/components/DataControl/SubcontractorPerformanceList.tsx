import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import type { SubcontractorPerformance } from '../../types/dataControl';

interface SubcontractorPerformanceListProps {
  obraId: string;
}

export default function SubcontractorPerformanceList({ obraId }: SubcontractorPerformanceListProps) {
  const [items, setItems] = useState<SubcontractorPerformance[]>([]);

  const fetchItems = async () => {
    const { data } = await supabase
      .from('subcontractor_performance')
      .select('*')
      .eq('obra_id', obraId)
      .order('event_datetime', { ascending: false });
    
    if (data) setItems(data);
  };

  useEffect(() => {
    if (obraId) {
      fetchItems();
    }
  }, [obraId]);

  return (
    <div style={{ width: '100%' }}>
      
      <table className="table table-striped">
        <thead>
          <tr>
            <th>Event</th>
            <th>Type</th>
            <th>Subcontractor</th>
            <th>Date/Time</th>
            <th>User</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id}>
              <td>{item.event}</td>
              <td>
                <span className={`badge ${item.estimated_date_type === 'Start' ? 'bg-primary' : 'bg-success'}`}>
                  {item.estimated_date_type}
                </span>
              </td>
              <td>{item.subcontractor || '-'}</td>
              <td>{item.event_datetime ? new Date(item.event_datetime).toLocaleString() : '-'}</td>
              <td style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{item.user_email}</td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={5} className="text-center text-muted">No performance events found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
