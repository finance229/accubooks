import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

// ============ SUPABASE ============
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ============ KONVERSI TANGGAL EXCEL ============
function excelDateToDate(excelDate: number): string {
  const epoch = new Date(1899, 11, 30);
  const date = new Date(epoch.getTime() + excelDate * 86400000);
  
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  
  return `${day}/${month}/${year}`;
}

// 🔥🔥🔥 AUTO CONVERT DATE (INI YANG KAMU MAU) 🔥🔥🔥
function autoConvertDate(value: any): string {
  if (!value) return '';
  
  const str = String(value).trim();
  
  // 1. Kalau angka (Excel date format) -> 46113 jadi 01/01/2026
  if (!isNaN(Number(str)) && str !== '') {
    const num = Number(str);
    if (num > 1 && num < 50000) {
      const converted = excelDateToDate(num);
      console.log(`📅 Auto convert: ${num} -> ${converted}`);
      return converted;
    }
  }
  
  // 2. Kalau string dengan format dd/mm/yyyy atau dd-mm-yyyy
  if (str.includes('/') || str.includes('-')) {
    let parts = str.split('/');
    if (parts.length !== 3) parts = str.split('-');
    
    if (parts.length === 3) {
      let d = parts[0].padStart(2, '0');
      let m = parts[1].padStart(2, '0');
      let y = parts[2];
      
      // Kalau tahun cuma 2 digit (misal 25 -> 2025)
      if (y.length === 2) y = '20' + y;
      
      if (d.length === 2 && m.length === 2 && y.length === 4) {
        return `${d}/${m}/${y}`;
      }
    }
  }
  
  // 3. Kalau format lain, coba parse dengan Date object
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    }
  } catch (e) {}
  
  return str;
}

function isNumeric(value: any): boolean {
  return !isNaN(parseFloat(value)) && isFinite(value);
}

// ============ HELPER ============
const getCompanySuffix = (_companyId: number): string => {
  const map: Record<number, string> = { 1: 'A', 2: 'B', 3: 'C' };
  return map[_companyId] || 'A';
};

// ============ CREATE JOURNAL ============
async function createJournal(
  companyId: number,
  date: string,
  description: string,
  entries: any[]
): Promise<number | null> {
  try {
    const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
    const totalCredit = entries.reduce((s, e) => s + e.credit, 0);
    
    if (totalDebit !== totalCredit) {
      throw new Error(`Debit ${totalDebit} != Kredit ${totalCredit}`);
    }

    const year = new Date(date).getFullYear();
    const prefix = `JU-${year}-`;
    const { data: last } = await supabase
      .from('journals')
      .select('journal_number')
      .ilike('journal_number', `${prefix}%`)
      .order('created_at', { ascending: false })
      .limit(1);
    
    let seq = 1;
    if (last && last.length > 0) {
      const num = parseInt(last[0].journal_number.replace(prefix, ''));
      seq = isNaN(num) ? 1 : num + 1;
    }
    const journalNumber = `${prefix}${String(seq).padStart(4, '0')}`;

    const { data: journal, error: jErr } = await supabase
      .from('journals')
      .insert({
        company_id: companyId,
        journal_number: journalNumber,
        journal_date: date,
        description: description,
        reference: `IMPORT-${Date.now()}`,
        reference_type: 'IMPORT',
        reference_id: 0,
        status: 'posted',
        posted_by: 'system',
        posted_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (jErr) throw jErr;

    const lines = entries.map(e => ({
      journal_id: journal.id,
      coa_id: e.account_id,
      account_code: e.account_code,
      account_name: e.account_name,
      debit: e.debit,
      credit: e.credit,
    }));

    const { error: lErr } = await supabase.from('journal_lines').insert(lines);
    if (lErr) throw lErr;

    console.log(`✅ Jurnal ${journalNumber} dibuat`);
    return journal.id;
  } catch (error) {
    console.error('Error creating journal:', error);
    return null;
  }
}

// ============ PARSE EXCEL ============
async function parseExcel(file: File, companyId: number) {
  console.log('📊 Parsing Excel...');
  
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  if (data.length < 2) throw new Error('File kosong');

  // Cari header
  const header = data[0];
  const map = { tgl: -1, ket: -1, coa: -1, debet: -1, kredit: -1 };

  header.forEach((col: any, idx: number) => {
    const str = String(col).toLowerCase().trim();
    if (str.includes('tanggal') || str.includes('tgl')) map.tgl = idx;
    else if (str.includes('keterangan') || str.includes('deskripsi')) map.ket = idx;
    else if (str.includes('coa') || str.includes('akun') || str.includes('nama')) map.coa = idx;
    else if (str.includes('debet') || str.includes('debit')) map.debet = idx;
    else if (str.includes('kredit') || str.includes('credit')) map.kredit = idx;
  });

  if (Object.values(map).some(v => v === -1)) {
    throw new Error('Header salah. Pakai: Tanggal | KETERANGAN | Nama coa | DEBET | KREDIT');
  }

  // Ambil COA
  const suffix = getCompanySuffix(companyId);
  const { data: coaList } = await supabase
    .from('coa')
    .select('id, code, name')
    .eq('company_id', companyId)
    .eq('suffix', suffix)
    .eq('is_active', true);

  const coaMap = new Map();
  coaList?.forEach(c => coaMap.set(c.name.toLowerCase().trim(), { id: c.id, code: c.code, name: c.name }));

  // Proses baris
  const rows: any[] = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;
    if (row.every(c => c === undefined || c === null || c === '')) continue;

    // 🔥🔥🔥 AUTO CONVERT TANGGAL 🔥🔥🔥
    const rawValue = row[map.tgl];
    console.log(`🔍 Row ${i}: tanggal raw =`, rawValue);
    
    let tanggalRaw = autoConvertDate(rawValue);
    console.log(`✅ Row ${i}: tanggal after autoConvert = "${tanggalRaw}"`);

    const ket = String(row[map.ket] || '').trim();
    const namaCoa = String(row[map.coa] || '').trim();
    const debet = parseFloat(String(row[map.debet] || '0').replace(/[^0-9,-]/g, '').replace(',', '.'));
    const kredit = parseFloat(String(row[map.kredit] || '0').replace(/[^0-9,-]/g, '').replace(',', '.'));

    const d = isNaN(debet) ? 0 : debet;
    const k = isNaN(kredit) ? 0 : kredit;

    let valid = true;
    let error = '';

    // Validasi tanggal
    if (!/^(\d{2})\/(\d{2})\/(\d{4})$/.test(tanggalRaw)) {
      valid = false;
      error = 'Format tanggal harus DD/MM/YYYY';
    }

    // Cari COA
    const coaKey = namaCoa.toLowerCase().trim();
    const coa = coaMap.get(coaKey);
    let coaId, coaCode, coaName;
    if (!coa) {
      valid = false;
      error = error ? `${error}; COA tidak ditemukan` : 'COA tidak ditemukan';
    } else {
      coaId = coa.id;
      coaCode = coa.code;
      coaName = coa.name;
    }

    if (d === 0 && k === 0) {
      valid = false;
      error = error ? `${error}; Debit & Kredit 0` : 'Debit & Kredit 0';
    }
    if (d > 0 && k > 0) {
      valid = false;
      error = error ? `${error}; Debit & Kredit positif` : 'Debit & Kredit positif';
    }

    rows.push({
      rowIndex: i + 1,
      tanggal: tanggalRaw,
      keterangan: ket,
      namaCoa,
      debit: d,
      kredit: k,
      valid,
      error,
      coaId,
      coaCode,
      coaName,
    });
  }

  // Group by tanggal + keterangan
  const groups = new Map();
  rows.forEach(row => {
    const key = `${row.tanggal}|${row.keterangan}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        tanggal: row.tanggal,
        keterangan: row.keterangan,
        rows: [],
        totalDebit: 0,
        totalCredit: 0,
        valid: true,
        error: '',
      });
    }
    const g = groups.get(key);
    g.rows.push(row);
    g.totalDebit += row.debit;
    g.totalCredit += row.kredit;
  });

  const groupList = Array.from(groups.values());
  groupList.forEach(g => {
    if (g.totalDebit !== g.totalCredit) {
      g.valid = false;
      g.error = `Debit ${g.totalDebit} != Kredit ${g.totalCredit}`;
    }
    if (g.rows.some(r => !r.valid)) {
      g.valid = false;
      g.error = g.error || 'Ada baris error';
    }
  });

  return {
    groups: groupList,
    totalRows: rows.length,
    validRows: rows.filter(r => r.valid).length,
    errorRows: rows.filter(r => !r.valid).length,
    validGroups: groupList.filter(g => g.valid).length,
    errorGroups: groupList.filter(g => !g.valid).length,
  };
}

// ============ MAIN HANDLER ============
export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('🔥🔥🔥 IMPORT API CALLED! 🔥🔥🔥');

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { action } = req.body;
    console.log('Action:', action);

    // ============ PREVIEW ============
    if (action === 'preview') {
      const { fileBase64, companyId } = req.body;

      if (!fileBase64 || !companyId) {
        return res.status(400).json({ error: 'fileBase64 dan companyId wajib' });
      }

      console.log('📥 Processing preview...');
      
      const buffer = Buffer.from(fileBase64, 'base64');
      const file = new File([buffer], 'upload.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const preview = await parseExcel(file, companyId);
      console.log('✅ Preview result:', preview);

      return res.status(200).json({ success: true, preview });
    }

    // ============ IMPORT ============
    if (action === 'import') {
      const { groups, companyId } = req.body;

      if (!groups || !companyId) {
        return res.status(400).json({ error: 'groups dan companyId wajib' });
      }

      const results = [];
      let success = 0, failed = 0;

      for (const group of groups) {
        if (!group.valid) {
          results.push({ success: false, error: group.error });
          failed++;
          continue;
        }

        try {
          const [day, month, year] = group.tanggal.split('/');
          const isoDate = `${year}-${month}-${day}`;

          const entries = group.rows.map((r: any) => ({
            account_id: r.coaId,
            account_code: r.coaCode,
            account_name: r.coaName,
            debit: r.debit,
            credit: r.kredit,
          }));

          const journalId = await createJournal(
            companyId,
            isoDate,
            group.keterangan || 'Import Excel',
            entries
          );

          if (journalId) {
            results.push({ success: true, journalId });
            success++;
          } else {
            results.push({ success: false, error: 'Gagal buat jurnal' });
            failed++;
          }
        } catch (err: any) {
          results.push({ success: false, error: err.message });
          failed++;
        }
      }

      return res.status(200).json({
        success: true,
        results,
        summary: { total: results.length, success, failed },
      });
    }

    return res.status(400).json({ error: `Action "${action}" tidak dikenal` });
  } catch (error: any) {
    console.error('❌ ERROR:', error);
    return res.status(500).json({ 
      success: false,
      error: error.message || 'Internal server error' 
    });
  }
}
