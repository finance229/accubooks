import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

// ============ SUPABASE CLIENT ============
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

function isNumeric(value: any): boolean {
  return !isNaN(parseFloat(value)) && isFinite(value);
}

// ============ HELPER FUNCTIONS ============
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(Math.abs(amount));
};

const getCompanySuffix = (_companyId: number): string => {
  const suffixMap: Record<number, string> = {
    1: 'A',
    2: 'B',
    3: 'C',
  };
  return suffixMap[_companyId] || 'A';
};

const createGeneralJournal = async (
  companyId: number,
  date: string,
  description: string,
  reference: string,
  referenceType: string,
  referenceId: number,
  entries: Array<{
    account_id: number;
    account_code: string;
    account_name: string;
    debit: number;
    credit: number;
  }>,
  projectId?: number
): Promise<number | null> => {
  try {
    const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0);
    const totalCredit = entries.reduce((sum, e) => sum + e.credit, 0);
    
    if (totalDebit !== totalCredit) {
      throw new Error(`Total Debit (${totalDebit}) != Total Kredit (${totalCredit})`);
    }

    const year = new Date(date).getFullYear();
    const prefix = `JU-${year}-`;
    const { data: lastJournal } = await supabase
      .from('journals')
      .select('journal_number')
      .ilike('journal_number', `${prefix}%`)
      .order('created_at', { ascending: false })
      .limit(1);
    
    let sequence = 1;
    if (lastJournal && lastJournal.length > 0) {
      const lastNumber = parseInt(lastJournal[0].journal_number.replace(prefix, ''));
      sequence = isNaN(lastNumber) ? 1 : lastNumber + 1;
    }
    const journalNumber = `${prefix}${String(sequence).padStart(4, '0')}`;

    const { data: journal, error: jError } = await supabase
      .from('journals')
      .insert({
        company_id: companyId,
        journal_number: journalNumber,
        journal_date: date,
        description: description,
        reference: reference,
        reference_type: referenceType,
        reference_id: referenceId,
        project_id: projectId || null,
        status: 'posted',
        posted_by: 'system',
        posted_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (jError) throw jError;

    const lines = entries.map(entry => ({
      journal_id: journal.id,
      coa_id: entry.account_id,
      account_code: entry.account_code,
      account_name: entry.account_name,
      debit: entry.debit,
      credit: entry.credit,
    }));

    const { error: lError } = await supabase.from('journal_lines').insert(lines);
    if (lError) throw lError;

    console.log(`✅ Jurnal ${journalNumber} dibuat: ${description}`);
    return journal.id;
  } catch (error) {
    console.error('Error creating journal:', error);
    return null;
  }
};

// ============ PARSE EXCEL ============
type ImportRow = {
  rowIndex: number;
  tanggal: string;
  keterangan: string;
  namaCoa: string;
  debit: number;
  kredit: number;
  valid: boolean;
  error?: string;
  coaId?: number;
  coaCode?: string;
  coaName?: string;
};

type ImportGroup = {
  key: string;
  tanggal: string;
  keterangan: string;
  rows: ImportRow[];
  totalDebit: number;
  totalCredit: number;
  valid: boolean;
  error?: string;
};

type ImportPreview = {
  groups: ImportGroup[];
  totalRows: number;
  validRows: number;
  errorRows: number;
  validGroups: number;
  errorGroups: number;
};

async function parseExcelFile(file: File, companyId: number): Promise<ImportPreview> {
  console.log('📊 [parseExcelFile] Started');
  
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  if (data.length < 2) throw new Error('File kosong atau tidak ada data');

  const headerRow = data[0];
  const headerMap = { tanggal: -1, keterangan: -1, coa: -1, debet: -1, kredit: -1 };

  headerRow.forEach((col: any, idx: number) => {
    const str = String(col).toLowerCase().trim();
    if (str.includes('tanggal') || str.includes('tgl')) headerMap.tanggal = idx;
    else if (str.includes('keterangan') || str.includes('deskripsi')) headerMap.keterangan = idx;
    else if (str.includes('coa') || str.includes('akun') || str.includes('nama akun')) headerMap.coa = idx;
    else if (str.includes('debet') || str.includes('debit')) headerMap.debet = idx;
    else if (str.includes('kredit') || str.includes('credit')) headerMap.kredit = idx;
  });

  if (Object.values(headerMap).some(v => v === -1)) {
    throw new Error('Header tidak sesuai. Gunakan: Tanggal | KETERANGAN | Nama coa | DEBET | KREDIT');
  }

  const suffix = getCompanySuffix(companyId);
  const { data: coaList } = await supabase
    .from('coa')
    .select('id, code, name')
    .eq('company_id', companyId)
    .eq('suffix', suffix)
    .eq('is_active', true);

  const coaMap = new Map<string, { id: number; code: string; name: string }>();
  coaList?.forEach(c => {
    coaMap.set(c.name.toLowerCase().trim(), { id: c.id, code: c.code, name: c.name });
  });

  const rows: ImportRow[] = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;
    if (row.every(cell => cell === undefined || cell === null || cell === '')) continue;

    // 🔥🔥🔥 PERBAIKAN: PARSING TANGGAL 🔥🔥🔥
    let tanggalRaw = String(row[headerMap.tanggal] || '').trim();

    // CEK APAKAH TANGGAL BERUPA ANGKA (FORMAT EXCEL DATE)
    if (tanggalRaw && isNumeric(tanggalRaw)) {
      const numValue = parseFloat(tanggalRaw);
      if (numValue > 1 && numValue < 50000) {
        tanggalRaw = excelDateToDate(numValue);
        console.log(`📅 Excel date ${numValue} -> ${tanggalRaw}`);
      }
    }

    const keterangan = String(row[headerMap.keterangan] || '').trim();
    const namaCoa = String(row[headerMap.coa] || '').trim();
    const debitRaw = parseFloat(String(row[headerMap.debet] || '0').replace(/[^0-9,-]/g, '').replace(',', '.'));
    const kreditRaw = parseFloat(String(row[headerMap.kredit] || '0').replace(/[^0-9,-]/g, '').replace(',', '.'));

    const debit = isNaN(debitRaw) ? 0 : debitRaw;
    const kredit = isNaN(kreditRaw) ? 0 : kreditRaw;

    const rowData: ImportRow = {
      rowIndex: i + 1,
      tanggal: tanggalRaw,
      keterangan,
      namaCoa,
      debit,
      kredit,
      valid: true,
    };

    const dateRegex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    if (!dateRegex.test(tanggalRaw)) {
      rowData.valid = false;
      rowData.error = 'Format tanggal harus DD/MM/YYYY';
    }

    const coaKey = namaCoa.toLowerCase().trim();
    const coa = coaMap.get(coaKey);
    if (!coa) {
      rowData.valid = false;
      rowData.error = rowData.error ? `${rowData.error}; COA tidak ditemukan` : 'COA tidak ditemukan';
    } else {
      rowData.coaId = coa.id;
      rowData.coaCode = coa.code;
      rowData.coaName = coa.name;
    }

    if (debit === 0 && kredit === 0) {
      rowData.valid = false;
      rowData.error = rowData.error ? `${rowData.error}; Debit & Kredit 0` : 'Debit & Kredit 0';
    }
    if (debit > 0 && kredit > 0) {
      rowData.valid = false;
      rowData.error = rowData.error ? `${rowData.error}; Tidak boleh debit & kredit berisi positif` : 'Tidak boleh debit & kredit berisi positif';
    }

    rows.push(rowData);
  }

  const groupMap = new Map<string, ImportGroup>();
  rows.forEach(row => {
    const key = `${row.tanggal}|${row.keterangan}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        key,
        tanggal: row.tanggal,
        keterangan: row.keterangan,
        rows: [],
        totalDebit: 0,
        totalCredit: 0,
        valid: true,
      });
    }
    const group = groupMap.get(key)!;
    group.rows.push(row);
    group.totalDebit += row.debit;
    group.totalCredit += row.kredit;
  });

  const groups = Array.from(groupMap.values());
  groups.forEach(group => {
    if (group.totalDebit !== group.totalCredit) {
      group.valid = false;
      group.error = `Total Debit (${group.totalDebit}) tidak sama dengan Total Kredit (${group.totalCredit})`;
    }
    if (group.rows.some(r => !r.valid)) {
      group.valid = false;
      group.error = group.error || 'Ada baris yang error';
    }
  });

  return {
    groups,
    totalRows: rows.length,
    validRows: rows.filter(r => r.valid).length,
    errorRows: rows.filter(r => !r.valid).length,
    validGroups: groups.filter(g => g.valid).length,
    errorGroups: groups.filter(g => !g.valid).length,
  };
}

// ============ MAIN HANDLER ============
export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('📥 [import-journal] API DIPANGGIL');

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action } = req.body;
    console.log('🎯 Action:', action);

    if (action === 'preview') {
      const { fileBase64, companyId } = req.body;

      if (!fileBase64 || !companyId) {
        return res.status(400).json({ error: 'fileBase64 dan companyId wajib' });
      }

      const buffer = Buffer.from(fileBase64, 'base64');
      const file = new File([buffer], 'upload.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const preview = await parseExcelFile(file, companyId);
      return res.status(200).json({ success: true, preview });
    }

    if (action === 'import') {
      const { groups, companyId } = req.body;

      if (!groups || !companyId) {
        return res.status(400).json({ error: 'groups dan companyId wajib' });
      }

      const results: any[] = [];
      let successCount = 0;
      let failCount = 0;

      for (const group of groups) {
        if (!group.valid) {
          results.push({ success: false, error: group.error || 'Group tidak valid' });
          failCount++;
          continue;
        }

        try {
          const [day, month, year] = group.tanggal.split('/');
          const isoDate = `${year}-${month}-${day}`;

          const entries = group.rows.map((row: any) => ({
            account_id: row.coaId,
            account_code: row.coaCode,
            account_name: row.coaName,
            debit: row.debit,
            credit: row.kredit,
          }));

          const journalId = await createGeneralJournal(
            companyId,
            isoDate,
            group.keterangan || 'Import Excel',
            `IMPORT-${Date.now()}`,
            'IMPORT',
            0,
            entries
          );

          if (journalId) {
            results.push({ success: true, journalId });
            successCount++;
          } else {
            results.push({ success: false, error: 'Gagal membuat jurnal' });
            failCount++;
          }
        } catch (err: any) {
          results.push({ success: false, error: err.message || 'Error' });
          failCount++;
        }
      }

      return res.status(200).json({
        success: true,
        results,
        summary: { total: results.length, success: successCount, failed: failCount },
      });
    }

    return res.status(400).json({ error: `Action "${action}" tidak dikenal` });
  } catch (error: any) {
    console.error('❌ Error:', error);
    return res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
}
