import { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, Calculator, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useCompany } from '../contexts/CompanyContext';
import { useAuth } from '../contexts/AuthContext';

type FixedAsset = {
  id: number;
  code: string;
  name: string;
  category: string;
  acquisition_date: string;
  acquisition_cost: number;
  salvage_value: number;
  useful_life: number;
  accumulated_depreciation: number;
  book_value: number;
  status: string;
};

export default function FixedAssets() {
  const { currentCompany } = useCompany();
  const { user } = useAuth();
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDepreciationModal, setShowDepreciationModal] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<FixedAsset | null>(null);
  const [newAsset, setNewAsset] = useState({
    code: '',
    name: '',
    category: '',
    acquisition_date: '',
    acquisition_cost: 0,
    salvage_value: 0,
    useful_life: 5,
  });

  useEffect(() => {
    if (currentCompany?.id) {
      fetchAssets();
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

  const handleAddAsset = async () => {
    if (!newAsset.code || !newAsset.name) return;
    if (!currentCompany?.id) return;

    const bookValue = newAsset.acquisition_cost;

    const { data, error } = await supabase
      .from('fixed_assets')
      .insert([{
        company_id: currentCompany.id,
        code: newAsset.code,
        name: newAsset.name,
        category: newAsset.category,
        acquisition_date: newAsset.acquisition_date,
        acquisition_cost: newAsset.acquisition_cost,
        salvage_value: newAsset.salvage_value,
        useful_life: newAsset.useful_life,
        accumulated_depreciation: 0,
        book_value: bookValue,
        status: 'active',
      }])
      .select();

    if (!error && data) {
      setAssets([data[0], ...assets]);
      setShowAddModal(false);
      setNewAsset({ code: '', name: '', category: '', acquisition_date: '', acquisition_cost: 0, salvage_value: 0, useful_life: 5 });
    }
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

  const calculateDepreciation = (asset: FixedAsset) => {
    const yearlyDepreciation = (asset.acquisition_cost - asset.salvage_value) / asset.useful_life;
    const monthlyDepreciation = yearlyDepreciation / 12;
    const currentYear = new Date().getFullYear();
    const acquisitionYear = new Date(asset.acquisition_date).getFullYear();
    const yearsUsed = Math.max(0, currentYear - acquisitionYear);
    const accumulated = Math.min(yearlyDepreciation * yearsUsed, asset.acquisition_cost - asset.salvage_value);
    const currentBookValue = asset.acquisition_cost - accumulated;

    return { yearlyDepreciation, monthlyDepreciation, accumulated, currentBookValue };
  };

  const handleCalculateDepreciation = (asset: FixedAsset) => {
    setSelectedAsset(asset);
    setShowDepreciationModal(true);
  };

  const filteredAssets = assets.filter(a => 
    a.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const stats = {
    total: assets.length,
    totalCost: assets.reduce((sum, a) => sum + a.acquisition_cost, 0),
    totalDepreciation: assets.reduce((sum, a) => sum + a.accumulated_depreciation, 0),
    totalBookValue: assets.reduce((sum, a) => sum + a.book_value, 0),
  };

  if (!currentCompany) {
    return <div className="flex justify-center py-12">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-slide-in-up">
        <div>
          <h1 className="font-display text-3xl font-bold text-text">Fixed Assets</h1>
          <p className="text-text-muted mt-1">Kelola aset tetap dengan auto-depreciation</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors shadow-lg shadow-accent/30">
          <Plus className="w-5 h-5" strokeWidth={2} />
          Tambah Aset
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface rounded-xl border border-border p-4">
          <p className="text-text-muted text-xs font-medium">Total Aset</p>
          <p className="text-text text-2xl font-bold font-display mt-1">{stats.total}</p>
        </div>
        <div className="bg-surface rounded-xl border border-border p-4">
          <p className="text-text-muted text-xs font-medium">Harga Perolehan</p>
          <p className="text-text text-lg font-bold font-display mt-1">{formatCurrency(stats.totalCost)}</p>
        </div>
        <div className="bg-surface rounded-xl border border-border p-4">
          <p className="text-text-muted text-xs font-medium">Akum. Penyusutan</p>
          <p className="text-text text-lg font-bold font-display mt-1">{formatCurrency(stats.totalDepreciation)}</p>
        </div>
        <div className="bg-surface rounded-xl border border-border p-4">
          <p className="text-text-muted text-xs font-medium">Nilai Buku</p>
          <p className="text-text text-lg font-bold font-display mt-1">{formatCurrency(stats.totalBookValue)}</p>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-border p-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
          <input type="text" placeholder="Cari kode atau nama aset..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent" />
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-background">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Kode</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Nama Aset</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Kategori</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-text-muted uppercase">Harga Perolehan</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-text-muted uppercase">Akum. Penyusutan</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-text-muted uppercase">Nilai Buku</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-text-muted uppercase">Umur</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-text-muted uppercase">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-8">Loading...</td>
                </tr>
              ) : (
                filteredAssets.map((asset, index) => (
                  <motion.tr key={asset.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * 0.05 }} className="hover:bg-background">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono font-semibold text-text">{asset.code}</td>
                    <td className="px-6 py-4 text-sm text-text">{asset.name}</td>
                    <td className="px-6 py-4 text-sm text-text">{asset.category}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-mono text-text">{formatCurrency(asset.acquisition_cost)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-mono text-danger">{formatCurrency(asset.accumulated_depreciation)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-mono font-bold text-info">{formatCurrency(asset.book_value)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-text">{asset.useful_life} tahun</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => handleCalculateDepreciation(asset)} className="p-2 text-text-muted hover:text-info hover:bg-info/10 rounded-lg transition-colors" title="Hitung Penyusutan">
                          <Calculator className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDeleteAsset(asset.id)} className="p-2 text-text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-warning/10 border border-warning/30 rounded-xl p-6">
        <h3 className="font-semibold text-text mb-2">💡 Auto-Depreciation</h3>
        <p className="text-sm text-text-muted">Sistem akan otomatis menghitung dan membuat jurnal penyusutan setiap akhir bulan. Metode penyusutan: Straight Line (Garis Lurus).</p>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl p-6 w-full max-w-md">
            <h2 className="font-display text-xl font-bold text-text mb-4">Tambah Aset Baru</h2>
            <div className="space-y-4">
              <input type="text" placeholder="Kode Aset *" value={newAsset.code} onChange={(e) => setNewAsset({ ...newAsset, code: e.target.value })} className="w-full px-4 py-2 border border-border rounded-lg" />
              <input type="text" placeholder="Nama Aset *" value={newAsset.name} onChange={(e) => setNewAsset({ ...newAsset, name: e.target.value })} className="w-full px-4 py-2 border border-border rounded-lg" />
              <input type="text" placeholder="Kategori" value={newAsset.category} onChange={(e) => setNewAsset({ ...newAsset, category: e.target.value })} className="w-full px-4 py-2 border border-border rounded-lg" />
              <input type="date" placeholder="Tanggal Perolehan" value={newAsset.acquisition_date} onChange={(e) => setNewAsset({ ...newAsset, acquisition_date: e.target.value })} className="w-full px-4 py-2 border border-border rounded-lg" />
              <input type="number" placeholder="Harga Perolehan" value={newAsset.acquisition_cost || ''} onChange={(e) => setNewAsset({ ...newAsset, acquisition_cost: parseInt(e.target.value) || 0 })} className="w-full px-4 py-2 border border-border rounded-lg" />
              <input type="number" placeholder="Nilai Residu" value={newAsset.salvage_value || ''} onChange={(e) => setNewAsset({ ...newAsset, salvage_value: parseInt(e.target.value) || 0 })} className="w-full px-4 py-2 border border-border rounded-lg" />
              <input type="number" placeholder="Umur Ekonomis (tahun)" value={newAsset.useful_life} onChange={(e) => setNewAsset({ ...newAsset, useful_life: parseInt(e.target.value) || 5 })} className="w-full px-4 py-2 border border-border rounded-lg" />
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 border border-border rounded-lg">Batal</button>
              <button onClick={handleAddAsset} className="px-4 py-2 bg-accent text-white rounded-lg">Simpan</button>
            </div>
          </div>
        </div>
      )}

      {showDepreciationModal && selectedAsset && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl p-6 w-full max-w-md">
            <h2 className="font-display text-xl font-bold text-text mb-4">Kalkulasi Penyusutan</h2>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b"><span className="text-text-muted">Nama Aset</span><span className="font-semibold">{selectedAsset.name}</span></div>
              <div className="flex justify-between py-2 border-b"><span className="text-text-muted">Harga Perolehan</span><span>{formatCurrency(selectedAsset.acquisition_cost)}</span></div>
              <div className="flex justify-between py-2 border-b"><span className="text-text-muted">Nilai Residu</span><span>{formatCurrency(selectedAsset.salvage_value)}</span></div>
              <div className="flex justify-between py-2 border-b"><span className="text-text-muted">Umur Ekonomis</span><span>{selectedAsset.useful_life} tahun</span></div>
              <div className="flex justify-between py-2 border-b"><span className="text-text-muted">Penyusutan per Tahun</span><span className="text-info">{formatCurrency(calculateDepreciation(selectedAsset).yearlyDepreciation)}</span></div>
              <div className="flex justify-between py-2 border-b"><span className="text-text-muted">Penyusutan per Bulan</span><span className="text-info">{formatCurrency(calculateDepreciation(selectedAsset).monthlyDepreciation)}</span></div>
              <div className="flex justify-between py-2 border-b"><span className="text-text-muted">Akumulasi Penyusutan</span><span className="text-danger">{formatCurrency(calculateDepreciation(selectedAsset).accumulated)}</span></div>
              <div className="flex justify-between py-3 bg-blue-50 rounded-lg font-bold"><span>Nilai Buku Saat Ini</span><span className="text-info">{formatCurrency(calculateDepreciation(selectedAsset).currentBookValue)}</span></div>
            </div>
            <div className="flex justify-end mt-6"><button onClick={() => setShowDepreciationModal(false)} className="px-4 py-2 bg-accent text-white rounded-lg">Tutup</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
