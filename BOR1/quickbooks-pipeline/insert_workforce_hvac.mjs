import fs from 'fs';
import readline from 'readline';
import pg from 'pg';

const { Pool } = pg;

const DATABASE_URL = 'postgresql://postgres:aTOqkxMEqJXUoEbqTHPbMjzunUgNQKBE@junction.proxy.rlwy.net:34093/railway';
const CSV_PATH = 'D:\\Arquivos\\Downloads\\timesheet_report_2026-01-01_thru_2026-04-30.csv';
const COMPANY = 'hvac';
const FILE_NAME = 'timesheet_report_2026-01-01_thru_2026-04-30.csv';

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

  let firstLine = true;
  for await (const line of rl) {
    if (!line.trim()) continue;
    if (firstLine) { firstLine = false; continue; }

    const cols = parseCSVLine(line);
    const fname      = cols[2]?.trim() ?? '';
    const lname      = cols[3]?.trim() ?? '';
    const localDate  = cols[6]?.trim() ?? '';
    const hours      = parseFloat(cols[11]) || 0;
    const jobcode1   = cols[12]?.trim() ?? '';
    const jobcode2   = cols[13]?.trim() ?? '';
    const jobcode3   = cols[14]?.trim() ?? '';
    const jobcode4   = cols[15]?.trim() ?? '';

    if (!localDate || localDate.length < 7) continue;

    const month = localDate.substring(0, 7); // "2026-01"
    const employeeName = lname ? `${lname}, ${fname}` : fname;

    if (!byMonth[month]) byMonth[month] = [];
    byMonth[month].push({ employeeName, hours, jobcode1, jobcode2, jobcode3, jobcode4 });
  }

  const months = Object.keys(byMonth).sort();
  console.log(`Meses encontrados: ${months.join(', ')}`);
  for (const m of months) {
    console.log(`  ${m}: ${byMonth[m].length} linhas, ${byMonth[m].reduce((s, r) => s + r.hours, 0).toFixed(2)}h`);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const month of months) {
      const rows = byMonth[month];
      const totalHours = rows.reduce((s, r) => s + r.hours, 0);

      const uploadRes = await client.query(
        `INSERT INTO workforce_uploads (reference_month, company, file_name, record_count, total_hours, uploaded_by, uploaded_at, status)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'active')
         RETURNING id`,
        [month, COMPANY, FILE_NAME, rows.length, totalHours.toFixed(2), null]
      );
      const uploadId = uploadRes.rows[0].id;

      // batch insert em blocos de 500
      const chunkSize = 500;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const values = [];
        const params = [];
        let p = 1;
        for (const r of chunk) {
          values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},NOW())`);
          params.push(uploadId, r.jobcode1 || '', r.jobcode2 || '', r.jobcode3 || '', r.jobcode4 || '', r.employeeName, r.hours, month);
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
    console.log('\nConcluído com sucesso.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro — rollback executado:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
