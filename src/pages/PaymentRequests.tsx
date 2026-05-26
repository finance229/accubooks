import { useState, useEffect } from 'react';
import { Plus, Search, Eye, CheckCircle, XCircle, Clock, AlertCircle, Send, UserCheck, Award } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';

type PaymentRequest = {
  id: number;
  request_number: string;
  request_date: string;
  requester: string;
  project: string;
  description: string;
  amount: number;
  status: 'draft' | 'submitted' | 'verified' | 'approved' | 'rejected';
  submitted_at: string | null;
  verified_by: string | null;
  verified_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
};

export default function PaymentRequests() {
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<PaymentRequest | null>(null);
  const [newRequest, setNewRequest] = useState({
    requester: '',
    project: '',
    description: '',
    amount: 0,
    request_date: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('payment_requests')
      .select('*')
      .eq('company_id', 1)
      .order('created_at', { ascending: false });
    
    setRequests(data || []);
    setLoading(false);
  };

  const handleAddRequest = async () => {
    if (!newRequest.requester || !newRequest.description || newRequest.amount <= 0) return;

    const year = new Date().getFullYear();
    const count = requests.length + 1;
    const requestNumber = `PR/${year}/${String(count).padStart(4, '0')}`;

    const { data, error } = await supabase
      .from('payment_requests')
      .insert([{
        company_id: 1,
        request_number: requestNumber,
        request_date: newRequest.request_date,
        requester: newRequest.requester,
        project: newRequest.project,
        description: newRequest.description,
        amount: newRequest.amount,
        status: 'draft',
      }])
      .select();

    if (!error && data) {
      setRequests([data[0], ...requests]);
      setShowAddModal(false);
      setNewRequest({ requester: '', project: '', description: '', amount: 0, request_date: new Date().toISOString().split('T')[0] });
    }
  };

  const handleUpdateStatus = async (id: number, newStatus: 'submitted' | 'verified' | 'approved' | 'rejected') => {
    const updates: any = { status: newStatus };
    
    if (newStatus === 'submitted') {
      updates.submitted_at = new Date().toISOString();
    } else if (newStatus === 'verified') {
      updates.verified_by = 'Finance Team';
      updates.verified_at = new Date().toISOString();
    } else if (newStatus === 'approved') {
      updates.approved_by = 'Director';
      updates.approved_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('payment_requests')
      .update(updates)
      .eq('id', id);

    if (!error) {
      fetchRequests();
      if (selectedRequest?.id === id) {
        setSelectedRequest({ ...selectedRequest, ...updates });
      }
    }
  };

  const filteredRequests = requests.filter(req => {
    const matchesSearch = 
      req.request_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.requester.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || req.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800',
      submitted: 'bg-blue-100 text-blue-800',
      verified: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
    };
    return badges[status] || badges.draft;
  };

  const getStatusIcon = (status: string) => {
    const icons: Record<string, any> = {
      draft: Clock,
      submitted: Send,
      verified: UserCheck,
      approved: CheckCircle,
      rejected: XCircle,
    };
    return icons[status] || Clock;
  };

  const getNextAction = (status: string) => {
    const actions: Record<string, { label: string; nextStatus: 'submitted' | 'verified' | 'approved' }> = {
      draft: { label: 'Submit ke Finance', nextStatus: 'submitted' },
      submitted: { label: 'Verifikasi', nextStatus: 'verified' },
      verified: { label: 'Approve', nextStatus: 'approved' },
    };
    return actions[status];
  };

  const stats = {
    total: requests.length,
    draft: requests.filter(r => r.status === 'draft').length,
    submitted: requests.filter(r => r.status === 'submitted').length,
    verified: requests.filter(r => r.status === 'verified').length,
    approved: requests.filter(r => r.status === 'approved').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-slide-in-up">
        <div>
          <h1 className="font-display text-3xl font-bold text-text">Payment Requests</h1>
          <p className="text-text-muted mt-1">Permintaan pembayaran dengan approval 3 tingkat</p>
          <p className="text-xs text-text-muted mt-1">Staff → Finance → Director</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors shadow-lg shadow-accent/30">
          <Plus className="w-5 h-5" strokeWidth={2} />
          Buat Request
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total', value: stats.total, color: 'blue' },
          { label: 'Draft', value: stats.draft, color: 'gray' },
          { label: 'Submitted', value: stats.submitted, color: 'blue' },
          { label: 'Verified', value: stats.verified, color: 'yellow' },
          { label: 'Approved', value: stats.approved, color: 'green' },
        ].map((stat, idx) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }} className="bg-surface rounded-xl border border-border p-4">
            <p className="text-text-muted text-xs font-medium">{stat.label}</p>
            <p className="text-text text-2xl font-bold font-display mt-1">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-surface rounded-xl border border-border p-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
            <input type="text" placeholder="Cari nomor request, requester, atau deskripsi..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent" />
          </div>
          <div className="flex gap-2 flex-wrap">
            {['all', 'draft', 'submitted', 'verified', 'approved'].map((status) => (
              <button key={status} onClick={() => setFilterStatus(status)} className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${filterStatus === status ? 'bg-accent text-white shadow-lg shadow-accent/30' : 'border border-border hover:bg-background'}`}>
                {status === 'all' ? 'Semua' : status}
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-background">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">No. Request</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Tanggal</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Requester</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Project</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Deskripsi</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-text-muted uppercase">Amount</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-text-muted uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-text-muted uppercase">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={8} className="text-center py-8">Loading...</td></tr>
              ) : (
                filteredRequests.map((request, index) => {
                  const StatusIcon = getStatusIcon(request.status);
                  const nextAction = getNextAction(request.status);
                  return (
                    <motion.tr key={request.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * 0.05 }} className="hover:bg-background transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap"><span className="text-xs font-mono font-semibold text-text">{request.request_number}</span></td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-text">{request.request_date}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-text">{request.requester}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-text">{request.project || '-'}</td>
                      <td className="px-6 py-4 text-sm text-text max-w-xs truncate">{request.description}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-mono font-semibold text-text">{formatCurrency(request.amount)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-2">
                          <StatusIcon className="w-4 h-4" />
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${getStatusBadge(request.status)}`}>{request.status}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => { setSelectedRequest(request); setShowDetailModal(true); }} className="p-2 text-text-muted hover:text-info hover:bg-info/10 rounded-lg transition-colors"><Eye className="w-4 h-4" /></button>
                          {nextAction && request.status !== 'approved' && request.status !== 'rejected' && (
                            <button onClick={() => handleUpdateStatus(request.id, nextAction.nextStatus)} className="p-2 text-text-muted hover:text-success hover:bg-success/10 rounded-lg transition-colors"><Send className="w-4 h-4" /></button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl p-6 w-full max-w-md">
            <h2 className="font-display text-xl font-bold text-text mb-4">Buat Payment Request</h2>
            <div className="space-y-4">
              <input type="text" placeholder="Nama Requester *" value={newRequest.requester} onChange={(e) => setNewRequest({ ...newRequest, requester: e.target.value })} className="w-full px-4 py-2 border border-border rounded-lg" />
              <input type="text" placeholder="Project" value={newRequest.project} onChange={(e) => setNewRequest({ ...newRequest, project: e.target.value })} className="w-full px-4 py-2 border border-border rounded-lg" />
              <textarea placeholder="Deskripsi *" value={newRequest.description} onChange={(e) => setNewRequest({ ...newRequest, description: e.target.value })} className="w-full px-4 py-2 border border-border rounded-lg resize-none" rows={3} />
              <input type="number" placeholder="Jumlah (Rp) *" value={newRequest.amount || ''} onChange={(e) => setNewRequest({ ...newRequest, amount: parseInt(e.target.value) || 0 })} className="w-full px-4 py-2 border border-border rounded-lg" />
              <input type="date" value={newRequest.request_date} onChange={(e) => setNewRequest({ ...newRequest, request_date: e.target.value })} className="w-full px-4 py-2 border border-border rounded-lg" />
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 border border-border rounded-lg">Batal</button>
              <button onClick={handleAddRequest} className="px-4 py-2 bg-accent text-white rounded-lg">Simpan</button>
            </div>
          </div>
        </div>
      )}

      {showDetailModal && selectedRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl p-6 w-full max-w-lg">
            <div className="flex justify-between items-start mb-4">
              <div><h2 className="font-display text-xl font-bold text-text">{selectedRequest.request_number}</h2><p className="text-sm text-text-muted">{selectedRequest.request_date}</p></div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusBadge(selectedRequest.status)}`}>{selectedRequest.status}</span>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b"><span className="text-text-muted">Requester</span><span className="font-semibold">{selectedRequest.requester}</span></div>
              <div className="flex justify-between py-2 border-b"><span className="text-text-muted">Project</span><span>{selectedRequest.project || '-'}</span></div>
              <div className="py-2 border-b"><span className="text-text-muted block mb-1">Deskripsi</span><p className="text-text">{selectedRequest.description}</p></div>
              <div className="flex justify-between py-2 border-b"><span className="text-text-muted">Jumlah</span><span className="font-bold text-lg text-accent">{formatCurrency(selectedRequest.amount)}</span></div>
              {selectedRequest.submitted_at && <div className="flex justify-between py-2 border-b"><span className="text-text-muted">Submitted</span><span>{formatDate(selectedRequest.submitted_at)}</span></div>}
              {selectedRequest.verified_at && <div className="flex justify-between py-2 border-b"><span className="text-text-muted">Verified by</span><span>{selectedRequest.verified_by} ({formatDate(selectedRequest.verified_at)})</span></div>}
              {selectedRequest.approved_at && <div className="flex justify-between py-2 border-b"><span className="text-text-muted">Approved by</span><span>{selectedRequest.approved_by} ({formatDate(selectedRequest.approved_at)})</span></div>}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowDetailModal(false)} className="px-4 py-2 border border-border rounded-lg">Tutup</button>
              {selectedRequest.status === 'draft' && <button onClick={() => handleUpdateStatus(selectedRequest.id, 'submitted')} className="px-4 py-2 bg-accent text-white rounded-lg">Submit ke Finance</button>}
              {selectedRequest.status === 'submitted' && <button onClick={() => handleUpdateStatus(selectedRequest.id, 'verified')} className="px-4 py-2 bg-yellow-500 text-white rounded-lg">Verifikasi</button>}
              {selectedRequest.status === 'verified' && <button onClick={() => handleUpdateStatus(selectedRequest.id, 'approved')} className="px-4 py-2 bg-green-500 text-white rounded-lg">Approve</button>}
            </div>
          </div>
        </div>
      )}

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="bg-info/10 border border-info/30 rounded-xl p-6">
        <h3 className="font-semibold text-text mb-3">📋 Alur Approval Payment Request:</h3>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2"><div className="w-8 h-8 rounded-full bg-gray-500 flex items-center justify-center text-white font-bold text-sm">1</div><span className="text-sm text-text">Staff: Create & Submit</span></div>
          <span className="text-text-muted">→</span>
          <div className="flex items-center gap-2"><div className="w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center text-white font-bold text-sm">2</div><span className="text-sm text-text">Finance: Verify & Check Budget</span></div>
          <span className="text-text-muted">→</span>
          <div className="flex items-center gap-2"><div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white font-bold text-sm">3</div><span className="text-sm text-text">Director: Approve/Reject</span></div>
        </div>
      </motion.div>
    </div>
  );
}
