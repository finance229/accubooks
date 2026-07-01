import { supabase } from './supabase';

// ============================================
// FORMAT CURRENCY
// ============================================
export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(Math.abs(amount));
};

export const formatNumber = (amount: number) => {
  return new Intl.NumberFormat('id-ID').format(amount);
};

// ============================================
// COMPANY SUFFIX
// ============================================
export const getCompanySuffix = (_companyId: number): string => {
  const suffixMap: Record<number, string> = {
    1: 'A',
    2: 'B',
    3: 'C',
  };
  return suffixMap[_companyId] || 'A';
};

// ============================================
// VOUCHER CODE (MANUAL)
// ============================================
export const generateVoucherCode = async (_companyId: number, projectCode: string, date: Date): Promise<string> => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const base = `${year}/${month}/${projectCode}`;
  
  const { data } = await supabase
    .from('payment_requests')
    .select('voucher_no')
    .ilike('voucher_no', `${base}/%`)
    .order('voucher_no', { ascending: false })
    .limit(1);
  
  let lastNumber = 0;
  if (data && data.length > 0 && data[0].voucher_no) {
    const parts = data[0].voucher_no.split('/');
    const lastPart = parts[parts.length - 1];
    lastNumber = parseInt(lastPart) || 0;
  }
  
  const nextNumber = (lastNumber + 1).toString().padStart(3, '0');
  return `${base}/${nextNumber}`;
};

// ============================================
// PROJECT BUDGET
// ============================================
export const checkProjectBudget = async (projectId: number, amount: number) => {
  const { data: project, error } = await supabase
    .from('projects')
    .select('id, name, budget, spent')
    .eq('id', projectId)
    .single();
  
  if (error || !project) return { sufficient: false, message: 'Proyek tidak ditemukan', remaining: 0 };
  
  // 🔥 JIKA BUDGET = 0, ANGGAP TIDAK TERBATAS (UNLIMITED)
  if (project.budget === 0) {
    return {
      sufficient: true,
      remaining: Infinity,
      budget: 0,
      spent: project.spent,
      message: '✅ Budget tidak terbatas (unlimited)'
    };
  }
  
  const remaining = project.budget - project.spent;
  const sufficient = remaining >= amount;
  return {
    sufficient,
    remaining,
    budget: project.budget,
    spent: project.spent,
    message: sufficient ? 'Budget cukup' : `Budget tidak cukup (sisa ${formatCurrency(remaining)})`
  };
};

export const updateProjectSpent = async (projectId: number, amount: number) => {
  const { data: project } = await supabase
    .from('projects')
    .select('spent')
    .eq('id', projectId)
    .single();
  
  if (!project) return false;
  
  const newSpent = (project.spent || 0) + amount;
  const { error } = await supabase
    .from('projects')
    .update({ spent: newSpent })
    .eq('id', projectId);
  
  return !error;
};

// ============================================
// GET DEFAULT ACCOUNT
// ============================================
export const getDefaultAccount = async (_companyId: number, type: string) => {
  const suffix = getCompanySuffix(_companyId);
  
  const mapping: Record<string, string> = {
    receivable: '1111',
    ppn_in: '1131',
    cash: '1101',
    bank_mandiri: '1102-01',
    bank_bca: '1102-02',
    bank_bri: '1102-03',
    bank_bsi: '1102-04',
    bank_bni: '1102-05',
    payable: '2101',
    ppn_out: '2103-01',
    pph21: '2103-02',
    pph23: '2103-03',
    pph25: '2103-04',
    capital: '3101',
    retained_earnings: '3102',
    revenue: '4101',
    revenue_other: '4102',
    expense_salary: '5101',
    expense_rent: '5111',
    expense_electricity: '5112',
    expense_depreciation: '5152',
  };
  
  const baseCode = mapping[type];
  if (!baseCode) {
    console.error(`Mapping untuk tipe "${type}" tidak ditemukan`);
    return null;
  }
  
  const { data, error } = await supabase
    .from('coa')
    .select('id, code, name, type')
    .eq('company_id', _companyId)
    .eq('code', baseCode)
    .eq('suffix', suffix)
    .single();
  
  if (error) {
    console.error(`Akun ${type} (${baseCode}-${suffix}) tidak ditemukan untuk company ${_companyId}`);
    return null;
  }
  return data;
};

// ============================================
// GET ACCOUNTS BY TYPE
// ============================================
export const getBankAccounts = async (companyId: number) => {
  try {
    const suffix = getCompanySuffix(companyId);
    
    const { data, error } = await supabase
      .from('coa')
      .select('id, code, name')
      .eq('company_id', companyId)
      .eq('suffix', suffix)
      .eq('is_active', true)
      .eq('type', 'asset');
    
    if (error) {
      console.error('Error getBankAccounts:', error);
      return [];
    }
    
    const bankAccounts = (data || []).filter(acc => 
      acc.name.toLowerCase().includes('bank') || 
      acc.name.toLowerCase().includes('kas')
    );
    
    return bankAccounts;
  } catch (err) {
    console.error('Error getBankAccounts:', err);
    return [];
  }
};

export const getExpenseAccounts = async (companyId: number) => {
  const { data, error } = await supabase
    .from('coa')
    .select('id, code, name, type')
    .eq('company_id', companyId)
    .in('type', ['expense', 'asset'])
    .eq('is_active', true)
    .order('code');
  
  if (error) return [];
  return data || [];
};

export const getLiabilityAccounts = async (companyId: number) => {
  const { data, error } = await supabase
    .from('coa')
    .select('id, code, name, type')
    .eq('company_id', companyId)
    .eq('type', 'liability')
    .eq('is_active', true)
    .order('code');
  
  if (error) return [];
  return data || [];
};

export const getAllAccounts = async (companyId: number) => {
  const { data, error } = await supabase
    .from('coa')
    .select('id, code, name, type')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('code');
  
  if (error) return [];
  return data || [];
};

// ============================================
// JOURNAL FUNCTIONS
// ============================================
async function getNextJournalNumber(companyId: number, year: number): Promise<number> {
  const prefix = `JU-${year}-`;
  const { data } = await supabase
    .from('journals')
    .select('journal_number')
    .ilike('journal_number', `${prefix}%`)
    .order('journal_number', { ascending: false })
    .limit(1);
  
  if (!data || data.length === 0) return 1;
  const lastNumber = parseInt(data[0].journal_number.replace(prefix, ''));
  return isNaN(lastNumber) ? 1 : lastNumber + 1;
}

export const createAccrualJournal = async (
  companyId: number,
  date: string,
  description: string,
  voucherNo: string,
  debitAccountId: number,
  creditAccountId: number,
  amount: number,
  _projectId?: number
) => {
  const { data: debitAcc } = await supabase
    .from('coa')
    .select('code, name')
    .eq('id', debitAccountId)
    .single();
  const { data: creditAcc } = await supabase
    .from('coa')
    .select('code, name')
    .eq('id', creditAccountId)
    .single();
  
  if (!debitAcc || !creditAcc) throw new Error('Akun tidak ditemukan');
  
  const year = new Date(date).getFullYear();
  const count = await getNextJournalNumber(companyId, year);
  const journalNumber = `JU-${year}-${String(count).padStart(4, '0')}`;
  
  const { data: journal, error: jError } = await supabase
    .from('journals')
    .insert({
      company_id: companyId,
      journal_number: journalNumber,
      journal_date: date,
      description: `Accrual: ${description} (${voucherNo})`,
      status: 'posted',
      posted_by: 'system',
      posted_at: new Date().toISOString(),
    })
    .select()
    .single();
  
  if (jError) throw jError;
  
  const lines = [
    { journal_id: journal.id, coa_id: debitAccountId, account_code: debitAcc.code, account_name: debitAcc.name, debit: amount, credit: 0 },
    { journal_id: journal.id, coa_id: creditAccountId, account_code: creditAcc.code, account_name: creditAcc.name, debit: 0, credit: amount }
  ];
  
  const { error: lError } = await supabase.from('journal_lines').insert(lines);
  if (lError) throw lError;
  
  return journal.id;
};

export const createPaymentJournal = async (
  companyId: number,
  date: string,
  description: string,
  voucherNo: string,
  liabilityAccountId: number,
  bankAccountId: number,
  amount: number,
  _projectId?: number
) => {
  const { data: liabilityAcc } = await supabase
    .from('coa')
    .select('code, name')
    .eq('id', liabilityAccountId)
    .single();
  const { data: bankAcc } = await supabase
    .from('coa')
    .select('code, name')
    .eq('id', bankAccountId)
    .single();
  
  if (!liabilityAcc || !bankAcc) throw new Error('Akun tidak ditemukan');
  
  const year = new Date(date).getFullYear();
  const count = await getNextJournalNumber(companyId, year);
  const journalNumber = `JU-${year}-${String(count).padStart(4, '0')}`;
  
  const { data: journal, error: jError } = await supabase
    .from('journals')
    .insert({
      company_id: companyId,
      journal_number: journalNumber,
      journal_date: date,
      description: `Pembayaran: ${description} (${voucherNo})`,
      status: 'posted',
      posted_by: 'system',
      posted_at: new Date().toISOString(),
    })
    .select()
    .single();
  
  if (jError) throw jError;
  
  const lines = [
    { journal_id: journal.id, coa_id: liabilityAccountId, account_code: liabilityAcc.code, account_name: liabilityAcc.name, debit: amount, credit: 0 },
    { journal_id: journal.id, coa_id: bankAccountId, account_code: bankAcc.code, account_name: bankAcc.name, debit: 0, credit: amount }
  ];
  
  const { error: lError } = await supabase.from('journal_lines').insert(lines);
  if (lError) throw lError;
  
  return journal.id;
};

export const createGeneralJournal = async (
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

// ============================================
// PAYMENT LOG
// ============================================
export const addPaymentLog = async (requestId: number, oldStatus: string, newStatus: string, notes: string) => {
  const { data: user } = await supabase.auth.getUser();
  const email = user.user?.email || 'system';
  
  await supabase.from('payment_request_logs').insert({
    request_id: requestId,
    old_status: oldStatus,
    new_status: newStatus,
    changed_by: email,
    notes: notes,
  });
};

// ============================================
// CREATE CUSTOMER / VENDOR / PROJECT
// ============================================
export const createCustomerIfNotExist = async (
  companyId: number,
  name: string,
  email?: string,
  phone?: string,
  address?: string
) => {
  const { data: existing } = await supabase
    .from('contacts')
    .select('id')
    .eq('company_id', companyId)
    .eq('type', 'customer')
    .eq('name', name)
    .maybeSingle();
  
  if (existing) return existing.id;
  
  const { data: newCustomer, error } = await supabase
    .from('contacts')
    .insert({
      company_id: companyId,
      name: name,
      type: 'customer',
      email: email || null,
      phone: phone || null,
      address: address || null,
      balance: 0,
    })
    .select()
    .single();
  
  if (error) throw error;
  return newCustomer.id;
};

export const createVendorIfNotExist = async (
  companyId: number,
  name: string,
  npwp?: string,
  address?: string,
  phone?: string,
  email?: string,
  bank_name?: string,
  bank_account?: string
) => {
  const { data: existing } = await supabase
    .from('vendors')
    .select('id')
    .eq('company_id', companyId)
    .eq('name', name)
    .maybeSingle();
  
  if (existing) return existing.id;
  
  const { data: newVendor, error } = await supabase
    .from('vendors')
    .insert({
      company_id: companyId,
      name: name,
      npwp: npwp || null,
      address: address || null,
      phone: phone || null,
      email: email || null,
      bank_name: bank_name || null,
      bank_account: bank_account || null,
      payment_term: 30,
    })
    .select()
    .single();
  
  if (error) throw error;
  return newVendor.id;
};

// ============================================
// 🔥🔥🔥 GENERATE INVOICE NO (NEW FORMAT) 🔥🔥🔥
// ============================================
export const generateInvoiceNo = async (
  companyId: number,
  date: Date,
  projectCode: string | null = null
): Promise<string> => {
  // Ambil kode perusahaan (ARKO, MMC, USA)
  const { data: company } = await supabase
    .from('companies')
    .select('code')
    .eq('id', companyId)
    .single();
  
  const companyCode = company?.code || 'INV';

  // Format tahun dan bulan (terpisah)
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');

  // Project code (default GENERAL)
  const projectPart = projectCode || 'GENERAL';

  // Cari nomor urut terakhir
  const pattern = `${companyCode}/INV/${year}/${month}/${projectPart}/%`;
  const { data: lastInvoice } = await supabase
    .from('invoices')
    .select('invoice_number')
    .eq('company_id', companyId)
    .like('invoice_number', pattern)
    .order('invoice_number', { ascending: false })
    .limit(1);

  let lastNumber = 0;
  if (lastInvoice && lastInvoice.length > 0) {
    const parts = lastInvoice[0].invoice_number.split('/');
    const lastPart = parts[parts.length - 1];
    lastNumber = parseInt(lastPart) || 0;
  }

  const nextNumber = (lastNumber + 1).toString().padStart(3, '0');

  // 🔥 FORMAT: ARKO/INV/2026/06/PRJ001/001
  return `${companyCode}/INV/${year}/${month}/${projectPart}/${nextNumber}`;
};

// ============================================
// GENERATE VOUCHER NO (RPC - bisa dihapus jika tidak dipakai)
// ============================================
export const generateVoucherNumber = async (
  companyId: number,
  prefix: string // contoh: 'PT A/2026/06/BNPB'
): Promise<string> => {
  // Cari atau buat sequence
  let { data: seq } = await supabase
    .from('voucher_sequences')
    .select('last_number')
    .eq('company_id', companyId)
    .eq('prefix', prefix)
    .single();

  if (!seq) {
    // Buat baru
    const { data: newSeq } = await supabase
      .from('voucher_sequences')
      .insert({ company_id: companyId, prefix, last_number: 0 })
      .select()
      .single();
    seq = newSeq;
  }

  // Increment
  const nextNumber = (seq.last_number || 0) + 1;

  // Update
  await supabase
    .from('voucher_sequences')
    .update({ last_number: nextNumber, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('prefix', prefix);

  // Format 3 digit
  const formatted = String(nextNumber).padStart(3, '0');
  return `${prefix}/${formatted}`;
};

export const previewVoucherNo = async (
  companyId: number,
  date: Date,
  projectCode: string | null = null
): Promise<string> => {
  const { data, error } = await supabase.rpc('preview_voucher_no', {
    p_company_id: companyId,
    p_date: date.toISOString().split('T')[0],
    p_project_code: projectCode,
  });
  if (error) throw new Error(error.message);
  return data;
};

export const createProjectIfNotExist = async (
  companyId: number,
  code: string,
  name: string,
  budget: number
) => {
  const { data: existing } = await supabase
    .from('projects')
    .select('id')
    .eq('company_id', companyId)
    .eq('code', code)
    .maybeSingle();
  
  if (existing) return existing.id;
  
  const { data: newProject, error } = await supabase
    .from('projects')
    .insert({
      company_id: companyId,
      code: code.toUpperCase(),
      name: name,
      budget: budget,
      spent: 0,
      status: 'active',
    })
    .select()
    .single();
  
  if (error) throw error;
  return newProject.id;
};

// ============================================
// CREATE PAYROLL JOURNAL
// ============================================
export const createPayrollJournal = async (
  companyId: number,
  payroll: any,
  createdBy: string = 'system'
): Promise<number | null> => {
  try {
    // Cari COA untuk akun-akun payroll
    const coaMap: Record<string, string> = {
      beban_gaji_pokok: '5101',
      beban_tunjangan: '5102',
      beban_bpjs_kes: '5103',
      beban_bpjs_tk: '5104',
      beban_pph21: '5105',
      utang_bpjs_kes: '2102',
      utang_bpjs_tk: '2103',
      utang_pph21: '2103-01', // Utang PPh 21 (sudah ada)
      kas: '1102-01', // Bank default
    };

    const getAccountId = async (code: string): Promise<number | null> => {
      const { data } = await supabase
        .from('coa')
        .select('id')
        .eq('company_id', companyId)
        .eq('code', code)
        .eq('is_active', true)
        .single();
      return data?.id || null;
    };

    // Ambil semua akun yang dibutuhkan
    const bebanGajiPokokId = await getAccountId(coaMap.beban_gaji_pokok);
    const bebanTunjanganId = await getAccountId(coaMap.beban_tunjangan);
    const bebanBpjsKesId = await getAccountId(coaMap.beban_bpjs_kes);
    const bebanBpjsTkId = await getAccountId(coaMap.beban_bpjs_tk);
    const bebanPph21Id = await getAccountId(coaMap.beban_pph21);
    const utangBpjsKesId = await getAccountId(coaMap.utang_bpjs_kes);
    const utangBpjsTkId = await getAccountId(coaMap.utang_bpjs_tk);
    const utangPph21Id = await getAccountId(coaMap.utang_pph21);
    const kasId = await getAccountId(coaMap.kas);

    if (!bebanGajiPokokId || !bebanTunjanganId || !bebanBpjsKesId || !bebanBpjsTkId ||
        !utangBpjsKesId || !utangBpjsTkId || !kasId) {
      console.error('❌ COA untuk payroll tidak lengkap');
      return null;
    }

    // Ambil nama akun untuk journal_lines
    const getAccountDetails = async (id: number) => {
      const { data } = await supabase
        .from('coa')
        .select('code, name')
        .eq('id', id)
        .single();
      return data || { code: '', name: '' };
    };

    const debitAcc = await getAccountDetails(bebanGajiPokokId);
    const tunjanganAcc = await getAccountDetails(bebanTunjanganId);
    const bpjsKesAcc = await getAccountDetails(bebanBpjsKesId);
    const bpjsTkAcc = await getAccountDetails(bebanBpjsTkId);
    const pph21Acc = await getAccountDetails(bebanPph21Id || 0);
    const utangBpjsKesAcc = await getAccountDetails(utangBpjsKesId);
    const utangBpjsTkAcc = await getAccountDetails(utangBpjsTkId);
    const utangPph21Acc = await getAccountDetails(utangPph21Id || 0);
    const kasAcc = await getAccountDetails(kasId);

    // ========== BUAT ENTRIES JURNAL ==========
    const entries: any[] = [];

    // 1. Debit Beban Gaji Pokok
    entries.push({
      account_id: bebanGajiPokokId,
      account_code: debitAcc.code,
      account_name: debitAcc.name,
      debit: payroll.gaji_pokok,
      credit: 0,
    });

    // 2. Debit Beban Tunjangan Lainnya
    if (payroll.tunjangan_lainnya > 0) {
      entries.push({
        account_id: bebanTunjanganId,
        account_code: tunjanganAcc.code,
        account_name: tunjanganAcc.name,
        debit: payroll.tunjangan_lainnya,
        credit: 0,
      });
    }

    // 3. Debit Beban BPJS Kesehatan
    if (payroll.bpjs_kesehatan > 0) {
      entries.push({
        account_id: bebanBpjsKesId,
        account_code: bpjsKesAcc.code,
        account_name: bpjsKesAcc.name,
        debit: payroll.bpjs_kesehatan,
        credit: 0,
      });
    }

    // 4. Debit Beban BPJS TK
    if (payroll.bpjs_tk > 0) {
      entries.push({
        account_id: bebanBpjsTkId,
        account_code: bpjsTkAcc.code,
        account_name: bpjsTkAcc.name,
        debit: payroll.bpjs_tk,
        credit: 0,
      });
    }

    // 5. Debit Beban PPh 21 (jika ada)
    if (payroll.pph21 > 0 && bebanPph21Id && utangPph21Id) {
      entries.push({
        account_id: bebanPph21Id,
        account_code: pph21Acc.code,
        account_name: pph21Acc.name,
        debit: payroll.pph21,
        credit: 0,
      });
    }

    // 6. Kredit Kas/Bank (Gaji Bersih)
    entries.push({
      account_id: kasId,
      account_code: kasAcc.code,
      account_name: kasAcc.name,
      debit: 0,
      credit: payroll.gaji_bersih,
    });

    // 7. Kredit Utang BPJS Kesehatan
    if (payroll.bpjs_kesehatan > 0) {
      entries.push({
        account_id: utangBpjsKesId,
        account_code: utangBpjsKesAcc.code,
        account_name: utangBpjsKesAcc.name,
        debit: 0,
        credit: payroll.bpjs_kesehatan,
      });
    }

    // 8. Kredit Utang BPJS TK
    if (payroll.bpjs_tk > 0) {
      entries.push({
        account_id: utangBpjsTkId,
        account_code: utangBpjsTkAcc.code,
        account_name: utangBpjsTkAcc.name,
        debit: 0,
        credit: payroll.bpjs_tk,
      });
    }

    // 9. Kredit Utang PPh 21 (jika ada)
    if (payroll.pph21 > 0 && utangPph21Id) {
      entries.push({
        account_id: utangPph21Id,
        account_code: utangPph21Acc.code,
        account_name: utangPph21Acc.name,
        debit: 0,
        credit: payroll.pph21,
      });
    }

    // 🔥 BUAT JURNAL
    const description = `Payroll ${payroll.employee_name || 'Karyawan'} - ${payroll.period.slice(0, 7)}`;
    const reference = `PAY-${payroll.id}-${Date.now()}`;

    const journalId = await createGeneralJournal(
      companyId,
      new Date().toISOString().split('T')[0],
      description,
      reference,
      'PAYROLL',
      payroll.id,
      entries
    );

    return journalId;
  } catch (error) {
    console.error('Error creating payroll journal:', error);
    return null;
  }
};
