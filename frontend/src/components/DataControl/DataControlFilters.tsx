import MultiSelectDropdown from '../common/MultiSelectDropdown';
import iconFieldwire from '../../assets/fieldwire.png';

interface DataControlFiltersProps {
  viewMode: string;
  setViewMode: (mode: string) => void;
  filterStatus?: string;
  setFilterStatus?: (status: string) => void;
  theme?: 'light' | 'dark';
}

export default function DataControlFilters({
  viewMode,
  setViewMode,
  filterStatus,
  setFilterStatus,
  theme
}: DataControlFiltersProps) {
  const isDarkMode = theme !== undefined ? theme === 'dark' : document.documentElement.classList.contains('dark');
  
  const viewOptions = [
    { label: 'Info & Dates', value: 'Info & Dates', icon: 'bi-info-circle' },
    { label: 'Fieldwire', value: 'Fieldwire', icon: 'fieldwire' },
    { label: 'Machines', value: 'Machines', icon: 'bi-truck' },
    { label: 'Contract', value: 'Contract', icon: 'bi-file-earmark-text' },
    { label: 'Optionals', value: 'Optionals', icon: 'bi-ui-checks-grid' }
  ];
  const statusOptions = ['not started', 'open', 'closed'];

  return (
    <div className="d-flex flex-row align-items-center" style={{ gap: 16, flexWrap: 'wrap', borderLeft: '1px solid var(--color-border-divider)', paddingLeft: 16 }}>
      <span style={{ fontSize: 14, fontWeight: 500, gap: 8, display: 'flex', alignItems: 'center', color: 'var(--color-text-secondary)' }}>
        <i className="bi bi-funnel" />
        Filters
      </span>
      
      {/* View Mode Icons */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 8, 
        padding: '4px'
      }}>
        {viewOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => setViewMode(option.value)}
            title={option.label}
            style={{
              background: viewMode === option.value ? 'var(--color-background-secondary)' : 'transparent',
              border: 'none',
              borderRadius: 6,
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: viewMode === option.value ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
              transition: 'all 0.2s ease'
            }}
          >
            {option.icon === 'fieldwire' ? (
              // TODO: Add fieldwire_darkmode.png to assets when available
              <img 
                src={iconFieldwire} 
                alt="Fieldwire" 
                style={{ 
                  width: 16, 
                  height: 16, 
                  objectFit: 'contain', 
                  filter: viewMode === option.value ? 'none' : 'grayscale(100%) opacity(0.7)' 
                }} 
              />
            ) : (
              <i className={`bi ${option.icon}`} style={{ fontSize: 16 }} />
            )}
          </button>
        ))}
      </div>

      {/* Filter Status */}
      <div className="input-group" style={{ minWidth: 180, maxWidth: 180, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 38, zIndex: 20, display: 'flex' }}>
        <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', borderRight: '1.5px solid var(--color-border-divider)', height: 38, width: 42, padding: 0, color: 'var(--color-accent-primary)', borderTopLeftRadius: 8, borderBottomLeftRadius: 8, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
          <i className="bi bi-filter" style={{ fontSize: 17 }} />
        </span>
        <div style={{ flex: 1, minWidth: 0, zIndex: 21, borderTopRightRadius: 8, borderBottomRightRadius: 8, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, height: 38 }}>
          <MultiSelectDropdown 
            options={statusOptions}
            selectedValues={filterStatus ? [filterStatus] : []}
            onChange={(values) => {
               if (setFilterStatus) setFilterStatus(values[0] || '');
            }}
            placeholder="Status"
            allLabel="All Status"
            dropdownTitle="Status"
            isSingleSelect={true}
          />
        </div>
      </div>
    </div>
  );
}
