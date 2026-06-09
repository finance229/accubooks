import { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, CheckCircle, XCircle, Eye, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useCompany } from '../contexts/CompanyContext';
import { useAuth } from '../contexts/AuthContext';

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

  const handleAddJournal = async () => {
    if (!newJournal.description || newJournal.lines.length === 0) return;
    if (!currentCompany?.id) return;

    const year = new Date().getFullYear();
    const count = journals.length + 1;
    const journalNumber = `JU-${year}-${String(count).padStart(4, '0')}`;

    const totalDebit = newJournal.lines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredit = newJournal.lines.reduce((sum, line) => sum + line.credit, 0);
    
    if (totalDebit !== totalCredit) {
      alert('Total Debit harus sama dengan Total Kredit!');
      return;
    }

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
      alert('Gagal menyimpan jurnal');
      return;
    }

    const journalId = journalData[0].id;
    const linesToInsert = newJournal.lines.map(line => ({
      journal_id: journalId,
      coa_id: line.coa_id,
      account_code: line.account_code,
      account_name: line.account_name,
      debit: line.debit,
      credit: line.credit,
    }));

    const { error: linesError } = await supabase
      .from('journal_lines')
      .insert(linesToInsert);

    if (linesError) {
      alert('Gagal menyimpan detail jurnal');
      return;
    }

    fetchJournals();
    setShowAddModal(false);
    setNewJournal({
      journal_date: new Date().toISOString().split('T')[0],
      description: '',
      project_id: null,
      lines: [{ coa_id: 0, account_code: '', account_name: '', debit: 0, credit: 0 }],
    });
  };

  const handlePostJournal = async (journal: Journal) => {
    const { error } = await supabase
      .from('journals')
      .update({ status: 'posted', posted_by: user?.name || 'Admin', posted_at: new Date().toISOString() })
      .eq('id', journal.id);
    if (!error) fetchJournals();
  };

  const handleDeleteJournal = async (id: number) => {
    if (confirm('Yakin ingin menghapus jurnal ini?')) {
      await supabase.from('journal_lines').delete().eq('journal_id', id);
      await supabase.from('journals').delete().eq('id', id);
      fetchJournals();
      setShowDetailModal(false);
    }
  };

  const addLine = () => {
    setNewJournal({ ...newJournal, lines: [...newJournal.lines, { coa_id: 0, account_code: '', account_name: '', debit: 0, credit: 0 }] });
  };

  const removeLine = (index: number) => {
    if (newJournal.lines.length > 1) {
      setNewJournal({ ...newJournal, lines: newJournal.lines.filter((_, i) => i !== index) });
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

  const filteredJournals = journals.filter(j => {
    const matchesSearch = j.journal_number.toLowerCase().includes(searchTerm.toLowerCase()) || j.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || j.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const stats = { total: journals.length, draft: journals.filter(j => j.status === 'draft').length, posted: journals.filter(j => j.status === 'posted').length };

  if (!currentCompany) {
    return <div className="flex justify-center py-12">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-slide-in-up">
        <div>
          <h1 className="font-display text-3xl font-bold text-text">Jurnal Umum</h1>
          <p className="text-text-muted mt-1">Input dan kelola jurnal akuntansi dengan validasi debit/kredit</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors shadow-lg shadow-accent/30">
          <Plus className="w-5 h-5" strokeWidth={2} /> Buat Jurnal
        </button>
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
          <div className="flex-1 relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" /><input type="text" placeholder="Cari nomor jurnal atau deskripsi..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg" /></div>
          <div className="flex gap-2">{['all', 'draft', 'posted'].map((status) => (<button key={status} onClick={() => setFilterStatus(status)} className={`px-4 py-2.5 rounded-lg font-medium transition-colors capitalize ${filterStatus === status ? 'bg-accent text-white' : 'border border-border hover:bg-background'}`}>{status === 'all' ? 'Semua' : status}</button>))}</div>
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
                <tr><td colSpan={7} className="text-center py-8">Loading...<\/td></tr>
              ) : (
                filteredJournals.map((journal, index) => {
                  const totalDebit = journal.lines.reduce((sum, line) => sum + line.debit, 0);
                  return (
                    <motion.tr key={journal.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * 0.05 }} className="hover:bg-background transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap"><span className="text-sm font-mono font-semibold text-text">{journal.journal_number}</span></td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-text">{journal.journal_date}</td>
                      <td className="px-6 py-4 text-sm text-text">{journal.description}</td>
                      <td className="px-6 py-4 text-sm text-text">{journal.project_id ? projects.find(p => p.id === journal.project_id)?.code || '-' : '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right"><span className="text-sm font-mono font-semibold text-text">{formatCurrency(totalDebit)}</span></td>
                      <td className="px-6 py-4 whitespace-nowrap text-center"><span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${journal.status === 'posted' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>{journal.status === 'posted' ? 'Posted' : 'Draft'}</span></td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => { setSelectedJournal(journal); setShowDetailModal(true); }} className="p-2 text-text-muted hover:text-info hover:bg-info/10 rounded-lg"><Eye className="w-4 h-4" /></button>
                          {journal.status === 'draft' && <button onClick={() => handleDeleteJournal(journal.id)} className="p-2 text-text-muted hover:text-danger hover:bg-danger/10 rounded-lg"><Trash2 className="w-4 h-4" /></button>}
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-auto">
          <div className="bg-surface rounded-xl p-6 w-full max-w-4xl my-8">
            <h2 className="font-display text-xl font-bold text-text mb-4">Buat Jurnal Baru</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-text mb-1">Tanggal</label><input type="date" value={newJournal.journal_date} onChange={(e) => setNewJournal({ ...newJournal, journal_date: e.target.value })} className="w-full px-4 py-2 border border-border rounded-lg" /></div>
                <div><label className="block text-sm font-medium text-text mb-1">Deskripsi</label><input type="text" placeholder="Deskripsi jurnal" value={newJournal.description} onChange={(e) => setNewJournal({ ...newJournal, description: e.target.value })} className="w-full px-4 py-2 border border-border rounded-lg" /></div>
              </div>
              <div>
                <label className="block text-sm font-medium text-text mb-1">Proyek (Opsional)</label>
                <select 
                  value={newJournal.project_id || ''} 
                  onChange={(e) => setNewJournal({ ...newJournal, project_id: e.target.value ? parseInt(e.target.value) : null })}
                  className="w-full px-4 py-2 border border-border rounded-lg"
                >
                  <option value="">-- Tidak Ada Proyek --</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="flex justify-between items-center mb-3"><label className="block text-sm font-medium text-text">Detail Jurnal</label><button onClick={addLine} className="text-sm text-accent hover:bg-accent/10 px-3 py-1 rounded-lg">+ Tambah Baris</button></div>
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-background"><tr><th className="px-4 py-2 text-left text-xs text-text-muted">Akun</th><th className="px-4 py-2 text-right text-xs text-text-muted w-32">Debit</th><th className="px-4 py-2 text-right text-xs text-text-muted w-32">Kredit</th><th className="px-4 py-2 text-center w-10"></th></tr></thead>
                    <tbody className="divide-y divide-border">
                      {newJournal.lines.map((line, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-2"><select value={line.coa_id || ''} onChange={(e) => updateLine(idx, 'coa_id', parseInt(e.target.value))} className="w-full px-3 py-1.5 border border-border rounded-lg text-sm"><option value="">Pilih Akun</option>{coaList.map(acc => (<option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>))}</select></td>
                          <td className="px-4 py-2"><input type="number" placeholder="0" value={line.debit || ''} onChange={(e) => updateLine(idx, 'debit', parseInt(e.target.value) || 0)} className="w-full px-3 py-1.5 border border-border rounded-lg text-right font-mono" /></td>
                          <td className="px-4 py-2"><input type="number" placeholder="0" value={line.credit || ''} onChange={(e) => updateLine(idx, 'credit', parseInt(e.target.value) || 0)} className="w-full px-3 py-1.5 border border-border rounded-lg text-right font-mono" /></td>
                          <td className="px-4 py-2 text-center"><button onClick={() => removeLine(idx)} className="text-danger hover:bg-danger/10 p-1 rounded"><Trash2 className="w-4 h-4" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-background"><tr className="border-t border-border font-semibold"><td className="px-4 py-2 text-right">TOTAL</td><td className="px-4 py-2 text-right text-success">{formatCurrency(newJournal.lines.reduce((s, l) => s + l.debit, 0))}</td><td className="px-4 py-2 text-right text-danger">{formatCurrency(newJournal.lines.reduce((s, l) => s + l.credit, 0))}</td><td></td></tr></tfoot>
                  </table>
                </div>
                {newJournal.lines.reduce((s, l) => s + l.debit, 0) !== newJournal.lines.reduce((s, l) => s + l.credit, 0) && <p className="text-danger text-sm mt-2">⚠️ Total Debit harus sama dengan Total Kredit!</p>}
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6"><button onClick={() => setShowAddModal(false)} className="px-4 py-2 border border-border rounded-lg">Batal</button><button onClick={handleAddJournal} className="px-4 py-2 bg-accent text-white rounded-lg">Simpan Jurnal</button></div>
          </div>
        </div>
      )}

      {showDetailModal && selectedJournal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-auto">
            <div className="flex justify-between items-center mb-4"><div><h2 className="font-display text-xl font-bold text-text">{selectedJournal.journal_number}</h2><p className="text-sm text-text-muted">{selectedJournal.description}</p></div><button onClick={() => setShowDetailModal(false)} className="text-text-muted hover:text-text">✕</button></div>
            <div className="grid grid-cols-2 gap-4 mb-4"><div><p className="text-xs text-text-muted">Tanggal</p><p className="text-sm font-semibold">{formatDate(selectedJournal.journal_date)}</p></div><div><p className="text-xs text-text-muted">Status</p><span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${selectedJournal.status === 'posted' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>{selectedJournal.status}</span></div></div>
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full"><thead className="bg-background"><tr><th className="px-4 py-2 text-left text-xs text-text-muted">Akun</th><th className="px-4 py-2 text-right text-xs text-text-muted">Debit</th><th className="px-4 py-2 text-right text-xs text-text-muted">Kredit</th></tr></thead>
              <tbody className="divide-y divide-border">{selectedJournal.lines.map((line, idx) => (<tr key={idx}><td className="px-4 py-2"><p className="text-sm font-mono font-semibold">{line.account_code}</p><p className="text-xs text-text-muted">{line.account_name}</p></td><td className="px-4 py-2 text-right">{line.debit > 0 && <span className="text-success">{formatCurrency(line.debit)}</span>}</td><td className="px-4 py-2 text-right">{line.credit > 0 && <span className="text-danger">{formatCurrency(line.credit)}</span>}</td></td>))}
              <tr className="bg-background font-bold"><td className="px-4 py-2">TOTAL</td><td className="px-4 py-2 text-right text-success">{formatCurrency(selectedJournal.lines.reduce((s, l) => s + l.debit, 0))}</td><td className="px-4 py-2 text-right text-danger">{formatCurrency(selectedJournal.lines.reduce((s, l) => s + l.credit, 0))}</td></tr></tbody></table>
            </div>
            <div className="flex justify-end gap-3 mt-6"><button onClick={() => setShowDetailModal(false)} className="px-4 py-2 border border-border rounded-lg">Tutup</button>{selectedJournal.status === 'draft' && <button onClick={() => handlePostJournal(selectedJournal)} className="px-4 py-2 bg-accent text-white rounded-lg">Post Jurnal</button>}</div>
          </div>
        </div>
      )}
    </div>
  );
}
