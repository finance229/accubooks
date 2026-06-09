import { supabase } from './supabase';

// Format currency
export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(Math.abs(amount));
};

// Format number tanpa Rp
export const formatNumber = (amount: number) => {
  return new Intl.NumberFormat('id-ID').format(amount);
};

// Generate Voucher Code
// Format: YYYY/MM/KODE_PROJECT/URUTAN (reset per bulan per project)
export const generateVoucherCode = async (companyId: number, projectCode: string, date: Date): Promise<string> => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const base = `${year}/${month}/${projectCode}`;
  
  // Cari nomor urut terakhir untuk base ini di tabel payment_requests
  const { data, error } = await supabase
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

// Cek budget project
export const checkProjectBudget = async (projectId: number, amount: number) => {
  const { data: project, error } = await supabase
    .from('projects')
    .select('id, name, budget, spent')
    .eq('id', projectId)
    .single();
  
  if (error || !project) return { sufficient: false, message: 'Proyek tidak ditemukan', remaining: 0 };
  
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

// Update spent project setelah verifikasi
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

// Buat jurnal accrual (saat verifikasi)
export const createAccrualJournal = async (
  companyId: number,
  date: string,
  description: string,
  voucherNo: string,
  debitAccountId: number,
  creditAccountId: number,
  amount: number,
  projectId?: number
) => {
  // Dapatkan akun kode dari coa
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
  
  // Generate journal number
  const year = new Date(date).getFullYear();
  const count = await getNextJournalNumber(companyId, year);
  const journalNumber = `JU-${year}-${String(count).padStart(4, '0')}`;
  
  // Insert journal
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
  
  // Insert journal lines
  const lines = [
    { journal_id: journal.id, coa_id: debitAccountId, account_code: debitAcc.code, account_name: debitAcc.name, debit: amount, credit: 0 },
    { journal_id: journal.id, coa_id: creditAccountId, account_code: creditAcc.code, account_name: creditAcc.name, debit: 0, credit: amount }
  ];
  
  const { error: lError } = await supabase.from('journal_lines').insert(lines);
  if (lError) throw lError;
  
  return journal.id;
};

// Buat jurnal pembayaran (saat approve)
export const createPaymentJournal = async (
  companyId: number,
  date: string,
  description: string,
  voucherNo: string,
  liabilityAccountId: number, // akun hutang (credit_account dari verifikasi)
  bankAccountId: number,      // akun kas/bank yang dipilih
  amount: number,
  projectId?: number
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

// Helper: get next journal number
async function getNextJournalNumber(companyId: number, year: number): Promise<number> {
  const prefix = `JU-${year}-`;
  const { data, error } = await supabase
    .from('journals')
    .select('journal_number')
    .ilike('journal_number', `${prefix}%`)
    .order('journal_number', { ascending: false })
    .limit(1);
  
  if (!data || data.length === 0) return 1;
  const lastNumber = parseInt(data[0].journal_number.replace(prefix, ''));
  return isNaN(lastNumber) ? 1 : lastNumber + 1;
}

// Log payment request activity
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

// Tambahkan di bagian bawah file accountingHelpers.ts

/**
 * Membuat jurnal umum (untuk AR dan AP)
 * @param companyId ID perusahaan
 * @param date Tanggal jurnal
 * @param description Deskripsi jurnal
 * @param reference Nomor referensi (invoice_no, dll)
 * @param referenceType Tipe referensi ('INVOICE', 'AP', 'PR')
 * @param referenceId ID dari tabel referensi
 * @param entries Array jurnal entries (debit/credit)
 * @param projectId Optional project ID
 */
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
    // Validasi debit = credit
    const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0);
    const totalCredit = entries.reduce((sum, e) => sum + e.credit, 0);
    
    if (totalDebit !== totalCredit) {
      throw new Error(`Total Debit (${totalDebit}) != Total Kredit (${totalCredit})`);
    }

    // Generate journal number
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

    // Insert journal header
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

    // Insert journal lines
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

/**
 * Mendapatkan akun default berdasarkan tipe
 * @param companyId ID perusahaan
 * @param type Tipe akun ('receivable', 'payable', 'ppn_out', 'ppn_in', 'pph23')
 */
export const getDefaultAccount = async (companyId: number, type: string) => {
  const suffix = companyId === 1 ? 'A' : companyId === 2 ? 'B' : companyId === 3 ? 'C' : 'D';
  
  const mapping: Record<string, string> = {
    receivable: `1111-${suffix}`,   // Piutang Usaha
    payable: `2101-${suffix}`,      // Hutang Usaha
    ppn_out: `2103-${suffix}`,      // PPN Keluaran
    ppn_in: `1112-${suffix}`,       // PPN Masukan
    pph23: `2131-${suffix}`,        // Hutang PPh 23
  };
  
  const code = mapping[type];
  if (!code) return null;
  
  const { data, error } = await supabase
    .from('coa')
    .select('id, code, name, type')
    .eq('company_id', companyId)
    .eq('code', code)
    .single();
  
  if (error) return null;
  return data;
};

/**
 * Membuat customer baru (jika belum ada)
 */
export const createCustomerIfNotExist = async (
  companyId: number,
  name: string,
  email?: string,
  phone?: string,
  address?: string
) => {
  // Cek apakah sudah ada
  const { data: existing } = await supabase
    .from('contacts')
    .select('id')
    .eq('company_id', companyId)
    .eq('type', 'customer')
    .eq('name', name)
    .maybeSingle();
  
  if (existing) return existing.id;
  
  // Buat baru
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

/**
 * Membuat vendor baru (jika belum ada)
 */
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
  // Cek apakah sudah ada
  const { data: existing } = await supabase
    .from('vendors')
    .select('id')
    .eq('company_id', companyId)
    .eq('name', name)
    .maybeSingle();
  
  if (existing) return existing.id;
  
  // Buat baru
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

/**
 * Membuat proyek baru (jika belum ada)
 */
export const createProjectIfNotExist = async (
  companyId: number,
  code: string,
  name: string,
  budget: number
) => {
  // Cek apakah sudah ada
  const { data: existing } = await supabase
    .from('projects')
    .select('id')
    .eq('company_id', companyId)
    .eq('code', code)
    .maybeSingle();
  
  if (existing) return existing.id;
  
  // Buat baru
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
