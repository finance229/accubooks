import { useState, useEffect } from 'react';
import { Building2, User, Bell, Shield, Palette, Globe, Save, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useCompany } from '../contexts/CompanyContext';
import { useAuth } from '../contexts/AuthContext';

type Company = {
  id: number;
  name: string;
  npwp: string;
  address: string;
  phone: string;
};

export default function Settings() {
  const { currentCompany } = useCompany();
  const { user } = useAuth();
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState('company');
  const [formData, setFormData] = useState({
    name: '',
    npwp: '',
    address: '',
    phone: '',
  });

  useEffect(() => {
    if (currentCompany?.id) {
      fetchCompany();
    }
  }, [currentCompany]);

  const fetchCompany = async () => {
    if (!currentCompany?.id) return;
    
    setLoading(true);
    const { data } = await supabase
      .from('companies')
      .select('*')
      .eq('id', currentCompany.id)
      .single();
    
    if (data) {
      setCompany(data);
      setFormData({
        name: data.name || '',
        npwp: data.npwp || '',
        address: data.address || '',
        phone: data.phone || '',
      });
    }
    setLoading(false);
  };

  const handleSaveCompany = async () => {
    if (!currentCompany?.id) return;
    
    setSaving(true);
    const { error } = await supabase
      .from('companies')
      .update({
        name: formData.name,
        npwp: formData.npwp,
        address: formData.address,
        phone: formData.phone,
        updated_at: new Date().toISOString(),
      })
      .eq('id', currentCompany.id);
    
    if (!error) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
    setSaving(false);
  };

  const tabs = [
    { id: 'company', label: 'Perusahaan', icon: Building2, color: 'blue' },
    { id: 'appearance', label: 'Tampilan', icon: Palette, color: 'purple' },
    { id: 'period', label: 'Periode', icon: Globe, color: 'green' },
    { id: 'security', label: 'Keamanan', icon: Shield, color: 'red' },
  ];

  const renderCompanyTab = () => (
    <div className="space-y-6">
      <div className="bg-surface rounded-xl border border-border p-6">
        <h3 className="font-display text-lg font-bold text-text mb-4">Informasi Perusahaan</h3>
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-text mb-2">Nama Perusahaan</label><input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent" /></div>
          <div><label className="block text-sm font-medium text-text mb-2">NPWP</label><input type="text" value={formData.npwp} onChange={(e) => setFormData({ ...formData, npwp: e.target.value })} className="w-full px-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent" placeholder="00.000.000.0-000.000" /></div>
          <div><label className="block text-sm font-medium text-text mb-2">Alamat</label><textarea value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} rows={3} className="w-full px-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent resize-none" /></div>
          <div><label className="block text-sm font-medium text-text mb-2">Telepon</label><input type="text" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="w-full px-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent" /></div>
        </div>
      </div>
      <div className="bg-surface rounded-xl border border-border p-6"><h3 className="font-display text-lg font-bold text-text mb-4">Database Status</h3><div className="flex items-center gap-3"><div className="flex items-center gap-2"><CheckCircle className="w-5 h-5 text-success" /><span className="text-sm text-text">Terhubung ke Supabase</span></div><div className="w-px h-4 bg-border" /><div className="flex items-center gap-2"><CheckCircle className="w-5 h-5 text-success" /><span className="text-sm text-text">Google Drive Terintegrasi</span></div></div></div>
    </div>
  );

  const renderAppearanceTab = () => (
    <div className="space-y-6">
      <div className="bg-surface rounded-xl border border-border p-6"><h3 className="font-display text-lg font-bold text-text mb-4">Pilih Tema</h3><div className="grid grid-cols-2 gap-4"><button className="p-4 border-2 border-accent rounded-lg bg-accent/5"><div className="w-full h-24 bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg mb-3" /><p className="text-sm font-medium text-text">Tema Gelap (Aktif)</p></button><button className="p-4 border-2 border-border rounded-lg hover:border-accent transition-colors"><div className="w-full h-24 bg-gradient-to-br from-white to-gray-100 rounded-lg mb-3 border border-border" /><p className="text-sm font-medium text-text">Tema Terang</p></button></div></div>
      <div className="bg-surface rounded-xl border border-border p-6"><h3 className="font-display text-lg font-bold text-text mb-4">Preferensi Tampilan</h3><div className="space-y-4"><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-text">Animasi Halaman</p><p className="text-xs text-text-muted">Aktifkan animasi transisi antar halaman</p></div><label className="relative inline-flex items-center cursor-pointer"><input type="checkbox" className="sr-only peer" defaultChecked /><div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-accent/25 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div></label></div><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-text">Sidebar Compact</p><p className="text-xs text-text-muted">Persempit sidebar untuk ruang lebih luas</p></div><label className="relative inline-flex items-center cursor-pointer"><input type="checkbox" className="sr-only peer" /><div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-accent/25 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div></label></div></div></div>
    </div>
  );

  const renderPeriodTab = () => (
    <div className="space-y-6">
      <div className="bg-surface rounded-xl border border-border p-6"><h3 className="font-display text-lg font-bold text-text mb-4">Periode Akuntansi</h3><div className="space-y-4"><div><label className="block text-sm font-medium text-text mb-2">Tahun Buku Aktif</label><select className="w-full px-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent bg-surface"><option>2024</option><option>2023</option><option>2022</option></select></div><div><label className="block text-sm font-medium text-text mb-2">Bulan Berjalan</label><select className="w-full px-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent bg-surface"><option>Januari 2024</option><option>Februari 2024</option><option>Maret 2024</option><option>April 2024</option><option>Mei 2024</option><option>Juni 2024</option><option>Juli 2024</option><option>Agustus 2024</option><option>September 2024</option><option>Oktober 2024</option><option>November 2024</option><option>Desember 2024</option></select></div><div><label className="block text-sm font-medium text-text mb-2">Mata Uang</label><select className="w-full px-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent bg-surface"><option>IDR - Rupiah Indonesia</option><option>USD - US Dollar</option></select></div></div></div>
      <div className="bg-surface rounded-xl border border-border p-6"><h3 className="font-display text-lg font-bold text-text mb-4">Format Angka</h3><div className="space-y-4"><div><label className="block text-sm font-medium text-text mb-2">Format Mata Uang</label><select className="w-full px-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent bg-surface"><option>Rp 1.000.000</option><option>Rp 1,000,000</option><option>1.000.000 IDR</option></select></div><div><label className="block text-sm font-medium text-text mb-2">Format Tanggal</label><select className="w-full px-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent bg-surface"><option>DD/MM/YYYY</option><option>MM/DD/YYYY</option><option>YYYY-MM-DD</option></select></div></div></div>
    </div>
  );

  const renderSecurityTab = () => (
    <div className="space-y-6">
      <div className="bg-surface rounded-xl border border-border p-6"><h3 className="font-display text-lg font-bold text-text mb-4">Ubah Password</h3><div className="space-y-4"><div><label className="block text-sm font-medium text-text mb-2">Password Lama</label><input type="password" className="w-full px-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent" /></div><div><label className="block text-sm font-medium text-text mb-2">Password Baru</label><input type="password" className="w-full px-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent" /></div><div><label className="block text-sm font-medium text-text mb-2">Konfirmasi Password Baru</label><input type="password" className="w-full px-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent" /></div></div></div>
      <div className="bg-surface rounded-xl border border-border p-6"><h3 className="font-display text-lg font-bold text-text mb-4">Sesi Login</h3><div className="space-y-3"><div className="flex items-center justify-between py-2 border-b border-border"><div><p className="text-sm font-medium text-text">Chrome on Windows</p><p className="text-xs text-text-muted">Login 2 hari yang lalu • Jakarta, Indonesia</p></div><button className="text-danger text-sm">Revoke</button></div><div className="flex items-center justify-between py-2"><div><p className="text-sm font-medium text-text">Safari on iPhone</p><p className="text-xs text-text-muted">Login 5 hari yang lalu • Jakarta, Indonesia</p></div><button className="text-danger text-sm">Revoke</button></div></div></div>
      <div className="bg-danger/10 border border-danger/30 rounded-xl p-6"><h3 className="font-semibold text-danger mb-2">⚠️ Zona Berbahaya</h3><p className="text-sm text-text-muted mb-4">Tindakan ini tidak dapat dibatalkan dan akan menghapus semua data perusahaan.</p><button className="px-4 py-2 bg-danger text-white rounded-lg">Hapus Semua Data</button></div>
    </div>
  );

  const renderTabContent = () => {
    if (activeTab === 'company') return renderCompanyTab();
    if (activeTab === 'appearance') return renderAppearanceTab();
    if (activeTab === 'period') return renderPeriodTab();
    return renderSecurityTab();
  };

  if (!currentCompany) {
    return <div className="flex justify-center py-12">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="animate-slide-in-up"><h1 className="font-display text-3xl font-bold text-text">Pengaturan</h1><p className="text-text-muted mt-1">Kelola preferensi dan konfigurasi sistem</p></div>
      <div className="flex flex-wrap gap-2 border-b border-border">{tabs.map((tab) => (<button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-all ${activeTab === tab.id ? 'border-b-2 border-accent text-accent' : 'text-text-muted hover:text-text'}`}><tab.icon className={`w-4 h-4 text-${tab.color}-500`} />{tab.label}</button>))}</div>
      <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>{loading ? <div className="flex justify-center py-12">Loading...</div> : renderTabContent()}</motion.div>
      {activeTab === 'company' && (<div className="sticky bottom-0 bg-background pt-4 pb-2"><div className="flex items-center justify-end gap-3">{saveSuccess && (<div className="flex items-center gap-2 text-success text-sm"><CheckCircle className="w-4 h-4" />Perubahan disimpan!</div>)}<button onClick={handleSaveCompany} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors shadow-lg shadow-accent/30 disabled:opacity-50">{saving ? (<><RefreshCw className="w-4 h-4 animate-spin" />Menyimpan...</>) : (<><Save className="w-4 h-4" />Simpan Perubahan</>)}</button></div></div>)}
    </div>
  );
}
