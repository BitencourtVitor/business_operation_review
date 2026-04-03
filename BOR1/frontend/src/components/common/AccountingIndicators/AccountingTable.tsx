import React, { useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import dayjs from 'dayjs';
import type { AccountingRow } from '../../../types/accounting';

interface AccountingTableProps {
  filteredData: AccountingRow[];
  selectedGroup: 'all' | 'receivables' | 'payables';
  onView?: () => void;
}

type GroupByType = 'invoices' | 'customers';
type SortByType = 'date' | 'invoice' | 'customer' | 'balance' | 'category';
type SortOrder = 'asc' | 'desc';

interface InvoiceGroup {
  date: string;
  inv_num?: string;
  bill_num?: string;
  customer_full_name?: string;
  vendor_display_name?: string;
  open_balance: number;
  type: 'receivables' | 'payables';
}

interface CustomerGroup {
  customer_full_name?: string;
  vendor_display_name?: string;
  category: string;
  open_balance: number;
  type: 'receivables' | 'payables';
}

// Componente SortByDropdown baseado na estrutura dos filtros
function SortByDropdown({ 
  sortBy, 
  onSortChange, 
  groupBy, 
  selectedGroup 
}: {
  sortBy: SortByType;
  onSortChange: (newSortBy: SortByType) => void;
  groupBy: GroupByType;
  selectedGroup: 'all' | 'receivables' | 'payables';
}) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{top: number, left: number, width: number}>({top: 0, left: 0, width: 0});
  const [hasPreRendered, setHasPreRendered] = useState(false);

  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  React.useEffect(() => {
    if ((open || !hasPreRendered) && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
      if (!hasPreRendered) setHasPreRendered(true);
    }
  }, [open, hasPreRendered]);

  const getSortByLabel = () => {
    switch (selectedGroup) {
      case 'receivables':
        return 'Invoice';
      case 'payables':
        return 'Bill';
      default:
        return 'Transaction';
    }
  };

  const getEntityColumnName = () => {
    switch (selectedGroup) {
      case 'receivables':
        return 'Customer Name';
      case 'payables':
        return 'Vendor Name';
      default:
        return 'Entity Name';
    }
  };

  const getSortByDisplayText = () => {
    switch (sortBy) {
      case 'date':
        return 'Date';
      case 'invoice':
        return getSortByLabel();
      case 'customer':
        return getEntityColumnName();
      case 'balance':
        return 'Balance';
      case 'category':
        return 'Category';
      default:
        return 'Date';
    }
  };

  const getSortByOptions = () => {
    if (groupBy === 'invoices') {
      return [
        { value: 'date', label: 'Date' },
        { value: 'invoice', label: getSortByLabel() },
        { value: 'customer', label: getEntityColumnName() },
        { value: 'balance', label: 'Balance' }
      ];
    } else {
      return [
        { value: 'customer', label: getEntityColumnName() },
        { value: 'category', label: 'Category' },
        { value: 'balance', label: 'Balance' }
      ];
    }
  };

  const dropdownJSX = (
    <div
      ref={dropdownRef}
      style={{
        position: 'absolute',
        zIndex: 1000,
        top: dropdownPos.top,
        left: dropdownPos.left,
        width: dropdownPos.width,
        background: 'var(--color-background-primary)',
        color: 'var(--color-text-primary)',
        border: '1.5px solid var(--color-border-divider)',
        borderRadius: 6,
        minWidth: 0,
        maxHeight: 220,
        overflowY: 'auto',
        padding: 0,
        boxShadow: 'none',
        fontSize: 14,
        display: open ? 'block' : 'none',
      }}
      className="custom-scrollbar"
    >
      {getSortByOptions().map(option => (
        <div
          key={option.value}
          style={{
            padding: '6px 12px',
            fontSize: 14,
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
            background: sortBy === option.value ? 'var(--color-background-secondary)' : 'transparent',
            borderBottom: '1px solid var(--color-border-divider)',
          }}
          onClick={() => {
            onSortChange(option.value as SortByType);
            setOpen(false);
          }}
          onMouseEnter={(e) => {
            if (sortBy !== option.value) {
              e.currentTarget.style.background = 'var(--color-background-secondary)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = sortBy === option.value ? 'var(--color-background-secondary)' : 'transparent';
          }}
        >
          {option.label}
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ position: 'relative', minWidth: 0, width: '100%', height: 38, borderTopRightRadius: 8, borderBottomRightRadius: 8 }}>
      <button
        ref={buttonRef}
        type="button"
        className="form-control d-flex align-items-center justify-content-between"
        style={{ cursor: 'pointer', width: '100%', height: 38, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', border: 'none', borderRadius: 0, fontSize: 14, boxShadow: 'none', padding: '0 12px', margin: 0 }}
        onClick={() => setOpen(o => !o)}
      >
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}>
          {getSortByDisplayText()}
        </span>
        <i className={`bi ${open ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ marginLeft: 8 }} />
      </button>
      {hasPreRendered && createPortal(dropdownJSX, document.body)}
    </div>
  );
}

export default function AccountingTable({ filteredData, selectedGroup, onView }: AccountingTableProps) {
  const [groupBy, setGroupBy] = useState<GroupByType>('invoices');
  const [sortBy, setSortBy] = useState<SortByType>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [searchText, setSearchText] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Agrupamento 1: Por Invoice (mais recente por invoice)
  const invoiceGroups = useMemo(() => {
    const groups = new Map<string, InvoiceGroup>();
    
    filteredData.forEach(row => {
      const key = row.type === 'receivables' ? row.inv_num : row.bill_num;
      const entityName = row.type === 'receivables' ? row.customer_full_name : row.vendor_display_name;
      
      if (!key || !entityName) return;
      
      const currentDate = row.date_field || row.date;
      
      const existingGroup = groups.get(key);
      if (!existingGroup || dayjs(currentDate).isAfter(dayjs(existingGroup.date))) {
        groups.set(key, {
          date: currentDate,
          inv_num: row.inv_num,
          bill_num: row.bill_num,
          customer_full_name: row.customer_full_name,
          vendor_display_name: row.vendor_display_name,
          open_balance: row.open_balance,
          type: row.type
        });
      }
    });
    
    return Array.from(groups.values());
  }, [filteredData]);

  // Agrupamento 2: Por Customer (soma por customer e category)
  const customerGroups = useMemo(() => {
    const groups = new Map<string, CustomerGroup>();
    // Primeiro, agrupar por invoice para pegar o mais recente de cada
    const invoiceGroups = new Map<string, { date: string; balance: number; entityName: string; category: string; type: 'receivables' | 'payables' }>();
    filteredData.forEach(row => {
      const key = row.type === 'receivables' ? row.inv_num : row.bill_num;
      const entityName = row.type === 'receivables' ? row.customer_full_name : row.vendor_display_name;
      if (!key || !entityName) return;
      const currentDate = row.date_field || row.date;
      const existingInvoiceGroup = invoiceGroups.get(key);
      if (!existingInvoiceGroup || dayjs(currentDate).isAfter(dayjs(existingInvoiceGroup.date))) {
        invoiceGroups.set(key, {
          date: currentDate,
          balance: row.open_balance,
          entityName: entityName,
          category: row.category,
          type: row.type
        });
      }
    });
    // Agora somar por entidade (cliente ou fornecedor) e categoria e tipo
    invoiceGroups.forEach(({ balance, entityName, category, type }) => {
      // Para selectedGroup==='all', separar clientes e fornecedores mesmo com nome igual
      const key = `${entityName}-${type}-${category}`;
      const existingGroup = groups.get(key);
      if (existingGroup) {
        existingGroup.open_balance += balance;
      } else {
        groups.set(key, {
          customer_full_name: type === 'receivables' ? entityName : undefined,
          vendor_display_name: type === 'payables' ? entityName : undefined,
          category: category,
          open_balance: balance,
          type: type
        });
      }
    });
    return Array.from(groups.values());
  }, [filteredData]);

  // Função de ordenação
  const sortData = (data: InvoiceGroup[] | CustomerGroup[]) => {
    return [...data].sort((a, b) => {
      let aValue: string | number | dayjs.Dayjs, bValue: string | number | dayjs.Dayjs;
      
      if (groupBy === 'invoices') {
        const invoiceA = a as InvoiceGroup;
        const invoiceB = b as InvoiceGroup;
        
        switch (sortBy) {
          case 'date':
            aValue = dayjs(invoiceA.date);
            bValue = dayjs(invoiceB.date);
            break;
          case 'invoice':
            aValue = invoiceA.inv_num || invoiceA.bill_num || '';
            bValue = invoiceB.inv_num || invoiceB.bill_num || '';
            break;
          case 'customer':
            aValue = invoiceA.customer_full_name || invoiceA.vendor_display_name || '';
            bValue = invoiceB.customer_full_name || invoiceB.vendor_display_name || '';
            break;
          case 'balance':
            aValue = invoiceA.open_balance;
            bValue = invoiceB.open_balance;
            break;
          default:
            aValue = invoiceA.date;
            bValue = invoiceB.date;
        }
      } else {
        const customerA = a as CustomerGroup;
        const customerB = b as CustomerGroup;
        
        switch (sortBy) {
          case 'customer':
            aValue = customerA.customer_full_name || customerA.vendor_display_name || '';
            bValue = customerB.customer_full_name || customerB.vendor_display_name || '';
            break;
          case 'category':
            aValue = customerA.category;
            bValue = customerB.category;
            break;
          case 'balance':
            aValue = customerA.open_balance;
            bValue = customerB.open_balance;
            break;
          default:
            aValue = customerA.customer_full_name || customerA.vendor_display_name || '';
            bValue = customerB.customer_full_name || customerB.vendor_display_name || '';
        }
      }
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortOrder === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
      } else if (dayjs.isDayjs(aValue) && dayjs.isDayjs(bValue)) {
        return sortOrder === 'asc' ? aValue.valueOf() - bValue.valueOf() : bValue.valueOf() - aValue.valueOf();
      } else {
        return sortOrder === 'asc' ? (aValue as number) - (bValue as number) : (bValue as number) - (aValue as number);
      }
    });
  };

  // Função para abrir o campo de busca e focar
  const handleOpenSearch = () => {
    setSearchOpen(true);
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
  };

  // Função para fechar o campo de busca
  const handleCloseSearch = () => {
    setSearchOpen(false);
    setSearchText('');
  };

  // Função para filtrar os dados conforme o texto digitado
  const filterRows = (data: InvoiceGroup[] | CustomerGroup[]) => {
    if (!searchText.trim()) return data;
    const lower = searchText.toLowerCase();
    if (groupBy === 'invoices') {
      return (data as InvoiceGroup[]).filter(row => {
        let entity = '';
        if (selectedGroup === 'receivables') entity = row.customer_full_name || '';
        else if (selectedGroup === 'payables') entity = row.vendor_display_name || '';
        else entity = row.customer_full_name || row.vendor_display_name || '';
        return entity.toLowerCase().includes(lower);
      });
    } else {
      return (data as CustomerGroup[]).filter(row => {
        let entity = '';
        if (selectedGroup === 'receivables') entity = row.customer_full_name || '';
        else if (selectedGroup === 'payables') entity = row.vendor_display_name || '';
        else entity = row.customer_full_name || row.vendor_display_name || '';
        return entity.toLowerCase().includes(lower);
      });
    }
  };

  const sortedInvoiceGroups = sortData(invoiceGroups) as InvoiceGroup[];
  const sortedCustomerGroups = sortData(customerGroups) as CustomerGroup[];
  const filteredInvoiceGroups = filterRows(sortedInvoiceGroups);
  const filteredCustomerGroups = filterRows(sortedCustomerGroups);

  const handleSort = (newSortBy: SortByType) => {
    if (sortBy === newSortBy) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(newSortBy);
      setSortOrder('asc');
    }
  };

  // Determinar o título baseado no tipo selecionado
  const getTitle = () => {
    if (groupBy === 'invoices') {
      switch (selectedGroup) {
        case 'receivables':
          return 'Invoice Overview';
        case 'payables':
          return 'Bill Overview';
        default:
          return 'Transaction Overview';
      }
    } else {
      switch (selectedGroup) {
        case 'receivables':
          return 'Customer Balance Summary';
        case 'payables':
          return 'Vendor Balance Summary';
        default:
          return 'Entity Balance Summary';
      }
    }
  };

  // Determinar o nome da coluna de entidade
  const getEntityColumnName = () => {
    switch (selectedGroup) {
      case 'receivables':
        return 'Customer Name';
      case 'payables':
        return 'Vendor Name';
      default:
        return 'Entity Name';
    }
  };

  // Determinar o nome da coluna de número
  const getNumberColumnName = () => {
    switch (selectedGroup) {
      case 'receivables':
        return 'Invoice';
      case 'payables':
        return 'Bill';
      default:
        return 'Transaction';
    }
  };

  // Determinar o nome do agrupamento para o botão
  const getGroupByLabel = (which: 'invoices' | 'customers') => {
    if (selectedGroup === 'all') {
      return which === 'invoices' ? 'Transactions' : 'Entities';
    }
    switch (selectedGroup) {
      case 'receivables':
        return which === 'invoices' ? 'Invoices' : 'Customers';
      case 'payables':
        return which === 'invoices' ? 'Bills' : 'Vendors';
      default:
        return which === 'invoices' ? 'Transactions' : 'Entities';
    }
  };





  return (
    <>
      {/* Header com título e controles */}
      <div style={{ display: 'flex', alignItems: 'center' }} className='ms-4 me-3 my-2 justify-content-between'>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h4 className='d-flex justify-content-start mb-0' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400 }}>
            {getTitle()}
          </h4>
          {onView && (
            <button
              type="button"
              className="btn-tertiary-custom d-flex align-items-center justify-content-center"
              style={{ 
              marginLeft: 5,
              width: 28,
              height: 28,
              fontSize: 14,
              padding: 0,
              borderRadius: 14,
              transition: 'all 0.2s ease',
            }}
              onClick={onView}
              aria-label="Expandir em modal"
              title="Expandir em modal"
            >
              <i className="bi bi-arrows-angle-expand" />
            </button>
          )}
        </div>
        <div className='d-flex flex-row align-items-center justify-content-center gap-2'>
          {/* Filtro de texto */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: searchOpen ? 'space-between' : 'center',
              position: 'relative',
              width: searchOpen ? 220 : 42,
              height: 42,
              transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)',
              background: searchOpen ? 'var(--color-background-secondary)' : 'var(--color-background-secondary)',
              border: '1px solid var(--color-border-divider)',
              borderRadius: searchOpen ? 25 : 21,
              padding: searchOpen ? '2px 8px 2px 8px' : '4px',
              boxSizing: 'border-box',
            }}
          >
            <button
              type="button"
              className="btn-tertiary-custom d-flex align-items-center justify-content-center"
              style={{ width: 28, height: 28, fontSize: 16, borderRadius: 14, transition: 'all 0.2s', color: 'var(--color-accent-primary)', flexShrink: 0, background: 'transparent', border: 'none' }}
              onClick={handleOpenSearch}
              aria-label="Abrir busca"
              title="Buscar"
              tabIndex={searchOpen ? -1 : 0}
              disabled={searchOpen}
            >
              <i className="bi bi-search" />
            </button>
            <input
              ref={searchInputRef}
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder={selectedGroup === 'receivables' ? 'Buscar cliente...' : selectedGroup === 'payables' ? 'Buscar fornecedor...' : 'Buscar entidade...'}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-text-primary)',
                fontSize: 15,
                height: 32,
                marginLeft: 4,
                display: searchOpen ? 'block' : 'none',
                padding: searchOpen ? '0 8px 0 4px' : '0',
                width: searchOpen ? '100%' : 0,
                minWidth: 0,
                opacity: searchOpen ? 1 : 0,
                pointerEvents: searchOpen ? 'auto' : 'none',
                transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1), opacity 0.3s',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              onBlur={() => { if (!searchText) handleCloseSearch(); }}
              tabIndex={searchOpen ? 0 : -1}
            />
          </div>
          {/* Group By Control */}
          <div style={{ height: 42, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)' }} className='justify-content-between'>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Group by</span>
            <button
              onClick={() => setGroupBy('invoices')}
              style={{ 
                background: groupBy === 'invoices' ? 'var(--color-accent-primary)' : 'var(--color-background-secondary)', 
                color: groupBy === 'invoices' ? '#fff' : 'var(--color-accent-primary)', 
                border: '1.5px solid var(--color-border-divider)', 
                borderRadius: 15, 
                padding: '4px 16px', 
                fontWeight: 500, 
                fontSize: 14, 
                cursor: 'pointer' 
              }}
            >
              {getGroupByLabel('invoices')}
            </button>
            <button
              onClick={() => setGroupBy('customers')}
              style={{ 
                background: groupBy === 'customers' ? 'var(--color-accent-primary)' : 'var(--color-background-secondary)', 
                color: groupBy === 'customers' ? '#fff' : 'var(--color-accent-primary)', 
                border: '1.5px solid var(--color-border-divider)', 
                borderRadius: 15, 
                padding: '4px 16px', 
                fontWeight: 500, 
                fontSize: 14, 
                cursor: 'pointer' 
              }}
            >
              {getGroupByLabel('customers')}
            </button>
          </div>
          {/* Sort By Control */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)', height: 42 }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Sort by</span>
            <div className="input-group" style={{ minWidth: 110, maxWidth: 110, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 31, zIndex: 20, display: 'flex' }}>
              <div style={{ flex: 1, minWidth: 0, zIndex: 21, borderRadius: 8, height: 31, display: 'flex', alignItems: 'center' }}>
                <SortByDropdown 
                  sortBy={sortBy}
                  onSortChange={handleSort}
                  groupBy={groupBy}
                  selectedGroup={selectedGroup}
                />
              </div>
            </div>
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              style={{ 
                background: 'var(--color-background-primary)', 
                color: 'var(--color-accent-primary)', 
                border: '1px solid var(--color-border-divider)', 
                borderRadius: 15, 
                padding: '4px 10px', 
                fontSize: 15, 
                cursor: 'pointer', 
                display: 'flex', 
                alignItems: 'center' 
              }}
            >
              {sortOrder === 'asc' ? (
                sortBy === 'date' || sortBy === 'invoice' || sortBy === 'customer' || sortBy === 'category' ? 
                <i className="bi bi-sort-alpha-down" /> : 
                <i className="bi bi-sort-numeric-down" />
              ) : (
                sortBy === 'date' || sortBy === 'invoice' || sortBy === 'customer' || sortBy === 'category' ? 
                <i className="bi bi-sort-alpha-up" /> : 
                <i className="bi bi-sort-numeric-up" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div style={{ background: 'var(--color-background-primary)', overflow: 'hidden', width: '100%', flex: '1 1 0%', display: 'flex', flexDirection: 'column', minHeight: 0, maxHeight: '40vh', padding: '0 10px 10px 10px' }}>
        <div style={{ flex: '1 1 0%', height: 0, overflowY: 'auto', width: '100%' }} className="custom-scrollbar">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, tableLayout: 'auto' }}>
            <thead>
              <tr style={{ background: 'var(--color-background-secondary)' }}>
                {groupBy === 'invoices' ? (
                  <>
                    <th 
                      style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'left', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2 }}
                    >
                      Date
                    </th>
                    <th 
                      style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'left', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2 }}
                    >
                      {getNumberColumnName()}
                    </th>
                    <th 
                      style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'left', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2 }}
                    >
                      {getEntityColumnName()}
                    </th>
                    <th 
                      style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'right', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2, whiteSpace: 'nowrap' }}
                    >
                      Open Balance
                    </th>
                  </>
                ) : (
                  <>
                    <th 
                      style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'left', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2 }}
                    >
                      {getEntityColumnName()}
                    </th>
                    <th 
                      style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'left', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2 }}
                    >
                      Category
                    </th>
                    <th 
                      style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'right', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2, whiteSpace: 'nowrap' }}
                    >
                      Open Balance
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {groupBy === 'invoices' ? (
                (filteredInvoiceGroups as InvoiceGroup[]).map((row, index) => (
                  <tr key={`${row.inv_num || row.bill_num}-${index}`}>
                    <td style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-secondary)', textAlign: 'left' }}>
                      {dayjs(row.date).format('DD/MM/YYYY')}
                    </td>
                    <td style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-secondary)', textAlign: 'left' }}>
                      {row.inv_num || row.bill_num}
                    </td>
                    <td style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-secondary)', textAlign: 'left' }}>
                      {row.customer_full_name || row.vendor_display_name}
                    </td>
                    <td style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-accent-primary)', textAlign: 'right' }}>
                      {row.open_balance.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                    </td>
                  </tr>
                ))
              ) : (
                (filteredCustomerGroups as CustomerGroup[]).map((row, index) => (
                  <tr key={`${row.customer_full_name || row.vendor_display_name}-${row.category}-${index}`}>
                    <td style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-secondary)', textAlign: 'left' }}>
                      {row.customer_full_name || row.vendor_display_name}
                    </td>
                    <td style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-secondary)', textAlign: 'left' }}>
                      {row.category}
                    </td>
                    <td style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-accent-primary)', textAlign: 'right' }}>
                      {row.open_balance.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
} 