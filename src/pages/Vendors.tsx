import { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, Mail, Phone, Building2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useCompany } from '../contexts/CompanyContext';

type Vendor = {
  id: number;
  name: string;
  npwp: string;
  address: string;
  phone: string;
  email: string;
  bank_name: string;
  bank_account: string;
  payment_term: number;
};

export default function Vendors() {
  const { currentCompany } = useCompany();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    npwp: '',
    address: '',
    phone: '',
    email: '',
    bank_name: '',
    bank_account: '',
    payment_term: 30,
  });

  useEffect(() => {
    if (currentCompany?.id) {
      fetchVendors();
    }
  }, [currentCompany]);

  const fetchVendors = async () => {
    if (!currentCompany?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('vendors')
      .select('*')
      .eq('company_id', currentCompany.id)
      .order('created_at', { ascending: false });
    setVendors(data || []);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!formData.name) {
      alert('Nama vendor wajib diisi');
      return;
    }
    if (!currentCompany?.id) return;

    if (editingVendor) {
      const { error } = await supabase
        .from('vendors')
        .update({
          name: formData.name,
          npwp: formData.npwp,
          address: formData.address,
          phone: formData.phone,
          email: formData.email,
          bank_name: formData.bank_name,
          bank_account: formData.bank_account,
          payment_term: formData.payment_term,
        })
        .eq('id', editingVendor.id);
      if (error) alert('Gagal update: ' + error.message);
      else fetchVendors();
    } else {
      const { error } = await supabase
        .from('vendors')
        .insert([{
          company_id: currentCompany.id,
          name: formData.name,
          npwp: formData.npwp,
          address: formData.address,
          phone: formData.phone,
          email: formData.email,
          bank_name: formData.bank_name,
          bank_account: formData.bank_account,
          payment_term: formData.payment_term,
        }]);
      if (error) alert('Gagal simpan: ' + error.message);
      else fetchVendors();
    }
    setShowModal(false);
    resetForm();
  };

  const handleDelete = async (id: number) => {
    if (confirm('Yakin ingin menghapus vendor ini?')) {
      const { error } = await supabase.from('vendors').delete().eq('id', id);
      if (error) alert('Gagal hapus: ' + error.message);
      else fetchVendors();
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      npwp: '',
      address: '',
      phone: '',
      email: '',
      bank_name: '',
      bank_account: '',
      payment_term: 30,
    });
    setEditingVendor(null);
  };

  const openEdit = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setFormData({
      name: vendor.name,
      npwp: vendor.npwp || '',
      address: vendor.address || '',
      phone: vendor.phone || '',
      email: vendor.email || '',
      bank_name: vendor.bank_name || '',
      bank_account: vendor.bank_account || '',
      payment_term: vendor.payment_term || 30,
    });
    setShowModal(true);
  };

  const filteredVendors = vendors.filter(v =>
    v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!currentCompany) return <div className="flex justify-center py-12">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-slide-in-up">
        <div>
          <h1 className="font-display text-3xl font-bold text-text">Vendor</h1>
          <p className="text-text-muted mt-1">Kelola data vendor / supplier</p>
        </div>
        <button onClick={() => { resetForm(); setShowModal(true); }} className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium shadow-lg shadow-accent/30">
          <Plus className="w-5 h-5" /> Tambah Vendor
        </button>
      </div>

      <div className="bg-surface rounded-xl border border-border p-6">
        <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" /><input type="text" placeholder="Cari vendor..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg" /></div>
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        {loading ? <div className="text-center py-12">Loading...</div> : (
          <div className="divide-y divide-border">
            {filteredVendors.map((vendor) => (
              <div key={vendor.id} className="p-4 hover:bg-background transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2"><h3 className="font-semibold text-text">{vendor.name}</h3><span className="text-xs text-text-muted">Term: {vendor.payment_term} hari</span></div>
                    <div className="grid grid-cols-2 gap-2 text-sm text-text-muted">
                      {vendor.email && <div className="flex items-center gap-1"><Mail className="w-3 h-3" /> {vendor.email}</div>}
                      {vendor.phone && <div className="flex items-center gap-1"><Phone className="w-3 h-3" /> {vendor.phone}</div>}
                      {vendor.npwp && <div className="col-span-2">NPWP: {vendor.npwp}</div>}
                      {vendor.bank_name && <div className="col-span-2">Bank: {vendor.bank_name} - {vendor.bank_account}</div>}
                    </div>
                  </div>
                  <div className="flex gap-2"><button onClick={() => openEdit(vendor)} className="p-2 text-text-muted hover:text-info hover:bg-info/10 rounded-lg"><Edit2 className="w-4 h-4" /></button><button onClick={() => handleDelete(vendor.id)} className="p-2 text-text-muted hover:text-danger hover:bg-danger/10 rounded-lg"><Trash2 className="w-4 h-4" /></button></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl p-6 w-full max-w-md">
            <h2 className="font-display text-xl font-bold text-text mb-4">{editingVendor ? 'Edit Vendor' : 'Tambah Vendor Baru'}</h2>
            <div className="space-y-3">
              <input type="text" placeholder="Nama Vendor *" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-4 py-2 border border-border rounded-lg" />
              <input type="text" placeholder="NPWP" value={formData.npwp} onChange={(e) => setFormData({ ...formData, npwp: e.target.value })} className="w-full px-4 py-2 border border-border rounded-lg" />
              <input type="text" placeholder="Telepon" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="w-full px-4 py-2 border border-border rounded-lg" />
              <input type="email" placeholder="Email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full px-4 py-2 border border-border rounded-lg" />
              <textarea placeholder="Alamat" rows={2} value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="w-full px-4 py-2 border border-border rounded-lg" />
              <input type="text" placeholder="Nama Bank" value={formData.bank_name} onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })} className="w-full px-4 py-2 border border-border rounded-lg" />
              <input type="text" placeholder="Nomor Rekening" value={formData.bank_account} onChange={(e) => setFormData({ ...formData, bank_account: e.target.value })} className="w-full px-4 py-2 border border-border rounded-lg" />
              <div><label className="block text-sm font-medium text-text mb-1">Term Pembayaran (hari)</label><input type="number" value={formData.payment_term} onChange={(e) => setFormData({ ...formData, payment_term: parseInt(e.target.value) })} className="w-full px-4 py-2 border border-border rounded-lg" /></div>
            </div>
            <div className="flex justify-end gap-3 mt-6"><button onClick={() => setShowModal(false)} className="px-4 py-2 border border-border rounded-lg">Batal</button><button onClick={handleSave} className="px-4 py-2 bg-accent text-white rounded-lg">Simpan</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
