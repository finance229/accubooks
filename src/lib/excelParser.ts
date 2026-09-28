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

// ============================================================
// KONVERSI TANGGAL EXCEL
// ============================================================
function excelDateToDate(excelDate: number): string {
  const epoch = new Date(1899, 11, 30);
  const date = new Date(epoch.getTime() + excelDate * 86400000);
  
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  
  return `${day}/${month}/${year}`;
}

function autoConvertDate(value: any): string {
  if (value === null || value === undefined || value === '') return '';
  
  // Kalau sudah Date object
  if (value instanceof Date) {
    const day = String(value.getDate()).padStart(2, '0');
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const year = value.getFullYear();
    return `${day}/${month}/${year}`;
  }
  
  const str = String(value).trim();
  
  // 1. Kalau angka (Excel date serial)
  if (!isNaN(Number(str)) && str !== '') {
    const num = Number(str);
    if (num > 1 && num < 100000) {
      return excelDateToDate(num);
    }
  }
  
  // 2. Format DD/MM/YYYY atau DD-MM-YYYY atau DD.MM.YYYY
  const separators = ['/', '-', '.'];
  for (const sep of separators) {
    if (str.includes(sep)) {
      const parts = str.split(sep);
      if (parts.length === 3) {
        let d = parts[0].trim().padStart(2, '0');
        let m = parts[1].trim().padStart(2, '0');
        let y = parts[2].trim();
        
        if (y.length === 2) y = '20' + y;
        
        if (d.length === 2 && m.length === 2 && y.length === 4 && !isNaN(Number(d)) && !isNaN(Number(m)) && !isNaN(Number(y))) {
          return `${d}/${m}/${y}`;
        }
      }
    }
  }
  
  // 3. Coba parse dengan Date object
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

// ============================================================
// PARSING ANGKA (ROBUST - HANDLE SEMUA FORMAT)
// ============================================================
function parseNumber(value: any): number {
  if (value === null || value === undefined || value === '') return 0;
  
  // Kalau sudah number
  if (typeof value === 'number') {
    return isNaN(value) ? 0 : value;
  }
  
  let str = String(value).trim();
  
  // Kalau cuma "-" atau "--" atau "- " → return 0
  if (/^[-–—\s]+$/.test(str) || str === '-') return 0;
  
  // Hapus semua karakter kecuali angka, titik, koma, minus
  str = str.replace(/[^\d.,-]/g, '');
  
  if (!str || str === '-' || str === '.' || str === ',') return 0;
  
  // Handle minus di depan
  const isNegative = str.startsWith('-');
  if (isNegative) str = str.substring(1);
  
  const hasDot = str.includes('.');
  const hasComma = str.includes(',');
  
  if (hasDot && hasComma) {
    const lastDot = str.lastIndexOf('.');
    const lastComma = str.lastIndexOf(',');
    
    if (lastComma > lastDot) {
      // Indonesia: 1.000.000,50
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      // US: 1,000,000.50
      str = str.replace(/,/g, '');
    }
  } else if (hasDot) {
    const parts = str.split('.');
    
    if (parts.length > 2) {
      // 1.000.000 → 1000000
      str = str.replace(/\./g, '');
    } else if (parts.length === 2) {
      const decimal = parts[1];
      // 🔥 KUNCI: kalau decimal 3 digit → pemisah ribuan
      if (decimal.length === 3) {
        str = str.replace(/\./g, '');
      }
      // decimal 1-2 digit → biarkan sebagai desimal
    }
  } else if (hasComma) {
    const parts = str.split(',');
    
    if (parts.length > 2) {
      // 1,000,000 → 1000000
      str = str.replace(/,/g, '');
    } else if (parts.length === 2) {
      const decimal = parts[1];
      if (decimal.length === 3) {
        str = str.replace(/,/g, '');
      } else {
        str = str.replace(',', '.');
      }
    }
  }
  
  const num = parseFloat(str);
  if (isNaN(num)) return 0;
  return isNegative ? -num : num;
}

// ============================================================
// NORMALISASI KETERANGAN (HANDLE MULTI-LINE)
// ============================================================
function normalizeKeterangan(str: string): string {
  if (!str) return '';
  // Ganti newline, tab, multiple spaces jadi single space
  return str.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// ============================================================
// NORMALISASI NAMA COA
// ============================================================
function normalizeCoaName(str: string): string {
  if (!str) return '';
  return str.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

// ============================================================
// PARSE EXCEL FILE
// ============================================================
export async function parseExcelFile(file: File, companyId: number): Promise<ImportPreview> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { 
    type: 'array',
    cellDates: true,  // 🔥 Convert date cells jadi Date object
    cellNF: false,
    cellText: false,
  });
  
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data: any[][] = XLSX.utils.sheet_to_json(sheet, { 
    header: 1, 
    raw: true,
    defval: '',  // 🔥 Default value untuk cell kosong
    blankrows: false,  // 🔥 Skip baris kosong
  });

  if (data.length < 2) throw new Error('File kosong atau tidak ada data');

  // ============ CARI HEADER ============
  const headerRow = data[0];
  const headerMap = { tanggal: -1, keterangan: -1, coa: -1, debet: -1, kredit: -1 };

  headerRow.forEach((col: any, idx: number) => {
    const str = String(col || '').toLowerCase().trim();
    if (str.includes('tanggal') || str.includes('tgl')) headerMap.tanggal = idx;
    else if (str.includes('keterangan') || str.includes('deskripsi')) headerMap.keterangan = idx;
    else if (str.includes('coa') || str.includes('akun') || str.includes('nama akun') || str.includes('nama coa')) headerMap.coa = idx;
    else if (str.includes('debet') || str.includes('debit')) headerMap.debet = idx;
    else if (str.includes('kredit') || str.includes('credit')) headerMap.kredit = idx;
  });

  console.log('📋 Header Map:', headerMap);

  if (Object.values(headerMap).some(v => v === -1)) {
    throw new Error('Header tidak sesuai. Gunakan: Tanggal | KETERANGAN | Nama coa | DEBET | KREDIT');
  }

  // ============ AMBIL COA DARI DB ============
  const suffix = getCompanySuffix(companyId);
  const { data: coaList } = await supabase
    .from('coa')
    .select('id, code, name')
    .eq('company_id', companyId)
    .eq('suffix', suffix)
    .eq('is_active', true);

  const coaMap = new Map<string, { id: number; code: string; name: string }>();
  coaList?.forEach(c => {
    const normalizedName = normalizeCoaName(c.name);
    coaMap.set(normalizedName, { id: c.id, code: c.code, name: c.name });
  });

  console.log(`✅ Loaded ${coaMap.size} COA untuk company ${companyId}`);

  // ============ PARSE SEMUA BARIS ============
  const rows: ImportRow[] = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;
    
    // Skip baris yang benar-benar kosong
    if (row.every(cell => cell === undefined || cell === null || cell === '')) continue;

    // 🔥 AUTO CONVERT TANGGAL
    const tanggalRaw = autoConvertDate(row[headerMap.tanggal]);
    
    // 🔥 NORMALISASI KETERANGAN
    const keteranganRaw = String(row[headerMap.keterangan] || '');
    const keterangan = normalizeKeterangan(keteranganRaw);
    
    const namaCoa = String(row[headerMap.coa] || '').trim();
    
    // 🔥 PARSE ANGKA
    const debit = parseNumber(row[headerMap.debet]);
    const kredit = parseNumber(row[headerMap.kredit]);

    const rowData: ImportRow = {
      rowIndex: i + 1,
      tanggal: tanggalRaw,
      keterangan,
      namaCoa,
      debit,
      kredit,
      valid: true,
    };

    // Validasi tanggal
    const dateRegex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    if (!dateRegex.test(tanggalRaw)) {
      rowData.valid = false;
      rowData.error = 'Format tanggal harus DD/MM/YYYY';
    }

    // Cari COA
    const coaKey = normalizeCoaName(namaCoa);
    const coa = coaMap.get(coaKey);
    if (!coa) {
      rowData.valid = false;
      rowData.error = rowData.error ? `${rowData.error}; COA tidak ditemukan: "${namaCoa}"` : `COA tidak ditemukan: "${namaCoa}"`;
    } else {
      rowData.coaId = coa.id;
      rowData.coaCode = coa.code;
      rowData.coaName = coa.name;
    }

    // Validasi Debit/Kredit
    if (debit === 0 && kredit === 0) {
      rowData.valid = false;
      rowData.error = rowData.error ? `${rowData.error}; Debit & Kredit 0` : 'Debit & Kredit 0';
    }
    if (debit > 0 && kredit > 0) {
      rowData.valid = false;
      rowData.error = rowData.error ? `${rowData.error}; Tidak boleh debit & kredit positif bersamaan` : 'Tidak boleh debit & kredit positif bersamaan';
    }

    rows.push(rowData);
  }

  console.log(`📊 Total rows parsed: ${rows.length}`);

  // ============ GROUPING ============
  const groupMap = new Map<string, ImportGroup>();
  
  rows.forEach(row => {
    // 🔥 KEY = tanggal + keterangan yang sudah dinormalisasi
    const key = `${row.tanggal}|||${row.keterangan}`;
    
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
  
  console.log(`📊 Total groups: ${groups.length}`);
  
  // Validasi grup
  groups.forEach(group => {
    // Cek total debit = kredit
    if (Math.abs(group.totalDebit - group.totalCredit) > 1) { // toleransi 1 rupiah
      group.valid = false;
      group.error = `Total Debit (${group.totalDebit.toLocaleString('id-ID')}) ≠ Total Kredit (${group.totalCredit.toLocaleString('id-ID')})`;
    }
    
    // Cek ada baris error
    const errorRows = group.rows.filter(r => !r.valid);
    if (errorRows.length > 0) {
      group.valid = false;
      const errorMsgs = errorRows.map(r => `Baris ${r.rowIndex}: ${r.error}`).join(' | ');
      group.error = group.error ? `${group.error} | ${errorMsgs}` : errorMsgs;
    }
  });

  // 🔥 DEBUG: Log grup yang error
  groups.filter(g => !g.valid).forEach(g => {
    console.log(`❌ Group ERROR: [${g.tanggal}] ${g.keterangan}`);
    console.log(`   Rows: ${g.rows.length}, Debit: ${g.totalDebit}, Kredit: ${g.totalCredit}`);
    g.rows.forEach(r => {
      console.log(`   - ${r.namaCoa} | D: ${r.debit} | K: ${r.kredit} | ${r.valid ? '✅' : '❌ ' + r.error}`);
    });
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

// ============================================================
// GENERATE TEMPLATE EXCEL
// ============================================================
export function generateTemplateExcel(): Blob {
  const headers = ['Tanggal', 'KETERANGAN', 'Nama coa', 'DEBET', 'KREDIT'];
  const exampleRows = [
    ['01/01/2025', 'Jurnal contoh 1', 'Kas', 1000000, 0],
    ['01/01/2025', 'Jurnal contoh 1', 'Pendapatan Jasa', 0, 1000000],
    ['02/01/2025', 'Jurnal contoh 2', 'Peralatan', 500000, 0],
    ['02/01/2025', 'Jurnal contoh 2', 'Kas', 0, 500000],
    ['03/01/2025', 'Jurnal dengan PPh', 'Beban Jasa', 1000000, 0],
    ['03/01/2025', 'Jurnal dengan PPh', 'Utang PPh 23', 0, 20000],
    ['03/01/2025', 'Jurnal dengan PPh', 'Kas', 0, 980000],
  ];

  const wsData = [headers, ...exampleRows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Jurnal');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
