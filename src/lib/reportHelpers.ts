// src/lib/reportHelpers.ts
import { supabase } from './supabase';
import { formatCurrency } from './accountingHelpers';

// ============================================
// TYPES
// ============================================
export type CashflowItem = {
  kategori: string;
  items: { akun: string; jumlah: number }[];
  total: number;
};

export type CashflowData = {
  periode: string;
  metode: 'langsung' | 'tidak_langsung';
  operasi: CashflowItem[];
  investasi: CashflowItem[];
  pendanaan: CashflowItem[];
  totalOperasi: number;
  totalInvestasi: number;
  totalPendanaan: number;
  kasAwal: number;
  kasAkhir: number;
  labaBersih?: number; // untuk metode tidak langsung
  penyesuaian?: CashflowItem[];
};

export type PajakData = {
  periode: string;
  ppn: {
    keluaran: { total: number; items: any[] };
    masukan: { total: number; items: any[] };
    selisih: number;
  };
  pphFinal: {
    total: number;
    items: any[];
  };
  pphTidakFinal: {
    pph21: { total: number; items: any[] };
    pph23: { total: number; items: any[] };
    pph25: { total: number; items: any[] };
    total: number;
  };
  saldoKreditPajak: number; // total pph tidak final yang bisa dikreditkan
};

// ============================================
// CASHFLOW - METODE LANGSUNG
// ============================================
export async function getCashflowLangsung(
  companyId: number,
  startDate: string,
  endDate: string
): Promise<CashflowData> {
  // Ambil semua jurnal yang sudah diposting dalam periode
  const { data: journals } = await supabase
    .from('journals')
    .select(`
      id, journal_date, description,
      journal_lines!inner (
        coa_id, debit, credit,
        coa!inner (id, code, name, type, category)
      )
    `)
    .eq('company_id', companyId)
    .eq('status', 'posted')
    .gte('journal_date', startDate)
    .lte('journal_date', endDate)
    .order('journal_date', { ascending: true });

  if (!journals || journals.length === 0) {
    return getEmptyCashflow(startDate, endDate, 'langsung');
  }

  // Mapping COA ke klasifikasi arus kas
  // Aset lancar (kas) → operasi, aset tetap → investasi, utang → pendanaan
  const operasi: CashflowItem[] = [];
  const investasi: CashflowItem[] = [];
  const pendanaan: CashflowItem[] = [];

  // Kategori transaksi untuk grouping
  const kategoriMap: Record<string, string> = {
    'Penjualan': 'Penerimaan dari pelanggan',
    'Pembelian': 'Pembayaran ke supplier',
    'Beban Gaji': 'Pembayaran gaji',
    'Beban Operasi': 'Beban operasi',
    'Beban Sewa': 'Pembayaran sewa',
    'Beban Listrik': 'Pembayaran listrik',
    'Beban Internet': 'Pembayaran internet',
    'Beban Transport': 'Pembayaran transport',
    'Beban Telepon': 'Pembayaran telepon',
    'Beban ATK': 'Pembayaran ATK',
    'Beban Maintenance': 'Pembayaran maintenance',
    'Beban Marketing': 'Pembayaran marketing',
    'Beban Penyusutan': 'Penyusutan (non-kas)',
    'Pajak': 'Pembayaran pajak',
    'Pembelian Aset': 'Pembelian aset tetap',
    'Penjualan Aset': 'Penjualan aset tetap',
    'Pinjaman': 'Penerimaan pinjaman',
    'Pembayaran Pinjaman': 'Pembayaran pinjaman',
    'Modal': 'Setoran modal',
    'Prive': 'Prive / Penarikan modal',
  };

  // Proses setiap journal
  journals.forEach(journal => {
    const lines = journal.journal_lines || [];
    
    lines.forEach((line: any) => {
      const coa = line.coa;
      if (!coa) return;
      
      // Hitung selisih debit - credit (positif = kas masuk, negatif = kas keluar)
      const amount = (line.debit || 0) - (line.credit || 0);
      if (amount === 0) return;

      // Tentukan klasifikasi berdasarkan COA type dan kategori
      const coaType = coa.type;
      const coaCode = coa.code || '';
      const coaName = coa.name || '';

      // Mapping COA ke kategori arus kas
      let kategori = 'Lain-lain';
      let deskripsi = coaName;

      // ========== KLASIFIKASI ==========
      // 1. ASET LANCAR (Kas, Bank) → Operasi
      if (coaType === 'asset' && (coaCode.startsWith('1101') || coaCode.startsWith('1102'))) {
        // Ini adalah akun kas/bank, tapi kita perlu lihat lawan transaksinya
        // Untuk sederhana, kita skip karena di jurnal double-entry
        return;
      }

      // 2. ASET TETAP (12xx) → Investasi
      if (coaType === 'asset' && coaCode.startsWith('12')) {
        if (amount > 0) {
          investasi.push({ akun: `Penjualan ${coaName}`, jumlah: amount });
        } else {
          investasi.push({ akun: `Pembelian ${coaName}`, jumlah: Math.abs(amount) });
        }
        return;
      }

      // 3. KEWAJIBAN (21xx) → Pendanaan
      if (coaType === 'liability') {
        if (amount > 0) {
          pendanaan.push({ akun: `Penerimaan ${coaName}`, jumlah: amount });
        } else {
          pendanaan.push({ akun: `Pembayaran ${coaName}`, jumlah: Math.abs(amount) });
        }
        return;
      }

      // 4. EKUITAS (31xx) → Pendanaan
      if (coaType === 'equity') {
        if (amount > 0) {
          pendanaan.push({ akun: `Setoran ${coaName}`, jumlah: amount });
        } else {
          pendanaan.push({ akun: `Prive ${coaName}`, jumlah: Math.abs(amount) });
        }
        return;
      }

      // 5. PENDAPATAN (41xx) → Operasi (Penerimaan)
      if (coaType === 'revenue') {
        operasi.push({ akun: `Penerimaan ${coaName}`, jumlah: amount });
        return;
      }

      // 6. BEBAN (51xx) → Operasi (Pengeluaran)
      if (coaType === 'expense') {
        // Kecuali beban penyusutan (5152) → tidak kas, diabaikan
        if (coaCode === '5152') {
          // Penyusutan tidak mempengaruhi kas, abaikan
          return;
        }
        const namaBeban = coaName.replace('Beban ', '');
        operasi.push({ akun: `Pembayaran ${namaBeban}`, jumlah: Math.abs(amount) });
        return;
      }

      // Default
      operasi.push({ akun: `${coaName} (${coaType})`, jumlah: amount });
    });
  });

  // Agregasi per kategori
  const aggregate = (items: { akun: string; jumlah: number }[]): CashflowItem[] => {
    const map = new Map<string, { akun: string; jumlah: number }[]>();
    items.forEach(item => {
      const key = item.akun;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    });
    
    const result: CashflowItem[] = [];
    map.forEach((value, key) => {
      const total = value.reduce((sum, v) => sum + v.jumlah, 0);
      result.push({
        kategori: key,
        items: value,
        total: total,
      });
    });
    return result;
  };

  // Hitung total
  const totalOperasi = operasi.reduce((sum, i) => sum + i.jumlah, 0);
  const totalInvestasi = investasi.reduce((sum, i) => sum + i.jumlah, 0);
  const totalPendanaan = pendanaan.reduce((sum, i) => sum + i.jumlah, 0);

  // Ambil saldo kas awal
  const { data: kasAwal } = await supabase
    .from('transactions')
    .select('amount')
    .eq('company_id', companyId)
    .lt('transaction_date', startDate)
    .in('coa_id', (await supabase.from('coa').select('id').eq('company_id', companyId).ilike('code', '1101%').or('code.ilike.1102%')).data?.map(c => c.id) || []);
  
  const saldoAwal = (kasAwal || []).reduce((sum, t) => sum + t.amount, 0);

  return {
    periode: `${startDate} s/d ${endDate}`,
    metode: 'langsung',
    operasi: aggregate(operasi),
    investasi: aggregate(investasi),
    pendanaan: aggregate(pendanaan),
    totalOperasi,
    totalInvestasi,
    totalPendanaan,
    kasAwal: saldoAwal,
    kasAkhir: saldoAwal + totalOperasi + totalInvestasi + totalPendanaan,
  };
}

// ============================================
// CASHFLOW - METODE TIDAK LANGSUNG
// ============================================
export async function getCashflowTidakLangsung(
  companyId: number,
  startDate: string,
  endDate: string
): Promise<CashflowData> {
  // Mulai dari laba bersih (dari income statement)
  // Ambil total pendapatan dan beban dari jurnal
  const { data: journals } = await supabase
    .from('journals')
    .select(`
      id, journal_date, description,
      journal_lines!inner (
        coa_id, debit, credit,
        coa!inner (id, code, name, type, category)
      )
    `)
    .eq('company_id', companyId)
    .eq('status', 'posted')
    .gte('journal_date', startDate)
    .lte('journal_date', endDate);

  if (!journals || journals.length === 0) {
    return getEmptyCashflow(startDate, endDate, 'tidak_langsung');
  }

  let totalPendapatan = 0;
  let totalBeban = 0;
  let penyesuaian: { akun: string; jumlah: number }[] = [];

  journals.forEach(journal => {
    const lines = journal.journal_lines || [];
    lines.forEach((line: any) => {
      const coa = line.coa;
      if (!coa) return;
      
      const amount = (line.debit || 0) - (line.credit || 0);
      
      if (coa.type === 'revenue') {
        totalPendapatan += amount;
      } else if (coa.type === 'expense') {
        totalBeban += Math.abs(amount);
        // Penyesuaian untuk beban non-kas
        if (coa.code === '5152') { // Beban penyusutan
          penyesuaian.push({ akun: 'Penyusutan', jumlah: Math.abs(amount) });
        }
      }
    });
  });

  const labaBersih = totalPendapatan - totalBeban;

  // Ambil perubahan aset/liabilitas dari neraca (simplifikasi)
  // Untuk demo, kita ambil dari saldo akun tertentu
  const { data: coaData } = await supabase
    .from('coa')
    .select('id, code, name, type')
    .eq('company_id', companyId)
    .in('code', ['1111', '2101', '1131', '2103-01']); // Piutang, Utang, PPN Masukan, PPN Keluaran

  const coaIds = coaData?.map(c => c.id) || [];

  // Ambil saldo awal dan akhir
  const getBalance = async (coaId: number, date: string) => {
    const { data } = await supabase
      .from('journal_lines')
      .select('debit, credit')
      .eq('coa_id', coaId)
      .in('journal_id', (await supabase.from('journals').select('id').eq('company_id', companyId).eq('status', 'posted').lte('journal_date', date)).data?.map(j => j.id) || []);
    return (data || []).reduce((sum, d) => sum + (d.debit - d.credit), 0);
  };

  // Tambahkan penyesuaian perubahan modal kerja
  const piutangAwal = await getBalance(coaData?.find(c => c.code === '1111')?.id || 0, startDate);
  const piutangAkhir = await getBalance(coaData?.find(c => c.code === '1111')?.id || 0, endDate);
  const utangAwal = await getBalance(coaData?.find(c => c.code === '2101')?.id || 0, startDate);
  const utangAkhir = await getBalance(coaData?.find(c => c.code === '2101')?.id || 0, endDate);

  if (piutangAkhir - piutangAwal > 0) {
    penyesuaian.push({ akun: 'Kenaikan Piutang', jumlah: -(piutangAkhir - piutangAwal) });
  }
  if (utangAkhir - utangAwal > 0) {
    penyesuaian.push({ akun: 'Kenaikan Utang', jumlah: (utangAkhir - utangAwal) });
  }

  // Operasi = laba bersih + penyesuaian
  const totalPenyesuaian = penyesuaian.reduce((sum, p) => sum + p.jumlah, 0);
  const totalOperasi = labaBersih + totalPenyesuaian;

  // Investasi dan pendanaan dihitung sama seperti metode langsung
  const investasi: CashflowItem[] = [];
  const pendanaan: CashflowItem[] = [];

  // Ambil data aset tetap dan utang jangka panjang
  journals.forEach(journal => {
    const lines = journal.journal_lines || [];
    lines.forEach((line: any) => {
      const coa = line.coa;
      if (!coa) return;
      const amount = (line.debit || 0) - (line.credit || 0);
      if (amount === 0) return;

      // Aset tetap (12xx)
      if (coa.type === 'asset' && coa.code.startsWith('12')) {
        investasi.push({ akun: coa.name, jumlah: Math.abs(amount) });
      }
      // Utang jangka panjang (22xx)
      if (coa.type === 'liability' && coa.code.startsWith('22')) {
        pendanaan.push({ akun: coa.name, jumlah: amount });
      }
    });
  });

  const totalInvestasi = investasi.reduce((sum, i) => sum + i.jumlah, 0);
  const totalPendanaan = pendanaan.reduce((sum, p) => sum + p.jumlah, 0);

  // Saldo kas
  const { data: kasAwal } = await supabase
    .from('transactions')
    .select('amount')
    .eq('company_id', companyId)
    .lt('transaction_date', startDate)
    .in('coa_id', (await supabase.from('coa').select('id').eq('company_id', companyId).ilike('code', '1101%').or('code.ilike.1102%')).data?.map(c => c.id) || []);
  
  const saldoAwal = (kasAwal || []).reduce((sum, t) => sum + t.amount, 0);

  return {
    periode: `${startDate} s/d ${endDate}`,
    metode: 'tidak_langsung',
    operasi: [{ kategori: 'Laba Bersih', items: [{ akun: 'Laba Bersih', jumlah: labaBersih }], total: labaBersih }],
    investasi: investasi.length ? [{ kategori: 'Investasi', items: investasi, total: totalInvestasi }] : [],
    pendanaan: pendanaan.length ? [{ kategori: 'Pendanaan', items: pendanaan, total: totalPendanaan }] : [],
    totalOperasi,
    totalInvestasi,
    totalPendanaan,
    kasAwal: saldoAwal,
    kasAkhir: saldoAwal + totalOperasi + totalInvestasi + totalPendanaan,
    labaBersih,
    penyesuaian: penyesuaian.length ? [{ kategori: 'Penyesuaian', items: penyesuaian, total: totalPenyesuaian }] : [],
  };
}

function getEmptyCashflow(startDate: string, endDate: string, metode: string): CashflowData {
  return {
    periode: `${startDate} s/d ${endDate}`,
    metode: metode as 'langsung' | 'tidak_langsung',
    operasi: [],
    investasi: [],
    pendanaan: [],
    totalOperasi: 0,
    totalInvestasi: 0,
    totalPendanaan: 0,
    kasAwal: 0,
    kasAkhir: 0,
  };
}

// ============================================
// LAPORAN PAJAK
// ============================================
export async function getLaporanPajak(
  companyId: number,
  startDate: string,
  endDate: string
): Promise<PajakData> {
  // PPN Keluaran (dari invoices - AR)
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, invoice_date, customer_name, total, ppn, status')
    .eq('company_id', companyId)
    .gte('invoice_date', startDate)
    .lte('invoice_date', endDate);

  const ppnKeluaran = (invoices || []).reduce((sum, inv) => sum + (inv.ppn || 0), 0);

  // PPN Masukan (dari vendor_invoices - AP)
  const { data: vendorInvoices } = await supabase
    .from('vendor_invoices')
    .select('id, invoice_number, invoice_date, vendor_name, total, ppn, status')
    .eq('company_id', companyId)
    .gte('invoice_date', startDate)
    .lte('invoice_date', endDate);

  const ppnMasukan = (vendorInvoices || []).reduce((sum, inv) => sum + (inv.ppn || 0), 0);

  // PPh 23 (dari vendor_invoices)
  const pph23 = (vendorInvoices || []).reduce((sum, inv) => sum + (inv.pph23 || 0), 0);

  // PPh 21, 25, Final dari jurnal (akun 2103-02, 2103-04, dan akun PPh final)
  const { data: journals } = await supabase
    .from('journals')
    .select(`
      id, journal_date, description,
      journal_lines!inner (
        debit, credit,
        coa!inner (id, code, name, type)
      )
    `)
    .eq('company_id', companyId)
    .eq('status', 'posted')
    .gte('journal_date', startDate)
    .lte('journal_date', endDate);

  let pph21 = 0;
  let pph25 = 0;
  let pphFinal = 0;
  const pph21Items: any[] = [];
  const pph25Items: any[] = [];
  const pphFinalItems: any[] = [];

  (journals || []).forEach(j => {
    (j.journal_lines || []).forEach((line: any) => {
      const coa = line.coa;
      if (!coa) return;
      const amount = (line.credit || 0) - (line.debit || 0); // utang bertambah = credit
      if (amount <= 0) return;

      if (coa.code === '2103-02') { // PPh 21
        pph21 += amount;
        pph21Items.push({
          tanggal: j.journal_date,
          deskripsi: j.description,
          jumlah: amount,
        });
      } else if (coa.code === '2103-04') { // PPh 25
        pph25 += amount;
        pph25Items.push({
          tanggal: j.journal_date,
          deskripsi: j.description,
          jumlah: amount,
        });
      } else if (coa.code && coa.code.startsWith('2104')) { // PPh Final (misal 2104-01)
        pphFinal += amount;
        pphFinalItems.push({
          tanggal: j.journal_date,
          deskripsi: j.description,
          jumlah: amount,
        });
      }
    });
  });

  const totalPphTidakFinal = pph21 + pph23 + pph25;
  const saldoKreditPajak = totalPphTidakFinal; // bisa dikurangkan ke PPh Badan

  return {
    periode: `${startDate} s/d ${endDate}`,
    ppn: {
      keluaran: { total: ppnKeluaran, items: invoices || [] },
      masukan: { total: ppnMasukan, items: vendorInvoices || [] },
      selisih: ppnKeluaran - ppnMasukan,
    },
    pphFinal: {
      total: pphFinal,
      items: pphFinalItems,
    },
    pphTidakFinal: {
      pph21: { total: pph21, items: pph21Items },
      pph23: { total: pph23, items: vendorInvoices || [] },
      pph25: { total: pph25, items: pph25Items },
      total: totalPphTidakFinal,
    },
    saldoKreditPajak,
  };
}
