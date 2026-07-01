import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Plus, Search, Eye, Edit2, Trash2, Send, Loader2,
  Clock, Copy, Save, CheckSquare, X
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useCompany } from '../contexts/CompanyContext';
import { useAuth } from '../contexts/AuthContext';
import {
  formatCurrency,
  createGeneralJournal,
  getDefaultAccount,
} from '../lib/accountingHelpers';

type PayrollRow = {
  id?: number;
  employee_name: string;
  period: string;
  gaji_pokok: number;
  bpjs_kesehatan: number;
  bpjs_tk: number;
  tunjangan_lainnya: number;
  tunjangan_pph21: number;
  potongan_pph21: number;
  pph21: number;
  gaji_bersih: number;
  bank_account_id: number;
  status: 'draft' | 'posted';
  journal_id: number | null;
  master_journal_id: number | null;
  is_new?: boolean;
};

type Overtime = {
  id: number;
  payroll_id: number;
  amount: number;
  description: string;
  bank_account_id: number;
  status: 'draft' | 'posted';
  journal_id: number | null;
};

type Coa = {
  id: number;
  code: string;
  name: string;
  type: string;
};

export default function Payroll() {
  const navigate = useNavigate();
  const { currentCompany } = useCompany();
  const { user } = useAuth();

  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [overtimes, setOvertimes] = useState<Overtime[]>([]);
  const [bankAccounts, setBankAccounts] = useState<Coa[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [postingAll, setPostingAll] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [showOvertimeModal, setShowOvertimeModal] = useState(false);
  const [selectedPayrollId, setSelectedPayrollId] = useState<number | null>(null);
  const [selectedPayrollName, setSelectedPayrollName] = useState('');
  const [overtimeForm, setOvertimeForm] = useState({ amount: 0, description: '', bank_account_id: 0 });
  const [editingOvertimeId, setEditingOvertimeId] = useState<number | null>(null);
  const [isLoadingPrevious, setIsLoadingPrevious] = useState(false);
  const [postingOvertimeId, setPostingOvertimeId] = useState<number | null>(null);

  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);

  // ===================== FETCH DATA =====================
  const fetchBankAccounts = useCallback(async () => {
    if (!currentCompany?.id) return;
    const { data } = await supabase
      .from('coa')
      .select('id, code, name')
      .eq('company_id', currentCompany.id)
      .eq('is_active', true)
      .eq('type', 'asset')
      .or('name.ilike.%bank%, name.ilike.%kas%, code.ilike.1102%')
      .order('code');
    setBankAccounts(data || []);
  }, [currentCompany?.id]);

  const fetchPayrolls = useCallback(async () => {
    if (!currentCompany?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('payroll')
        .select('*')
        .eq('company_id', currentCompany.id)
        .eq('period', `${period}-01`)
        .order('employee_name');
      
      if (error) {
        console.error('Error fetching payroll:', error);
        setLoading(false);
        return;
      }
      
      if (data && data.length > 0) {
        setRows(data);
        const ids = data.map(r => r.id);
        const { data: otData } = await supabase
          .from('payroll_overtime')
          .select('*')
          .in('payroll_id', ids);
        setOvertimes(otData || []);
      } else {
        setRows([]);
        setOvertimes([]);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }, [currentCompany?.id, period]);

  useEffect(() => {
    if (currentCompany?.id) {
      fetchBankAccounts();
      fetchPayrolls();
    }
  }, [currentCompany, fetchBankAccounts, fetchPayrolls]);

  // ===================== COPY PREVIOUS MONTH =====================
  const copyFromPreviousMonth = async () => {
    if (!currentCompany?.id) return;
    if (!confirm(`Copy data payroll dari bulan sebelumnya ke ${period}?`)) return;
    setIsLoadingPrevious(true);
    try {
      const prevDate = new Date(period);
      prevDate.setMonth(prevDate.getMonth() - 1);
      const prevPeriod = prevDate.toISOString().slice(0, 7);
      
      const { data, error } = await supabase
        .from('payroll')
        .select('*')
        .eq('company_id', currentCompany.id)
        .eq('period', `${prevPeriod}-01`)
        .eq('status', 'posted');
      
      if (error) {
        alert('Gagal mengambil data bulan sebelumnya');
        return;
      }
      
      if (data && data.length > 0) {
        const newRows = data.map(r => ({
          employee_name: r.employee_name,
          period: `${period}-01`,
          gaji_pokok: r.gaji_pokok,
          bpjs_kesehatan: r.bpjs_kesehatan || 0,
          bpjs_tk: r.bpjs_tk || 0,
          tunjangan_lainnya: r.tunjangan_lainnya,
          tunjangan_pph21: r.tunjangan_pph21 || 0,
          potongan_pph21: r.potongan_pph21 || 0,
          pph21: r.pph21 || 0,
          gaji_bersih: r.gaji_bersih,
          bank_account_id: r.bank_account_id,
          status: 'draft' as const,
          journal_id: null,
          master_journal_id: null,
          is_new: true,
        }));
        setRows(newRows);
        alert(`${data.length} data payroll berhasil di-copy dari ${prevPeriod}`);
      } else {
        alert(`Tidak ada data payroll untuk periode ${prevPeriod}`);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Terjadi kesalahan saat copy data');
    } finally {
      setIsLoadingPrevious(false);
    }
  };

  // ===================== CALCULATE & UPDATE =====================
  const calculateRow = useCallback((row: PayrollRow): PayrollRow => {
    const gajiPokok = Number(row.gaji_pokok) || 0;
    const tunjangan = Number(row.tunjangan_lainnya) || 0;
    const tunjanganPph21 = Number(row.tunjangan_pph21) || 0;
    const potonganPph21 = Number(row.potongan_pph21) || 0;
    const gajiBersih = gajiPokok + tunjangan + tunjanganPph21 - potonganPph21;
    return {
      ...row,
      gaji_bersih: gajiBersih,
    };
  }, []);

  const updateRow = useCallback((index: number, field: keyof PayrollRow, value: any) => {
    setRows(prevRows => {
      const newRows = [...prevRows];
      let updated = { ...newRows[index], [field]: value };

      if (field === 'pph21') {
        const pph = Number(value) || 0;
        updated.tunjangan_pph21 = pph;
        updated.potongan_pph21 = pph;
      }
      if (field === 'tunjangan_pph21') {
        const val = Number(value) || 0;
        updated.potongan_pph21 = val;
        updated.pph21 = val;
      }
      if (field === 'potongan_pph21') {
        const val = Number(value) || 0;
        updated.tunjangan_pph21 = val;
        updated.pph21 = val;
      }

      updated = calculateRow(updated);
      newRows[index] = updated;
      return newRows;
    });
    autoSave();
  }, [calculateRow]);

  const addRow = useCallback(() => {
    const newRow: PayrollRow = {
      employee_name: '',
      period: `${period}-01`,
      gaji_pokok: 5247870,
      bpjs_kesehatan: 0,
      bpjs_tk: 0,
      tunjangan_lainnya: 0,
      tunjangan_pph21: 0,
      potongan_pph21: 0,
      pph21: 0,
      gaji_bersih: 0,
      bank_account_id: 0,
      status: 'draft',
      journal_id: null,
      master_journal_id: null,
      is_new: true,
    };
    setRows(prev => [...prev, newRow]);
  }, [period]);

  const deleteRow = useCallback(async (index: number) => {
    const row = rows[index];
    if (!row.id) {
      setRows(prev => prev.filter((_, i) => i !== index));
      return;
    }
    if (!confirm(`Hapus payroll untuk ${row.employee_name}?`)) return;
    try {
      const { error } = await supabase.from('payroll').delete().eq('id', row.id);
      if (!error) {
        setRows(prev => prev.filter((_, i) => i !== index));
        setOvertimes(prev => prev.filter(ot => ot.payroll_id !== row.id));
      } else {
        alert('Gagal menghapus: ' + error.message);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Terjadi kesalahan saat menghapus');
    }
  }, [rows]);

  // ===================== AUTO SAVE =====================
  const autoSave = useCallback(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(saveAllRows, 1500);
  }, []);

  const saveAllRows = useCallback(async () => {
    if (!currentCompany?.id || rows.length === 0 || saving) return;
    setSaving(true);
    try {
      for (const row of rows) {
        if (!row.employee_name.trim()) continue;
        const dataToSave = {
          company_id: currentCompany.id,
          employee_name: row.employee_name.trim(),
          period: `${period}-01`,
          gaji_pokok: row.gaji_pokok,
          bpjs_kesehatan: row.bpjs_kesehatan,
          bpjs_tk: row.bpjs_tk,
          tunjangan_lainnya: row.tunjangan_lainnya,
          tunjangan_pph21: row.tunjangan_pph21,
          potongan_pph21: row.potongan_pph21,
          pph21: row.pph21,
          gaji_bersih: row.gaji_bersih,
          bank_account_id: row.bank_account_id,
          status: 'draft',
          created_by: user?.email,
        };
        if (row.id) {
          await supabase.from('payroll').update(dataToSave).eq('id', row.id);
        } else {
          const { data } = await supabase.from('payroll').insert([dataToSave]).select();
          if (data && data[0]) {
            const newRow = { ...row, id: data[0].id };
            setRows(prev => prev.map(r => r === row ? newRow : r));
          }
        }
      }
    } catch (error) {
      console.error('Auto-save error:', error);
    } finally {
      setSaving(false);
    }
  }, [currentCompany?.id, period, rows, saving, user?.email]);

  // ===================== OVERTIME =====================
  const openOvertimeModal = useCallback((payrollId: number, employeeName: string) => {
    setSelectedPayrollId(payrollId);
    setSelectedPayrollName(employeeName);
    setEditingOvertimeId(null);
    setOvertimeForm({ amount: 0, description: '', bank_account_id: 0 });
    setShowOvertimeModal(true);
  }, []);

  const editOvertime = useCallback((ot: Overtime) => {
    setSelectedPayrollId(ot.payroll_id);
    const row = rows.find(r => r.id === ot.payroll_id);
    setSelectedPayrollName(row?.employee_name || '');
    setEditingOvertimeId(ot.id);
    setOvertimeForm({
      amount: ot.amount,
      description: ot.description,
      bank_account_id: ot.bank_account_id,
    });
    setShowOvertimeModal(true);
  }, [rows]);

  const saveOvertime = useCallback(async () => {
    // Validasi: pastikan semua field terisi
    if (!selectedPayrollId) {
      alert('Data payroll tidak valid');
      return;
    }
    if (!overtimeForm.description.trim()) {
      alert('Deskripsi harus diisi');
      return;
    }
    if (overtimeForm.amount <= 0) {
      alert('Jumlah harus lebih dari 0');
      return;
    }
    if (overtimeForm.bank_account_id <= 0) {
      alert('Pilih akun bank / kas');
      return;
    }

    if (!currentCompany?.id) return;

    try {
      const dataToSave = {
        payroll_id: selectedPayrollId,
        company_id: currentCompany.id,
        amount: overtimeForm.amount,
        description: overtimeForm.description.trim(),
        bank_account_id: overtimeForm.bank_account_id,
        status: 'draft' as const,
        created_by: user?.email,
      };
      
      if (editingOvertimeId) {
        const { error } = await supabase.from('payroll_overtime').update(dataToSave).eq('id', editingOvertimeId);
        if (!error) {
          setOvertimes(prev => prev.map(ot => 
            ot.id === editingOvertimeId ? { ...ot, ...dataToSave } : ot
          ));
          alert('Lemburan berhasil diupdate');
        } else {
          alert('Gagal update: ' + error.message);
          return;
        }
      } else {
        const { data, error } = await supabase.from('payroll_overtime').insert([dataToSave]).select();
        if (!error && data) {
          setOvertimes(prev => [...prev, data[0]]);
          alert('Lemburan berhasil ditambahkan');
        } else {
          alert('Gagal simpan: ' + error.message);
          return;
        }
      }
      setShowOvertimeModal(false);
    } catch (error) {
      console.error('Error:', error);
      alert('Terjadi kesalahan saat menyimpan lemburan');
    }
  }, [currentCompany?.id, selectedPayrollId, overtimeForm, editingOvertimeId, user?.email]);

  const deleteOvertime = useCallback(async (id: number) => {
    if (!confirm('Hapus lemburan ini?')) return;
    try {
      const { error } = await supabase.from('payroll_overtime').delete().eq('id', id);
      if (!error) {
        setOvertimes(prev => prev.filter(ot => ot.id !== id));
      } else {
        alert('Gagal hapus: ' + error.message);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Terjadi kesalahan saat menghapus lemburan');
    }
  }, []);

  const postOvertime = useCallback(async (id: number) => {
    if (!confirm('Posting lemburan ini?')) return;
    if (!currentCompany?.id) return;
    
    setPostingOvertimeId(id);
    try {
      const ot = overtimes.find(o => o.id === id);
      if (!ot) {
        alert('Data lemburan tidak ditemukan');
        return;
      }
      
      const expenseAcc = await getDefaultAccount(currentCompany.id, 'expense');
      const bankAcc = bankAccounts.find(b => b.id === ot.bank_account_id);
      
      if (!expenseAcc || !bankAcc) {
        alert('Akun tidak ditemukan');
        return;
      }
      
      const entries = [
        {
          account_id: expenseAcc.id,
          account_code: expenseAcc.code,
          account_name: expenseAcc.name,
          debit: ot.amount,
          credit: 0,
        },
        {
          account_id: bankAcc.id,
          account_code: bankAcc.code,
          account_name: bankAcc.name,
          debit: 0,
          credit: ot.amount,
        },
      ];
      
      const journalId = await createGeneralJournal(
        currentCompany.id,
        new Date().toISOString().split('T')[0],
        `Lemburan: ${ot.description}`,
        `OT-${ot.id}`,
        'OVERTIME',
        ot.id,
        entries
      );
      
      if (!journalId) {
        alert('Gagal membuat jurnal');
        return;
      }
      
      await supabase
        .from('payroll_overtime')
        .update({
          status: 'posted',
          journal_id: journalId,
          posted_by: user?.email,
          posted_at: new Date().toISOString(),
        })
        .eq('id', id);
      
      setOvertimes(prev => prev.map(o => 
        o.id === id ? { ...o, status: 'posted', journal_id: journalId } : o
      ));
      alert('Lemburan berhasil diposting!');
    } catch (err: any) {
      alert('Gagal posting: ' + err.message);
    } finally {
      setPostingOvertimeId(null);
    }
  }, [currentCompany?.id, overtimes, bankAccounts, user?.email]);

  // ===================== POST ALL (ONLY MASTER JOURNAL) =====================
  const postAll = useCallback(async () => {
    const draftRows = rows.filter(r => r.status === 'draft' && r.employee_name.trim());
    if (draftRows.length === 0) {
      alert('Tidak ada payroll draft untuk diposting');
      return;
    }

    if (!confirm(`Posting ${draftRows.length} payroll sebagai satu jurnal gabungan?`)) return;
    if (!currentCompany?.id) return;
    setPostingAll(true);
    let successCount = 0, failCount = 0;
    let masterJournalId: number | null = null;

    try {
      // ========== GET ALL ACCOUNTS WITH SPECIFIC CODES ==========
      const defaultAccounts = {
        bebanGajiPokok: await getDefaultAccount(currentCompany.id, 'expense_salary'),
        bebanTunjangan: await getDefaultAccount(currentCompany.id, 'expense_tunjangan'),
        bebanBpjsKes: await getDefaultAccount(currentCompany.id, 'expense_bpjs_kes'),
        bebanBpjsTk: await getDefaultAccount(currentCompany.id, 'expense_bpjs_tk'),
        bebanTunjanganPph21: await getDefaultAccount(currentCompany.id, 'expense_tunjangan_pph21'),
        utangBpjsKes: await getDefaultAccount(currentCompany.id, 'liability_bpjs_kes'),
        utangBpjsTk: await getDefaultAccount(currentCompany.id, 'liability_bpjs_tk'),
        utangPph21: await getDefaultAccount(currentCompany.id, 'liability_pph21'),
      };

      // ========== BUILD MASTER ENTRIES ==========
      const masterEntries: any[] = [];
      for (const row of draftRows) {
        const bank = bankAccounts.find(b => b.id === row.bank_account_id);
        if (!bank) { 
          failCount++; 
          continue; 
        }

        // Debit
        if (row.gaji_pokok > 0) {
          masterEntries.push({
            account_id: defaultAccounts.bebanGajiPokok?.id || 0,
            account_code: defaultAccounts.bebanGajiPokok?.code || '',
            account_name: defaultAccounts.bebanGajiPokok?.name || 'Beban Gaji Pokok',
            debit: row.gaji_pokok,
            credit: 0,
          });
        }
        if (row.tunjangan_lainnya > 0) {
          masterEntries.push({
            account_id: defaultAccounts.bebanTunjangan?.id || 0,
            account_code: defaultAccounts.bebanTunjangan?.code || '',
            account_name: defaultAccounts.bebanTunjangan?.name || 'Beban Tunjangan',
            debit: row.tunjangan_lainnya,
            credit: 0,
          });
        }
        if (row.tunjangan_pph21 > 0) {
          masterEntries.push({
            account_id: defaultAccounts.bebanTunjanganPph21?.id || 0,
            account_code: defaultAccounts.bebanTunjanganPph21?.code || '',
            account_name: defaultAccounts.bebanTunjanganPph21?.name || 'Beban Tunjangan PPh 21',
            debit: row.tunjangan_pph21,
            credit: 0,
          });
        }
        if (row.bpjs_kesehatan > 0) {
          masterEntries.push({
            account_id: defaultAccounts.bebanBpjsKes?.id || 0,
            account_code: defaultAccounts.bebanBpjsKes?.code || '',
            account_name: defaultAccounts.bebanBpjsKes?.name || 'Beban BPJS Kesehatan',
            debit: row.bpjs_kesehatan,
            credit: 0,
          });
        }
        if (row.bpjs_tk > 0) {
          masterEntries.push({
            account_id: defaultAccounts.bebanBpjsTk?.id || 0,
            account_code: defaultAccounts.bebanBpjsTk?.code || '',
            account_name: defaultAccounts.bebanBpjsTk?.name || 'Beban BPJS TK',
            debit: row.bpjs_tk,
            credit: 0,
          });
        }

        // Kredit
        masterEntries.push({
          account_id: bank.id,
          account_code: bank.code,
          account_name: bank.name,
          debit: 0,
          credit: row.gaji_bersih,
        });
        
        if (row.bpjs_kesehatan > 0 && defaultAccounts.utangBpjsKes) {
          masterEntries.push({
            account_id: defaultAccounts.utangBpjsKes.id,
            account_code: defaultAccounts.utangBpjsKes.code,
            account_name: defaultAccounts.utangBpjsKes.name,
            debit: 0,
            credit: row.bpjs_kesehatan,
          });
        }
        if (row.bpjs_tk > 0 && defaultAccounts.utangBpjsTk) {
          masterEntries.push({
            account_id: defaultAccounts.utangBpjsTk.id,
            account_code: defaultAccounts.utangBpjsTk.code,
            account_name: defaultAccounts.utangBpjsTk.name,
            debit: 0,
            credit: row.bpjs_tk,
          });
        }
        if (row.potongan_pph21 > 0 && defaultAccounts.utangPph21) {
          masterEntries.push({
            account_id: defaultAccounts.utangPph21.id,
            account_code: defaultAccounts.utangPph21.code,
            account_name: defaultAccounts.utangPph21.name,
            debit: 0,
            credit: row.potongan_pph21,
          });
        }
      }

      // Validasi master entries
      const totalMasterDebit = masterEntries.reduce((sum, e) => sum + e.debit, 0);
      const totalMasterCredit = masterEntries.reduce((sum, e) => sum + e.credit, 0);
      if (totalMasterDebit !== totalMasterCredit) {
        throw new Error(`Total Debit (${totalMasterDebit}) != Total Kredit (${totalMasterCredit})`);
      }

      if (masterEntries.length === 0) {
        throw new Error('Tidak ada entries yang valid');
      }

      // Buat satu jurnal master
      const masterJournalIdResult = await createGeneralJournal(
        currentCompany.id,
        new Date().toISOString().split('T')[0],
        `Payroll ${period} (Gabungan)`,
        `PAY-MASTER-${Date.now()}`,
        'PAYROLL_MASTER',
        0,
        masterEntries
      );
      if (!masterJournalIdResult) throw new Error('Gagal membuat master journal');
      masterJournalId = masterJournalIdResult;

      // Update semua payroll draft dengan status posted dan master_journal_id
      for (const row of draftRows) {
        try {
          await supabase
            .from('payroll')
            .update({
              status: 'posted',
              journal_id: masterJournalId, // semua payroll pakai journal_id yang sama (master)
              master_journal_id: masterJournalId,
              posted_by: user?.email,
              posted_at: new Date().toISOString(),
            })
            .eq('id', row.id);
          successCount++;
        } catch (err) {
          console.error('Error updating payroll:', err);
          failCount++;
        }
      }

      await fetchPayrolls();
      alert(`✅ ${successCount} payroll berhasil diposting dengan satu jurnal gabungan.\n❌ ${failCount} gagal`);
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setPostingAll(false);
    }
  }, [rows, currentCompany?.id, period, bankAccounts, user?.email, fetchPayrolls]);

  // ===================== RENDER =====================
  const filteredRows = rows.filter(r => {
    const matchSearch = r.employee_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = filterStatus === 'all' || r.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const totalGaji = filteredRows.reduce((sum, r) => sum + r.gaji_bersih, 0);

  if (!currentCompany) return <div className="flex justify-center py-12">Loading...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between animate-slide-in-up flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-text">Payroll</h1>
          <p className="text-text-muted mt-1">Kelola gaji karyawan dengan input massal & auto-jurnal</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={copyFromPreviousMonth}
            disabled={isLoadingPrevious}
            className="flex items-center gap-2 px-4 py-2.5 border border-border rounded-lg hover:bg-background transition-colors disabled:opacity-50"
          >
            <Copy className="w-4 h-4" /> Copy Previous Month
          </button>
          <button
            onClick={addRow}
            className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium shadow-lg shadow-accent/30"
          >
            <Plus className="w-5 h-5" /> Tambah Baris
          </button>
        </div>
      </div>

      {/* Period & Controls */}
      <div className="bg-surface rounded-xl border border-border p-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Periode</label>
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-4 py-2 border border-border rounded-lg bg-surface"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Cari</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder="Cari karyawan..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 border border-border rounded-lg bg-surface"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Status</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-border rounded-lg bg-surface"
          >
            <option value="all">Semua</option>
            <option value="draft">Draft</option>
            <option value="posted">Posted</option>
          </select>
        </div>
        <div className="flex gap-2 ml-auto">
          <button
            onClick={saveAllRows}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-background transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> {saving ? 'Menyimpan...' : 'Simpan Semua'}
          </button>
          <button
            onClick={postAll}
            disabled={postingAll || rows.filter(r => r.status === 'draft' && r.employee_name).length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-success text-white rounded-lg hover:bg-success/80 transition-colors disabled:opacity-50"
          >
            {postingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckSquare className="w-4 h-4" />}
            Post All
          </button>
        </div>
      </div>

      {/* Total Gaji */}
      <div className="bg-surface rounded-xl border border-border p-4">
        <p className="text-sm text-text-muted">Total Gaji Bersih Periode Ini</p>
        <p className="text-2xl font-bold text-accent">{formatCurrency(totalGaji)}</p>
      </div>

      {/* Table */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-background">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-text-muted uppercase">Nama</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-text-muted uppercase">Gaji Pokok</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-text-muted uppercase">BPJS Kes</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-text-muted uppercase">BPJS TK</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-text-muted uppercase">Tunjangan</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-text-muted uppercase">Tunj. PPh 21</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-text-muted uppercase">Pot. PPh 21</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-text-muted uppercase">PPh 21</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-text-muted uppercase">Gaji Bersih</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-text-muted uppercase">Bank</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-text-muted uppercase">Status</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-text-muted uppercase">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRows.map((row, idx) => (
                  <tr key={row.id || idx} className="hover:bg-background/50 transition-colors">
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={row.employee_name}
                        onChange={(e) => updateRow(idx, 'employee_name', e.target.value)}
                        className="w-full px-2 py-1 border border-transparent hover:border-border rounded focus:border-accent focus:outline-none bg-transparent"
                        placeholder="Nama"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={row.gaji_pokok}
                        onChange={(e) => updateRow(idx, 'gaji_pokok', Number(e.target.value) || 0)}
                        className="w-full px-2 py-1 border border-transparent hover:border-border rounded focus:border-accent focus:outline-none bg-transparent text-right font-mono"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={row.bpjs_kesehatan}
                        onChange={(e) => updateRow(idx, 'bpjs_kesehatan', Number(e.target.value) || 0)}
                        className="w-full px-2 py-1 border border-transparent hover:border-border rounded focus:border-accent focus:outline-none bg-transparent text-right font-mono"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={row.bpjs_tk}
                        onChange={(e) => updateRow(idx, 'bpjs_tk', Number(e.target.value) || 0)}
                        className="w-full px-2 py-1 border border-transparent hover:border-border rounded focus:border-accent focus:outline-none bg-transparent text-right font-mono"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={row.tunjangan_lainnya}
                        onChange={(e) => updateRow(idx, 'tunjangan_lainnya', Number(e.target.value) || 0)}
                        className="w-full px-2 py-1 border border-transparent hover:border-border rounded focus:border-accent focus:outline-none bg-transparent text-right font-mono"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={row.tunjangan_pph21}
                        onChange={(e) => updateRow(idx, 'tunjangan_pph21', Number(e.target.value) || 0)}
                        className="w-full px-2 py-1 border border-transparent hover:border-border rounded focus:border-accent focus:outline-none bg-transparent text-right font-mono"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={row.potongan_pph21}
                        onChange={(e) => updateRow(idx, 'potongan_pph21', Number(e.target.value) || 0)}
                        className="w-full px-2 py-1 border border-transparent hover:border-border rounded focus:border-accent focus:outline-none bg-transparent text-right font-mono"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={row.pph21}
                        onChange={(e) => updateRow(idx, 'pph21', Number(e.target.value) || 0)}
                        className="w-full px-2 py-1 border border-transparent hover:border-border rounded focus:border-accent focus:outline-none bg-transparent text-right font-mono"
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold">
                      {formatCurrency(row.gaji_bersih)}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={row.bank_account_id}
                        onChange={(e) => updateRow(idx, 'bank_account_id', Number(e.target.value))}
                        className="w-full px-2 py-1 border border-transparent hover:border-border rounded focus:border-accent focus:outline-none bg-transparent text-sm"
                      >
                        <option value={0}>-- Pilih --</option>
                        {bankAccounts.map(b => (
                          <option key={b.id} value={b.id}>{b.code} - {b.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        row.status === 'posted' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
                      }`}>
                        {row.status === 'posted' ? 'Posted' : 'Draft'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {row.status === 'draft' && (
                          <>
                            <button
                              onClick={() => openOvertimeModal(row.id!, row.employee_name)}
                              className="p-1.5 text-text-muted hover:text-warning hover:bg-warning/10 rounded"
                              title="Tambah Lemburan"
                            >
                              <Clock className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deleteRow(idx)}
                              className="p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 rounded"
                              title="Hapus"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {row.status === 'posted' && row.journal_id && (
                          <button
                            onClick={() => navigate(`/journal-entries/${row.journal_id}`)}
                            className="p-1.5 text-text-muted hover:text-info hover:bg-info/10 rounded"
                            title="Lihat Jurnal"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={12} className="text-center py-8 text-text-muted">
                      Belum ada data payroll untuk periode ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Overtime Table */}
      {overtimes.length > 0 && (
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-background/50">
            <h3 className="font-semibold text-text">📋 Lemburan</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-background">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-text-muted uppercase">Karyawan</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-text-muted uppercase">Deskripsi</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-text-muted uppercase">Jumlah</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-text-muted uppercase">Bank</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-text-muted uppercase">Status</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-text-muted uppercase">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {overtimes.map(ot => {
                  const row = rows.find(r => r.id === ot.payroll_id);
                  const bank = bankAccounts.find(b => b.id === ot.bank_account_id);
                  return (
                    <tr key={ot.id} className="hover:bg-background/50">
                      <td className="px-3 py-2 text-sm">{row?.employee_name || '-'}</td>
                      <td className="px-3 py-2 text-sm">{ot.description}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatCurrency(ot.amount)}</td>
                      <td className="px-3 py-2 text-sm">{bank?.code || '-'}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          ot.status === 'posted' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
                        }`}>
                          {ot.status === 'posted' ? 'Posted' : 'Draft'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {ot.status === 'draft' && (
                            <>
                              <button
                                onClick={() => editOvertime(ot)}
                                className="p-1.5 text-text-muted hover:text-info hover:bg-info/10 rounded"
                                title="Edit"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => postOvertime(ot.id)}
                                disabled={postingOvertimeId === ot.id}
                                className="p-1.5 text-text-muted hover:text-success hover:bg-success/10 rounded disabled:opacity-50"
                                title="Posting"
                              >
                                {postingOvertimeId === ot.id ? 
                                  <Loader2 className="w-4 h-4 animate-spin" /> : 
                                  <Send className="w-4 h-4" />
                                }
                              </button>
                              <button
                                onClick={() => deleteOvertime(ot.id)}
                                className="p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 rounded"
                                title="Hapus"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {ot.status === 'posted' && ot.journal_id && (
                            <button
                              onClick={() => navigate(`/journal-entries/${ot.journal_id}`)}
                              className="p-1.5 text-text-muted hover:text-info hover:bg-info/10 rounded"
                              title="Lihat Jurnal"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Overtime Modal */}
      {showOvertimeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-surface rounded-xl p-6 w-full max-w-lg"
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-display text-xl font-bold">
                {editingOvertimeId ? 'Edit Lemburan' : 'Tambah Lemburan'}
              </h2>
              <button
                onClick={() => setShowOvertimeModal(false)}
                className="text-text-muted hover:text-text"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Karyawan</label>
                <input
                  type="text"
                  value={selectedPayrollName}
                  disabled
                  className="w-full px-4 py-2 border rounded-lg bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Deskripsi *</label>
                <input
                  type="text"
                  value={overtimeForm.description}
                  onChange={(e) => setOvertimeForm({ ...overtimeForm, description: e.target.value })}
                  placeholder="Misal: Lembur Minggu"
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Jumlah *</label>
                <input
                  type="number"
                  value={overtimeForm.amount}
                  onChange={(e) => setOvertimeForm({ ...overtimeForm, amount: Number(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Akun Bank / Kas *</label>
                <select
                  value={overtimeForm.bank_account_id}
                  onChange={(e) => setOvertimeForm({ ...overtimeForm, bank_account_id: Number(e.target.value) })}
                  className="w-full px-4 py-2 border rounded-lg"
                >
                  <option value={0}>-- Pilih --</option>
                  {bankAccounts.map(b => (
                    <option key={b.id} value={b.id}>{b.code} - {b.name}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-text-muted">Jurnal: Debit Beban, Kredit Bank/Kas</p>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowOvertimeModal(false)}
                className="px-4 py-2 border border-border rounded-lg"
              >
                Batal
              </button>
              <button
                onClick={saveOvertime}
                className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
              >
                {editingOvertimeId ? 'Update' : 'Simpan'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
