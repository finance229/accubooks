import { useState, useEffect } from 'react';
import { Plus, Search, Eye, Edit2, Trash2, Send, CheckCircle, XCircle, Loader2, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useCompany } from '../contexts/CompanyContext';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency, createPayrollJournal, createGeneralJournal, getDefaultAccount } from '../lib/accountingHelpers';

type Payroll = {
  id: number;
  employee_name: string;
  period: string;
  gaji_pokok: number;
  bpjs_kesehatan: number;
  bpjs_tk: number;
  tunjangan_lainnya: number;
  pph21: number;
  gaji_bersih: number;
  bank_account_id: number | null;
  status: 'draft' | 'posted';
  journal_id: number | null;
  created_at: string;
};

type Overtime = {
  id: number;
  payroll_id: number;
  amount: number;
  description: string;
  bank_account_id: number | null;
  journal_id: number | null;
  status: 'draft' | 'posted';
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
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [overtimes, setOvertimes] = useState<Overtime[]>([]);
  const [coaList, setCoaList] = useState<Coa[]>([]);
  const [bankAccounts, setBankAccounts] = useState<Coa[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [showOvertimeModal, setShowOvertimeModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingOvertimeId, setEditingOvertimeId] = useState<number | null>(null);
  const [selectedPayrollId, setSelectedPayrollId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ============ STATE FORM GAJI ============
  const [formData, setFormData] = useState({
    employee_name: '',
    period: new Date().toISOString().slice(0, 7),
    gaji_pokok: 5247870,
    bpjs_kesehatan: 0,
    bpjs_tk: 0,
    tunjangan_lainnya: 0,
    pph21: 0,
    bank_account_id: 0,
  });

  // ============ STATE FORM LEMBURAN ============
  const [overtimeData, setOvertimeData] = useState({
    payroll_id: 0,
    amount: 0,
    description: '',
    bank_account_id: 0,
  });

  // ============ AUTO-CALCULATE ============
  useEffect(() => {
    const gajiPokok = formData.gaji_pokok || 0;
    const bpjsKes = Math.round(gajiPokok * 0.05); // 5%
    const bpjsTk = Math.round(gajiPokok * 0.0924); // 9.24%
    const gajiBersih = gajiPokok + (formData.tunjangan_lainnya || 0);

    setFormData(prev => ({
      ...prev,
      bpjs_kesehatan: bpjsKes,
      bpjs_tk: bpjsTk,
      // gaji_bersih tidak disimpan di state, dihitung langsung
    }));
  }, [formData.gaji_pokok, formData.tunjangan_lainnya]);

  // ============ FETCH DATA ============
  useEffect(() => {
    if (currentCompany?.id) {
      fetchPayrolls();
      fetchCoa();
      fetchBankAccounts();
    }
  }, [currentCompany]);

  const fetchCoa = async () => {
    if (!currentCompany?.id) return;
    const { data } = await supabase
      .from('coa')
      .select('id, code, name, type')
      .eq('company_id', currentCompany.id)
      .eq('is_active', true)
      .order('code');
    setCoaList(data || []);
  };

  const fetchBankAccounts = async () => {
    if (!currentCompany?.id) return;
    const { data } = await supabase
      .from('coa')
      .select('id, code, name')
      .eq('company_id', currentCompany.id)
      .eq('is_active', true)
      .eq('type', 'asset')
      .ilike('name', '%bank%')
      .or('name.ilike.%kas%');
    setBankAccounts(data || []);
  };

  const fetchPayrolls = async () => {
    if (!currentCompany?.id) return;
    setLoading(true);
    
    // Ambil payroll
    const { data: payrollData } = await supabase
      .from('payroll')
      .select('*')
      .eq('company_id', currentCompany.id)
      .order('period', { ascending: false })
      .order('created_at', { ascending: false });

    if (payrollData) {
      // Ambil overtime untuk setiap payroll
      const withOvertimes = await Promise.all(
        payrollData.map(async (p) => {
          const { data: otData } = await supabase
            .from('payroll_overtime')
            .select('*')
            .eq('payroll_id', p.id);
          return { ...p, overtimes: otData || [] };
        })
      );
      setPayrolls(withOvertimes);
    }
    setLoading(false);
  };

  // ============ CRUD GAJI ============
  const handleSave = async () => {
    if (!formData.employee_name || !formData.period) {
      alert('Isi nama karyawan dan periode');
      return;
    }
    if (!formData.bank_account_id) {
      alert('Pilih akun bank/kas');
      return;
    }
    if (!currentCompany?.id) return;

    const gajiBersih = formData.gaji_pokok + formData.tunjangan_lainnya;

    const dataToInsert = {
      company_id: currentCompany.id,
      employee_name: formData.employee_name,
      period: `${formData.period}-01`,
      gaji_pokok: formData.gaji_pokok,
      bpjs_kesehatan: formData.bpjs_kesehatan,
      bpjs_tk: formData.bpjs_tk,
      tunjangan_lainnya: formData.tunjangan_lainnya,
      pph21: formData.pph21,
      gaji_bersih: gajiBersih,
      bank_account_id: formData.bank_account_id,
      status: 'draft',
      created_by: user?.email,
    };

    if (editingId) {
      const { error } = await supabase
        .from('payroll')
        .update(dataToInsert)
        .eq('id', editingId);
      if (error) {
        alert('Gagal update: ' + error.message);
        return;
      }
    } else {
      const { error } = await supabase
        .from('payroll')
        .insert([dataToInsert]);
      if (error) {
        alert('Gagal simpan: ' + error.message);
        return;
      }
    }

    setShowModal(false);
    resetForm();
    fetchPayrolls();
  };

  // ============ POST PAYROLL ============
  const handlePost = async (id: number) => {
    if (!confirm('Posting payroll ini? Jurnal akan dibuat.')) return;
    if (!currentCompany?.id) return;

    setSubmitting(true);
    try {
      const { data: payroll, error: fetchError } = await supabase
        .from('payroll')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError || !payroll) {
        alert('Data payroll tidak ditemukan');
        return;
      }

      // 🔥 BUAT JURNAL
      const journalId = await createPayrollJournal(
        currentCompany.id,
        payroll,
        user?.email || 'system'
      );

      if (!journalId) {
        alert('Gagal membuat jurnal');
        return;
      }

      // Update status
      const { error: updateError } = await supabase
        .from('payroll')
        .update({
          status: 'posted',
          journal_id: journalId,
          posted_by: user?.email,
          posted_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (updateError) throw updateError;

      alert('Payroll berhasil diposting!');
      fetchPayrolls();
    } catch (err: any) {
      alert('Gagal posting: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ============ CRUD LEMBURAN ============
  const handleAddOvertime = async () => {
    if (!selectedPayrollId) {
      alert('Pilih payroll terlebih dahulu');
      return;
    }
    if (!overtimeData.amount || overtimeData.amount <= 0) {
      alert('Masukkan jumlah lemburan');
      return;
    }
    if (!overtimeData.bank_account_id) {
      alert('Pilih akun bank/kas');
      return;
    }
    if (!overtimeData.description) {
      alert('Masukkan deskripsi lemburan');
      return;
    }
    if (!currentCompany?.id) return;

    const dataToInsert = {
      payroll_id: selectedPayrollId,
      company_id: currentCompany.id,
      amount: overtimeData.amount,
      description: overtimeData.description,
      bank_account_id: overtimeData.bank_account_id,
      status: 'draft',
      created_by: user?.email,
    };

    if (editingOvertimeId) {
      const { error } = await supabase
        .from('payroll_overtime')
        .update(dataToInsert)
        .eq('id', editingOvertimeId);
      if (error) {
        alert('Gagal update lemburan: ' + error.message);
        return;
      }
    } else {
      const { error } = await supabase
        .from('payroll_overtime')
        .insert([dataToInsert]);
      if (error) {
        alert('Gagal simpan lemburan: ' + error.message);
        return;
      }
    }

    setShowOvertimeModal(false);
    setOvertimeData({ payroll_id: 0, amount: 0, description: '', bank_account_id: 0 });
    fetchPayrolls();
  };

  const handlePostOvertime = async (id: number, payrollId: number) => {
    if (!confirm('Posting lemburan ini?')) return;
    if (!currentCompany?.id) return;

    try {
      const { data: overtime, error: fetchError } = await supabase
        .from('payroll_overtime')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError || !overtime) {
        alert('Data lemburan tidak ditemukan');
        return;
      }

      // 🔥 BUAT JURNAL LEMBURAN
      const bebanAkun = await getDefaultAccount(currentCompany.id, 'expense');
      const bankAcc = bankAccounts.find(b => b.id === overtime.bank_account_id);

      if (!bebanAkun || !bankAcc) {
        alert('Akun tidak ditemukan');
        return;
      }

      const entries = [
        {
          account_id: bebanAkun.id,
          account_code: bebanAkun.code,
          account_name: bebanAkun.name,
          debit: overtime.amount,
          credit: 0,
        },
        {
          account_id: bankAcc.id,
          account_code: bankAcc.code,
          account_name: bankAcc.name,
          debit: 0,
          credit: overtime.amount,
        },
      ];

      const journalId = await createGeneralJournal(
        currentCompany.id,
        new Date().toISOString().split('T')[0],
        `Lemburan: ${overtime.description}`,
        `OT-${overtime.id}`,
        'OVERTIME',
        overtime.id,
        entries
      );

      if (!journalId) {
        alert('Gagal membuat jurnal lemburan');
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

      alert('Lemburan berhasil diposting!');
      fetchPayrolls();
    } catch (err: any) {
      alert('Gagal posting lemburan: ' + err.message);
    }
  };

  const handleDeleteOvertime = async (id: number) => {
    if (!confirm('Yakin ingin menghapus lemburan ini?')) return;
    const { error } = await supabase
      .from('payroll_overtime')
      .delete()
      .eq('id', id);
    if (!error) fetchPayrolls();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Yakin ingin menghapus payroll ini?')) return;
    const { error } = await supabase
      .from('payroll')
      .delete()
      .eq('id', id);
    if (!error) fetchPayrolls();
  };

  const handleEdit = (payroll: any) => {
    setEditingId(payroll.id);
    setFormData({
      employee_name: payroll.employee_name,
      period: payroll.period.slice(0, 7),
      gaji_pokok: payroll.gaji_pokok,
      bpjs_kesehatan: payroll.bpjs_kesehatan,
      bpjs_tk: payroll.bpjs_tk,
      tunjangan_lainnya: payroll.tunjangan_lainnya,
      pph21: payroll.pph21,
      bank_account_id: payroll.bank_account_id || 0,
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      employee_name: '',
      period: new Date().toISOString().slice(0, 7),
      gaji_pokok: 5247870,
      bpjs_kesehatan: 0,
      bpjs_tk: 0,
      tunjangan_lainnya: 0,
      pph21: 0,
      bank_account_id: 0,
    });
    setEditingId(null);
  };

  const openOvertimeModal = (payrollId: number) => {
    setSelectedPayrollId(payrollId);
    setEditingOvertimeId(null);
    setOvertimeData({ payroll_id: payrollId, amount: 0, description: '', bank_account_id: 0 });
    setShowOvertimeModal(true);
  };

  // ============ FILTER ============
  const filteredPayrolls = payrolls.filter(p => {
    const matchSearch = p.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        p.period.includes(searchTerm);
    const matchStatus = filterStatus === 'all' || p.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const stats = {
    total: payrolls.length,
    draft: payrolls.filter(p => p.status === 'draft').length,
    posted: payrolls.filter(p => p.status === 'posted').length,
  };

  if (!currentCompany) return <div className="flex justify-center py-12">Loading...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between animate-slide-in-up">
        <div>
          <h1 className="font-display text-3xl font-bold text-text">Payroll</h1>
          <p className="text-text-muted mt-1">Kelola gaji karyawan dan buat jurnal otomatis</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium shadow-lg shadow-accent/30"
        >
          <Plus className="w-5 h-5" /> Buat Payroll
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-surface rounded-xl border border-border p-4">
          <p className="text-text-muted text-xs">Total</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-surface rounded-xl border border-border p-4">
          <p className="text-text-muted text-xs">Draft</p>
          <p className="text-2xl font-bold text-warning">{stats.draft}</p>
        </div>
        <div className="bg-surface rounded-xl border border-border p-4">
          <p className="text-text-muted text-xs">Posted</p>
          <p className="text-2xl font-bold text-success">{stats.posted}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface rounded-xl border border-border p-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
            <input
              type="text"
              placeholder="Cari karyawan atau periode..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg"
            />
          </div>
          <div className="flex gap-2">
            {['all', 'draft', 'posted'].map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-2 rounded-lg text-sm font-medium capitalize ${
                  filterStatus === s
                    ? 'bg-accent text-white'
                    : 'border border-border hover:bg-background'
                }`}
              >
                {s === 'all' ? 'Semua' : s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-background">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Karyawan</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Periode</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-text-muted uppercase">Gaji Pokok</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-text-muted uppercase">Gaji Bersih</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-text-muted uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-text-muted uppercase">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8">Loading...</td></tr>
              ) : filteredPayrolls.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-text-muted">Belum ada data payroll</td></tr>
              ) : (
                filteredPayrolls.map((p) => (
                  <tr key={p.id} className="hover:bg-background transition-colors">
                    <td className="px-6 py-4 text-sm">{p.employee_name}</td>
                    <td className="px-6 py-4 text-sm">{p.period.slice(0, 7)}</td>
                    <td className="px-6 py-4 text-right font-mono">{formatCurrency(p.gaji_pokok)}</td>
                    <td className="px-6 py-4 text-right font-mono font-bold">{formatCurrency(p.gaji_bersih)}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                        p.status === 'posted'
                          ? 'bg-success/10 text-success'
                          : 'bg-warning/10 text-warning'
                      }`}>
                        {p.status === 'posted' ? 'Posted' : 'Draft'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {p.status === 'draft' && (
                          <>
                            <button
                              onClick={() => handleEdit(p)}
                              className="p-2 text-text-muted hover:text-info hover:bg-info/10 rounded-lg"
                              title="Edit"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => openOvertimeModal(p.id)}
                              className="p-2 text-text-muted hover:text-warning hover:bg-warning/10 rounded-lg"
                              title="Tambah Lemburan"
                            >
                              <Clock className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handlePost(p.id)}
                              disabled={submitting}
                              className="p-2 text-text-muted hover:text-success hover:bg-success/10 rounded-lg disabled:opacity-50"
                              title="Post"
                            >
                              <Send className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(p.id)}
                              className="p-2 text-text-muted hover:text-danger hover:bg-danger/10 rounded-lg"
                              title="Hapus"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {p.status === 'posted' && p.journal_id && (
                          <button
                            onClick={() => navigate(`/journal-entries/${p.journal_id}`)}
                            className="p-2 text-text-muted hover:text-info hover:bg-info/10 rounded-lg"
                            title="Lihat Jurnal"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Form Gaji */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-surface rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-display text-xl font-bold">
                {editingId ? 'Edit Payroll' : 'Buat Payroll Baru'}
              </h2>
              <button
                onClick={() => { setShowModal(false); resetForm(); }}
                className="text-text-muted hover:text-text"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Nama Karyawan - Manual Input */}
              <div>
                <label className="block text-sm font-medium mb-1">Nama Karyawan *</label>
                <input
                  type="text"
                  value={formData.employee_name}
                  onChange={(e) => setFormData({ ...formData, employee_name: e.target.value })}
                  placeholder="Masukkan nama karyawan"
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>

              {/* Periode */}
              <div>
                <label className="block text-sm font-medium mb-1">Periode</label>
                <input
                  type="month"
                  value={formData.period}
                  onChange={(e) => setFormData({ ...formData, period: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>

              {/* Gaji Pokok */}
              <div>
                <label className="block text-sm font-medium mb-1">Gaji Pokok (UMR)</label>
                <input
                  type="number"
                  value={formData.gaji_pokok}
                  onChange={(e) => setFormData({ ...formData, gaji_pokok: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border rounded-lg"
                />
                <p className="text-xs text-text-muted mt-1">UMR Tangsel 2026: Rp 5.247.870 (bisa diubah)</p>
              </div>

              {/* BPJS Kesehatan */}
              <div>
                <label className="block text-sm font-medium mb-1">BPJS Kesehatan (5%)</label>
                <input
                  type="number"
                  value={formData.bpjs_kesehatan}
                  onChange={(e) => setFormData({ ...formData, bpjs_kesehatan: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border rounded-lg bg-gray-50"
                />
                <p className="text-xs text-text-muted mt-1">Otomatis 5% dari Gaji Pokok, bisa diubah</p>
              </div>

              {/* BPJS TK */}
              <div>
                <label className="block text-sm font-medium mb-1">BPJS Ketenagakerjaan (9.24%)</label>
                <input
                  type="number"
                  value={formData.bpjs_tk}
                  onChange={(e) => setFormData({ ...formData, bpjs_tk: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border rounded-lg bg-gray-50"
                />
                <p className="text-xs text-text-muted mt-1">Otomatis 9.24% dari Gaji Pokok, bisa diubah</p>
              </div>

              {/* Tunjangan Lainnya */}
              <div>
                <label className="block text-sm font-medium mb-1">Tunjangan Lainnya</label>
                <input
                  type="number"
                  value={formData.tunjangan_lainnya}
                  onChange={(e) => setFormData({ ...formData, tunjangan_lainnya: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>

              {/* PPh 21 */}
              <div>
                <label className="block text-sm font-medium mb-1">PPh 21 (Kosongkan jika tidak ada)</label>
                <input
                  type="number"
                  value={formData.pph21}
                  onChange={(e) => setFormData({ ...formData, pph21: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border rounded-lg"
                />
                <p className="text-xs text-text-muted mt-1">Input manual jika ada PPh 21</p>
              </div>

              {/* Gaji Bersih - Read Only */}
              <div>
                <label className="block text-sm font-medium mb-1">Gaji Bersih (Diterima Karyawan)</label>
                <input
                  type="text"
                  value={formatCurrency(formData.gaji_pokok + formData.tunjangan_lainnya)}
                  readOnly
                  className="w-full px-4 py-2 border rounded-lg bg-gray-100 font-semibold"
                />
                <p className="text-xs text-text-muted mt-1">Otomatis: Gaji Pokok + Tunjangan Lainnya</p>
              </div>

              {/* Pilih Bank */}
              <div>
                <label className="block text-sm font-medium mb-1">Akun Bank / Kas *</label>
                <select
                  value={formData.bank_account_id}
                  onChange={(e) => setFormData({ ...formData, bank_account_id: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border rounded-lg"
                >
                  <option value={0}>-- Pilih Bank / Kas --</option>
                  {bankAccounts.map(b => (
                    <option key={b.id} value={b.id}>{b.code} - {b.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => { setShowModal(false); resetForm(); }}
                className="px-4 py-2 border border-border rounded-lg"
              >
                Batal
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-accent text-white rounded-lg"
              >
                {editingId ? 'Update' : 'Simpan'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Modal Lemburan */}
      {showOvertimeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-surface rounded-xl p-6 w-full max-w-lg"
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-display text-xl font-bold">Tambah Lemburan</h2>
              <button
                onClick={() => { setShowOvertimeModal(false); setOvertimeData({ payroll_id: 0, amount: 0, description: '', bank_account_id: 0 }); }}
                className="text-text-muted hover:text-text"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Deskripsi *</label>
                <input
                  type="text"
                  value={overtimeData.description}
                  onChange={(e) => setOvertimeData({ ...overtimeData, description: e.target.value })}
                  placeholder="Misal: Lemburan Hari Minggu"
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Jumlah *</label>
                <input
                  type="number"
                  value={overtimeData.amount}
                  onChange={(e) => setOvertimeData({ ...overtimeData, amount: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Akun Bank / Kas *</label>
                <select
                  value={overtimeData.bank_account_id}
                  onChange={(e) => setOvertimeData({ ...overtimeData, bank_account_id: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border rounded-lg"
                >
                  <option value={0}>-- Pilih Bank / Kas --</option>
                  {bankAccounts.map(b => (
                    <option key={b.id} value={b.id}>{b.code} - {b.name}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-text-muted">Jurnal: Debit Beban Survei Lokasi, Kredit Bank/Kas</p>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => { setShowOvertimeModal(false); setOvertimeData({ payroll_id: 0, amount: 0, description: '', bank_account_id: 0 }); }}
                className="px-4 py-2 border border-border rounded-lg"
              >
                Batal
              </button>
              <button
                onClick={handleAddOvertime}
                className="px-4 py-2 bg-accent text-white rounded-lg"
              >
                Simpan Lemburan
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
