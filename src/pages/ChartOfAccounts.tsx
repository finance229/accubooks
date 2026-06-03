import { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, CheckCircle, XCircle, ChevronRight, ChevronDown } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useCompany } from '../contexts/CompanyContext';
import { useAuth } from '../contexts/AuthContext';

type Account = {
  id: number;
  code: string;
  suffix: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  category: string;
  parent_id: number | null;
  is_active: boolean;
  children?: Account[];
};

const accountTypes = [
  { value: 'all', label: 'Semua Tipe', color: 'gray' },
  { value: 'asset', label: 'Aset', color: 'blue' },
  { value: 'liability', label: 'Kewajiban', color: 'red' },
  { value: 'equity', label: 'Ekuitas', color: 'purple' },
  { value: 'revenue', label: 'Pendapatan', color: 'green' },
  { value: 'expense', label: 'Beban', color: 'orange' },
];

export default function ChartOfAccounts() {
  const { currentCompany } = useCompany();
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [newAccount, setNewAccount] = useState({
    code: '',
    suffix: '',
    name: '',
    type: 'asset' as Account['type'],
    category: '',
    parent_id: null as number | null,
  });

  useEffect(() => {
    if (currentCompany?.id) {
      fetchAccounts();
    }
  }, [currentCompany]);

  const fetchAccounts = async () => {
    if (!currentCompany?.id) return;
    
    setLoading(true);
    const { data } = await supabase
      .from('coa')
      .select('*')
      .eq('company_id', currentCompany.id)
      .order('code', { ascending: true });
    
    if (data) {
      const accountsMap = new Map();
      const roots: Account[] = [];
      
      data.forEach((acc: any) => {
        accountsMap.set(acc.id, { ...acc, children: [] });
      });
      
      data.forEach((acc: any) => {
        const account = accountsMap.get(acc.id);
        if (acc.parent_id && accountsMap.has(acc.parent_id)) {
          const parent = accountsMap.get(acc.parent_id);
          parent.children.push(account);
        } else {
          roots.push(account);
        }
      });
      
      setAccounts(roots);
    }
    setLoading(false);
  };

  const handleAddAccount = async () => {
    if (!newAccount.code || !newAccount.name) return;
    if (!currentCompany?.id) return;

    const { data, error } = await supabase
      .from('coa')
      .insert([{
        company_id: currentCompany.id,
        code: newAccount.code,
        suffix: newAccount.suffix || '',
        name: newAccount.name,
        type: newAccount.type,
        category: newAccount.category || 'other',
        parent_id: newAccount.parent_id,
        is_active: true,
      }])
      .select();

    if (!error && data) {
      fetchAccounts();
      setShowAddModal(false);
      setNewAccount({ code: '', suffix: '', name: '', type: 'asset', category: '', parent_id: null });
    }
  };

  const toggleExpand = (id: number) => {
    const newExpanded = new Set(expandedIds);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedIds(newExpanded);
  };

  const getAccountTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      asset: 'blue',
      liability: 'red',
      equity: 'purple',
      revenue: 'green',
      expense: 'orange',
    };
    return colors[type] || 'gray';
  };

  const renderAccountRow = (account: Account, level: number = 0) => {
    const hasChildren = account.children && account.children.length > 0;
    const isExpanded = expandedIds.has(account.id);
    const isHeader = account.category === 'header';
    
    return (
      <React.Fragment key={account.id}>
        <motion.tr
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={`hover:bg-background transition-colors ${isHeader ? 'bg-background/50 font-semibold' : ''}`}
        >
          <td className="px-6 py-3 whitespace-nowrap">
            <div className="flex items-center gap-2" style={{ paddingLeft: `${level * 24}px` }}>
              {hasChildren && (
                <button onClick={() => toggleExpand(account.id)} className="p-0.5">
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              )}
              <span className="text-sm font-mono font-semibold text-text">{account.code}</span>
            </div>
           </td>
          <td className="px-6 py-3 whitespace-nowrap">
            {account.suffix && (
              <span className="inline-flex px-2 py-1 rounded text-xs font-mono font-bold bg-accent/10 text-accent">
                {account.suffix}
              </span>
            )}
           </td>
          <td className="px-6 py-3">
            <span className={`text-sm ${isHeader ? 'font-bold text-text uppercase' : 'text-text'}`}>
              {account.name}
            </span>
           </td>
          <td className="px-6 py-3 whitespace-nowrap">
            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-${getAccountTypeColor(account.type)}-100 text-${getAccountTypeColor(account.type)}-800`}>
              {account.type}
            </span>
           </td>
          <td className="px-6 py-3 whitespace-nowrap text-sm text-text-muted capitalize">
            {account.category?.replace('_', ' ')}
           </td>
          <td className="px-6 py-3 whitespace-nowrap text-center">
            {account.is_active ? (
              <CheckCircle className="w-5 h-5 text-success inline" />
            ) : (
              <XCircle className="w-5 h-5 text-danger inline" />
            )}
           </td>
          <td className="px-6 py-3 whitespace-nowrap text-right">
            <div className="flex items-center justify-end gap-2">
              <button className="p-2 text-text-muted hover:text-info hover:bg-info/10 rounded-lg transition-colors">
                <Edit2 className="w-4 h-4" />
              </button>
              <button className="p-2 text-text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
           </td>
        </motion.tr>
        {hasChildren && isExpanded && account.children?.map(child => renderAccountRow(child, level + 1))}
      </React.Fragment>
    );
  };

  const filterAccounts = (accountsList: Account[]): Account[] => {
    return accountsList.filter(acc => {
      const matchesSearch = 
        acc.code.includes(searchTerm) ||
        acc.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter = filterType === 'all' || acc.type === filterType;
      return matchesSearch && matchesFilter;
    }).map(acc => ({
      ...acc,
      children: acc.children ? filterAccounts(acc.children) : []
    }));
  };

  const filteredAccounts = filterAccounts(accounts);

  const stats = {
    total: accounts.reduce((count, acc) => count + 1 + (acc.children?.length || 0), 0),
  };

  const React = require('react');

  if (!currentCompany) {
    return <div className="flex justify-center py-12">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-slide-in-up">
        <div>
          <h1 className="font-display text-3xl font-bold text-text">Chart of Accounts</h1>
          <p className="text-text-muted mt-1">Daftar akun perusahaan dengan sistem suffix</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors shadow-lg shadow-accent/30">
          <Plus className="w-5 h-5" strokeWidth={2} />
          Tambah Akun
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-surface rounded-xl border border-border p-4">
          <p className="text-text-muted text-xs font-medium">Total Akun</p>
          <p className="text-text text-2xl font-bold font-display mt-1">{stats.total}</p>
        </motion.div>
        {accountTypes.filter(t => t.value !== 'all').map((type, idx) => (
          <motion.div key={type.value} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: (idx + 1) * 0.05 }} className="bg-surface rounded-xl border border-border p-4">
            <p className="text-text-muted text-xs font-medium capitalize">{type.label}</p>
            <p className="text-text text-2xl font-bold font-display mt-1">0</p>
          </motion.div>
        ))}
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-surface rounded-xl border border-border p-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
            <input type="text" placeholder="Cari kode atau nama akun..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg" />
          </div>
          <div className="flex gap-2 flex-wrap">
            {accountTypes.map((type) => (
              <button key={type.value} onClick={() => setFilterType(type.value)} className={`px-4 py-2.5 rounded-lg font-medium transition-colors ${filterType === type.value ? 'bg-accent text-white shadow-lg shadow-accent/30' : 'border border-border hover:bg-background'}`}>
                {type.label}
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
                <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Kode</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Suffix</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Nama Akun</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Tipe</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Kategori</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-text-muted uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-text-muted uppercase">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={7} className="text-center py-8">Loading...<\/td></tr>
              ) : (
                filteredAccounts.map(account => renderAccountRow(account))
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl p-6 w-full max-w-md">
            <h2 className="font-display text-xl font-bold text-text mb-4">Tambah Akun Baru</h2>
            <div className="space-y-4">
              <input type="text" placeholder="Kode Akun *" value={newAccount.code} onChange={(e) => setNewAccount({ ...newAccount, code: e.target.value })} className="w-full px-4 py-2 border border-border rounded-lg" />
              <input type="text" placeholder="Suffix (A/B/C)" value={newAccount.suffix} onChange={(e) => setNewAccount({ ...newAccount, suffix: e.target.value })} className="w-full px-4 py-2 border border-border rounded-lg" />
              <input type="text" placeholder="Nama Akun *" value={newAccount.name} onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })} className="w-full px-4 py-2 border border-border rounded-lg" />
              <select value={newAccount.type} onChange={(e) => setNewAccount({ ...newAccount, type: e.target.value as Account['type'] })} className="w-full px-4 py-2 border border-border rounded-lg">
                <option value="asset">Aset</option>
                <option value="liability">Kewajiban</option>
                <option value="equity">Ekuitas</option>
                <option value="revenue">Pendapatan</option>
                <option value="expense">Beban</option>
              </select>
              <input type="text" placeholder="Kategori" value={newAccount.category} onChange={(e) => setNewAccount({ ...newAccount, category: e.target.value })} className="w-full px-4 py-2 border border-border rounded-lg" />
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 border border-border rounded-lg">Batal</button>
              <button onClick={handleAddAccount} className="px-4 py-2 bg-accent text-white rounded-lg">Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
