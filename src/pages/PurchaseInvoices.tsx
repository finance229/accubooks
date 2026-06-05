import { useState, useEffect } from 'react';
import { Plus, Search, Eye, Send, DollarSign, Clock, CheckCircle, Download, X, Trash2, User, FolderOpen, Edit, CheckSquare, Square } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useCompany } from '../contexts/CompanyContext';
import { useAuth } from '../contexts/AuthContext';
import { uploadToGoogleDrive } from '../lib/googleDrive';

type Vendor = {
  id: number;
  name: string;
  npwp: string;
  address: string;
  phone: string;
  email: string;
  bank_name: string;
  bank_account: string;
  payment_term: number;
};

type Project = {
  id: number;
  code: string;
  name: string;
  budget: number;
  spent: number;
};

type Coa = {
  id: number;
  code: string;
  name: string;
  type: string;
};

type PurchaseInvoice = {
  id: number;
  vendor_id: number;
  vendor_name: string;
  vendor_npwp: string;
  vendor_address: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  project_id: number | null;
  description: string;
  amount: number;
  ppn: number;
  pph23: number;
  total: number;
  status: string;
  attachment_url: string;
  debit_account_id: number | null;
  voucher_no: string | null;
  credit_account_id: number | null;
  paid_amount: number;
  payment_date: string | null;
};

export default function PurchaseInvoices() {
  const { currentCompany } = useCompany();
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [coaList, setCoaList] = useState<Coa[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<PurchaseInvoice | null>(null);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [includePpn, setIncludePpn] = useState(true);
  const [includePph, setIncludePph] = useState(false);
  
  // Form buat AP
  const [formData, setFormData] = useState({
    vendor_id: 0,
    vendor_name: '',
    vendor_npwp: '',
    vendor_address: '',
    invoice_number: '',
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    project_id: null as number | null,
    description: '',
    amount: 0,
  });
  
  const [vendorSearch, setVendorSearch] = useState('');
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  
  // Verifikasi
  const [verifyData, setVerifyData] = useState({
    projectId: 0,
    newProjectCode: '',
    newProjectName: '',
    newProjectBudget: 0,
    debitAccountId: 0,
    ppn: 0,
    pph: 0,
    total: 0,
  });
  const [budgetInfo, setBudgetInfo] = useState<{ sufficient: boolean; message: string } | null>(null);
  
  // Pembayaran
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [creditAccountId, setCreditAccountId] = useState(0);

  useEffect(() => {
    if (currentCompany?.id) {
      fetchInvoices();
      fetchVendors();
      fetchProjects();
      fetchCoa();
    }
  }, [currentCompany]);

  const fetchInvoices = async () => {
    if (!currentCompany?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('vendor_invoices')
      .select('*')
      .eq('company_id', currentCompany.id)
      .order('created_at', { ascending: false });
    setInvoices(data || []);
    setLoading(false);
  };

  const fetchVendors = async () => {
    if (!currentCompany?.id) return;
    const { data } = await supabase
      .from('vendors')
      .select('*')
      .eq('company_id', currentCompany.id);
    setVendors(data || []);
  };

  const fetchProjects = async () => {
    if (!currentCompany?.id) return;
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('company_id', currentCompany.id);
    setProjects(data || []);
  };

  const fetchCoa = async () => {
    if (!currentCompany?.id) return;
    const { data } = await supabase
      .from('coa')
      .select('id, code, name, type')
      .eq('company_id', currentCompany.id)
      .in('type', ['expense', 'asset']);
    setCoaList(data || []);
  };

  const filteredVendors = vendors.filter(v =>
    v.name.toLowerCase().includes(vendorSearch.toLowerCase())
  );

  const generateInvoiceNumber = async () => {
    const year = new Date().getFullYear();
    const count = invoices.length + 1;
    return `AP/${currentCompany?.id}/${year}/${String(count).padStart(4, '0')}`;
  };

  const handleCreateInvoice = async () => {
    if (!formData.vendor_id || !formData.invoice_number || formData.amount <= 0) {
      alert('Lengkapi vendor, nomor invoice, dan jumlah');
      return;
    }
    if (!attachmentFile) {
      alert('Upload invoice vendor (foto/PDF) wajib');
      return;
    }
    if (!currentCompany?.id) return;

    setUploading(true);
    const uploadResult = await uploadToGoogleDrive(attachmentFile, 'vendor_invoices');
    if (!uploadResult.success) {
      alert('Gagal upload bukti: ' + uploadResult.error);
      setUploading(false);
      return;
    }

    const invoiceNumber = await generateInvoiceNumber();
    const selectedVendor = vendors.find(v => v.id === formData.vendor_id);
    const ppn = includePpn ? Math.round(formData.amount * 0.11) : 0;
    const pph23 = includePph ? Math.round(formData.amount * 0.02) : 0;
    const total = formData.amount + ppn - pph23;

    const { error } = await supabase
      .from('vendor_invoices')
      .insert([{
        company_id: currentCompany.id,
        vendor_id: formData.vendor_id,
        vendor_name: selectedVendor?.name || '',
        vendor_npwp: selectedVendor?.npwp || '',
        vendor_address: selectedVendor?.address || '',
        invoice_number: invoiceNumber,
        invoice_date: formData.invoice_date,
        due_date: formData.due_date,
        project_id: formData.project_id,
        description: formData.description,
        amount: formData.amount,
        ppn: ppn,
        pph23: pph23,
        total: total,
        status: 'draft',
        attachment_url: uploadResult.fileUrl,
        created_by: user?.email,
      }]);

    if (error) {
      alert('Gagal membuat AP: ' + error.message);
    } else {
      alert('AP berhasil dibuat');
      setShowModal(false);
      resetForm();
      fetchInvoices();
    }
    setUploading(false);
  };

  const resetForm = () => {
    setFormData({
      vendor_id: 0,
      vendor_name: '',
      vendor_npwp: '',
      vendor_address: '',
      invoice_number: '',
      invoice_date: new Date().toISOString().split('T')[0],
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      project_id: null,
      description: '',
      amount: 0,
    });
    setVendorSearch('');
    setAttachmentFile(null);
    setIncludePpn(true);
    setIncludePph(false);
  };

  const handleSubmit = async (id: number) => {
    const { error } = await supabase
      .from('vendor_invoices')
      .update({ status: 'submitted' })
      .eq('id', id);
    if (!error) {
      alert('AP diajukan ke finance');
      fetchInvoices();
    } else alert('Gagal submit');
  };

  const openVerifyModal = (invoice: PurchaseInvoice) => {
    setSelectedInvoice(invoice);
    setVerifyData({
      projectId: invoice.project_id || 0,
      newProjectCode: '',
      newProjectName: '',
      newProjectBudget: 0,
      debitAccountId: invoice.debit_account_id || 0,
      ppn: invoice.ppn,
      pph: invoice.pph23,
      total: invoice.total,
    });
    setBudgetInfo(null);
    setShowVerifyModal(true);
  };

  const handleProjectChange = async (projectId: number) => {
    setVerifyData({ ...verifyData, projectId });
    if (projectId > 0 && selectedInvoice) {
      const project = projects.find(p => p.id === projectId);
      if (project) {
        const remaining = project.budget - project.spent;
        const sufficient = remaining >= selectedInvoice.total;
        setBudgetInfo({
          sufficient,
          message: sufficient 
            ? `✅ Budget cukup. Sisa: Rp ${remaining.toLocaleString('id-ID')}`
            : `❌ Budget tidak cukup! Sisa: Rp ${remaining.toLocaleString('id-ID')}`
        });
      }
    } else setBudgetInfo(null);
  };

  const handleCreateNewProject = async () => {
    if (!verifyData.newProjectCode || !verifyData.newProjectName) {
      alert('Kode dan nama proyek harus diisi');
      return;
    }
    const { data, error } = await supabase
      .from('projects')
      .insert([{
        company_id: currentCompany?.id,
        code: verifyData.newProjectCode.toUpperCase(),
        name: verifyData.newProjectName,
        budget: verifyData.newProjectBudget,
        spent: 0,
        status: 'active',
      }])
      .select()
      .single();
    if (error) {
      alert('Gagal buat proyek: ' + error.message);
      return;
    }
    setProjects([...projects, data]);
    setVerifyData({ ...verifyData, projectId: data.id, newProjectCode: '', newProjectName: '', newProjectBudget: 0 });
    if (selectedInvoice) {
      const remaining = data.budget - 0;
      setBudgetInfo({
        sufficient: remaining >= selectedInvoice.total,
        message: `✅ Proyek dibuat. Sisa budget: Rp ${remaining.toLocaleString('id-ID')}`
      });
    }
  };

  const handleVerify = async () => {
    if (!selectedInvoice) return;
    if (!verifyData.projectId) {
      alert('Pilih atau buat proyek terlebih dahulu');
      return;
    }
    if (!verifyData.debitAccountId) {
      alert('Pilih akun debit (beban/persediaan/aset)');
      return;
    }
    if (budgetInfo && !budgetInfo.sufficient) {
      alert('Budget tidak cukup. Tidak bisa verifikasi.');
      return;
    }

    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const projectCode = projects.find(p => p.id === verifyData.projectId)?.code || 'PRJ';
    const count = invoices.filter(i => i.status === 'verified' || i.status === 'paid').length + 1;
    const voucherNo = `AP/${year}/${month}/${projectCode}/${String(count).padStart(4, '0')}`;

    // Update project spent
    await supabase
      .from('projects')
      .update({ spent: (projects.find(p => p.id === verifyData.projectId)?.spent || 0) + selectedInvoice.total })
      .eq('id', verifyData.projectId);

    const { error } = await supabase
      .from('vendor_invoices')
      .update({
        status: 'verified',
        project_id: verifyData.projectId,
        debit_account_id: verifyData.debitAccountId,
        voucher_no: voucherNo,
        verified_by: user?.email,
        verified_at: new Date().toISOString(),
      })
      .eq('id', selectedInvoice.id);

    if (error) {
      alert('Gagal verifikasi: ' + error.message);
    } else {
      alert('AP berhasil diverifikasi. Jurnal hutang telah dibuat.');
      setShowVerifyModal(false);
      fetchInvoices();
    }
  };

  const openPaymentModal = (invoice: PurchaseInvoice) => {
    setSelectedInvoice(invoice);
    const remaining = invoice.total - (invoice.paid_amount || 0);
    setPaymentAmount(remaining.toString());
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setCreditAccountId(0);
    setShowPaymentModal(true);
  };

  const handlePayment = async () => {
    if (!selectedInvoice) return;
    const amount = parseInt(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Masukkan jumlah pembayaran yang valid');
      return;
    }
    if (!creditAccountId) {
      alert('Pilih akun bank/kas');
      return;
    }

    const currentPaid = selectedInvoice.paid_amount || 0;
    const newPaid = currentPaid + amount;
    const newStatus = newPaid >= selectedInvoice.total ? 'paid' : 'partial';

    const { error } = await supabase
      .from('vendor_invoices')
      .update({
        paid_amount: newPaid,
        status: newStatus,
        payment_date: paymentDate,
        credit_account_id: creditAccountId,
        paid_by: user?.email,
        paid_at: new Date().toISOString(),
      })
      .eq('id', selectedInvoice.id);

    if (error) {
      alert('Gagal mencatat pembayaran: ' + error.message);
    } else {
      await supabase.from('vendor_payments').insert([{
        vendor_invoice_id: selectedInvoice.id,
        payment_date: paymentDate,
        amount: amount,
        bank_account_id: creditAccountId,
        created_by: user?.email,
      }]);
      alert(`Pembayaran Rp ${amount.toLocaleString('id-ID')} berhasil dicatat`);
      setShowPaymentModal(false);
      fetchInvoices();
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
  };

  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch = inv.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         inv.vendor_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || inv.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800',
      submitted: 'bg-blue-100 text-blue-800',
      verified: 'bg-yellow-100 text-yellow-800',
      partial: 'bg-orange-100 text-orange-800',
      paid: 'bg-green-100 text-green-800',
    };
    return badges[status] || 'bg-gray-100';
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      draft: 'Draft',
      submitted: 'Submitted',
      verified: 'Terverifikasi',
      partial: 'Dibayar Sebagian',
      paid: 'Lunas',
    };
    return labels[status] || status;
  };

  if (!currentCompany) return <div className="flex justify-center py-12">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-slide-in-up">
        <div>
          <h1 className="font-display text-3xl font-bold text-text">Account Payable (AP)</h1>
          <p className="text-text-muted mt-1">Kelola invoice pembelian dari vendor</p>
          <p className="text-xs text-text-muted mt-1">Staff → Finance (Verifikasi & Pilih Akun) → Direktur (Bayar)</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium shadow-lg shadow-accent/30">
          <Plus className="w-5 h-5" /> Buat AP
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface rounded-xl border border-border p-4"><p className="text-text-muted text-xs">Total AP</p><p className="text-2xl font-bold">{invoices.length}</p></div>
        <div className="bg-surface rounded-xl border border-border p-4"><p className="text-text-muted text-xs">Total Amount</p><p className="text-lg font-bold">{formatCurrency(invoices.reduce((s, i) => s + i.total, 0))}</p></div>
        <div className="bg-surface rounded-xl border border-border p-4"><p className="text-text-muted text-xs">Pending</p><p className="text-2xl font-bold text-warning">{invoices.filter(i => i.status === 'submitted' || i.status === 'verified').length}</p></div>
        <div className="bg-surface rounded-xl border border-border p-4"><p className="text-text-muted text-xs">Outstanding</p><p className="text-lg font-bold text-danger">{formatCurrency(invoices.filter(i => i.status !== 'paid').reduce((s, i) => s + (i.total - (i.paid_amount || 0)), 0))}</p></div>
      </div>

      <div className="bg-surface rounded-xl border border-border p-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" /><input type="text" placeholder="Cari nomor AP atau vendor..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg" /></div>
          <div className="flex gap-2 flex-wrap">{['all','draft','submitted','verified','partial','paid'].map(s => (<button key={s} onClick={() => setFilterStatus(s)} className={`px-3 py-2 rounded-lg text-sm font-medium capitalize ${filterStatus === s ? 'bg-accent text-white' : 'border border-border hover:bg-background'}`}>{s === 'all' ? 'Semua' : getStatusLabel(s)}</button>))}</div>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full"><thead className="bg-background"><tr><th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">No. AP</th><th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Tanggal</th><th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Vendor</th><th className="px-6 py-3 text-right text-xs font-semibold text-text-muted uppercase">Total</th><th className="px-6 py-3 text-center text-xs font-semibold text-text-muted uppercase">Status</th><th className="px-6 py-3 text-right text-xs font-semibold text-text-muted uppercase">Aksi</th></tr></thead>
        <tbody className="divide-y divide-border">{loading ? <tr><td colSpan={6} className="text-center py-8">Loading...</td></tr> : filteredInvoices.map((inv) => (<tr key={inv.id} className="hover:bg-background"><td className="px-6 py-4 text-sm font-mono">{inv.invoice_number}</td><td className="px-6 py-4 text-sm">{inv.invoice_date}</td><td className="px-6 py-4 text-sm">{inv.vendor_name}</td><td className="px-6 py-4 text-right font-mono">{formatCurrency(inv.total)}</td><td className="px-6 py-4 text-center"><span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${getStatusBadge(inv.status)}`}>{getStatusLabel(inv.status)}</span></td><td className="px-6 py-4 text-right"><div className="flex justify-end gap-2"><button onClick={() => { setSelectedInvoice(inv); setShowDetailModal(true); }} className="p-1 text-blue-600"><Eye className="w-4 h-4" /></button>{inv.status === 'draft' && <button onClick={() => handleSubmit(inv.id)} className="p-1 text-green-600"><Send className="w-4 h-4" /></button>}{inv.status === 'submitted' && <button onClick={() => openVerifyModal(inv)} className="p-1 text-yellow-600"><CheckCircle className="w-4 h-4" /></button>}{(inv.status === 'verified' || inv.status === 'partial') && <button onClick={() => openPaymentModal(inv)} className="p-1 text-red-600"><DollarSign className="w-4 h-4" /></button>}</div></td></tr>))}</tbody></table></div>
      </div>

      {/* Modal Buat AP */}
      {showModal && (<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-auto"><div className="bg-surface rounded-xl p-6 w-full max-w-2xl my-8"><h2 className="font-display text-xl font-bold mb-4">Buat Account Payable</h2><div className="space-y-4"><div className="relative"><label className="block text-sm font-medium mb-1">Pilih Vendor *</label><input type="text" placeholder="Cari vendor..." value={vendorSearch} onChange={(e) => { setVendorSearch(e.target.value); setShowVendorDropdown(true); }} className="w-full px-4 py-2 border rounded-lg" />{showVendorDropdown && filteredVendors.length > 0 && (<div className="absolute z-10 w-full bg-white border rounded-lg mt-1 max-h-48 overflow-auto">{filteredVendors.map(v => (<button key={v.id} className="w-full text-left px-4 py-2 hover:bg-gray-100" onClick={() => { setFormData({ ...formData, vendor_id: v.id, vendor_name: v.name, vendor_npwp: v.npwp || '', vendor_address: v.address || '' }); setVendorSearch(v.name); setShowVendorDropdown(false); }}>{v.name} - {v.npwp || '-'}</button>))}</div>)}</div><div><label className="block text-sm font-medium mb-1">Nomor Invoice Vendor *</label><input type="text" value={formData.invoice_number} onChange={e => setFormData({...formData, invoice_number: e.target.value})} className="w-full px-4 py-2 border rounded-lg" /></div><div className="grid grid-cols-2 gap-4"><div><label>Tanggal Invoice</label><input type="date" value={formData.invoice_date} onChange={e => setFormData({...formData, invoice_date: e.target.value})} className="w-full px-4 py-2 border rounded-lg" /></div><div><label>Jatuh Tempo</label><input type="date" value={formData.due_date} onChange={e => setFormData({...formData, due_date: e.target.value})} className="w-full px-4 py-2 border rounded-lg" /></div></div><div><label>Proyek (Opsional)</label><select value={formData.project_id || ''} onChange={e => setFormData({...formData, project_id: e.target.value ? parseInt(e.target.value) : null})} className="w-full px-4 py-2 border rounded-lg"><option value="">-- Pilih Proyek --</option>{projects.map(p => (<option key={p.id} value={p.id}>{p.code} - {p.name} (Budget: {formatCurrency(p.budget)})</option>))}</select></div><div><label>Deskripsi</label><textarea rows={2} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full px-4 py-2 border rounded-lg" /></div><div><label>Jumlah (DPP)</label><input type="number" value={formData.amount || ''} onChange={e => setFormData({...formData, amount: parseInt(e.target.value) || 0})} className="w-full px-4 py-2 border rounded-lg" /></div><div className="flex gap-4"><label className="flex items-center gap-2"><input type="checkbox" checked={includePpn} onChange={e => setIncludePpn(e.target.checked)} /> + PPN 11% (Masukan)</label><label className="flex items-center gap-2"><input type="checkbox" checked={includePph} onChange={e => setIncludePph(e.target.checked)} /> - PPh 23 (2%)</label></div><div><label>Upload Invoice Vendor *</label><input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setAttachmentFile(e.target.files?.[0] || null)} className="w-full" /></div></div><div className="flex justify-end gap-3 mt-6"><button onClick={() => setShowModal(false)} className="px-4 py-2 border rounded-lg">Batal</button><button onClick={handleCreateInvoice} disabled={uploading} className="px-4 py-2 bg-accent text-white rounded-lg">{uploading ? 'Uploading...' : 'Simpan Draft'}</button></div></div></div>)}

      {/* Modal Verifikasi */}
      {showVerifyModal && selectedInvoice && (<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-auto"><div className="bg-surface rounded-xl p-6 w-full max-w-2xl my-8"><h2 className="font-display text-xl font-bold mb-4">Verifikasi AP - {selectedInvoice.invoice_number}</h2><div className="space-y-4"><div className="bg-gray-50 p-4 rounded-lg"><p><strong>Vendor:</strong> {selectedInvoice.vendor_name}</p><p><strong>Jumlah:</strong> {formatCurrency(selectedInvoice.amount)}</p><p><strong>PPN:</strong> {formatCurrency(selectedInvoice.ppn)}</p><p><strong>PPh 23:</strong> {formatCurrency(selectedInvoice.pph23)}</p><p><strong>Total:</strong> {formatCurrency(selectedInvoice.total)}</p><a href={selectedInvoice.attachment_url} target="_blank" className="text-blue-600 text-sm">Lihat Invoice Vendor</a></div><div><label className="block font-medium">Pilih Proyek</label><select value={verifyData.projectId} onChange={e => handleProjectChange(parseInt(e.target.value))} className="w-full px-4 py-2 border rounded-lg"><option value={0}>-- Pilih Proyek --</option>{projects.map(p => (<option key={p.id} value={p.id}>{p.code} - {p.name} (Budget: {formatCurrency(p.budget)}, Sisa: {formatCurrency(p.budget - p.spent)})</option>))}</select><button onClick={() => { setVerifyData({...verifyData, projectId: 0, newProjectCode: '', newProjectName: '', newProjectBudget: 0}); }} className="text-sm text-accent mt-1">+ Buat proyek baru</button></div>{verifyData.projectId === 0 && (<div className="border p-4 rounded-lg space-y-2"><input type="text" placeholder="Kode Proyek" value={verifyData.newProjectCode} onChange={e => setVerifyData({...verifyData, newProjectCode: e.target.value.toUpperCase()})} className="w-full px-4 py-2 border rounded-lg" /><input type="text" placeholder="Nama Proyek" value={verifyData.newProjectName} onChange={e => setVerifyData({...verifyData, newProjectName: e.target.value})} className="w-full px-4 py-2 border rounded-lg" /><input type="number" placeholder="Anggaran" value={verifyData.newProjectBudget || ''} onChange={e => setVerifyData({...verifyData, newProjectBudget: parseInt(e.target.value) || 0})} className="w-full px-4 py-2 border rounded-lg" /><button onClick={handleCreateNewProject} className="w-full bg-accent text-white py-2 rounded-lg">Simpan Proyek Baru</button></div>)}<div><label className="block font-medium">Akun Debit (Beban/Persediaan/Aset)</label><select value={verifyData.debitAccountId} onChange={e => setVerifyData({...verifyData, debitAccountId: parseInt(e.target.value)})} className="w-full px-4 py-2 border rounded-lg"><option value={0}>-- Pilih Akun --</option>{coaList.map(acc => (<option key={acc.id} value={acc.id}>{acc.code} - {acc.name} ({acc.type === 'expense' ? 'Beban' : 'Aset'})</option>))}</select></div>{budgetInfo && (<div className={`p-3 rounded-lg ${budgetInfo.sufficient ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{budgetInfo.message}</div>)}</div><div className="flex justify-end gap-3 mt-6"><button onClick={() => setShowVerifyModal(false)} className="px-4 py-2 border rounded-lg">Batal</button><button onClick={handleVerify} disabled={!budgetInfo?.sufficient && budgetInfo !== null} className="px-4 py-2 bg-accent text-white rounded-lg">Verifikasi & Buat Jurnal</button></div></div></div>)}

      {/* Modal Pembayaran */}
      {showPaymentModal && selectedInvoice && (<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"><div className="bg-surface rounded-xl p-6 w-full max-w-md"><h2 className="font-display text-xl font-bold mb-4">Pembayaran AP</h2><div className="space-y-4"><div><p className="text-sm text-text-muted">No. AP</p><p className="font-semibold">{selectedInvoice.invoice_number}</p></div><div><p className="text-sm text-text-muted">Total Tagihan</p><p className="font-semibold">{formatCurrency(selectedInvoice.total)}</p></div><div><p className="text-sm text-text-muted">Sudah Dibayar</p><p className="font-semibold text-success">{formatCurrency(selectedInvoice.paid_amount || 0)}</p></div><div><p className="text-sm text-text-muted">Sisa</p><p className="font-semibold text-warning">{formatCurrency(selectedInvoice.total - (selectedInvoice.paid_amount || 0))}</p></div><div><label className="block text-sm font-medium mb-1">Jumlah Bayar</label><input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} className="w-full px-4 py-2 border rounded-lg" /></div><div><label className="block text-sm font-medium mb-1">Tanggal Bayar</label><input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="w-full px-4 py-2 border rounded-lg" /></div><div><label className="block text-sm font-medium mb-1">Akun Bank / Kas</label><select value={creditAccountId} onChange={e => setCreditAccountId(parseInt(e.target.value))} className="w-full px-4 py-2 border rounded-lg"><option value={0}>-- Pilih Akun --</option>{coaList.filter(c => c.type === 'asset' && (c.name.includes('Bank') || c.name.includes('Kas'))).map(acc => (<option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>))}</select></div></div><div className="flex justify-end gap-3 mt-6"><button onClick={() => setShowPaymentModal(false)} className="px-4 py-2 border rounded-lg">Batal</button><button onClick={handlePayment} className="px-4 py-2 bg-accent text-white rounded-lg">Catat Pembayaran</button></div></div></div>)}

      {/* Modal Detail */}
      {showDetailModal && selectedInvoice && (<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"><div className="bg-surface rounded-xl p-6 w-full max-w-lg"><div className="flex justify-between"><h2 className="font-display text-xl font-bold">Detail AP</h2><button onClick={() => setShowDetailModal(false)}>✕</button></div><div className="space-y-2 mt-4"><p><strong>No. AP:</strong> {selectedInvoice.invoice_number}</p><p><strong>Vendor:</strong> {selectedInvoice.vendor_name}</p><p><strong>Tanggal Invoice:</strong> {selectedInvoice.invoice_date}</p><p><strong>Jatuh Tempo:</strong> {selectedInvoice.due_date}</p><p><strong>Jumlah:</strong> {formatCurrency(selectedInvoice.amount)}</p><p><strong>PPN:</strong> {formatCurrency(selectedInvoice.ppn)}</p><p><strong>PPh 23:</strong> {formatCurrency(selectedInvoice.pph23)}</p><p><strong>Total:</strong> {formatCurrency(selectedInvoice.total)}</p><p><strong>Sudah Dibayar:</strong> {formatCurrency(selectedInvoice.paid_amount || 0)}</p><p><strong>Sisa:</strong> {formatCurrency(selectedInvoice.total - (selectedInvoice.paid_amount || 0))}</p><p><strong>Status:</strong> {getStatusLabel(selectedInvoice.status)}</p>{selectedInvoice.voucher_no && <p><strong>Voucher:</strong> {selectedInvoice.voucher_no}</p>}<a href={selectedInvoice.attachment_url} target="_blank" className="text-blue-600">Lihat Bukti</a></div></div></div>)}
    </div>
  );
}
