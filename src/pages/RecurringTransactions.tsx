import { useState, useEffect } from 'react';
import { Plus, Search, Eye, Send, DollarSign, Clock, CheckCircle, Download, X, Trash2, User, FolderOpen, Edit, RefreshCw, Calendar, Repeat } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useCompany } from '../contexts/CompanyContext';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency, createGeneralJournal } from '../lib/accountingHelpers';

type Coa = { id: number; code: string; name: string; type: string };
type RecurringLine = {
  id?: number;
  account_id: number;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  notes: string;
};

type Recurring = {
  id: number;
  name: string;
  description: string;
  start_date: string;
  frequency: 'monthly' | 'quarterly' | 'yearly';
  duration: number | null;
  total_cycles: number;
  last_generated: string | null;
  status: 'active' | 'completed' | 'inactive';
  lines: RecurringLine[];
};

export default function RecurringTransactions() {
  const { currentCompany } = useCompany();
  const { user } = useAuth();
  const [recurrings, setRecurrings] = useState<Recurring[]>([]);
  const [coaList, setCoaList] = useState<Coa[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedRecurring, setSelectedRecurring] = useState<Recurring | null>(null);
  const [generating, setGenerating] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [showLogsModal, setShowLogsModal] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    start_date: new Date().toISOString().split('T')[0],
    frequency: 'monthly' as 'monthly' | 'quarterly' | 'yearly',
    duration: 12,
    duration_unlimited: false,
  });
  
  const [lines, setLines] = useState<RecurringLine[]>([
    { account_id: 0, account_code: '', account_name: '', debit: 0, credit: 0, notes: '' }
  ]);

  useEffect(() => {
    if (currentCompany?.id) {
      fetchRecurrings();
      fetchCoa();
    }
  }, [currentCompany]);

  const fetchRecurrings = async () => {
    if (!currentCompany?.id) return;
    setLoading(true);
    
    // Ambil data recurring
    const { data: recurringData } = await supabase
      .from('recurring_transactions')
      .select('*')
      .eq('company_id', currentCompany.id)
      .order('created_at', { ascending: false });
    
    if (recurringData) {
      // Ambil lines untuk setiap recurring
      const recurringsWithLines = await Promise.all(
        recurringData.map(async (rec) => {
          const { data: linesData } = await supabase
            .from('recurring_lines')
            .select('*')
            .eq('recurring_id', rec.id);
          return { ...rec, lines: linesData || [] };
        })
      );
      setRecurrings(recurringsWithLines);
    }
    setLoading(false);
  };

  const fetchCoa = async () => {
    if (!currentCompany?.id) return;
    const { data } = await supabase
      .from('coa')
      .select('id, code, name, type')
      .eq('company_id', currentCompany.id)
      .order('code');
    setCoaList(data || []);
  };

  const fetchLogs = async (recurringId: number) => {
    const { data } = await supabase
      .from('recurring_logs')
      .select('*, journals!inner(journal_number, journal_date, description)')
      .eq('recurring_id', recurringId)
      .order('generated_date', { ascending: false });
    setLogs(data || []);
  };

  const addLine = () => {
    setLines([...lines, { account_id: 0, account_code: '', account_name: '', debit: 0, credit: 0, notes: '' }]);
  };

  const removeLine = (index: number) => {
    if (lines.length > 1) {
      setLines(lines.filter((_, i) => i !== index));
    }
  };

  const updateLine = (index: number, field: keyof RecurringLine, value: any) => {
    const newLines = [...lines];
    if (field === 'account_id') {
      const selectedCoa = coaList.find(c => c.id === value);
      if (selectedCoa) {
        newLines[index] = {
          ...newLines[index],
          account_id: selectedCoa.id,
          account_code: selectedCoa.code,
          account_name: selectedCoa.name,
        };
      }
    } else {
      newLines[index] = { ...newLines[index], [field]: value };
    }
    setLines(newLines);
  };

  const validateLines = () => {
    const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);
    if (totalDebit !== totalCredit) {
      alert(`Total Debit (${formatCurrency(totalDebit)}) harus sama dengan Total Kredit (${formatCurrency(totalCredit)})`);
      return false;
    }
    if (lines.some(l => l.account_id === 0)) {
      alert('Semua baris harus memilih akun');
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!formData.name) {
      alert('Nama transaksi wajib diisi');
      return;
    }
    if (!validateLines()) return;
    if (!currentCompany?.id) return;

    const duration = formData.duration_unlimited ? null : formData.duration;

    const { data: recurring, error } = await supabase
      .from('recurring_transactions')
      .insert([{
        company_id: currentCompany.id,
        name: formData.name,
        description: formData.description,
        start_date: formData.start_date,
        frequency: formData.frequency,
        duration: duration,
        total_cycles: 0,
        status: 'active',
        created_by: user?.email,
      }])
      .select()
      .single();

    if (error) {
      alert('Gagal simpan: ' + error.message);
      return;
    }

    const linesToInsert = lines.map(line => ({
      recurring_id: recurring.id,
      account_id: line.account_id,
      account_code: line.account_code,
      account_name: line.account_name,
      debit: line.debit,
      credit: line.credit,
      notes: line.notes,
    }));

    const { error: linesError } = await supabase
      .from('recurring_lines')
      .insert(linesToInsert);

    if (linesError) {
      alert('Gagal simpan detail: ' + linesError.message);
    } else {
      alert('Transaksi berulang berhasil disimpan');
      setShowModal(false);
      resetForm();
      fetchRecurrings();
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      start_date: new Date().toISOString().split('T')[0],
      frequency: 'monthly',
      duration: 12,
      duration_unlimited: false,
    });
    setLines([{ account_id: 0, account_code: '', account_name: '', debit: 0, credit: 0, notes: '' }]);
  };

  const handleGenerate = async (recurring: Recurring) => {
    setGenerating(true);
    
    try {
      // Cek apakah masih aktif
      if (recurring.status !== 'active') {
        alert('Transaksi ini sudah selesai atau tidak aktif');
        return;
      }
      
      // Cek durasi
      if (recurring.duration !== null && recurring.total_cycles >= recurring.duration) {
        alert('Durasi transaksi sudah habis');
        await supabase
          .from('recurring_transactions')
          .update({ status: 'completed' })
          .eq('id', recurring.id);
        fetchRecurrings();
        return;
      }
      
      // Hitung tanggal generate berikutnya
      const lastGenerated = recurring.last_generated ? new Date(recurring.last_generated) : new Date(recurring.start_date);
      let nextDate = new Date(lastGenerated);
      
      if (recurring.frequency === 'monthly') {
        nextDate.setMonth(nextDate.getMonth() + 1);
      } else if (recurring.frequency === 'quarterly') {
        nextDate.setMonth(nextDate.getMonth() + 3);
      } else if (recurring.frequency === 'yearly') {
        nextDate.setFullYear(nextDate.getFullYear() + 1);
      }
      
      const today = new Date();
      if (nextDate > today) {
        alert(`Belum waktunya generate. Generate berikutnya: ${nextDate.toLocaleDateString('id-ID')}`);
        return;
      }
      
      // Buat jurnal
      const entries = recurring.lines.map(line => ({
        account_id: line.account_id,
        account_code: line.account_code,
        account_name: line.account_name,
        debit: line.debit,
        credit: line.credit,
      }));
      
      const journalId = await createGeneralJournal(
        currentCompany!.id,
        nextDate.toISOString().split('T')[0],
        `[AUTO] ${recurring.name} - ${recurring.description || ''}`,
        `REC-${recurring.id}`,
        'RECURRING',
        recurring.id,
        entries
      );
      
      if (!journalId) {
        alert('Gagal membuat jurnal');
        return;
      }
      
      // Update recurring
      const newTotalCycles = (recurring.total_cycles || 0) + 1;
      const newStatus = recurring.duration !== null && newTotalCycles >= recurring.duration ? 'completed' : 'active';
      
      await supabase
        .from('recurring_transactions')
        .update({
          total_cycles: newTotalCycles,
          last_generated: nextDate.toISOString().split('T')[0],
          status: newStatus,
        })
        .eq('id', recurring.id);
      
      // Catat log
      await supabase
        .from('recurring_logs')
        .insert({
          recurring_id: recurring.id,
          journal_id: journalId,
          generated_date: nextDate.toISOString().split('T')[0],
          cycle_number: newTotalCycles,
          created_by: user?.email,
          notes: `Generate otomatis untuk periode ${nextDate.toLocaleDateString('id-ID')}`,
        });
      
      alert(`Jurnal berhasil digenerate! (${newTotalCycles}/${recurring.duration || '∞'})`);
      fetchRecurrings();
    } catch (error) {
      console.error('Error generating:', error);
      alert('Gagal generate jurnal');
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateAll = async () => {
    if (!confirm('Generate semua transaksi berulang yang sudah waktunya?')) return;
    
    setGenerating(true);
    let successCount = 0;
    let failCount = 0;
    
    for (const recurring of recurrings) {
      if (recurring.status === 'active') {
        try {
          // Cek durasi
          if (recurring.duration !== null && recurring.total_cycles >= recurring.duration) {
            await supabase
              .from('recurring_transactions')
              .update({ status: 'completed' })
              .eq('id', recurring.id);
            continue;
          }
          
          const lastGenerated = recurring.last_generated ? new Date(recurring.last_generated) : new Date(recurring.start_date);
          let nextDate = new Date(lastGenerated);
          
          if (recurring.frequency === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
          else if (recurring.frequency === 'quarterly') nextDate.setMonth(nextDate.getMonth() + 3);
          else nextDate.setFullYear(nextDate.getFullYear() + 1);
          
          const today = new Date();
          if (nextDate > today) continue;
          
          const entries = recurring.lines.map(line => ({
            account_id: line.account_id,
            account_code: line.account_code,
            account_name: line.account_name,
            debit: line.debit,
            credit: line.credit,
          }));
          
          const journalId = await createGeneralJournal(
            currentCompany!.id,
            nextDate.toISOString().split('T')[0],
            `[AUTO] ${recurring.name}`,
            `REC-${recurring.id}`,
            'RECURRING',
            recurring.id,
            entries
          );
          
          if (journalId) {
            const newTotalCycles = (recurring.total_cycles || 0) + 1;
            const newStatus = recurring.duration !== null && newTotalCycles >= recurring.duration ? 'completed' : 'active';
            
            await supabase
              .from('recurring_transactions')
              .update({
                total_cycles: newTotalCycles,
                last_generated: nextDate.toISOString().split('T')[0],
                status: newStatus,
              })
              .eq('id', recurring.id);
            
            await supabase.from('recurring_logs').insert({
              recurring_id: recurring.id,
              journal_id: journalId,
              generated_date: nextDate.toISOString().split('T')[0],
              cycle_number: newTotalCycles,
              created_by: user?.email,
            });
            
            successCount++;
          } else {
            failCount++;
          }
        } catch (err) {
          failCount++;
        }
      }
    }
    
    alert(`Generate selesai! Berhasil: ${successCount}, Gagal: ${failCount}`);
    fetchRecurrings();
    setGenerating(false);
  };

  const handleViewLogs = async (recurring: Recurring) => {
    setSelectedRecurring(recurring);
    await fetchLogs(recurring.id);
    setShowLogsModal(true);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('id-ID');
  };

  const getFrequencyLabel = (freq: string) => {
    const labels = { monthly: 'Bulanan', quarterly: 'Triwulan', yearly: 'Tahunan' };
    return labels[freq as keyof typeof labels] || freq;
  };

  const filteredRecurrings = recurrings.filter(r =>
    r.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!currentCompany) return <div className="flex justify-center py-12">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-slide-in-up">
        <div>
          <h1 className="font-display text-3xl font-bold text-text">Transaksi Berulang</h1>
          <p className="text-text-muted mt-1">Buat jurnal otomatis untuk transaksi rutin (sewa, cicilan, dll)</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleGenerateAll}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2.5 bg-success/10 text-success border border-success/30 rounded-lg hover:bg-success/20 transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
            Generate All
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium shadow-lg shadow-accent/30"
          >
            <Plus className="w-5 h-5" /> Tambah Transaksi
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface rounded-xl border border-border p-4"><p className="text-text-muted text-xs">Total Transaksi</p><p className="text-2xl font-bold">{recurrings.length}</p></div>
        <div className="bg-surface rounded-xl border border-border p-4"><p className="text-text-muted text-xs">Aktif</p><p className="text-2xl font-bold text-success">{recurrings.filter(r => r.status === 'active').length}</p></div>
        <div className="bg-surface rounded-xl border border-border p-4"><p className="text-text-muted text-xs">Selesai</p><p className="text-2xl font-bold text-gray-500">{recurrings.filter(r => r.status === 'completed').length}</p></div>
        <div className="bg-surface rounded-xl border border-border p-4"><p className="text-text-muted text-xs">Total Generate</p><p className="text-2xl font-bold">{recurrings.reduce((sum, r) => sum + (r.total_cycles || 0), 0)}</p></div>
      </div>

      {/* Search */}
      <div className="bg-surface rounded-xl border border-border p-6">
        <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" /><input type="text" placeholder="Cari transaksi berulang..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg" /></div>
      </div>

      {/* List */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        {loading ? <div className="text-center py-12">Loading...</div> : (
          <div className="divide-y divide-border">
            {filteredRecurrings.map((rec) => {
              const progress = rec.duration ? ((rec.total_cycles || 0) / rec.duration) * 100 : 0;
              return (
                <div key={rec.id} className="p-4 hover:bg-background transition-colors">
                  <div className="flex items-start justify-between flex-wrap gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Repeat className="w-5 h-5 text-accent" />
                        <h3 className="font-semibold text-text">{rec.name}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${rec.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                          {rec.status === 'active' ? 'Aktif' : 'Selesai'}
                        </span>
                        <span className="text-xs text-text-muted">{getFrequencyLabel(rec.frequency)}</span>
                      </div>
                      {rec.description && <p className="text-sm text-text-muted mb-2">{rec.description}</p>}
                      <div className="flex gap-4 text-xs text-text-muted">
                        <span>Mulai: {formatDate(rec.start_date)}</span>
                        <span>Generate: {rec.total_cycles || 0}/{rec.duration || '∞'}</span>
                        {rec.last_generated && <span>Terakhir: {formatDate(rec.last_generated)}</span>}
                      </div>
                      {rec.duration && (
                        <div className="mt-2 w-full max-w-xs bg-gray-200 rounded-full h-1.5">
                          <div className="bg-accent h-1.5 rounded-full" style={{ width: `${Math.min(progress, 100)}%` }}></div>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleGenerate(rec)} disabled={generating || rec.status !== 'active'} className="p-2 text-text-muted hover:text-success hover:bg-success/10 rounded-lg transition-colors disabled:opacity-50" title="Generate Sekarang">
                        <RefreshCw className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleViewLogs(rec)} className="p-2 text-text-muted hover:text-info hover:bg-info/10 rounded-lg transition-colors" title="Lihat Log">
                        <Clock className="w-4 h-4" />
                      </button>
                      <button onClick={() => { setSelectedRecurring(rec); setShowDetailModal(true); }} className="p-2 text-text-muted hover:text-info hover:bg-info/10 rounded-lg" title="Detail">
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredRecurrings.length === 0 && <div className="text-center py-12 text-text-muted">Belum ada transaksi berulang</div>}
          </div>
        )}
      </div>

      {/* Modal Tambah */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-auto">
          <div className="bg-surface rounded-xl p-6 w-full max-w-4xl my-8">
            <h2 className="font-display text-xl font-bold text-text mb-4">Tambah Transaksi Berulang</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium mb-1">Nama Transaksi *</label><input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-2 border rounded-lg" /></div>
                <div><label className="block text-sm font-medium mb-1">Frekuensi</label><select value={formData.frequency} onChange={e => setFormData({...formData, frequency: e.target.value as any})} className="w-full px-4 py-2 border rounded-lg"><option value="monthly">Bulanan</option><option value="quarterly">Triwulan</option><option value="yearly">Tahunan</option></select></div>
              </div>
              <div><label className="block text-sm font-medium mb-1">Deskripsi</label><textarea rows={2} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full px-4 py-2 border rounded-lg" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium mb-1">Tanggal Mulai</label><input type="date" value={formData.start_date} onChange={e => setFormData({...formData, start_date: e.target.value})} className="w-full px-4 py-2 border rounded-lg" /></div>
                <div><label className="flex items-center gap-2 mt-6"><input type="checkbox" checked={formData.duration_unlimited} onChange={e => setFormData({...formData, duration_unlimited: e.target.checked})} /> Tidak Terbatas</label></div>
              </div>
              {!formData.duration_unlimited && (
                <div><label className="block text-sm font-medium mb-1">Durasi (kali generate)</label><input type="number" value={formData.duration} onChange={e => setFormData({...formData, duration: parseInt(e.target.value) || 0})} className="w-full px-4 py-2 border rounded-lg" /></div>
              )}
              
              <div><label className="block text-sm font-medium mb-1">Detail Jurnal (Multi-Line)</label><button onClick={addLine} className="text-sm text-accent mb-2">+ Tambah Baris</button>
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-background"><tr><th className="px-2 py-2 text-left text-xs">Akun</th><th className="px-2 py-2 text-right text-xs w-32">Debit</th><th className="px-2 py-2 text-right text-xs w-32">Kredit</th><th className="px-2 py-2 text-left text-xs w-32">Catatan</th><th className="w-10"></th></tr></thead>
                    <tbody>
                      {lines.map((line, idx) => (
                        <tr key={idx}>
                          <td className="px-2 py-2"><select value={line.account_id || ''} onChange={e => updateLine(idx, 'account_id', parseInt(e.target.value))} className="w-full px-2 py-1 border rounded text-sm"><option value="">Pilih Akun</option>{coaList.map(acc => (<option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>))}</select></td>
                          <td className="px-2 py-2"><input type="number" value={line.debit || ''} onChange={e => updateLine(idx, 'debit', parseInt(e.target.value) || 0)} className="w-full px-2 py-1 border rounded text-right" /></td>
                          <td className="px-2 py-2"><input type="number" value={line.credit || ''} onChange={e => updateLine(idx, 'credit', parseInt(e.target.value) || 0)} className="w-full px-2 py-1 border rounded text-right" /></td>
                          <td className="px-2 py-2"><input type="text" placeholder="Catatan" value={line.notes} onChange={e => updateLine(idx, 'notes', e.target.value)} className="w-full px-2 py-1 border rounded text-sm" /></td>
                          <td className="px-2 py-2"><button onClick={() => removeLine(idx)}><Trash2 className="w-4 h-4 text-danger" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-background">
                      <tr className="border-t border-border"><td className="px-2 py-2 text-right font-medium">TOTAL Jan</td><td className="px-2 py-2 text-right font-medium text-success">{formatCurrency(lines.reduce((s, l) => s + l.debit, 0))}</td><td className="px-2 py-2 text-right font-medium text-danger">{formatCurrency(lines.reduce((s, l) => s + l.credit, 0))}</td><td></td><td></td></tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6"><button onClick={() => setShowModal(false)} className="px-4 py-2 border rounded-lg">Batal</button><button onClick={handleSave} className="px-4 py-2 bg-accent text-white rounded-lg">Simpan</button></div>
          </div>
        </div>
      )}

      {/* Modal Logs */}
      {showLogsModal && selectedRecurring && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-auto">
            <div className="flex justify-between items-center mb-4"><h2 className="font-display text-xl font-bold">Riwayat Generate - {selectedRecurring.name}</h2><button onClick={() => setShowLogsModal(false)} className="text-gray-500">✕</button></div>
            {logs.length === 0 ? <p className="text-text-muted">Belum ada riwayat generate</p> : (
              <div className="space-y-2">
                {logs.map((log, idx) => (
                  <div key={idx} className="bg-gray-50 p-3 rounded-lg">
                    <div className="flex justify-between"><span className="font-medium">#{log.cycle_number}</span><span className="text-sm text-text-muted">{log.generated_date}</span></div>
                    <div className="text-sm">Jurnal: {log.journals?.journal_number} - {log.journals?.description}</div>
                    <div className="text-xs text-text-muted">{log.created_by} • {new Date(log.created_at).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Detail */}
      {showDetailModal && selectedRecurring && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl p-6 w-full max-w-lg">
            <div className="flex justify-between items-center mb-4"><h2 className="font-display text-xl font-bold">{selectedRecurring.name}</h2><button onClick={() => setShowDetailModal(false)} className="text-gray-500">✕</button></div>
            <div className="space-y-2">
              <p><strong>Deskripsi:</strong> {selectedRecurring.description || '-'}</p>
              <p><strong>Mulai:</strong> {formatDate(selectedRecurring.start_date)}</p>
              <p><strong>Frekuensi:</strong> {getFrequencyLabel(selectedRecurring.frequency)}</p>
              <p><strong>Durasi:</strong> {selectedRecurring.duration ? `${selectedRecurring.duration} kali` : 'Tidak Terbatas'}</p>
              <p><strong>Sudah Generate:</strong> {selectedRecurring.total_cycles || 0} kali</p>
              <p><strong>Status:</strong> {selectedRecurring.status === 'active' ? 'Aktif' : 'Selesai'}</p>
              <div className="border-t pt-3 mt-3"><strong>Detail Jurnal:</strong>
                {selectedRecurring.lines.map((line, idx) => (<div key={idx} className="text-sm mt-1">{line.account_code} - {line.account_name}: {formatCurrency(line.debit)} / {formatCurrency(line.credit)}</div>))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
