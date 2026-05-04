import fs from 'fs';
import readline from 'readline';
import pg from 'pg';

const { Pool } = pg;

const DATABASE_URL = 'postgresql://postgres:aTOqkxMEqJXUoEbqTHPbMjzunUgNQKBE@junction.proxy.rlwy.net:34093/railway';

const [,, CSV_PATH, COMPANY] = process.argv;
if (!CSV_PATH || !COMPANY) {
  console.error('Uso: node insert_workforce.mjs <caminho_csv> <empresa>');
  process.exit(1);
}
const FILE_NAME = CSV_PATH.split(/[\\/]/).pop();

function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const byMonth = {};

  const rl = readline.createInterface({
    input: fs.createReadStream(CSV_PATH, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  let idx = null;

  for await (const line of rl) {
    if (!line.trim()) continue;

    const cols = parseCSVLine(line);

    if (!idx) {
      // detecta colunas pelo header
      idx = {
        fname:     cols.indexOf('fname'),
        lname:     cols.indexOf('lname'),
        localDate: cols.indexOf('local_date'),
        hours:     cols.indexOf('hours'),
        jc1:       cols.indexOf('jobcode_1'),
        jc2:       cols.indexOf('jobcode_2'),
        jc3:       cols.indexOf('jobcode_3'),
        jc4:       cols.indexOf('jobcode_4'),
        jc5:       cols.indexOf('jobcode_5'),
      };
      console.log('Colunas detectadas:', idx);
      continue;
    }

    const localDate = cols[idx.localDate]?.trim() ?? '';
    if (!localDate || localDate.length < 7) continue;

    const fname  = cols[idx.fname]?.trim() ?? '';
    const lname  = cols[idx.lname]?.trim() ?? '';
    const hours  = parseFloat(cols[idx.hours]) || 0;
    const jc1    = idx.jc1 >= 0 ? (cols[idx.jc1]?.trim() ?? '') : '';
    const jc2    = idx.jc2 >= 0 ? (cols[idx.jc2]?.trim() ?? '') : '';
    const jc3    = idx.jc3 >= 0 ? (cols[idx.jc3]?.trim() ?? '') : '';
    const jc4    = idx.jc4 >= 0 ? (cols[idx.jc4]?.trim() ?? '') : '';

    const month = localDate.substring(0, 7);
    const employeeName = lname ? `${lname}, ${fname}` : fname;

    if (!byMonth[month]) byMonth[month] = [];
    byMonth[month].push({ employeeName, hours, jc1, jc2, jc3, jc4 });
  }

  const months = Object.keys(byMonth).sort();
  console.log(`\nEmpresa: ${COMPANY} | Meses: ${months.join(', ')}`);
  for (const m of months) {
    const total = byMonth[m].reduce((s, r) => s + r.hours, 0);
    console.log(`  ${m}: ${byMonth[m].length} linhas, ${total.toFixed(2)}h`);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const month of months) {
      const rows = byMonth[month];
      const totalHours = rows.reduce((s, r) => s + r.hours, 0);

      const uploadRes = await client.query(
        `INSERT INTO workforce_uploads (reference_month, company, file_name, record_count, total_hours, uploaded_by, uploaded_at, status)
         VALUES ($1, $2, $3, $4, $5, NULL, NOW(), 'active')
         RETURNING id`,
        [month, COMPANY, FILE_NAME, rows.length, totalHours.toFixed(2)]
      );
      const uploadId = uploadRes.rows[0].id;

      const chunkSize = 500;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const values = [];
        const params = [];
        let p = 1;
        for (const r of chunk) {
          values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},NOW())`);
          params.push(uploadId, r.jc1, r.jc2, r.jc3, r.jc4, r.employeeName, r.hours, month);
        }
        await client.query(
          `INSERT INTO workforce_productivity (upload_id, client, jobsite, lot_building, worktype, employee_name, regular_hours, reference_month, created_at)
           VALUES ${values.join(',')}`,
          params
        );
      }

      console.log(`✓ ${month} — ${rows.length} registros, ${totalHours.toFixed(2)}h (upload_id: ${uploadId})`);
    }

    await client.query('COMMIT');
    console.log('\nConcluído.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro — rollback:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
