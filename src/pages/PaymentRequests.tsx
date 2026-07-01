import { useState, useEffect } from 'react';
import { Plus, Search, Eye, Send, CheckCircle, XCircle, Clock, AlertCircle, UserCheck, Award, Upload, X, FolderOpen, Coins, Banknote, FileText, Edit } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useCompany } from '../contexts/CompanyContext';
import { useAuth } from '../contexts/AuthContext';
import { 
  formatCurrency, 
  generateVoucherNo, 
  createAccrualJournal, 
  createPaymentJournal, 
  addPaymentLog,
  createProjectIfNotExist,
  checkProjectBudget,
  updateProjectSpent,
  generateVoucherNumber
} from '../lib/accountingHelpers';
import { uploadToGoogleDrive } from '../lib/googleDrive';

type PaymentRequest = {
  id: number;
  request_number: string;
  request_date: string;
  requester_name: string;
  requester_email: string;
  description: string;
  amount: number;
  bank_name: string;
  bank_account_number: string;
  bank_account_name: string;
  status: 'draft' | 'submitted' | 'verified' | 'approved' | 'rejected';
  submitted_at: string | null;
  verified_by: string | null;
  verified_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  project_id: number | null;
  voucher_no: string | null;
  attachment_url: string | null;
  debit_account_id: number | null;
  credit_account_id: number | null;
  payment_account_id: number | null;
  ppn: number;
  pph: number;
  total_with_tax: number;
};

type Project = { id: number; code: string; name: string; budget: number; spent: number };
type Coa = { id: number; code: string; name: string; type: string };

export default function PaymentRequests() {
  const navigate = useNavigate();
  const { currentCompany } = useCompany();
  const { user } = useAuth();
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [coaList, setCoaList] = useState<Coa[]>([]);
  const [bankAccounts, setBankAccounts] = useState<Coa[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<PaymentRequest | null>(null);
  
  // State untuk Edit
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRequest, setEditingRequest] = useState<PaymentRequest | null>(null);
  const [editData, setEditData] = useState({
    description: '',
    amount: '',
    request_date: '',
    bank_name: '',
    bank_account_number: '',
    bank_account_name: '',
  });
  const [editAttachmentFile, setEditAttachmentFile] = useState<File | null>(null);
  const [editUploading, setEditUploading] = useState(false);

  const [companyCode, setCompanyCode] = useState<string>('');
  const [voucherPreview, setVoucherPreview] = useState<string>('');
  const [isGeneratingPreview, setIsGeneratingPreview] = useState<boolean>(false);
  
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProject, setNewProject] = useState({ code: '', name: '', budget: 0 });
  
  const [newRequest, setNewRequest] = useState({
    description: '',
    amount: '',
    request_date: new Date().toISOString().split('T')[0],
    bank_name: '',
    bank_account_number: '',
    bank_account_name: '',
  });
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const [verifyData, setVerifyData] = useState({
    projectId: 0,
    newProjectCode: '',
    newProjectName: '',
    newProjectBudget: 0,
    debitAccountId: 0,
    creditAccountId: 0,
    paymentAccountId: 0,
    ppn: 0,
    pph: 0,
    total: 0,
  });
  const [budgetInfo, setBudgetInfo] = useState<{ sufficient: boolean; remaining: number; message: string } | null>(null);

  useEffect(() => {
    if (currentCompany?.id) {
      fetchRequests();
      fetchProjects();
      fetchCoa();
      fetchBankAccounts();
      fetchCompanyCode();
    }
  }, [currentCompany]);

  const fetchCompanyCode = async () => {
    if (!currentCompany?.id) return;
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', currentCompany.id)
        .single();
      if (error) {
        console.error('Error fetching company:', error);
        return;
      }
      const code = data.code || data.company_code || data.kode || data.name?.substring(0, 4).toUpperCase() || 'COMP';
      setCompanyCode(code);
    } catch (err) {
      console.error('Fetch error:', err);
    }
  };

  const generateVoucherPreview = async () => {
    if (!currentCompany?.id || !companyCode) {
      setVoucherPreview('');
      return;
    }
    setIsGeneratingPreview(true);
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const projectId = verifyData.projectId;
      const project = projects.find(p => p.id === projectId);
      const projectCode = project?.code || '';

      let basePattern = `${companyCode}/${year}/${month}`;
      if (projectCode) {
        basePattern += `/${projectCode}`;
      }

      const { data: existingVouchers } = await supabase
        .from('payment_requests')
        .select('voucher_no')
        .ilike('voucher_no', `${basePattern}/%`)
        .order('voucher_no', { ascending: false })
        .limit(1);

      let lastNumber = 0;
      if (existingVouchers && existingVouchers.length > 0) {
        const parts = existingVouchers[0].voucher_no.split('/');
        const lastPart = parts[parts.length - 1];
        lastNumber = parseInt(lastPart) || 0;
      }
      const nextNumber = (lastNumber + 1).toString().padStart(3, '0');
      setVoucherPreview(`${basePattern}/${nextNumber}`);
    } catch (error) {
      console.error('Error generating preview:', error);
      setVoucherPreview('(gagal generate)');
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  useEffect(() => {
    if (companyCode) {
      generateVoucherPreview();
    }
  }, [companyCode, verifyData.projectId, projects]);

  const fetchRequests = async () => {
    if (!currentCompany?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('payment_requests')
      .select('*')
      .eq('company_id', currentCompany.id)
      .order('created_at', { ascending: false });
    setRequests(data || []);
    setLoading(false);
  };

  const fetchProjects = async () => {
    if (!currentCompany?.id) return;
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('company_id', currentCompany.id)
      .eq('status', 'active');
    setProjects(data || []);
  };

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
      .or('name.ilike.%bank%,name.ilike.%kas%')
      .order('code');
    setBankAccounts(data || []);
  };

  const handleCreateProject = async () => {
    if (!newProject.code || !newProject.name) {
      alert('Kode dan nama proyek wajib diisi');
      return;
    }
    try {
      const projectId = await createProjectIfNotExist(
        currentCompany!.id,
        newProject.code,
        newProject.name,
        newProject.budget
      );
      await fetchProjects();
      setVerifyData({ ...verifyData, projectId: projectId });
      setShowNewProjectModal(false);
      setNewProject({ code: '', name: '', budget: 0 });
      alert('Proyek berhasil ditambahkan');
    } catch (error) {
      alert('Gagal menambahkan proyek');
    }
  };

  const handleAddRequest = async () => {
    if (!newRequest.description || !newRequest.amount) {
      alert('Lengkapi deskripsi dan jumlah');
      return;
    }
    if (!attachmentFile) {
      alert('Upload bukti pendukung (foto/PDF) wajib');
      return;
    }

    setUploading(true);

    const uploadResult = await uploadToGoogleDrive(attachmentFile, 'payment_requests');
    if (!uploadResult.success) {
      alert('Gagal upload bukti: ' + uploadResult.error);
      setUploading(false);
      return;
    }

    const year = new Date().getFullYear();
    const { data: requestNumber, error: seqError } = await supabase.rpc(
      'generate_pr_number',
      { p_company_id: currentCompany!.id, p_year: year }
    );

    if (seqError || !requestNumber) {
      alert('Gagal generate nomor request: ' + seqError?.message);
      setUploading(false);
      return;
    }

    const { data, error } = await supabase
      .from('payment_requests')
      .insert([{
        company_id: currentCompany!.id,
        request_number: requestNumber,
        request_date: newRequest.request_date,
        requester_name: user?.name || user?.email || 'Staff',
        requester_email: user?.email,
        description: newRequest.description,
        amount: parseInt(newRequest.amount) || 0,
        bank_name: newRequest.bank_name,
        bank_account_number: newRequest.bank_account_number,
        bank_account_name: newRequest.bank_account_name,
        attachment_url: uploadResult.fileUrl,
        status: 'draft',
      }])
      .select();

    if (!error && data) {
      setRequests([data[0], ...requests]);
      setShowAddModal(false);
      setNewRequest({
        description: '',
        amount: '',
        request_date: new Date().toISOString().split('T')[0],
        bank_name: '',
        bank_account_number: '',
        bank_account_name: '',
      });
      setAttachmentFile(null);
    } else {
      alert('Gagal simpan: ' + error?.message);
    }
    setUploading(false);
  };

  // ============================================
  // FUNGSI EDIT UNTUK DRAFT
  // ============================================
  const openEditModal = (request: PaymentRequest) => {
    if (request.status !== 'draft') {
      alert('Hanya request dengan status DRAFT yang bisa diedit');
      return;
    }
    setEditingRequest(request);
    setEditData({
      description: request.description,
      amount: request.amount.toString(),
      request_date: request.request_date,
      bank_name: request.bank_name || '',
      bank_account_number: request.bank_account_number || '',
      bank_account_name: request.bank_account_name || '',
    });
    setEditAttachmentFile(null);
    setShowEditModal(true);
  };

  const handleEditRequest = async () => {
    if (!editingRequest) return;
    if (!editData.description || !editData.amount) {
      alert('Lengkapi deskripsi dan jumlah');
      return;
    }

    setEditUploading(true);

    let attachmentUrl = editingRequest.attachment_url;
    if (editAttachmentFile) {
      const uploadResult = await uploadToGoogleDrive(editAttachmentFile, 'payment_requests');
      if (!uploadResult.success) {
        alert('Gagal upload bukti baru: ' + uploadResult.error);
        setEditUploading(false);
        return;
      }
      attachmentUrl = uploadResult.fileUrl;
    }

    const { error } = await supabase
      .from('payment_requests')
      .update({
        description: editData.description,
        amount: parseInt(editData.amount) || 0,
        request_date: editData.request_date,
        bank_name: editData.bank_name,
        bank_account_number: editData.bank_account_number,
        bank_account_name: editData.bank_account_name,
        attachment_url: attachmentUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editingRequest.id);

    if (!error) {
      await addPaymentLog(editingRequest.id, 'draft', 'draft', 'Data request diedit');
      fetchRequests();
      setShowEditModal(false);
      setEditingRequest(null);
    } else {
      alert('Gagal update: ' + error.message);
    }
    setEditUploading(false);
  };

  const handleSubmit = async (id: number) => {
    const { error } = await supabase
      .from('payment_requests')
      .update({ status: 'submitted', submitted_at: new Date().toISOString() })
      .eq('id', id);
    if (!error) {
      await addPaymentLog(id, 'draft', 'submitted', 'Diajukan ke finance');
      fetchRequests();
    } else alert('Gagal submit');
  };

  const openVerifyModal = (request: PaymentRequest) => {
    setSelectedRequest(request);
    setVerifyData({
      projectId: request.project_id || 0,
      newProjectCode: '',
      newProjectName: '',
      newProjectBudget: 0,
      debitAccountId: request.debit_account_id || 0,
      creditAccountId: request.credit_account_id || 0,
      paymentAccountId: request.payment_account_id || 0,
      ppn: request.ppn || 0,
      pph: request.pph || 0,
      total: request.amount,
    });
    setBudgetInfo(null);
    setShowVerifyModal(true);
  };

  const handleProjectChange = async (projectId: number) => {
    setVerifyData({ ...verifyData, projectId });
    if (projectId > 0 && selectedRequest) {
      const project = projects.find(p => p.id === projectId);
      if (project) {
        const budgetCheck = await checkProjectBudget(projectId, selectedRequest.amount);
        setBudgetInfo(budgetCheck);
      } else setBudgetInfo(null);
    } else setBudgetInfo(null);
  };

  const handleVerify = async () => {
    if (!selectedRequest) return;
    if (!verifyData.projectId) {
      alert('Pilih atau buat proyek terlebih dahulu');
      return;
    }
    if (!verifyData.debitAccountId || !verifyData.creditAccountId) {
      alert('Pilih akun debit dan kredit');
      return;
    }
    if (!verifyData.paymentAccountId) {
      alert('Pilih akun pembayaran (Bank/Kas)');
      return;
    }
    if (budgetInfo && !budgetInfo.sufficient && budgetInfo.budget !== 0) {
      alert('Budget tidak cukup. Tidak bisa verifikasi.');
      return;
    }

    const request = selectedRequest;
    const totalAmount = request.amount + verifyData.ppn - verifyData.pph;

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const project = projects.find(p => p.id === verifyData.projectId);
    const projectCode = project?.code || '';

    const basePattern = `${companyCode}/${year}/${month}` + (projectCode ? `/${projectCode}` : '');
    const voucherCode = await generateVoucherNumber(currentCompany!.id, basePattern);

    await updateProjectSpent(verifyData.projectId, request.amount);

    let journalId = null;
    try {
      journalId = await createAccrualJournal(
        currentCompany!.id,
        new Date().toISOString().split('T')[0],
        request.description,
        voucherCode,
        verifyData.debitAccountId,
        verifyData.creditAccountId,
        request.amount,
        verifyData.projectId
      );
    } catch (err) {
      alert('Gagal membuat jurnal: ' + (err as Error).message);
      return;
    }

    const { error } = await supabase
      .from('payment_requests')
      .update({
        status: 'verified',
        verified_by: user?.email,
        verified_at: new Date().toISOString(),
        project_id: verifyData.projectId,
        voucher_no: voucherCode,
        debit_account_id: verifyData.debitAccountId,
        credit_account_id: verifyData.creditAccountId,
        payment_account_id: verifyData.paymentAccountId,
        ppn: verifyData.ppn,
        pph: verifyData.pph,
        total_with_tax: totalAmount,
      })
      .eq('id', request.id);

    if (error) {
      alert('Gagal update: ' + error.message);
      return;
    }

    await addPaymentLog(request.id, request.status, 'verified', `Voucher: ${voucherCode}, Jurnal accrual: ${journalId}`);
    fetchRequests();
    setShowVerifyModal(false);
  };

  const handleApprove = async (id: number) => {
    const request = requests.find(r => r.id === id);
    if (!request) return;

    const bankAccountId = request.payment_account_id || request.credit_account_id;
    if (!bankAccountId) {
      alert('Akun pembayaran belum dipilih saat verifikasi');
      return;
    }

    let journalId = null;
    try {
      journalId = await createPaymentJournal(
        currentCompany!.id,
        new Date().toISOString().split('T')[0],
        request.description,
        request.voucher_no || '',
        request.credit_account_id,
        bankAccountId,
        request.total_with_tax || request.amount,
        request.project_id || undefined
      );
    } catch (err) {
      alert('Gagal membuat jurnal pembayaran: ' + (err as Error).message);
      return;
    }

    const { error } = await supabase
      .from('payment_requests')
      .update({ status: 'approved', approved_by: user?.email, approved_at: new Date().toISOString() })
      .eq('id', id);
    if (!error) {
      await addPaymentLog(id, request.status, 'approved', `Jurnal pembayaran: ${journalId}`);
      fetchRequests();
    } else alert('Gagal approve');
  };

  const filteredRequests = requests.filter(req => {
    const matchesSearch = req.request_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         req.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || req.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800',
      submitted: 'bg-blue-100 text-blue-800',
      verified: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
    };
    return badges[status] || 'bg-gray-100';
  };

  const getStatusIcon = (status: string) => {
    const icons: Record<string, any> = { draft: Clock, submitted: Send, verified: UserCheck, approved: CheckCircle, rejected: XCircle };
    return icons[status] || Clock;
  };

  const stats = {
    total: requests.length,
    draft: requests.filter(r => r.status === 'draft').length,
    submitted: requests.filter(r => r.status === 'submitted').length,
    verified: requests.filter(r => r.status === 'verified').length,
    approved: requests.filter(r => r.status === 'approved').length,
  };

  if (!currentCompany) return <div className="flex justify-center py-12">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-slide-in-up">
        <div>
          <h1 className="font-display text-3xl font-bold text-text">Payment Requests</h1>
          <p className="text-text-muted mt-1">Permintaan pembayaran dengan approval 3 tingkat + budget project</p>
          <p className="text-xs text-text-muted mt-1">Staff → Finance (Verifikasi & Pilih Akun) → Direktur (Approve & Bayar)</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium shadow-lg shadow-accent/30">
          <Plus className="w-5 h-5" /> Buat Request
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[{ label: 'Total', value: stats.total },{ label: 'Draft', value: stats.draft },{ label: 'Submitted', value: stats.submitted },{ label: 'Verified', value: stats.verified },{ label: 'Approved', value: stats.approved }].map((stat, idx) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }} className="bg-surface rounded-xl border border-border p-4">
            <p className="text-text-muted text-xs font-medium">{stat.label}</p>
            <p className="text-text text-2xl font-bold font-display mt-1">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      <div className="bg-surface rounded-xl border border-border p-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" /><input type="text" placeholder="Cari request..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg" /></div>
          <div className="flex gap-2 flex-wrap">{['all','draft','submitted','verified','approved'].map(s => (<button key={s} onClick={() => setFilterStatus(s)} className={`px-3 py-2 rounded-lg text-sm font-medium capitalize ${filterStatus === s ? 'bg-accent text-white' : 'border border-border hover:bg-background'}`}>{s === 'all' ? 'Semua' : s}</button>))}</div>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-background">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">No. Request</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Tanggal</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Deskripsi</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-text-muted uppercase">Jumlah</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-text-muted uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-text-muted uppercase">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8">Loading...</td></tr>
              ) : (
                filteredRequests.map((req, idx) => {
                  const Icon = getStatusIcon(req.status);
                  return (
                    <tr key={req.id} className="hover:bg-background">
                      <td className="px-6 py-4 text-sm font-mono">{req.request_number}</td>
                      <td className="px-6 py-4 text-sm">{req.request_date}</td>
                      <td className="px-6 py-4 text-sm">{req.description}</td>
                      <td className="px-6 py-4 text-right font-mono font-semibold">{formatCurrency(req.amount)}</td>
                      <td className="px-6 py-4 text-center"><span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${getStatusBadge(req.status)}`}><Icon className="w-3 h-3" />{req.status}</span></td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => { setSelectedRequest(req); setShowDetailModal(true); }} className="p-1 text-blue-600"><Eye className="w-4 h-4" /></button>
                          {req.status === 'draft' && (
                            <>
                              <button onClick={() => openEditModal(req)} className="p-1 text-indigo-600"><Edit className="w-4 h-4" /></button>
                              <button onClick={() => handleSubmit(req.id)} className="p-1 text-green-600"><Send className="w-4 h-4" /></button>
                            </>
                          )}
                          {req.status === 'submitted' && <button onClick={() => openVerifyModal(req)} className="p-1 text-yellow-600"><UserCheck className="w-4 h-4" /></button>}
                          {req.status === 'verified' && <button onClick={() => handleApprove(req.id)} className="p-1 text-red-600"><Award className="w-4 h-4" /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Tambah Request */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl p-6 w-full max-w-md">
            <h2 className="font-display text-xl font-bold mb-4">Buat Payment Request</h2>
            <div className="space-y-4">
              <textarea placeholder="Deskripsi *" rows={3} value={newRequest.description} onChange={e => setNewRequest({...newRequest, description: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
              <input type="text" placeholder="Jumlah (Rp) *" value={newRequest.amount} onChange={e => { const raw = e.target.value.replace(/\./g, ''); if (/^\d*$/.test(raw)) setNewRequest({...newRequest, amount: raw}); }} className="w-full px-4 py-2 border rounded-lg" />
              <input type="text" placeholder="Nama Bank" value={newRequest.bank_name} onChange={e => setNewRequest({...newRequest, bank_name: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
              <input type="text" placeholder="Nomor Rekening" value={newRequest.bank_account_number} onChange={e => setNewRequest({...newRequest, bank_account_number: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
              <input type="text" placeholder="Atas Nama" value={newRequest.bank_account_name} onChange={e => setNewRequest({...newRequest, bank_account_name: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
              <input type="date" value={newRequest.request_date} onChange={e => setNewRequest({...newRequest, request_date: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
              <div><label className="block text-sm font-medium mb-1">Upload Bukti (Invoice/Nota) *</label><input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setAttachmentFile(e.target.files?.[0] || null)} className="w-full" /></div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 border rounded-lg">Batal</button>
              <button onClick={handleAddRequest} disabled={uploading} className="px-4 py-2 bg-accent text-white rounded-lg">{uploading ? 'Uploading...' : 'Simpan Draft'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Edit untuk Draft */}
      {showEditModal && editingRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl p-6 w-full max-w-md">
            <h2 className="font-display text-xl font-bold mb-4">Edit Payment Request</h2>
            <div className="space-y-4">
              <textarea placeholder="Deskripsi *" rows={3} value={editData.description} onChange={e => setEditData({...editData, description: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
              <input type="text" placeholder="Jumlah (Rp) *" value={editData.amount} onChange={e => { const raw = e.target.value.replace(/\./g, ''); if (/^\d*$/.test(raw)) setEditData({...editData, amount: raw}); }} className="w-full px-4 py-2 border rounded-lg" />
              <input type="text" placeholder="Nama Bank" value={editData.bank_name} onChange={e => setEditData({...editData, bank_name: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
              <input type="text" placeholder="Nomor Rekening" value={editData.bank_account_number} onChange={e => setEditData({...editData, bank_account_number: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
              <input type="text" placeholder="Atas Nama" value={editData.bank_account_name} onChange={e => setEditData({...editData, bank_account_name: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
              <input type="date" value={editData.request_date} onChange={e => setEditData({...editData, request_date: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
              <div>
                <label className="block text-sm font-medium mb-1">Upload Bukti Baru (opsional)</label>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setEditAttachmentFile(e.target.files?.[0] || null)} className="w-full" />
                {editingRequest.attachment_url && (
                  <p className="text-xs text-text-muted mt-1">Bukti saat ini: <a href={editingRequest.attachment_url} target="_blank" className="text-blue-600">Lihat</a></p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowEditModal(false)} className="px-4 py-2 border rounded-lg">Batal</button>
              <button onClick={handleEditRequest} disabled={editUploading} className="px-4 py-2 bg-accent text-white rounded-lg">
                {editUploading ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Verifikasi */}
      {showVerifyModal && selectedRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-auto">
          <div className="bg-surface rounded-xl p-6 w-full max-w-2xl my-8">
            <h2 className="font-display text-xl font-bold mb-4">Verifikasi Payment Request</h2>
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <p><strong>Deskripsi:</strong> {selectedRequest.description}</p>
                <p><strong>Jumlah:</strong> {formatCurrency(selectedRequest.amount)}</p>
                <a href={selectedRequest.attachment_url || '#'} target="_blank" className="text-blue-600 text-sm">Lihat Bukti</a>
              </div>
              <div>
                <label className="block font-medium">Pilih Proyek</label>
                <div className="flex gap-2">
                  <select value={verifyData.projectId} onChange={e => handleProjectChange(parseInt(e.target.value))} className="flex-1 px-4 py-2 border rounded-lg">
                    <option value={0}>-- Tidak Ada Proyek --</option>
                    {projects.map(p => (<option key={p.id} value={p.id}>{p.code} - {p.name} (Budget: {formatCurrency(p.budget)}, Sisa: {formatCurrency(p.budget - p.spent)})</option>))}
                  </select>
                  <button type="button" onClick={() => setShowNewProjectModal(true)} className="px-4 py-2 text-accent border border-accent rounded-lg hover:bg-accent/5">+ Baru</button>
                </div>
              </div>
              <div>
                <label className="block font-medium">Preview Voucher</label>
                <div className="flex items-center gap-2">
                  <input type="text" value={isGeneratingPreview ? 'Loading...' : voucherPreview} readOnly className="flex-1 px-4 py-2 border rounded-lg bg-gray-50 font-mono text-sm" />
                </div>
                <p className="text-xs text-text-muted mt-1">Voucher akan digenerate otomatis saat verifikasi</p>
              </div>
              <div>
                <label className="block font-medium">Akun Debit (Beban/Aset)</label>
                <select value={verifyData.debitAccountId} onChange={e => setVerifyData({...verifyData, debitAccountId: parseInt(e.target.value)})} className="w-full px-4 py-2 border rounded-lg">
                  <option value={0}>-- Pilih Akun --</option>
                  {coaList.filter(c => c.type === 'expense' || c.type === 'asset').map(acc => (<option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>))}
                </select>
              </div>
              <div>
                <label className="block font-medium">Akun Kredit (Hutang)</label>
                <select value={verifyData.creditAccountId} onChange={e => setVerifyData({...verifyData, creditAccountId: parseInt(e.target.value)})} className="w-full px-4 py-2 border rounded-lg">
                  <option value={0}>-- Pilih Akun --</option>
                  {coaList.filter(c => c.type === 'liability').map(acc => (<option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>))}
                </select>
              </div>
              <div>
                <label className="block font-medium">Akun Pembayaran (Bank/Kas) *</label>
                <select value={verifyData.paymentAccountId} onChange={e => setVerifyData({...verifyData, paymentAccountId: parseInt(e.target.value)})} className="w-full px-4 py-2 border rounded-lg">
                  <option value={0}>-- Pilih Akun --</option>
                  {bankAccounts.map(acc => (<option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>))}
                </select>
                <p className="text-xs text-text-muted mt-1">Akun ini akan digunakan saat pembayaran nanti (Debit Utang, Kredit Bank/Kas)</p>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div><label>PPN (Rp)</label><input type="number" value={verifyData.ppn} onChange={e => setVerifyData({...verifyData, ppn: parseInt(e.target.value) || 0, total: selectedRequest.amount + (parseInt(e.target.value) || 0) - verifyData.pph})} className="w-full px-4 py-2 border rounded-lg" /></div>
                <div><label>PPh 23 (Rp)</label><input type="number" value={verifyData.pph} onChange={e => setVerifyData({...verifyData, pph: parseInt(e.target.value) || 0, total: selectedRequest.amount + verifyData.ppn - (parseInt(e.target.value) || 0)})} className="w-full px-4 py-2 border rounded-lg" /></div>
                <div><label>Total</label><input type="text" value={formatCurrency(verifyData.total)} readOnly className="w-full px-4 py-2 border rounded-lg bg-gray-100" /></div>
              </div>
              {budgetInfo && (<div className={`p-3 rounded-lg ${budgetInfo.sufficient ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{budgetInfo.message}</div>)}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowVerifyModal(false)} className="px-4 py-2 border rounded-lg">Batal</button>
              <button onClick={handleVerify} disabled={!budgetInfo?.sufficient && budgetInfo !== null} className="px-4 py-2 bg-accent text-white rounded-lg">Verifikasi & Buat Jurnal</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detail */}
      {showDetailModal && selectedRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl p-6 w-full max-w-lg">
            <div className="flex justify-between"><h2 className="font-display text-xl font-bold">Detail Request</h2><button onClick={() => setShowDetailModal(false)}>✕</button></div>
            <div className="space-y-2 mt-4">
              <p><strong>No:</strong> {selectedRequest.request_number}</p>
              <p><strong>Tanggal:</strong> {selectedRequest.request_date}</p>
              <p><strong>Deskripsi:</strong> {selectedRequest.description}</p>
              <p><strong>Jumlah:</strong> {formatCurrency(selectedRequest.amount)}</p>
              {selectedRequest.bank_name && <p><strong>Bank:</strong> {selectedRequest.bank_name} - {selectedRequest.bank_account_number} a.n. {selectedRequest.bank_account_name}</p>}
              <p><strong>Status:</strong> {selectedRequest.status}</p>
              {selectedRequest.voucher_no && <p><strong>Voucher:</strong> {selectedRequest.voucher_no}</p>}
              {selectedRequest.attachment_url && <p><strong>Bukti:</strong> <a href={selectedRequest.attachment_url} target="_blank" className="text-blue-600">Lihat</a></p>}
            </div>
            {selectedRequest && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-sm font-medium text-text mb-2">📎 Dokumen Terkait</p>
                <button onClick={() => navigate(`/documents?ref=payment_request&id=${selectedRequest.id}`)} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                  <FileText className="w-4 h-4" />
                  Lihat dokumen untuk Payment Request ini
                </button>
              </div>
            )}
            <div className="flex justify-end mt-6">
              <button onClick={() => setShowDetailModal(false)} className="px-4 py-2 border border-border rounded-lg">Tutup</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Buat Proyek Baru */}
      {showNewProjectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl p-6 w-full max-w-md">
            <h2 className="font-display text-xl font-bold text-text mb-4">Tambah Proyek Baru</h2>
            <div className="space-y-3">
              <input type="text" placeholder="Kode Proyek *" value={newProject.code} onChange={e => setNewProject({...newProject, code: e.target.value.toUpperCase()})} className="w-full px-4 py-2 border border-border rounded-lg" />
              <input type="text" placeholder="Nama Proyek *" value={newProject.name} onChange={e => setNewProject({...newProject, name: e.target.value})} className="w-full px-4 py-2 border border-border rounded-lg" />
              <input type="number" placeholder="Anggaran" value={newProject.budget || ''} onChange={e => setNewProject({...newProject, budget: parseInt(e.target.value) || 0})} className="w-full px-4 py-2 border border-border rounded-lg" />
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowNewProjectModal(false)} className="px-4 py-2 border border-border rounded-lg">Batal</button>
              <button onClick={handleCreateProject} className="px-4 py-2 bg-accent text-white rounded-lg">Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
