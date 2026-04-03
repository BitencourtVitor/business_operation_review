
interface ForecastDateControlsProps {
  dateMode: 'start' | 'beams';
  onDateModeChange: (mode: 'start' | 'beams') => void;
  sortByDate: 'off' | 'asc' | 'desc' | null;
  onSortByDateChange: (sortBy: 'off' | 'asc' | 'desc' | null) => void;
}

export default function ForecastDateControls({
  dateMode,
  onDateModeChange,
  sortByDate,
  onSortByDateChange
}: ForecastDateControlsProps) {
  const dateModeLabel = dateMode === 'beams' ? 'Beams Date' : 'Start Date';

  return (
    <div style={{
      marginBottom: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        background: 'var(--color-background-secondary)',
        border: '1px solid var(--color-border-divider)',
        borderRadius: 8,
        padding: '6px 10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <i className="bi bi-calendar-week" style={{ color: 'var(--color-accent-primary)', fontSize: 14 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            Date Mode
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => onDateModeChange('beams')}
            style={{
              background: dateMode === 'beams' ? '#17a2b8' : 'transparent',
              color: dateMode === 'beams' ? '#fff' : 'var(--color-text-primary)',
              border: '1px solid var(--color-border-divider)',
              borderRadius: 20,
              padding: '3px 10px',
              fontSize: 12,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              cursor: 'pointer'
            }}
          >
            <i className="bi bi-flag-fill" style={{ fontSize: 11 }} />
            Beams
          </button>
          <button
            onClick={() => onDateModeChange('start')}
            style={{
              background: dateMode === 'start' ? 'var(--color-accent-primary)' : 'transparent',
              color: dateMode === 'start' ? '#fff' : 'var(--color-text-primary)',
              border: '1px solid var(--color-border-divider)',
              borderRadius: 20,
              padding: '3px 10px',
              fontSize: 12,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              cursor: 'pointer'
            }}
          >
            <i className="bi bi-calendar" style={{ fontSize: 11 }} />
            Start
          </button>
        </div>
      </div>
      <div style={{
        display: 'flex',
        gap: '6px',
        alignItems: 'center'
      }}>
        <button
          onClick={() => onSortByDateChange(sortByDate === 'asc' ? 'desc' : sortByDate === 'desc' ? 'asc' : 'asc')}
          style={{
            flex: 1,
            background: sortByDate ? 'var(--color-accent-primary)' : 'var(--color-background-secondary)',
            color: sortByDate ? '#fff' : 'var(--color-text-primary)',
            border: '1px solid var(--color-border-divider)',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer'
          }}>
          <span>Sort by {dateModeLabel}</span>
          <span>{sortByDate ? sortByDate.toUpperCase() : 'OFF'}</span>
        </button>
        {sortByDate && (
          <button
            onClick={() => onSortByDateChange(null)}
            style={{
              background: 'var(--color-background-secondary)',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border-divider)',
              borderRadius: 10,
              padding: '10px 14px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            OFF
          </button>
        )}
      </div>
    </div>
  );
}

