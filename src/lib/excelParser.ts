import * as XLSX from 'xlsx';
import { supabase } from './supabase';
import { getCompanySuffix } from './accountingHelpers';

export type ImportRow = {
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

export type ImportGroup = {
  key: string;
  tanggal: string;
  keterangan: string;
  rows: ImportRow[];
  totalDebit: number;
  totalCredit: number;
  valid: boolean;
  error?: string;
};

export type ImportPreview = {
  groups: ImportGroup[];
  totalRows: number;
  validRows: number;
  errorRows: number;
  validGroups: number;
  errorGroups: number;
};

export async function parseExcelFile(file: File, companyId: number): Promise<ImportPreview> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  if (data.length < 2) throw new Error('File kosong atau tidak ada data');

  // Cari header
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

    const tanggalRaw = String(row[headerMap.tanggal] || '').trim();
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

export function generateTemplateExcel(): Blob {
  const headers = ['Tanggal', 'KETERANGAN', 'Nama coa', 'DEBET', 'KREDIT'];
  const exampleRows = [
    ['01/01/2025', 'Jurnal contoh 1', 'Kas', 1000000, 0],
    ['01/01/2025', 'Jurnal contoh 1', 'Pendapatan Jasa', 0, 1000000],
    ['02/01/2025', 'Jurnal contoh 2', 'Peralatan', 500000, 0],
    ['02/01/2025', 'Jurnal contoh 2', 'Kas', 0, 500000],
  ];

  const wsData = [headers, ...exampleRows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Jurnal');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
