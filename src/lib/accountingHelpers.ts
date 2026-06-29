import { supabase } from './supabase';

// ============================================
// ✅ FORMAT CURRENCY - TANPA MINUS OTOMATIS
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

// ... sisanya sama seperti sebelumnya
export const getCompanySuffix = (_companyId: number): string => {
  const suffixMap: Record<number, string> = {
    1: 'A',
    2: 'B',
    3: 'C',
  };
  return suffixMap[_companyId] || 'A';
};

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

export const generateInvoiceNo = async (
  companyId: number,
  date: Date,
  projectCode: string | null = null
): Promise<string> => {
  const { data, error } = await supabase.rpc('generate_invoice_no', {
    p_company_id: companyId,
    p_date: date.toISOString().split('T')[0],
    p_project_code: projectCode,
  });
  if (error) throw new Error(error.message);
  return data;
};

export const generateVoucherNo = async (
  companyId: number,
  date: Date,
  projectCode: string | null = null
): Promise<string> => {
  const { data, error } = await supabase.rpc('generate_voucher_no', {
    p_company_id: companyId,
    p_date: date.toISOString().split('T')[0],
    p_project_code: projectCode,
  });
  if (error) throw new Error(error.message);
  return data;
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
