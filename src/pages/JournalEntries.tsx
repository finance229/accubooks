import { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, CheckCircle, XCircle, Eye, Send, Undo2, Upload, CheckSquare } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useCompany } from '../contexts/CompanyContext';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../lib/accountingHelpers';
import ImportJournalModal from '../components/ImportJournalModal';

type JournalLine = {
  id?: number;
  coa_id: number;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
};

type Journal = {
  id: number;
  journal_number: string;
  journal_date: string;
  description: string;
  project_id: number | null;
  status: 'draft' | 'posted';
  posted_by: string | null;
  posted_at: string | null;
  lines: JournalLine[];
};

export default function JournalEntries() {
  const { currentCompany } = useCompany();
  const { user } = useAuth();
  const [journals, setJournals] = useState<Journal[]>([]);
  const [coaList, setCoaList] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedJournal, setSelectedJournal] = useState<Journal | null>(null);
  const [editingJournal, setEditingJournal] = useState<Journal | null>(null);
  const [showUnpostModal, setShowUnpostModal] = useState(false);
  const [unpostReason, setUnpostReason] = useState('');
  const [unpostTargetId, setUnpostTargetId] = useState<number | null>(null);
  
  // STATE UNTUK IMPORT EXCEL
  const [showImportModal, setShowImportModal] = useState(false);
  const [postingAll, setPostingAll] = useState(false);
  
  const [newJournal, setNewJournal] = useState({
    journal_date: new Date().toISOString().split('T')[0],
    description: '',
    project_id: null as number | null,
    lines: [{ coa_id: 0, account_code: '', account_name: '', debit: 0, credit: 0 }] as JournalLine[],
  });

  useEffect(() => {
    if (currentCompany?.id) {
      fetchJournals();
      fetchCoa();
      fetchProjects();
    }
  }, [currentCompany]);

  const fetchJournals = async () => {
    if (!currentCompany?.id) return;
    setLoading(true);
    const { data: journalsData } = await supabase
      .from('journals')
      .select('*')
      .eq('company_id', currentCompany.id)
      .order('journal_date', { ascending: false });
    
    if (journalsData) {
      const journalsWithLines = await Promise.all(
        journalsData.map(async (journal) => {
          const { data: linesData } = await supabase
            .from('journal_lines')
            .select('*')
            .eq('journal_id', journal.id);
          return { ...journal, lines: linesData || [] };
        })
      );
      setJournals(journalsWithLines);
    }
    setLoading(false);
  };

  const fetchCoa = async () => {
    if (!currentCompany?.id) return;
    const { data } = await supabase
      .from('coa')
      .select('id, code, name')
      .eq('company_id', currentCompany.id)
      .eq('is_active', true);
    setCoaList(data || []);
  };

  const fetchProjects = async () => {
    if (!currentCompany?.id) return;
    const { data } = await supabase
      .from('projects')
      .select('id, code, name')
      .eq('company_id', currentCompany.id)
      .eq('status', 'active');
    setProjects(data || []);
  };

  // ============================================
  // POST ALL DRAFTS
  // ============================================
  const handlePostAllDrafts = async () => {
    if (!confirm('Posting semua jurnal yang berstatus DRAFT?')) return;
    
    setPostingAll(true);
    try {
      const { data: drafts } = await supabase
        .from('journals')
        .select('id')
        .eq('company_id', currentCompany!.id)
        .eq('status', 'draft');
      
      if (!drafts || drafts.length === 0) {
        alert('Tidak ada jurnal draft');
        setPostingAll(false);
        return;
      }

      const ids = drafts.map(d => d.id);
      const { error } = await supabase
        .from('journals')
        .update({ 
          status: 'posted', 
          posted_by: user?.email || 'system',
          posted_at: new Date().toISOString()
        })
        .in('id', ids);

      if (error) throw error;
      alert(`${ids.length} jurnal berhasil diposting`);
      fetchJournals();
    } catch (error: any) {
      alert('Gagal posting: ' + error.message);
    } finally {
      setPostingAll(false);
    }
  };

  const handleSaveJournal = async () => {
    if (!newJournal.description) {
      alert('Deskripsi jurnal wajib diisi');
      return;
    }
    if (newJournal.lines.length === 0) {
      alert('Minimal 1 baris jurnal');
      return;
    }
    if (!currentCompany?.id) return;

    const totalDebit = newJournal.lines.reduce((sum, line) => sum + (line.debit || 0), 0);
    const totalCredit = newJournal.lines.reduce((sum, line) => sum + (line.credit || 0), 0);
    
    if (totalDebit !== totalCredit) {
      alert(`Total Debit (${formatCurrency(totalDebit)}) harus sama dengan Total Kredit (${formatCurrency(totalCredit)})`);
      return;
    }

    const year = new Date().getFullYear();
    
    if (editingJournal) {
      const { error: journalError } = await supabase
        .from('journals')
        .update({
          journal_date: newJournal.journal_date,
          description: newJournal.description,
          project_id: newJournal.project_id,
        })
        .eq('id', editingJournal.id);

      if (journalError) {
        alert('Gagal update jurnal: ' + journalError.message);
        return;
      }

      await supabase.from('journal_lines').delete().eq('journal_id', editingJournal.id);

      const linesToInsert = newJournal.lines.map(line => ({
        journal_id: editingJournal.id,
        coa_id: line.coa_id,
        account_code: line.account_code,
        account_name: line.account_name,
        debit: line.debit || 0,
        credit: line.credit || 0,
      }));

      const { error: linesError } = await supabase
        .from('journal_lines')
        .insert(linesToInsert);

      if (linesError) {
        alert('Gagal update detail jurnal: ' + linesError.message);
        return;
      }

      alert('Jurnal berhasil diupdate');
    } else {
      const { data: lastJournal } = await supabase
        .from('journals')
        .select('journal_number')
        .like('journal_number', `JU-${year}-%`)
        .order('id', { ascending: false })
        .limit(1);
      
      let sequence = 1;
      if (lastJournal && lastJournal.length > 0) {
        const lastNumber = parseInt(lastJournal[0].journal_number.split('-').pop() || '0');
        sequence = lastNumber + 1;
      }
      const journalNumber = `JU-${year}-${String(sequence).padStart(4, '0')}`;

      const { data: journalData, error: journalError } = await supabase
        .from('journals')
        .insert([{
          company_id: currentCompany.id,
          journal_number: journalNumber,
          journal_date: newJournal.journal_date,
          description: newJournal.description,
          project_id: newJournal.project_id,
          status: 'draft',
        }])
        .select();

      if (journalError || !journalData) {
        alert('Gagal menyimpan jurnal: ' + journalError?.message);
        return;
      }

      const journalId = journalData[0].id;
      const linesToInsert = newJournal.lines.map(line => ({
        journal_id: journalId,
        coa_id: line.coa_id,
        account_code: line.account_code,
        account_name: line.account_name,
        debit: line.debit || 0,
        credit: line.credit || 0,
      }));

      const { error: linesError } = await supabase
        .from('journal_lines')
        .insert(linesToInsert);

      if (linesError) {
        alert('Gagal menyimpan detail jurnal: ' + linesError.message);
        return;
      }

      alert('Jurnal berhasil disimpan');
    }

    fetchJournals();
    setShowAddModal(false);
    setEditingJournal(null);
    resetForm();
  };

  const handlePostJournal = async (journal: Journal) => {
    const { error } = await supabase
      .from('journals')
      .update({ 
        status: 'posted', 
        posted_by: user?.email || user?.name || 'Admin', 
        posted_at: new Date().toISOString() 
      })
      .eq('id', journal.id);
    if (!error) {
      alert('Jurnal berhasil diposting');
      fetchJournals();
    } else {
      alert('Gagal posting jurnal: ' + error.message);
    }
  };

  const handleUnpostJournal = async (id: number, reason?: string) => {
    try {
      const { error } = await supabase
        .from('journals')
        .update({ 
          status: 'draft',
          posted_by: null,
          posted_at: null,
        })
        .eq('id', id);

      if (error) throw error;

      console.log(`Journal ${id} unposted by ${user?.email}${reason ? `, reason: ${reason}` : ''}`);
      alert('Jurnal berhasil diunpost. Status berubah menjadi DRAFT dan bisa diedit kembali.');
      fetchJournals();
      setShowUnpostModal(false);
      setUnpostReason('');
      setUnpostTargetId(null);
    } catch (error) {
      console.error('Error unposting journal:', error);
      alert('Gagal mengunpost jurnal');
    }
  };

  const handleDeleteJournal = async (id: number) => {
    if (confirm('Yakin ingin menghapus jurnal ini? Tindakan ini tidak dapat dibatalkan.')) {
      await supabase.from('journal_lines').delete().eq('journal_id', id);
      await supabase.from('journals').delete().eq('id', id);
      fetchJournals();
      setShowDetailModal(false);
    }
  };

  const handleEditJournal = (journal: Journal) => {
    setEditingJournal(journal);
    setNewJournal({
      journal_date: journal.journal_date,
      description: journal.description,
      project_id: journal.project_id,
      lines: journal.lines.map(line => ({
        coa_id: line.coa_id,
        account_code: line.account_code,
        account_name: line.account_name,
        debit: line.debit,
        credit: line.credit,
      })),
    });
    setShowAddModal(true);
  };

  const addLine = () => {
    setNewJournal({ 
      ...newJournal, 
      lines: [...newJournal.lines, { coa_id: 0, account_code: '', account_name: '', debit: 0, credit: 0 }] 
    });
  };

  const removeLine = (index: number) => {
    if (newJournal.lines.length > 1) {
      setNewJournal({ 
        ...newJournal, 
        lines: newJournal.lines.filter((_, i) => i !== index) 
      });
    }
  };

  const updateLine = (index: number, field: keyof JournalLine, value: any) => {
    const newLines = [...newJournal.lines];
    if (field === 'coa_id') {
      const selectedCoa = coaList.find(c => c.id === value);
      if (selectedCoa) {
        newLines[index] = {
          ...newLines[index],
          coa_id: selectedCoa.id,
          account_code: selectedCoa.code,
          account_name: selectedCoa.name,
        };
      }
    } else {
      newLines[index] = { ...newLines[index], [field]: value };
    }
    setNewJournal({ ...newJournal, lines: newLines });
  };

  const resetForm = () => {
    setNewJournal({
      journal_date: new Date().toISOString().split('T')[0],
      description: '',
      project_id: null,
      lines: [{ coa_id: 0, account_code: '', account_name: '', debit: 0, credit: 0 }],
    });
    setEditingJournal(null);
  };

  const filteredJournals = journals.filter(j => {
    const matchesSearch = j.journal_number.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         j.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || j.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const stats = { 
    total: journals.length, 
    draft: journals.filter(j => j.status === 'draft').length, 
    posted: journals.filter(j => j.status === 'posted').length 
  };

  if (!currentCompany) return <div className="flex justify-center py-12">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-slide-in-up">
        <div>
          <h1 className="font-display text-3xl font-bold text-text">Jurnal Umum</h1>
          <p className="text-text-muted mt-1">Input dan kelola jurnal akuntansi dengan validasi debit/kredit</p>
        </div>
        <div className="flex gap-3">
          {/* TOMBOL IMPORT EXCEL */}
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-500/10 text-blue-600 border border-blue-500/30 rounded-lg hover:bg-blue-500/20 transition-colors"
          >
            <Upload className="w-5 h-5" />
            Import Excel
          </button>
          {/* TOMBOL POST ALL DRAFTS */}
          <button
            onClick={handlePostAllDrafts}
            disabled={postingAll}
            className="flex items-center gap-2 px-4 py-2.5 bg-success/10 text-success border border-success/30 rounded-lg hover:bg-success/20 transition-colors disabled:opacity-50"
          >
            <CheckSquare className="w-5 h-5" />
Post All Drafts
          </button>
          {/* TOMBOL BUAT JURNAL */}
          <button
            onClick={() => { resetForm(); setShowAddModal(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium shadow-lg shadow-accent/30"
          >
            <Plus className="w-5 h-5" strokeWidth={2} /> Buat Jurnal
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[{ label: 'Total', value: stats.total }, { label: 'Draft', value: stats.draft }, { label: 'Posted', value: stats.posted }].map((stat, idx) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }} className="bg-surface rounded-xl border border-border p-4">
            <p className="text-text-muted text-xs font-medium">{stat.label}</p>
            <p className="text-text text-2xl font-bold font-display mt-1">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-surface rounded-xl border border-border p-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
            <input
              type="text"
              placeholder="Cari nomor jurnal atau deskripsi..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>
          <div className="flex gap-2">
            {['all', 'draft', 'posted'].map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-4 py-2.5 rounded-lg font-medium transition-colors capitalize ${
                  filterStatus === status
                    ? 'bg-accent text-white shadow-lg shadow-accent/30'
                    : 'border border-border hover:bg-background'
                }`}
              >
                {status === 'all' ? 'Semua' : status}
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-background">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">No. Jurnal</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Tanggal</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Deskripsi</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Proyek</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-text-muted uppercase">Total</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-text-muted uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-text-muted uppercase">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={7} className="text-center py-8">Loading...</td></tr>
              ) : (
                filteredJournals.map((journal) => {
                  const totalDebit = journal.lines.reduce((sum, line) => sum + line.debit, 0);
                  return (
                    <tr key={journal.id} className="hover:bg-background transition-colors">
                      <td className="px-6 py-4 text-sm font-mono font-semibold">{journal.journal_number}</td>
                      <td className="px-6 py-4 text-sm">{journal.journal_date}</td>
                      <td className="px-6 py-4 text-sm">{journal.description}</td>
                      <td className="px-6 py-4 text-sm">{journal.project_id ? projects.find(p => p.id === journal.project_id)?.code || '-' : '-'}</td>
                      <td className="px-6 py-4 text-right font-mono font-semibold">{formatCurrency(totalDebit)}</td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                          journal.status === 'posted' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
                        }`}>
                          {journal.status === 'posted' ? 'Posted' : 'Draft'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => { setSelectedJournal(journal); setShowDetailModal(true); }}
                            className="p-2 text-text-muted hover:text-info hover:bg-info/10 rounded-lg"
                            title="Lihat Detail"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {journal.status === 'draft' && (
                            <>
                              <button
                                onClick={() => handleEditJournal(journal)}
                                className="p-2 text-text-muted hover:text-info hover:bg-info/10 rounded-lg"
                                title="Edit"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handlePostJournal(journal)}
                                className="p-2 text-text-muted hover:text-success hover:bg-success/10 rounded-lg"
                                title="Post"
                              >
                                <Send className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteJournal(journal.id)}
                                className="p-2 text-text-muted hover:text-danger hover:bg-danger/10 rounded-lg"
                                title="Hapus"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {journal.status === 'posted' && (
                            <button
                              onClick={() => {
                                setUnpostTargetId(journal.id);
                                setShowUnpostModal(true);
                              }}
                              className="p-2 text-text-muted hover:text-warning hover:bg-warning/10 rounded-lg"
                              title="Unpost (Kembalikan ke Draft)"
                            >
                              <Undo2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Modal Add/Edit Jurnal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-auto">
          <div className="bg-surface rounded-xl p-6 w-full max-w-4xl my-8">
            <h2 className="font-display text-xl font-bold text-text mb-4">
              {editingJournal ? 'Edit Jurnal' : 'Buat Jurnal Baru'}
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text mb-1">Tanggal</label>
                  <input
                    type="date"
                    value={newJournal.journal_date}
                    onChange={(e) => setNewJournal({ ...newJournal, journal_date: e.target.value })}
                    className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text mb-1">Deskripsi</label>
                  <input
                    type="text"
                    placeholder="Deskripsi jurnal"
                    value={newJournal.description}
                    onChange={(e) => setNewJournal({ ...newJournal, description: e.target.value })}
                    className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-text mb-1">Proyek (Opsional)</label>
                <select
                  value={newJournal.project_id || ''}
                  onChange={(e) => setNewJournal({ ...newJournal, project_id: e.target.value ? parseInt(e.target.value) : null })}
                  className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="">-- Tidak Ada Proyek --</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="block text-sm font-medium text-text">Detail Jurnal</label>
                  <button
                    onClick={addLine}
                    className="text-sm text-accent hover:bg-accent/10 px-3 py-1 rounded-lg"
                  >
                    + Tambah Baris
                  </button>
                </div>
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-background">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs text-text-muted">Akun</th>
                        <th className="px-4 py-2 text-right text-xs text-text-muted w-32">Debit</th>
                        <th className="px-4 py-2 text-right text-xs text-text-muted w-32">Kredit</th>
                        <th className="px-4 py-2 text-center w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {newJournal.lines.map((line, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-2">
                            <select
                              value={line.coa_id || ''}
                              onChange={(e) => updateLine(idx, 'coa_id', parseInt(e.target.value))}
                              className="w-full px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                            >
                              <option value="">Pilih Akun</option>
                              {coaList.map(acc => (
                                <option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="number"
                              placeholder="0"
                              value={line.debit || ''}
                              onChange={(e) => updateLine(idx, 'debit', parseInt(e.target.value) || 0)}
                              className="w-full px-3 py-1.5 border border-border rounded-lg text-right font-mono focus:outline-none focus:ring-2 focus:ring-accent"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="number"
                              placeholder="0"
                              value={line.credit || ''}
                              onChange={(e) => updateLine(idx, 'credit', parseInt(e.target.value) || 0)}
                              className="w-full px-3 py-1.5 border border-border rounded-lg text-right font-mono focus:outline-none focus:ring-2 focus:ring-accent"
                            />
                          </td>
                          <td className="px-4 py-2 text-center">
                            <button
                              onClick={() => removeLine(idx)}
                              className="text-danger hover:bg-danger/10 p-1 rounded"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-background">
                      <tr className="border-t border-border font-semibold">
                        <td className="px-4 py-2 text-right">TOTAL</td>
                        <td className="px-4 py-2 text-right text-success">
                          {formatCurrency(newJournal.lines.reduce((s, l) => s + l.debit, 0))}
                        </td>
                        <td className="px-4 py-2 text-right text-danger">
                          {formatCurrency(newJournal.lines.reduce((s, l) => s + l.credit, 0))}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {newJournal.lines.reduce((s, l) => s + l.debit, 0) !== newJournal.lines.reduce((s, l) => s + l.credit, 0) && (
                  <p className="text-danger text-sm mt-2">⚠️ Total Debit harus sama dengan Total Kredit!</p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 border border-border rounded-lg hover:bg-background"
              >
                Batal
              </button>
              <button
                onClick={handleSaveJournal}
                className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover"
              >
                {editingJournal ? 'Update Jurnal' : 'Simpan Jurnal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Unpost */}
      {showUnpostModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl p-6 w-full max-w-md">
            <h2 className="font-display text-xl font-bold text-text mb-4">Unpost Jurnal</h2>
            <p className="text-sm text-text-muted mb-4">
              Apakah Anda yakin ingin membatalkan posting jurnal ini?<br/>
              Jurnal akan kembali ke status DRAFT dan bisa diedit.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-text mb-1">Alasan (Opsional)</label>
              <textarea
                rows={2}
                value={unpostReason}
                onChange={(e) => setUnpostReason(e.target.value)}
                placeholder="Misal: Kesalahan input, perlu penyesuaian, dll..."
                className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowUnpostModal(false)}
                className="px-4 py-2 border border-border rounded-lg hover:bg-background"
              >
                Batal
              </button>
              <button
                onClick={() => handleUnpostJournal(unpostTargetId!, unpostReason)}
                className="px-4 py-2 bg-warning text-white rounded-lg hover:bg-warning/90"
              >
                Konfirmasi Unpost
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detail */}
      {showDetailModal && selectedJournal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="font-display text-xl font-bold text-text">{selectedJournal.journal_number}</h2>
                <p className="text-sm text-text-muted">{selectedJournal.description}</p>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="text-text-muted hover:text-text"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-xs text-text-muted">Tanggal</p>
                <p className="text-sm font-semibold">{formatDate(selectedJournal.journal_date)}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Status</p>
                <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                  selectedJournal.status === 'posted' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
                }`}>
                  {selectedJournal.status}
                </span>
              </div>
            </div>
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-background">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs text-text-muted">Akun</th>
                    <th className="px-4 py-2 text-right text-xs text-text-muted">Debit</th>
                    <th className="px-4 py-2 text-right text-xs text-text-muted">Kredit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {selectedJournal.lines.map((line, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-2">
                        <p className="text-sm font-mono font-semibold">{line.account_code}</p>
                        <p className="text-xs text-text-muted">{line.account_name}</p>
                      </td>
                      <td className="px-4 py-2 text-right">
                        {line.debit > 0 && <span className="text-success">{formatCurrency(line.debit)}</span>}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {line.credit > 0 && <span className="text-danger">{formatCurrency(line.credit)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-background font-bold">
                  <tr>
                    <td className="px-4 py-2">TOTAL</td>
                    <td className="px-4 py-2 text-right text-success">
                      {formatCurrency(selectedJournal.lines.reduce((s, l) => s + l.debit, 0))}
                    </td>
                    <td className="px-4 py-2 text-right text-danger">
                      {formatCurrency(selectedJournal.lines.reduce((s, l) => s + l.credit, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-2 border border-border rounded-lg hover:bg-background"
              >
                Tutup
              </button>
              {selectedJournal.status === 'draft' && (
                <button
                  onClick={() => handlePostJournal(selectedJournal)}
                  className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover"
                >
                  Post Jurnal
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL IMPORT EXCEL */}
      {showImportModal && (
        <ImportJournalModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          onImportSuccess={() => {
            fetchJournals();
            setShowImportModal(false);
          }}
        />
      )}
    </div>
  );
}
