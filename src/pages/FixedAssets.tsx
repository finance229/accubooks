import { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, Calculator, TrendingUp, RefreshCw, Eye } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useCompany } from '../contexts/CompanyContext';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency, createGeneralJournal } from '../lib/accountingHelpers';

type Coa = { id: number; code: string; name: string; type: string };

type FixedAsset = {
  id: number;
  code: string;
  name: string;
  category: string;
  asset_type: 'tangible' | 'intangible';
  acquisition_date: string;
  acquisition_cost: number;
  salvage_value: number;
  useful_life: number;
  accumulated_depreciation: number;
  book_value: number;
  status: string;
  expense_account_id: number | null;
  accumulated_account_id: number | null;
  amortization_account_id: number | null;
  last_depreciation_date: string | null;
  total_depreciation_generated: number;
};

type DepreciationHistory = {
  id: number;
  period: string;
  amount: number;
  accumulated_depreciation: number;
  book_value: number;
  journal_id: number;
};

export default function FixedAssets() {
  const { currentCompany } = useCompany();
  const { user } = useAuth();
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [coaList, setCoaList] = useState<Coa[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDepreciationModal, setShowDepreciationModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<FixedAsset | null>(null);
  const [history, setHistory] = useState<DepreciationHistory[]>([]);
  const [generating, setGenerating] = useState(false);
  
  const [newAsset, setNewAsset] = useState({
    code: '',
    name: '',
    category: '',
    asset_type: 'tangible' as 'tangible' | 'intangible',
    acquisition_date: '',
    acquisition_cost: 0,
    salvage_value: 0,
    useful_life: 5,
    expense_account_id: null as number | null,
    accumulated_account_id: null as number | null,
  });

  useEffect(() => {
    if (currentCompany?.id) {
      fetchAssets();
      fetchCoa();
    }
  }, [currentCompany]);

  const fetchAssets = async () => {
    if (!currentCompany?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('fixed_assets')
      .select('*')
      .eq('company_id', currentCompany.id)
      .order('created_at', { ascending: false });
    setAssets(data || []);
    setLoading(false);
  };

  const fetchCoa = async () => {
    if (!currentCompany?.id) return;
    const { data } = await supabase
      .from('coa')
      .select('id, code, name, type')
      .eq('company_id', currentCompany.id);
    setCoaList(data || []);
  };

  const fetchHistory = async (assetId: number) => {
    const { data } = await supabase
      .from('depreciation_history')
      .select('*, journals!inner(journal_number)')
      .eq('asset_id', assetId)
      .order('period', { ascending: false });
    setHistory(data || []);
  };

  const calculateMonthlyDepreciation = (asset: FixedAsset) => {
    const depreciableAmount = asset.acquisition_cost - (asset.salvage_value || 0);
    const yearlyDepreciation = depreciableAmount / asset.useful_life;
    const monthlyDepreciation = yearlyDepreciation / 12;
    return { yearlyDepreciation, monthlyDepreciation };
  };

  const handleAddAsset = async () => {
    if (!newAsset.code || !newAsset.name) {
      alert('Kode dan nama aset wajib diisi');
      return;
    }
    if (!newAsset.expense_account_id) {
      alert('Pilih akun beban/amortisasi');
      return;
    }
    if (!currentCompany?.id) return;

    const bookValue = newAsset.acquisition_cost;

    const { error } = await supabase
      .from('fixed_assets')
      .insert([{
        company_id: currentCompany.id,
        code: newAsset.code,
        name: newAsset.name,
        category: newAsset.category,
        asset_type: newAsset.asset_type,
        acquisition_date: newAsset.acquisition_date,
        acquisition_cost: newAsset.acquisition_cost,
        salvage_value: newAsset.salvage_value,
        useful_life: newAsset.useful_life,
        accumulated_depreciation: 0,
        book_value: bookValue,
        status: 'active',
        expense_account_id: newAsset.expense_account_id,
        accumulated_account_id: newAsset.accumulated_account_id,
        total_depreciation_generated: 0,
      }]);

    if (!error) {
      fetchAssets();
      setShowAddModal(false);
      setNewAsset({
        code: '',
        name: '',
        category: '',
        asset_type: 'tangible',
        acquisition_date: '',
        acquisition_cost: 0,
        salvage_value: 0,
        useful_life: 5,
        expense_account_id: null,
        accumulated_account_id: null,
      });
    } else {
      alert('Gagal simpan: ' + error.message);
    }
  };

  const handleGenerateDepreciation = async (asset: FixedAsset) => {
    setGenerating(true);
    
    try {
      if (asset.status !== 'active') {
        alert('Aset sudah tidak aktif');
        return;
      }

      // Cek apakah sudah pernah generate untuk bulan ini
      const currentPeriod = new Date().toISOString().slice(0, 7); // YYYY-MM
      const alreadyGenerated = history.some(h => h.period === currentPeriod);
      if (alreadyGenerated && history.length > 0) {
        alert(`Penyusutan untuk periode ${currentPeriod} sudah pernah digenerate`);
        setGenerating(false);
        return;
      }

      const { monthlyDepreciation } = calculateMonthlyDepreciation(asset);
      
      if (monthlyDepreciation <= 0) {
        alert('Nilai penyusutan 0, tidak perlu generate');
        return;
      }

      // Dapatkan akun beban dan akumulasi
      const expenseAccount = coaList.find(c => c.id === asset.expense_account_id);
      let accumulatedAccountId = asset.accumulated_account_id;
      
      // Jika belum punya akun akumulasi, cari default atau buat
      if (!accumulatedAccountId) {
        const suffix = currentCompany?.id === 1 ? 'A' : currentCompany?.id === 2 ? 'B' : 'C';
        const defaultAccCode = asset.asset_type === 'tangible' ? `1290-${suffix}` : `1390-${suffix}`;
        const defaultAcc = coaList.find(c => c.code === defaultAccCode);
        if (defaultAcc) {
          accumulatedAccountId = defaultAcc.id;
        } else {
          alert('Akun akumulasi tidak ditemukan. Silakan set manual di edit aset.');
          return;
        }
      }
      
      const accumulatedAccount = coaList.find(c => c.id === accumulatedAccountId);
      
      if (!expenseAccount || !accumulatedAccount) {
        alert('Akun beban atau akumulasi tidak ditemukan');
        return;
      }

      const description = asset.asset_type === 'tangible' 
        ? `Penyusutan ${asset.name} (${asset.code})` 
        : `Amortisasi ${asset.name} (${asset.code})`;

      // Buat jurnal
      const entries = [
        {
          account_id: expenseAccount.id,
          account_code: expenseAccount.code,
          account_name: expenseAccount.name,
          debit: Math.round(monthlyDepreciation),
          credit: 0,
        },
        {
          account_id: accumulatedAccount.id,
          account_code: accumulatedAccount.code,
          account_name: accumulatedAccount.name,
          debit: 0,
          credit: Math.round(monthlyDepreciation),
        },
      ];

      const journalId = await createGeneralJournal(
        currentCompany!.id,
        new Date().toISOString().split('T')[0],
        description,
        `AST-${asset.id}`,
        'DEPRECIATION',
        asset.id,
        entries
      );

      if (!journalId) {
        alert('Gagal membuat jurnal penyusutan');
        return;
      }

      // Update aset
      const newAccumulated = (asset.accumulated_depreciation || 0) + Math.round(monthlyDepreciation);
      const newBookValue = asset.acquisition_cost - newAccumulated;
      const newTotalGenerated = (asset.total_depreciation_generated || 0) + 1;

      await supabase
        .from('fixed_assets')
        .update({
          accumulated_depreciation: newAccumulated,
          book_value: newBookValue,
          last_depreciation_date: new Date().toISOString().split('T')[0],
          total_depreciation_generated: newTotalGenerated,
        })
        .eq('id', asset.id);

      // Catat history
      await supabase
        .from('depreciation_history')
        .insert({
          asset_id: asset.id,
          period: currentPeriod,
          amount: Math.round(monthlyDepreciation),
          accumulated_depreciation: newAccumulated,
          book_value: newBookValue,
          journal_id: journalId,
        });

      alert(`Jurnal ${asset.asset_type === 'tangible' ? 'penyusutan' : 'amortisasi'} berhasil dibuat`);
      fetchAssets();
      if (selectedAsset?.id === asset.id) {
        fetchHistory(asset.id);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Gagal generate penyusutan');
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateAll = async () => {
    if (!confirm('Generate penyusutan untuk semua aset aktif?')) return;
    setGenerating(true);
    
    let successCount = 0;
    let failCount = 0;
    
    for (const asset of assets) {
      if (asset.status !== 'active') continue;
      
      try {
        // Cek duplikasi
        const currentPeriod = new Date().toISOString().slice(0, 7);
        const { data: existing } = await supabase
          .from('depreciation_history')
          .select('id')
          .eq('asset_id', asset.id)
          .eq('period', currentPeriod)
          .limit(1);
        
        if (existing && existing.length > 0) continue;
        
        const { monthlyDepreciation } = calculateMonthlyDepreciation(asset);
        if (monthlyDepreciation <= 0) continue;
        
        const expenseAccount = coaList.find(c => c.id === asset.expense_account_id);
        let accumulatedAccountId = asset.accumulated_account_id;
        
        if (!accumulatedAccountId) {
          const suffix = currentCompany?.id === 1 ? 'A' : currentCompany?.id === 2 ? 'B' : 'C';
          const defaultAccCode = asset.asset_type === 'tangible' ? `1290-${suffix}` : `1390-${suffix}`;
          const defaultAcc = coaList.find(c => c.code === defaultAccCode);
          if (defaultAcc) accumulatedAccountId = defaultAcc.id;
        }
        
        const accumulatedAccount = coaList.find(c => c.id === accumulatedAccountId);
        
        if (!expenseAccount || !accumulatedAccount) continue;
        
        const entries = [
          { account_id: expenseAccount.id, account_code: expenseAccount.code, account_name: expenseAccount.name, debit: Math.round(monthlyDepreciation), credit: 0 },
          { account_id: accumulatedAccount.id, account_code: accumulatedAccount.code, account_name: accumulatedAccount.name, debit: 0, credit: Math.round(monthlyDepreciation) },
        ];
        
        const journalId = await createGeneralJournal(
          currentCompany!.id,
          new Date().toISOString().split('T')[0],
          `${asset.asset_type === 'tangible' ? 'Penyusutan' : 'Amortisasi'} ${asset.name}`,
          `AST-${asset.id}`,
          'DEPRECIATION',
          asset.id,
          entries
        );
        
        if (journalId) {
          const newAccumulated = (asset.accumulated_depreciation || 0) + Math.round(monthlyDepreciation);
          const newBookValue = asset.acquisition_cost - newAccumulated;
          
          await supabase
            .from('fixed_assets')
            .update({
              accumulated_depreciation: newAccumulated,
              book_value: newBookValue,
              last_depreciation_date: new Date().toISOString().split('T')[0],
              total_depreciation_generated: (asset.total_depreciation_generated || 0) + 1,
            })
            .eq('id', asset.id);
          
          await supabase.from('depreciation_history').insert({
            asset_id: asset.id,
            period: currentPeriod,
            amount: Math.round(monthlyDepreciation),
            accumulated_depreciation: newAccumulated,
            book_value: newBookValue,
            journal_id: journalId,
          });
          
          successCount++;
        } else {
          failCount++;
        }
      } catch (err) {
        failCount++;
      }
    }
    
    alert(`Generate selesai! Berhasil: ${successCount}, Gagal: ${failCount}`);
    fetchAssets();
    setGenerating(false);
  };

  const handleViewHistory = async (asset: FixedAsset) => {
    setSelectedAsset(asset);
    await fetchHistory(asset.id);
    setShowHistoryModal(true);
  };

  const handleDeleteAsset = async (id: number) => {
    if (confirm('Yakin ingin menghapus aset ini?')) {
      const { error } = await supabase
        .from('fixed_assets')
        .delete()
        .eq('id', id);
      
      if (!error) {
        setAssets(assets.filter(a => a.id !== id));
      }
    }
  };

  const filteredAssets = assets.filter(a => 
    a.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = {
    total: assets.length,
    totalCost: assets.reduce((sum, a) => sum + a.acquisition_cost, 0),
    totalDepreciation: assets.reduce((sum, a) => sum + a.accumulated_depreciation, 0),
    totalBookValue: assets.reduce((sum, a) => sum + a.book_value, 0),
  };

  const getAssetTypeLabel = (type: string) => {
    return type === 'tangible' ? 'Berwujud' : 'Tidak Berwujud';
  };

  if (!currentCompany) return <div className="flex justify-center py-12">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-slide-in-up">
        <div>
          <h1 className="font-display text-3xl font-bold text-text">Fixed Assets</h1>
          <p className="text-text-muted mt-1">Kelola aset tetap (berwujud & tidak berwujud) dengan auto-depresiasi/amortisasi</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleGenerateAll}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2.5 bg-success/10 text-success border border-success/30 rounded-lg hover:bg-success/20 transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
            Generate Semua
          </button>
          <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium shadow-lg shadow-accent/30">
            <Plus className="w-5 h-5" /> Tambah Aset
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface rounded-xl border border-border p-4"><p className="text-text-muted text-xs">Total Aset</p><p className="text-2xl font-bold">{stats.total}</p></div>
        <div className="bg-surface rounded-xl border border-border p-4"><p className="text-text-muted text-xs">Harga Perolehan</p><p className="text-lg font-bold">{formatCurrency(stats.totalCost)}</p></div>
        <div className="bg-surface rounded-xl border border-border p-4"><p className="text-text-muted text-xs">Akum. Penyusutan</p><p className="text-lg font-bold text-danger">{formatCurrency(stats.totalDepreciation)}</p></div>
        <div className="bg-surface rounded-xl border border-border p-4"><p className="text-text-muted text-xs">Nilai Buku</p><p className="text-lg font-bold text-info">{formatCurrency(stats.totalBookValue)}</p></div>
      </div>

      {/* Search */}
      <div className="bg-surface rounded-xl border border-border p-6">
        <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" /><input type="text" placeholder="Cari kode atau nama aset..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg" /></div>
      </div>

      {/* Assets Table */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-background">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Kode</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Nama Aset</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Tipe</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-text-muted uppercase">Harga Perolehan</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-text-muted uppercase">Akum. Penyusutan</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-text-muted uppercase">Nilai Buku</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-text-muted uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-text-muted uppercase">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? <tr><td colSpan={8} className="text-center py-8">Loading...</td></tr> : (
                filteredAssets.map((asset) => (
                  <tr key={asset.id} className="hover:bg-background">
                    <td className="px-6 py-4 text-sm font-mono font-semibold">{asset.code}</td>
                    <td className="px-6 py-4 text-sm">{asset.name}</td>
                    <td className="px-6 py-4 text-sm"><span className={`px-2 py-1 rounded-full text-xs ${asset.asset_type === 'tangible' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>{getAssetTypeLabel(asset.asset_type)}</span></td>
                    <td className="px-6 py-4 text-right text-sm font-mono">{formatCurrency(asset.acquisition_cost)}</td>
                    <td className="px-6 py-4 text-right text-sm font-mono text-danger">{formatCurrency(asset.accumulated_depreciation)}</td>
                    <td className="px-6 py-4 text-right text-sm font-mono font-bold text-info">{formatCurrency(asset.book_value)}</td>
                    <td className="px-6 py-4 text-center"><span className={`px-2 py-1 rounded-full text-xs ${asset.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{asset.status === 'active' ? 'Aktif' : 'Nonaktif'}</span></td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => handleGenerateDepreciation(asset)} disabled={generating || asset.status !== 'active'} className="p-2 text-text-muted hover:text-success hover:bg-success/10 rounded-lg disabled:opacity-50" title="Generate Penyusutan">
                          <RefreshCw className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleViewHistory(asset)} className="p-2 text-text-muted hover:text-info hover:bg-info/10 rounded-lg" title="Riwayat">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDeleteAsset(asset.id)} className="p-2 text-text-muted hover:text-danger hover:bg-danger/10 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Tambah Aset */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-auto">
          <div className="bg-surface rounded-xl p-6 w-full max-w-2xl my-8">
            <h2 className="font-display text-xl font-bold text-text mb-4">Tambah Aset Baru</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium mb-1">Kode Aset *</label><input type="text" value={newAsset.code} onChange={e => setNewAsset({...newAsset, code: e.target.value})} className="w-full px-4 py-2 border rounded-lg" /></div>
                <div><label className="block text-sm font-medium mb-1">Nama Aset *</label><input type="text" value={newAsset.name} onChange={e => setNewAsset({...newAsset, name: e.target.value})} className="w-full px-4 py-2 border rounded-lg" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium mb-1">Kategori</label><input type="text" placeholder="Kendaraan, Peralatan, Software, dll" value={newAsset.category} onChange={e => setNewAsset({...newAsset, category: e.target.value})} className="w-full px-4 py-2 border rounded-lg" /></div>
                <div><label className="block text-sm font-medium mb-1">Tipe Aset</label><select value={newAsset.asset_type} onChange={e => setNewAsset({...newAsset, asset_type: e.target.value as any})} className="w-full px-4 py-2 border rounded-lg"><option value="tangible">Berwujud (Depresiasi)</option><option value="intangible">Tidak Berwujud (Amortisasi)</option></select></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium mb-1">Tanggal Perolehan</label><input type="date" value={newAsset.acquisition_date} onChange={e => setNewAsset({...newAsset, acquisition_date: e.target.value})} className="w-full px-4 py-2 border rounded-lg" /></div>
                <div><label className="block text-sm font-medium mb-1">Umur Ekonomis (tahun)</label><input type="number" value={newAsset.useful_life} onChange={e => setNewAsset({...newAsset, useful_life: parseInt(e.target.value) || 5})} className="w-full px-4 py-2 border rounded-lg" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium mb-1">Harga Perolehan</label><input type="number" value={newAsset.acquisition_cost || ''} onChange={e => setNewAsset({...newAsset, acquisition_cost: parseInt(e.target.value) || 0})} className="w-full px-4 py-2 border rounded-lg" /></div>
                <div><label className="block text-sm font-medium mb-1">Nilai Residu</label><input type="number" value={newAsset.salvage_value || ''} onChange={e => setNewAsset({...newAsset, salvage_value: parseInt(e.target.value) || 0})} className="w-full px-4 py-2 border rounded-lg" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium mb-1">Akun Beban / Amortisasi</label><select value={newAsset.expense_account_id || ''} onChange={e => setNewAsset({...newAsset, expense_account_id: parseInt(e.target.value) || null})} className="w-full px-4 py-2 border rounded-lg"><option value="">Pilih Akun</option>{coaList.filter(c => c.type === 'expense').map(acc => (<option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>))}</select></div>
                <div><label className="block text-sm font-medium mb-1">Akun Akumulasi (Opsional)</label><select value={newAsset.accumulated_account_id || ''} onChange={e => setNewAsset({...newAsset, accumulated_account_id: parseInt(e.target.value) || null})} className="w-full px-4 py-2 border rounded-lg"><option value="">-- Auto pilih --</option>{coaList.filter(c => c.type === 'asset').map(acc => (<option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>))}</select></div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6"><button onClick={() => setShowAddModal(false)} className="px-4 py-2 border rounded-lg">Batal</button><button onClick={handleAddAsset} className="px-4 py-2 bg-accent text-white rounded-lg">Simpan</button></div>
          </div>
        </div>
      )}

      {/* Modal Riwayat */}
      {showHistoryModal && selectedAsset && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-auto">
            <div className="flex justify-between items-center mb-4"><h2 className="font-display text-xl font-bold">Riwayat {selectedAsset.name}</h2><button onClick={() => setShowHistoryModal(false)} className="text-gray-500">✕</button></div>
            {history.length === 0 ? <p className="text-text-muted">Belum ada riwayat penyusutan</p> : (
              <div className="space-y-2">
                {history.map((h, idx) => (
                  <div key={idx} className="bg-gray-50 p-3 rounded-lg"><div className="flex justify-between"><span className="font-medium">Periode: {h.period}</span><span className="text-danger">{formatCurrency(h.amount)}</span></div><div className="text-sm">Akumulasi: {formatCurrency(h.accumulated_depreciation)} | Nilai Buku: {formatCurrency(h.book_value)}</div></div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
