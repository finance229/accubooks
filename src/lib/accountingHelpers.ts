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

// Upload file ke Google Drive (via GAS) – reuse existing function
// Kita akan gunakan fungsi yang sudah ada di googleDrive.ts, jadi tidak perlu buat baru.
