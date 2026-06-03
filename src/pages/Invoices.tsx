pertinya kode yang Anda kirim sudah benar. Namun, saya akan menyediakan ulang file `Invoices.tsx` yang sudah diperbaiki lengkap:

```tsx
import { useState, useEffect } from 'react';
import { Plus, Search, Eye, Send, DollarSign, Clock, CheckCircle, Download, X, Trash2, User, FolderOpen } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useCompany } from '../contexts/CompanyContext';
import { useAuth } from '../contexts/AuthContext';

type Invoice = {
  id: number;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  customer_id: number;
  customer_name: string;
  project_id: number | null;
  subtotal: number;
  ppn: number;
  total: number;
  status: string;
  notes: string;
};

type InvoiceItem = {
  id?: number;
  description: string;
  quantity: number;
  unit_price: number;
  discount: number;
  amount: number;
};

type Customer = {
  id: number;
  name: string;
  type: string;
};

type Project = {
  id: number;
  code: string;
  name: string;
};

export default function Invoices() {
  const { currentCompany } = useCompany();
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  
  const [formData, setFormData] = useState({
    customer_id: 0,
    customer_name: '',
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    project_id: null as number | null,
    notes: '',
    items: [{ description: '', quantity: 1, unit_price: 0, discount: 0, amount: 0 }] as InvoiceItem[],
  });
  
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  useEffect(() => {
    if (currentCompany?.id) {
      fetchInvoices();
      fetchCustomers();
      fetchProjects();
    }
  }, [currentCompany]);

  const fetchInvoices = async () => {
    if (!currentCompany?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('invoices')
      .select('*')
      .eq('company_id', currentCompany.id)
      .order('created_at', { ascending: false });
    setInvoices(data || []);
    setLoading(false);
  };

  const fetchCustomers = async () => {
    if (!currentCompany?.id) return;
    const { data } = await supabase
      .from('contacts')
      .select('id, name, type')
      .eq('company_id', currentCompany.id)
      .eq('type', 'customer');
    setCustomers(data || []);
  };

  const fetchProjects = async () => {
    if (!currentCompany?.id) return;
    const { data } = await supabase
      .from('projects')
      .select('id, code, name')
      .eq('company_id', currentCompany.id);
    setProjects(data || []);
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    
    if (field === 'quantity' || field === 'unit_price' || field === 'discount') {
      const qty = newItems[index].quantity;
      const price = newItems[index].unit_price;
      const disc = newItems[index].discount;
      newItems[index].amount = (qty * price) - disc;
    }
    
    setFormData({ ...formData, items: newItems });
  };

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { description: '', quantity: 1, unit_price: 0, discount: 0, amount: 0 }]
    });
  };

  const removeItem = (index: number) => {
    if (formData.items.length > 1) {
      const newItems = formData.items.filter((_, i) => i !== index);
      setFormData({ ...formData, items: newItems });
    }
  };

  const calculateTotals = () => {
    const subtotal = formData.items.reduce((sum, item) => sum + item.amount, 0);
    const ppnRate = currentCompany?.id === 1 ? 0.11 : 0.011;
    const ppn = Math.round(subtotal * ppnRate);
    return { subtotal, ppn, total: subtotal + ppn };
  };

  const { subtotal, ppn, total } = calculateTotals();

  const handleCreateInvoice = async () => {
    if (!formData.customer_id || formData.items.length === 0) {
      alert('Lengkapi customer dan minimal 1 item');
      return;
    }
    if (!currentCompany?.id) return;

    const year = new Date().getFullYear();
    const count = invoices.length + 1;
    const invoiceNumber = `INV/${currentCompany.id}/${year}/${String(count).padStart(4, '0')}`;

    const { data: invoiceData, error: invoiceError } = await supabase
      .from('invoices')
      .insert([{
        company_id: currentCompany.id,
        invoice_number: invoiceNumber,
        invoice_date: formData.invoice_date,
        due_date: formData.due_date,
        customer_id: formData.customer_id,
        customer_name: formData.customer_name,
        project_id: formData.project_id,
        subtotal: subtotal,
        ppn: ppn,
        total: total,
        status: 'draft',
        notes: formData.notes,
        created_by: user?.email,
      }])
      .select();

    if (invoiceError) {
      alert('Gagal membuat invoice: ' + invoiceError.message);
      return;
    }

    const invoiceId = invoiceData[0].id;

    for (const item of formData.items) {
      await supabase.from('invoice_items').insert([{
        invoice_id: invoiceId,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount: item.discount,
        amount: item.amount,
      }]);
    }

    alert('Invoice berhasil dibuat');
    setShowModal(false);
    resetForm();
    fetchInvoices();
  };

  const resetForm = () => {
    setFormData({
      customer_id: 0,
      customer_name: '',
      invoice_date: new Date().toISOString().split('T')[0],
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      project_id: null,
      notes: '',
      items: [{ description: '', quantity: 1, unit_price: 0, discount: 0, amount: 0 }],
    });
    setCustomerSearch('');
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
  };

  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch = inv.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         inv.customer_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || inv.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800',
      sent: 'bg-blue-100 text-blue-800',
      partial: 'bg-yellow-100 text-yellow-800',
      paid: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return badges[status] || 'bg-gray-100';
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      draft: 'Draft',
      sent: 'Terkirim',
      partial: 'Dibayar Sebagian',
      paid: 'Lunas',
      cancelled: 'Dibatalkan',
    };
    return labels[status] || status;
  };

  const stats = {
    total: invoices.length,
    totalAmount: invoices.reduce((sum, inv) => sum + inv.total, 0),
    paid: invoices.filter(i => i.status === 'paid').length,
    pending: invoices.filter(i => i.status === 'sent' || i.status === 'partial').length,
  };

  if (!currentCompany) {
    return <div className="flex justify-center py-12">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-slide-in-up">
        <div>
          <h1 className="font-display text-3xl font-bold text-text">Invoice Penjualan</h1>
          <p className="text-text-muted mt-1">Kelola faktur penjualan dengan customer</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium shadow-lg shadow-accent/30">
          <Plus className="w-5 h-5" /> Buat Invoice
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface rounded-xl border border-border p-4">
          <p className="text-text-muted text-xs font-medium">Total Invoice</p>
          <p className="text-text text-2xl font-bold font-display mt-1">{stats.total}</p>
        </div>
        <div className="bg-surface rounded-xl border border-border p-4">
          <p className="text-text-muted text-xs font-medium">Total Amount</p>
          <p className="text-text text-lg font-bold font-display mt-1">{formatCurrency(stats.totalAmount)}</p>
        </div>
        <div className="bg-surface rounded-xl border border-border p-4">
          <p className="text-text-muted text-xs font-medium">Lunas</p>
          <p className="text-text text-2xl font-bold font-display mt-1">{stats.paid}</p>
        </div>
        <div className="bg-surface rounded-xl border border-border p-4">
          <p className="text-text-muted text-xs font-medium">Pending</p>
          <p className="text-text text-2xl font-bold font-display mt-1">{stats.pending}</p>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-border p-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
            <input type="text" placeholder="Cari nomor invoice atau customer..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg" />
          </div>
          <div className="flex gap-2">
            {['all', 'draft', 'sent', 'partial', 'paid'].map(status => (
              <button key={status} onClick={() => setFilterStatus(status)} className={`px-4 py-2.5 rounded-lg font-medium capitalize ${filterStatus === status ? 'bg-accent text-white' : 'border border-border hover:bg-background'}`}>
                {status === 'all' ? 'Semua' : getStatusLabel(status)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-background">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">No. Invoice</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Tanggal</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-text-muted uppercase">Customer</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-text-muted uppercase">Total</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-text-muted uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-text-muted uppercase">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8">Loading...</td>
                </tr>
              ) : (
                filteredInvoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-background transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono font-semibold text-text">{invoice.invoice_number}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-text">{invoice.invoice_date}</td>
                    <td className="px-6 py-4 text-sm text-text">{invoice.customer_name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-mono font-semibold text-text">{formatCurrency(invoice.total)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${getStatusBadge(invoice.status)}`}>
                        {getStatusLabel(invoice.status)}
                      </span>
                    </td
