import { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, AlertTriangle, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';

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

export default function Projects() {
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

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('company_id', 1)
      .order('created_at', { ascending: false });
    setProjects(data || []);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!formData.code || !formData.name) {
      alert('Kode dan nama proyek wajib diisi');
      return;
    }

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
        .insert([{
          company_id: 1,
          code: formData.code,
          name: formData.name,
          budget: formData.budget,
          spent: 0,
          start_date: formData.start_date || null,
          end_date: formData.end_date || null,
          status: 'active',
        }]);
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const filteredProjects = projects.filter(p =>
    p.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = {
    total: projects.length,
    totalBudget: projects.reduce((s, p) => s + p.budget, 0),
    totalSpent: projects.reduce((s, p) => s + p.spent, 0),
    active: projects.filter(p => p.status === 'active').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-slide-in-up">
        <div>
          <h1 className="font-display text-3xl font-bold text-text">Manajemen Proyek</h1>
          <p className="text-text-muted mt-1">Kelola proyek dan pantau budget vs realisasi</p>
        </div>
        <button onClick={() => { resetForm(); setShowModal(true); }} className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium shadow-lg shadow-accent/30">
          <Plus className="w-5 h-5" /> Tambah Proyek
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface rounded-xl border border-border p-4"><p className="text-text-muted text-xs">Total Proyek</p><p className="text-2xl font-bold">{stats.total}</p></div>
        <div className="bg-surface rounded-xl border border-border p-4"><p className="text-text-muted text-xs">Total Anggaran</p><p className="text-2xl font-bold text-success">{formatCurrency(stats.totalBudget)}</p></div>
        <div className="bg-surface rounded-xl border border-border p-4"><p className="text-text-muted text-xs">Total Realisasi</p><p className="text-2xl font-bold text-info">{formatCurrency(stats.totalSpent)}</p></div>
        <div className="bg-surface rounded-xl border border-border p-4"><p className="text-text-muted text-xs">Proyek Aktif</p><p className="text-2xl font-bold">{stats.active}</p></div>
      </div>

      <div className="bg-surface rounded-xl border border-border p-6">
        <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" /><input type="text" placeholder="Cari proyek..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg" /></div>
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        {loading ? <div className="text-center py-12">Loading...</div> : (
          <div className="divide-y divide-border">
            {filteredProjects.map((project) => {
              const percentage = project.budget > 0 ? (project.spent / project.budget) * 100 : 0;
              const isOverBudget = project.spent > project.budget;
              return (
                <div key={project.id} className="p-6 hover:bg-background transition-colors">
                  <div className="flex items-start justify-between flex-wrap gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 flex-wrap mb-2">
                        <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-accent/10 text-accent">{project.code}</span>
                        <h3 className="font-display text-lg font-bold text-text">{project.name}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${project.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{project.status}</span>
                        {isOverBudget && <span className="flex items-center gap-1 text-danger text-xs"><AlertTriangle className="w-3 h-3" />Over Budget</span>}
                      </div>
                      <div className="space-y-2 max-w-md">
                        <div className="flex justify-between text-sm"><span>Realisasi</span><span className="font-mono">{formatCurrency(project.spent)} / {formatCurrency(project.budget)}</span></div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5"><div className={`h-2.5 rounded-full ${getProgressColor(percentage)}`} style={{ width: `${Math.min(percentage, 100)}%` }}></div></div>
                        <div className="flex justify-between text-xs text-text-muted"><span>Sisa: {formatCurrency(project.budget - project.spent)}</span><span>{percentage.toFixed(1)}%</span></div>
                      </div>
                    </div>
                    <div className="flex gap-2"><button onClick={() => openEdit(project)} className="p-2 text-text-muted hover:text-info hover:bg-info/10 rounded-lg"><Edit2 className="w-4 h-4" /></button><button onClick={() => handleDelete(project.id)} className="p-2 text-text-muted hover:text-danger hover:bg-danger/10 rounded-lg"><Trash2 className="w-4 h-4" /></button></div>
                  </div>
                </div>
              );
            })}
            {filteredProjects.length === 0 && <div className="text-center py-12 text-text-muted">Belum ada proyek</div>}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl p-6 w-full max-w-md">
            <h2 className="font-display text-xl font-bold text-text mb-4">{editingProject ? 'Edit Proyek' : 'Tambah Proyek Baru'}</h2>
            <div className="space-y-4">
              <input type="text" placeholder="Kode Proyek *" value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })} className="w-full px-4 py-2 border border-border rounded-lg" />
              <input type="text" placeholder="Nama Proyek *" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-4 py-2 border border-border rounded-lg" />
              <input type="number" placeholder="Anggaran (Rp)" value={formData.budget || ''} onChange={(e) => setFormData({ ...formData, budget: parseInt(e.target.value) || 0 })} className="w-full px-4 py-2 border border-border rounded-lg" />
              <div className="grid grid-cols-2 gap-2"><input type="date" placeholder="Mulai" value={formData.start_date} onChange={(e) => setFormData({ ...formData, start_date: e.target.value })} className="px-4 py-2 border border-border rounded-lg" /><input type="date" placeholder="Selesai" value={formData.end_date} onChange={(e) => setFormData({ ...formData, end_date: e.target.value })} className="px-4 py-2 border border-border rounded-lg" /></div>
            </div>
            <div className="flex justify-end gap-3 mt-6"><button onClick={() => { setShowModal(false); resetForm(); }} className="px-4 py-2 border border-border rounded-lg">Batal</button><button onClick={handleSave} className="px-4 py-2 bg-accent text-white rounded-lg">Simpan</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
