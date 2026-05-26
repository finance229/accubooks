import { useState, useEffect } from 'react';
import { Plus, Search, Mail, Phone, Building2, UserCircle, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';

export default function Contacts() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('Semua');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newContact, setNewContact] = useState({
    name: '',
    type: 'customer',
    email: '',
    phone: '',
    address: '',
  });

  useEffect(() => {
    fetchContacts();
  }, []);

  const fetchContacts = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('company_id', 1)
      .order('created_at', { ascending: false });
    
    setContacts(data || []);
    setLoading(false);
  };

  const handleAddContact = async () => {
    if (!newContact.name) return;

    const { data, error } = await supabase
      .from('contacts')
      .insert([{
        company_id: 1,
        name: newContact.name,
        type: newContact.type,
        email: newContact.email || null,
        phone: newContact.phone || null,
        address: newContact.address || null,
        balance: 0,
      }])
      .select();

    if (!error && data) {
      setContacts([data[0], ...contacts]);
      setShowAddModal(false);
      setNewContact({ name: '', type: 'customer', email: '', phone: '', address: '' });
    }
  };

  const filteredContacts = contacts.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesFilter = filterType === 'Semua' || 
                         (filterType === 'Pelanggan' && c.type === 'customer') ||
                         (filterType === 'Vendor' && c.type === 'vendor');
    return matchesSearch && matchesFilter;
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(Math.abs(amount));
  };

  const stats = {
    total: contacts.length,
    customers: contacts.filter(c => c.type === 'customer').length,
    vendors: contacts.filter(c => c.type === 'vendor').length,
    totalReceivables: contacts.filter(c => c.balance > 0).reduce((sum, c) => sum + c.balance, 0),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-slide-in-up">
        <div>
          <h1 className="font-display text-3xl font-bold text-text">Kontak</h1>
          <p className="text-text-muted mt-1">Kelola pelanggan dan vendor Anda</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors shadow-lg shadow-accent/30"
        >
          <Plus className="w-5 h-5" strokeWidth={2} />
          Kontak Baru
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Total Kontak', value: stats.total, icon: UserCircle, color: 'blue' },
          { label: 'Pelanggan', value: stats.customers, icon: Building2, color: 'green' },
          { label: 'Vendor', value: stats.vendors, icon: Building2, color: 'purple' },
          { label: 'Total Piutang', value: formatCurrency(stats.totalReceivables), icon: Building2, color: 'orange' },
        ].map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-surface rounded-xl border border-border p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-text-muted text-sm font-medium">{stat.label}</p>
                <p className="text-text text-2xl font-bold font-display mt-1">{stat.value}</p>
              </div>
              <div className={`w-12 h-12 rounded-lg bg-${stat.color}-500/10 flex items-center justify-center`}>
                <stat.icon className={`w-6 h-6 text-${stat.color}-500`} strokeWidth={2} />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-surface rounded-xl border border-border p-6"
      >
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
            <input
              type="text"
              placeholder="Cari kontak..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>
          <div className="flex gap-2">
            {['Semua', 'Pelanggan', 'Vendor'].map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-4 py-2.5 rounded-lg font-medium transition-colors ${
                  filterType === type
                    ? 'bg-accent text-white shadow-lg shadow-accent/30'
                    : 'border border-border hover:bg-background'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      )}

      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredContacts.map((contact, index) => (
            <motion.div
              key={contact.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="bg-surface rounded-xl border border-border p-6 card-hover cursor-pointer"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-accent" strokeWidth={2} />
                </div>
                <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                  contact.type === 'customer' ? 'bg-green-100 text-green-800' : 'bg-purple-100 text-purple-800'
                }`}>
                  {contact.type === 'customer' ? 'Pelanggan' : 'Vendor'}
                </span>
              </div>

              <h3 className="font-display text-lg font-bold text-text mb-3">{contact.name}</h3>

              <div className="space-y-2 mb-4">
                {contact.email && (
                  <div className="flex items-center gap-2 text-sm text-text-muted">
                    <Mail className="w-4 h-4" />
                    <span className="truncate">{contact.email}</span>
                  </div>
                )}
                {contact.phone && (
                  <div className="flex items-center gap-2 text-sm text-text-muted">
                    <Phone className="w-4 h-4" />
                    <span>{contact.phone}</span>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-border flex items-center justify-between">
                <div>
                  <p className="text-xs text-text-muted">Saldo</p>
                  <p className={`text-lg font-bold font-mono ${
                    contact.balance > 0 ? 'text-success' : contact.balance < 0 ? 'text-danger' : 'text-text'
                  }`}>
                    {formatCurrency(contact.balance)}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl p-6 w-full max-w-md">
            <h2 className="font-display text-xl font-bold text-text mb-4">Tambah Kontak Baru</h2>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Nama Kontak *"
                value={newContact.name}
                onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                className="w-full px-4 py-2 border border-border rounded-lg"
              />
              <select
                value={newContact.type}
                onChange={(e) => setNewContact({ ...newContact, type: e.target.value as 'customer' | 'vendor' })}
                className="w-full px-4 py-2 border border-border rounded-lg"
              >
                <option value="customer">Pelanggan</option>
                <option value="vendor">Vendor</option>
              </select>
              <input
                type="email"
                placeholder="Email"
                value={newContact.email}
                onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                className="w-full px-4 py-2 border border-border rounded-lg"
              />
              <input
                type="text"
                placeholder="Telepon"
                value={newContact.phone}
                onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                className="w-full px-4 py-2 border border-border rounded-lg"
              />
              <textarea
                placeholder="Alamat"
                value={newContact.address}
                onChange={(e) => setNewContact({ ...newContact, address: e.target.value })}
                className="w-full px-4 py-2 border border-border rounded-lg resize-none"
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 border border-border rounded-lg">Batal</button>
              <button onClick={handleAddContact} className="px-4 py-2 bg-accent text-white rounded-lg">Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
