import { useState, useMemo } from 'react';
import dayjs from 'dayjs';
import type { AccountingRow } from '../../../types/accounting';

interface AccountingTableProps {
  filteredData: AccountingRow[];
  selectedGroup: 'all' | 'receivables' | 'payables';
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

export default function AccountingTable({ filteredData, selectedGroup }: AccountingTableProps) {
  const [groupBy, setGroupBy] = useState<GroupByType>('invoices');
  const [sortBy, setSortBy] = useState<SortByType>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Agrupamento 1: Por Invoice (mais recente por invoice)
  const invoiceGroups = useMemo(() => {
    const groups = new Map<string, InvoiceGroup>();
    
    filteredData.forEach(row => {
      const key = row.type === 'receivables' ? row.inv_num : row.bill_num;
      const entityName = row.type === 'receivables' ? row.customer_full_name : row.vendor_display_name;
      
      if (!key || !entityName) return;
      
      const currentDate = row.date_field || row.date;
      
      if (!groups.has(key) || dayjs(currentDate).isAfter(dayjs(groups.get(key)!.date))) {
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
      
      if (!invoiceGroups.has(key) || dayjs(currentDate).isAfter(dayjs(invoiceGroups.get(key)!.date))) {
        invoiceGroups.set(key, {
          date: currentDate,
          balance: row.open_balance,
          entityName: entityName,
          category: row.category,
          type: row.type
        });
      }
    });
    
    // Agora somar por customer e category
    invoiceGroups.forEach(({ balance, entityName, category, type }) => {
      const key = `${entityName}-${category}-${type}`;
      if (groups.has(key)) {
        groups.get(key)!.open_balance += balance;
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

  const sortedInvoiceGroups = sortData(invoiceGroups) as InvoiceGroup[];
  const sortedCustomerGroups = sortData(customerGroups) as CustomerGroup[];

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

  // Determinar o nome do agrupamento
  const getGroupByLabel = () => {
    switch (selectedGroup) {
      case 'receivables':
        return 'Invoices';
      case 'payables':
        return 'Bills';
      default:
        return 'Transactions';
    }
  };

  // Determinar o nome do sort by
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

  return (
    <>
      {/* Header com título e controles */}
      <div style={{ display: 'flex', alignItems: 'center' }} className='ms-4 me-3 my-2 justify-content-between'>
        <h4 className='d-flex justify-content-start mb-0' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400 }}>
          {getTitle()}
        </h4>
        
        <div className='d-flex flex-row align-items-center justify-content-center gap-2'>
          {/* Group By Control */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)' }} className='justify-content-between'>
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
              {getGroupByLabel()}
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
              {selectedGroup === 'payables' ? 'Vendors' : 'Customers'}
            </button>
          </div>

          {/* Sort By Control */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Sort by</span>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <select
                value={sortBy}
                onChange={(e) => handleSort(e.target.value as SortByType)}
                style={{
                  background: 'var(--color-background-primary)',
                  color: 'var(--color-text-primary)',
                  border: '1.5px solid var(--color-border-divider)',
                  borderRadius: 8,
                  padding: '4px 32px 4px 8px',
                  fontSize: 14,
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  MozAppearance: 'none',
                  minWidth: 110,
                }}
              >
                {groupBy === 'invoices' ? (
                  <>
                    <option value="date">Date</option>
                    <option value="invoice">{getSortByLabel()}</option>
                    <option value="customer">{getEntityColumnName()}</option>
                    <option value="balance">Balance</option>
                  </>
                ) : (
                  <>
                    <option value="customer">{getEntityColumnName()}</option>
                    <option value="category">Category</option>
                    <option value="balance">Balance</option>
                  </>
                )}
              </select>
              <i
                className="bi bi-chevron-down"
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                  color: 'var(--color-accent-primary)',
                  fontSize: 16,
                }}
              />
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
                      style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'right', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2 }}
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
                      style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'right', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2 }}
                    >
                      Open Balance
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {groupBy === 'invoices' ? (
                sortedInvoiceGroups.map((row, index) => (
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
                sortedCustomerGroups.map((row, index) => (
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