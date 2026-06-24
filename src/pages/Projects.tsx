import { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, AlertTriangle, CheckCircle, Eye } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useCompany } from '../contexts/CompanyContext';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../lib/accountingHelpers';

type Project = {
  id: number;
  company_id: number;
  code: string;
  name: string;
  budget: number;
  spent: number;
  start_date: string;
  end_date: string;
  status: string;
};

type ProjectTransaction = {
  id: number;
  date: string;
  type: string;
  description: string;
  amount: number;
  status: string;
  reference: string;
  source: string;
};

export default function Projects() {
  const { currentCompany } = useCompany();
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    budget: 0,
    start_date: '',
    end_date: '',
  });

  // ============================================
  // STATE UNTUK MODAL TRANSAKSI PROYEK
  // ============================================
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectTransactions, setProjectTransactions] = useState<ProjectTransaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState(false);

  useEffect(() => {
    if (currentCompany?.id) {
      fetchProjects();
    }
  }, [currentCompany]);

  const fetchProjects = async () => {
    if (!currentCompany?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('company_id', currentCompany.id)
      .order('created_at', { ascending: false });
    setProjects(data || []);
    setLoading(false);
  };

  // ============================================
  // FETCH TRANSAKSI PER PROYEK
  // ============================================
  const fetchProjectTransactions = async (projectId: number) => {
    setLoadingTransactions(true);
    setProjectTransactions([]);

    try {
      // 1. Dari invoices (AR)
      const { data: invoices } = await supabase
        .from('invoices')
        .select('id, invoice_number, invoice_date, customer_name, total, status, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      // 2. Dari vendor_invoices (AP)
      const { data: vendorInvoices } = await supabase
        .from('vendor_invoices')
        .select('id, invoice_number, invoice_date, vendor_name, total, status, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      // 3. Dari payment_requests
      const { data: paymentRequests } = await supabase
        .from('payment_requests')
        .select('id, request_number, request_date, description, amount, status, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      // 4. Dari journals (jurnal umum)
      const { data: journals } = await supabase
        .from('journals')
        .select('id, journal_number, journal_date, description, status, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      // Gabungkan semua data dengan format seragam
      const allTransactions: ProjectTransaction[] = [];

      (invoices || []).forEach((inv) => {
        allTransactions.push({
          id: inv.id,
          date: inv.invoice_date,
          type: 'Invoice (AR)',
          description: `Invoice ${inv.invoice_number} - ${inv.customer_name}`,
          amount: inv.total,
          status: inv.status,
          reference: inv.invoice_number,
          source: 'invoices',
        });
      });

      (vendorInvoices || []).forEach((inv) => {
        allTransactions.push({
          id: inv.id,
          date: inv.invoice_date,
          type: 'Vendor Invoice (AP)',
          description: `AP ${inv.invoice_number} - ${inv.vendor_name}`,
          amount: inv.total,
          status: inv.status,
          reference: inv.invoice_number,
          source: 'vendor_invoices',
        });
      });

      (paymentRequests || []).forEach((pr) => {
        allTransactions.push({
          id: pr.id,
          date: pr.request_date,
          type: 'Payment Request',
          description: pr.description,
          amount: pr.amount,
          status: pr.status,
          reference: pr.request_number,
          source: 'payment_requests',
        });
      });

      (journals || []).forEach((j) => {
        allTransactions.push({
          id: j.id,
          date: j.journal_date,
          type: 'Jurnal Umum',
          description: j.description,
          amount: 0,
          status: j.status,
          reference: j.journal_number,
          source: 'journals',
        });
      });

      // Sort by date descending
      allTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setProjectTransactions(allTransactions);
    } catch (error) {
      console.error('Error fetching project transactions:', error);
    } finally {
      setLoadingTransactions(false);
    }
  };

  // ============================================
  // HANDLER KLIK PROYEK
  // ============================================
  const handleProjectClick = async (project: Project) => {
    setSelectedProject(project);
    await fetchProjectTransactions(project.id);
    setShowTransactionModal(true);
  };

  // ============================================
  // CRUD FUNCTIONS
  // ============================================
  const handleSave = async () => {
    if (!formData.code || !formData.name) {
      alert('Kode dan nama proyek wajib diisi');
      return;
    }
    if (!currentCompany?.id) return;

    if (editingProject) {
      const { error } = await supabase
        .from('projects')
        .update({
          code: formData.code,
          name: formData.name,
          budget: formData.budget,
          start_date: formData.start_date || null,
          end_date: formData.end_date || null,
        })
        .eq('id', editingProject.id);
      if (error) {
        alert('Gagal update: ' + error.message);
      } else {
        fetchProjects();
        setShowModal(false);
        setEditingProject(null);
        resetForm();
      }
    } else {
      const { error } = await supabase
        .from('projects')
        .insert([
          {
            company_id: currentCompany.id,
            code: formData.code,
            name: formData.name,
            budget: formData.budget,
            spent: 0,
            start_date: formData.start_date || null,
            end_date: formData.end_date || null,
            status: 'active',
          },
        ]);
      if (error) {
        alert('Gagal simpan: ' + error.message);
      } else {
        fetchProjects();
        setShowModal(false);
        resetForm();
      }
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Yakin ingin menghapus proyek ini?')) {
      const { error } = await supabase.from('projects').delete().eq('id', id);
      if (error) alert('Gagal hapus: ' + error.message);
      else fetchProjects();
    }
  };

  const resetForm = () => {
    setFormData({ code: '', name: '', budget: 0, start_date: '', end_date: '' });
    setEditingProject(null);
  };

  const openEdit = (project: Project) => {
    setEditingProject(project);
    setFormData({
      code: project.code,
      name: project.name,
      budget: project.budget,
      start_date: project.start_date || '',
      end_date: project.end_date || '',
    });
    setShowModal(true);
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      paid: 'bg-green-100 text-green-800',
      approved: 'bg-green-100 text-green-800',
      verified: 'bg-yellow-100 text-yellow-800',
      submitted: 'bg-blue-100 text-blue-800',
      draft: 'bg-gray-100 text-gray-800',
      partial: 'bg-orange-100 text-orange-800',
      pending: 'bg-yellow-100 text-yellow-800',
      rejected: 'bg-red-100 text-red-800',
      cancelled: 'bg-red-100 text-red-800',
      posted: 'bg-green-100 text-green-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const formatDate = (date: string) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const filteredProjects = projects.filter((p) =>
    p.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = {
    total: projects.length,
    totalBudget: projects.reduce((s, p) => s + p.budget, 0),
    totalSpent: projects.reduce((s, p) => s + p.spent, 0),
    active: projects.filter((p) => p.status === 'active').length,
  };

  if (!currentCompany) return <div className="flex justify-center py-12">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-slide-in-up">
        <div>
          <h1 className="font-display text-3xl font-bold text-text">Manajemen Proyek</h1>
          <p className="text-text-muted mt-1">Kelola proyek dan pantau budget vs realisasi</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium shadow-lg shadow-accent/30"
        >
          <Plus className="w-5 h-5" /> Tambah Proyek
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface rounded-xl border border-border p-4">
          <p className="text-text-muted text-xs">Total Proyek</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-surface rounded-xl border border-border p-4">
          <p className="text-text-muted text-xs">Total Anggaran</p>
          <p className="text-2xl font-bold text-success">{formatCurrency(stats.totalBudget)}</p>
        </div>
        <div className="bg-surface rounded-xl border border-border p-4">
          <p className="text-text-muted text-xs">Total Realisasi</p>
          <p className="text-2xl font-bold text-info">{formatCurrency(stats.totalSpent)}</p>
        </div>
        <div className="bg-surface rounded-xl border border-border p-4">
          <p className="text-text-muted text-xs">Proyek Aktif</p>
          <p className="text-2xl font-bold">{stats.active}</p>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-border p-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
          <input
            type="text"
            placeholder="Cari proyek..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      </div>

      {/* ============================================ */}
      {/* LIST PROYEK - Klik untuk lihat transaksi */}
      {/* ============================================ */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="text-center py-12">Loading...</div>
        ) : (
          <div className="divide-y divide-border">
            {filteredProjects.map((project) => {
              const percentage = project.budget > 0 ? (project.spent / project.budget) * 100 : 0;
              const isOverBudget = project.spent > project.budget;
              return (
                <div
                  key={project.id}
                  onClick={() => handleProjectClick(project)}
                  className="p-6 hover:bg-background transition-colors cursor-pointer group"
                >
                  <div className="flex items-start justify-between flex-wrap gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 flex-wrap mb-2">
                        <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-accent/10 text-accent">
                          {project.code}
                        </span>
                        <h3 className="font-display text-lg font-bold text-text">{project.name}</h3>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs ${
                            project.status === 'active'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {project.status}
                        </span>
                        {isOverBudget && (
                          <span className="flex items-center gap-1 text-danger text-xs">
                            <AlertTriangle className="w-3 h-3" />
                            Over Budget
                          </span>
                        )}
                        <span className="text-xs text-text-muted flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          Klik untuk lihat transaksi
                        </span>
                      </div>
                      <div className="space-y-2 max-w-md">
                        <div className="flex justify-between text-sm">
                          <span>Realisasi</span>
                          <span className="font-mono">
                            {formatCurrency(project.spent)} / {formatCurrency(project.budget)}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                          <div
                            className={`h-2.5 rounded-full ${getProgressColor(percentage)}`}
                            style={{ width: `${Math.min(percentage, 100)}%` }}
                          ></div>
                        </div>
                        <div className="flex justify-between text-xs text-text-muted">
                          <span>Sisa: {formatCurrency(project.budget - project.spent)}</span>
                          <span>{percentage.toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(project);
                        }}
                        className="p-2 text-text-muted hover:text-info hover:bg-info/10 rounded-lg"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(project.id);
                        }}
                        className="p-2 text-text-muted hover:text-danger hover:bg-danger/10 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredProjects.length === 0 && (
              <div className="text-center py-12 text-text-muted">Belum ada proyek</div>
            )}
          </div>
        )}
      </div>

      {/* ============================================ */}
      {/* MODAL TAMBAH / EDIT PROYEK */}
      {/* ============================================ */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl p-6 w-full max-w-md">
            <h2 className="font-display text-xl font-bold text-text mb-4">
              {editingProject ? 'Edit Proyek' : 'Tambah Proyek Baru'}
            </h2>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Kode Proyek *"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <input
                type="text"
                placeholder="Nama Proyek *"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <input
                type="number"
                placeholder="Anggaran (Rp)"
                value={formData.budget || ''}
                onChange={(e) => setFormData({ ...formData, budget: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  placeholder="Mulai"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className="px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <input
                  type="date"
                  placeholder="Selesai"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  className="px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="px-4 py-2 border border-border rounded-lg hover:bg-background"
              >
                Batal
              </button>
              <button onClick={handleSave} className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover">
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* MODAL TRANSAKSI PROYEK */}
      {/* ============================================ */}
      {showTransactionModal && selectedProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl w-full max-w-4xl max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div>
                <h2 className="font-display text-xl font-bold text-text">
                  Transaksi - {selectedProject.name}
                </h2>
                <p className="text-sm text-text-muted">
                  Kode: {selectedProject.code} • Total {projectTransactions.length} transaksi
                </p>
              </div>
              <button
                onClick={() => setShowTransactionModal(false)}
                className="p-2 hover:bg-background rounded-lg text-text-muted hover:text-text"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {loadingTransactions ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
                </div>
              ) : projectTransactions.length === 0 ? (
                <div className="text-center py-12 text-text-muted">
                  <p>Belum ada transaksi untuk proyek ini</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-background">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-text-muted uppercase">
                          Tanggal
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-text-muted uppercase">
                          Tipe
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-text-muted uppercase">
                          Deskripsi
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-text-muted uppercase">
                          Jumlah
                        </th>
                        <th className="px-4 py-2 text-center text-xs font-semibold text-text-muted uppercase">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {projectTransactions.map((t, idx) => (
                        <tr key={idx} className="hover:bg-background transition-colors">
                          <td className="px-4 py-3 text-sm whitespace-nowrap">{formatDate(t.date)}</td>
                          <td className="px-4 py-3 text-sm">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                                t.type.includes('AR')
                                  ? 'bg-green-100 text-green-800'
                                  : t.type.includes('AP')
                                  ? 'bg-red-100 text-red-800'
                                  : t.type.includes('Payment')
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {t.type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm">{t.description}</td>
                          <td className="px-4 py-3 text-right font-mono font-semibold">
                            {t.amount > 0 ? formatCurrency(t.amount) : '-'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                                t.status
                              )}`}
                            >
                              {t.status || '-'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-border flex justify-end">
              <button
                onClick={() => setShowTransactionModal(false)}
                className="px-4 py-2 border border-border rounded-lg hover:bg-background"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
