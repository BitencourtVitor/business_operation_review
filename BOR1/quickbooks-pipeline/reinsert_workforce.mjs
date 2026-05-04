import fs from 'fs';
import readline from 'readline';
import pg from 'pg';

const { Pool } = pg;
const DATABASE_URL = 'postgresql://postgres:aTOqkxMEqJXUoEbqTHPbMjzunUgNQKBE@junction.proxy.rlwy.net:34093/railway';

const JOBS = [
  { csv: 'D:\\Arquivos\\Downloads\\timesheet_report_2026-01-01_thru_2026-04-30.csv', company: 'HVAC' },
  { csv: 'D:\\Arquivos\\Downloads\\pcg março e abril.csv',                            company: 'PCG'  },
  { csv: 'D:\\Arquivos\\Downloads\\framing março e abril.csv',                        company: 'Framing' },
];

function parseCSVLine(line) {
  const fields = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (ch === ',' && !inQ) { fields.push(cur); cur = ''; }
    else cur += ch;
  }
  fields.push(cur);
  return fields;
}

function findCol(header, ...names) {
  for (const n of names) {
    const i = header.findIndex(h => h.toLowerCase().replace(/"/g,'').trim() === n);
    if (i >= 0) return i;
  }
  return -1;
}

async function readCSV(csvPath) {
  const byMonth = {};
  const rl = readline.createInterface({ input: fs.createReadStream(csvPath, { encoding: 'utf8' }), crlfDelay: Infinity });
  let idx = null;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const cols = parseCSVLine(line);
    if (!idx) {
      idx = {
        fname:     findCol(cols, 'fname'),
        lname:     findCol(cols, 'lname'),
        localDate: findCol(cols, 'local_date'),
        hours:     findCol(cols, 'hours'),
        jc1:       findCol(cols, 'jobcode_1'),
        jc2:       findCol(cols, 'jobcode_2'),
        jc3:       findCol(cols, 'jobcode_3'),
        jc4:       findCol(cols, 'jobcode_4'),
      };
      continue;
    }
    const localDate = cols[idx.localDate]?.trim() ?? '';
    if (!localDate || localDate.length < 7) continue;

    const fname = cols[idx.fname]?.trim() ?? '';
    const lname = cols[idx.lname]?.trim() ?? '';
    const hours = parseFloat(cols[idx.hours]) || 0;
    const jc1   = idx.jc1 >= 0 ? (cols[idx.jc1]?.trim() ?? '') : '';
    const jc2   = idx.jc2 >= 0 ? (cols[idx.jc2]?.trim() ?? '') : '';
    const jc3   = idx.jc3 >= 0 ? (cols[idx.jc3]?.trim() ?? '') : '';
    const jc4   = idx.jc4 >= 0 ? (cols[idx.jc4]?.trim() ?? '') : '';

    const month = localDate.substring(0, 7);
    const emp   = fname && lname ? `${fname} ${lname}` : fname || lname;
    const workDate = localDate;

    if (!byMonth[month]) byMonth[month] = [];
    byMonth[month].push({ emp, hours, jc1, jc2, jc3, jc4, workDate });
  }
  return byMonth;
}

async function insertCompany(pool, csvPath, company) {
  const fileName = csvPath.split(/[/\\]/).pop();
  const byMonth  = await readCSV(csvPath);
  const months   = Object.keys(byMonth).sort();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const month of months) {
      const rows   = byMonth[month];
      const totalH = rows.reduce((s, r) => s + r.hours, 0);

      // Delete existing data for this company/month first
      await client.query(
        `DELETE FROM workforce_uploads WHERE company=$1 AND reference_month=$2`,
        [company, month]
      );
      await client.query(
        `DELETE FROM workforce_productivity WHERE company=$1 AND reference_month=$2`,
        [company, month]
      );

      const up = await client.query(
        `INSERT INTO workforce_uploads(reference_month,company,file_name,record_count,total_hours,uploaded_by,uploaded_at,status)
         VALUES($1,$2,$3,$4,$5,NULL,NOW(),'success') RETURNING id`,
        [month, company, fileName, rows.length, totalH.toFixed(2)]
      );
      const uploadId = up.rows[0].id;

      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const vals = [], params = []; let p = 1;
        for (const r of chunk) {
          vals.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},NOW())`);
          params.push(uploadId, r.jc1, r.jc2, r.jc3, r.jc4, r.emp, r.hours, month, company, r.workDate);
        }
        await client.query(
          `INSERT INTO workforce_productivity(upload_id,client,jobsite,lot_building,worktype,employee_name,regular_hours,reference_month,company,work_date,created_at) VALUES ${vals.join(',')}`,
          params
        );
      }
      console.log(`[${company}] ${month} — ${rows.length} rows, ${totalH.toFixed(2)}h`);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(`ERRO [${company}]: ${e.message}`);
  } finally {
    client.release();
  }
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  for (const { csv, company } of JOBS) {
    await insertCompany(pool, csv, company);
  }
  await pool.end();
  console.log('\nTudo concluído.');
}

main();
