import { supabase } from '../supabaseClient';

// Função utilitária para buscar todos os registros de uma tabela via paginação
export async function fetchAllRows(table: string) {
  const pageSize = 1000;
  let allRows: unknown[] = [];
  let from = 0;
  let to = pageSize - 1;
  let finished = false;

  while (!finished) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, to);
    if (error) throw error;
    if (data && data.length > 0) {
      allRows = allRows.concat(data);
      if (data.length < pageSize) {
        finished = true;
      } else {
        from += pageSize;
        to += pageSize;
      }
    } else {
      finished = true;
    }
  }
  return allRows;
} 