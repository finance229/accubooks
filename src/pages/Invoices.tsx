import { useState, useEffect } from 'react';
import { Plus, Search, Eye, Send, DollarSign, Clock, CheckCircle, Download, X, Trash2, User, FolderOpen, Edit } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useCompany } from '../contexts/CompanyContext';
import { useAuth } from '../contexts/AuthContext';
import { generateInvoiceHTML } from '../lib/invoiceTemplate';

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
  paid_amount: number;
  last_payment_date: string;
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
  email: string;
  address: string;
  phone: string;
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
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState('transfer');
  const [editItems, setEditItems] = useState<InvoiceItem[]>([]);
  const [editForm, setEditForm] = useState({
    invoice_date: '',
    due_date: '',
    notes: '',
  });
  
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
      .select('id, name, type, email, address, phone')
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
        paid_amount: 0,
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

  // ========== EDIT INVOICE ==========
  const handleOpenEditModal = async (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setEditForm({
      invoice_date: invoice.invoice_date,
      due_date: invoice.due_date,
      notes: invoice.notes || '',
    });
    
    const { data: items } = await supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', invoice.id);
    
    setEditItems(items || []);
    setShowEditModal(true);
  };

  const handleEditItem = (index: number, field: keyof InvoiceItem, value: any) => {
    const newItems = [...editItems];
    newItems[index] = { ...newItems[index], [field]: value };
    
    if (field === 'quantity' || field === 'unit_price' || field === 'discount') {
      const qty = newItems[index].quantity;
      const price = newItems[index].unit_price;
      const disc = newItems[index].discount;
      newItems[index].amount = (qty * price) - disc;
    }
    
    setEditItems(newItems);
  };

  const addEditItem = () => {
    setEditItems([...editItems, { description: '', quantity: 1, unit_price: 0, discount: 0, amount: 0 }]);
  };

  const removeEditItem = (index: number) => {
    if (editItems.length > 1) {
      setEditItems(editItems.filter((_, i) => i !== index));
    }
  };

  const calculateEditTotals = () => {
    const subtotal = editItems.reduce((sum, item) => sum + item.amount, 0);
    const ppnRate = currentCompany?.id === 1 ? 0.11 : 0.011;
    const ppn = Math.round(subtotal * ppnRate);
    return { subtotal, ppn, total: subtotal + ppn };
  };

  const handleSaveEdit = async () => {
    if (!selectedInvoice) return;
    
    const { subtotal: newSubtotal, ppn: newPpn, total: newTotal } = calculateEditTotals();
    
    const { error: invoiceError } = await supabase
      .from('invoices')
      .update({
        invoice_date: editForm.invoice_date,
        due_date: editForm.due_date,
        subtotal: newSubtotal,
        ppn: newPpn,
        total: newTotal,
        notes: editForm.notes,
      })
      .eq('id', selectedInvoice.id);
    
    if (invoiceError) {
      alert('Gagal update invoice');
      return;
    }
    
    // Hapus items lama
    await supabase.from('invoice_items').delete().eq('invoice_id', selectedInvoice.id);
    
    // Insert items baru
    for (const item of editItems) {
      await supabase.from('invoice_items').insert([{
        invoice_id: selectedInvoice.id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount: item.discount,
        amount: item.amount,
      }]);
    }
    
    alert('Invoice berhasil diupdate');
    setShowEditModal(false);
    fetchInvoices();
  };

  // ========== DOWNLOAD PDF ==========
  const handleDownloadPDF = async (invoice: Invoice) => {
    try {
      const { data: items } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', invoice.id);
      
      const { data: company } = await supabase
        .from('companies')
        .select('*')
        .eq('id', currentCompany?.id)
        .single();
      
      const { data: customer } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', invoice.customer_id)
        .single();
      
      const html = generateInvoiceHTML(invoice, company, customer, items || []);
      
      const win = window.open();
      win?.document.write(html);
      win?.document.close();
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Gagal generate PDF');
    }
  };

  // ========== KIRIM EMAIL ==========
  const handleSendEmail = async (invoice: Invoice) => {
    try {
      const { data: customer } = await supabase
        .from('contacts')
        .select('email')
        .eq('id', invoice.customer_id)
        .single();
      
      if (!customer?.email) {
        alert('Customer belum memiliki alamat email');
        return;
      }
      
      const link = `${window.location.origin}/invoices/${invoice.id}`;
      const subject = `Invoice ${invoice.invoice_number} dari ${currentCompany?.name}`;
      const body = `Yth. ${invoice.customer_name},\n\nBerikut adalah invoice untuk transaksi Anda.\n\nLink invoice: ${link}\n\nTerima kasih atas kepercayaan Anda.\n\nSalam,\n${currentCompany?.name}`;
      
      window.location.href = `mailto:${customer.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    } catch (error) {
      console.error('Error sending email:', error);
      alert('Gagal membuka email client');
    }
  };

  // ========== VERIFIKASI INVOICE ==========
  const handleVerifyInvoice = async (invoice: Invoice) => {
    const { error } = await supabase
      .from('invoices')
      .update({ status: 'verified' })
      .eq('id', invoice.id);
    
    if (error) {
      alert('Gagal verifikasi invoice');
    } else {
      alert('Invoice berhasil diverifikasi. Tanda tangan akan muncul di PDF.');
      fetchInvoices();
    }
  };

  // ========== BAYAR INVOICE ==========
  const handleOpenPaymentModal = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    const paid = invoice.paid_amount || 0;
    const remaining = invoice.total - paid;
    setPaymentAmount(remaining.toString());
    setShowPaymentModal(true);
  };

  const handleRecordPayment = async () => {
    if (!selectedInvoice) return;
    
    const amount = parseInt(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Masukkan jumlah pembayaran yang valid');
      return;
    }
    
    const currentPaid = selectedInvoice.paid_amount || 0;
    const newPaid = currentPaid + amount;
    const newStatus = newPaid >= selectedInvoice.total ? 'paid' : 'partial';
    
    const { error: invoiceError } = await supabase
      .from('invoices')
      .update({ 
        paid_amount: newPaid,
        status: newStatus,
        last_payment_date: paymentDate
      })
      .eq('id', selectedInvoice.id);
    
    if (invoiceError) {
      alert('Gagal mencatat pembayaran');
      return;
    }
    
    await supabase
      .from('invoice_payments')
      .insert([{
        invoice_id: selectedInvoice.id,
        payment_date: paymentDate,
        amount: amount,
        payment_method: paymentMethod,
        created_by: user?.email,
      }]);
    
    alert(`Pembayaran ${formatCurrency(amount)} berhasil dicatat`);
    setShowPaymentModal(false);
    setPaymentAmount('');
    fetchInvoices();
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
      verified: 'bg-green-100 text-green-800',
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
      verified: 'Terverifikasi',
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
    pending: invoices.filter(i => i.status === 'sent' || i.status === 'partial' || i.status === 'verified').length,
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
            {['all', 'draft', 'sent', 'verified', 'partial', 'paid'].map(status => (
              <button key={status} onClick={() => setFilterStatus(status)} className={`px-4 py-2.5 rounded-lg font-medium capitalize ${filterStatus === status ? 'bg-accent text-white' : 'border border-border hover:bg-background'}`}>
                {status === 'all' ? 'Semua' : getStatusLabel(status)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-x-auto">
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
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => { setSelectedInvoice(invoice); setShowDetailModal(true); }} className="p-2 text-text-muted hover:text-info hover:bg-info/10 rounded-lg" title="Lihat Detail">
                        <Eye className="w-4 h-4" />
                      </button>
                      {invoice.status === 'draft' && (
                        <button onClick={() => handleOpenEditModal(invoice)} className="p-2 text-text-muted hover:text-info hover:bg-info/10 rounded-lg" title="Edit">
                          <Edit className="w-4 h-4" />
                        </button>
                      )}
                      {(invoice.status === 'draft' || invoice.status === 'sent' || invoice.status === 'verified') && (
                        <button onClick={() => handleVerifyInvoice(invoice)} className="p-2 text-text-muted hover:text-warning hover:bg-warning/10 rounded-lg" title="Verifikasi">
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}
                      {/* Tombol Bayar muncul SELALU kecuali status paid */}
                      {invoice.status !== 'paid' && (
                        <button onClick={() => handleOpenPaymentModal(invoice)} className="p-2 text-text-muted hover:text-success hover:bg-success/10 rounded-lg" title="Bayar">
                          <DollarSign className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => handleDownloadPDF(invoice)} className="p-2 text-text-muted hover:text-info hover:bg-info/10 rounded-lg" title="Download PDF">
                        <Download className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleSendEmail(invoice)} className="p-2 text-text-muted hover:text-success hover:bg-success/10 rounded-lg" title="Kirim ke Email">
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Buat Invoice */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-auto">
          <div className="bg-surface rounded-xl p-6 w-full max-w-4xl my-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-display text-xl font-bold text-text">Buat Invoice Baru</h2>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="relative">
                <label className="block text-sm font-medium text-text mb-1">Customer *</label>
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-text-muted" />
                  <input 
                    type="text" 
                    placeholder="Cari customer..." 
                    value={customerSearch} 
                    onChange={(e) => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); }} 
                    className="flex-1 px-4 py-2 border border-border rounded-lg" 
                  />
                </div>
                {showCustomerDropdown && filteredCustomers.length > 0 && (
                  <div className="absolute z-10 w-full bg-surface border border-border rounded-lg mt-1 max-h-48 overflow-auto">
                    {filteredCustomers.map(c => (
                      <button 
                        key={c.id} 
                        className="w-full text-left px-4 py-2 hover:bg-background" 
                        onClick={() => { 
                          setFormData({ ...formData, customer_id: c.id, customer_name: c.name }); 
                          setCustomerSearch(c.name); 
                          setShowCustomerDropdown(false); 
                        }}
                      >
                        {c.name} - {c.email}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text mb-1">Tanggal Invoice</label>
                  <input type="date" value={formData.invoice_date} onChange={(e) => setFormData({ ...formData, invoice_date: e.target.value })} className="w-full px-4 py-2 border border-border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text mb-1">Jatuh Tempo</label>
                  <input type="date" value={formData.due_date} onChange={(e) => setFormData({ ...formData, due_date: e.target.value })} className="w-full px-4 py-2 border border-border rounded-lg" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-text mb-1">Proyek (Opsional)</label>
                <select value={formData.project_id || ''} onChange={(e) => setFormData({ ...formData, project_id: e.target.value ? parseInt(e.target.value) : null })} className="w-full px-4 py-2 border border-border rounded-lg">
                  <option value="">-- Pilih Proyek --</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-text mb-1">Item</label>
                <button onClick={addItem} className="text-sm text-accent mb-2">+ Tambah Item</button>
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-background">
                      <tr>
                        <th className="px-2 py-2 text-left text-xs text-text-muted">Deskripsi</th>
                        <th className="px-2 py-2 text-center text-xs text-text-muted w-20">Qty</th>
                        <th className="px-2 py-2 text-right text-xs text-text-muted w-32">Harga</th>
                        <th className="px-2 py-2 text-right text-xs text-text-muted w-32">Diskon</th>
                        <th className="px-2 py-2 text-right text-xs text-text-muted w-32">Jumlah</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-2 py-2">
                            <input type="text" placeholder="Deskripsi" value={item.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} className="w-full px-2 py-1 border border-border rounded text-sm" />
                          </td>
                          <td className="px-2 py-2">
                            <input type="number" value={item.quantity} onChange={(e) => updateItem(idx, 'quantity', parseInt(e.target.value) || 0)} className="w-full px-2 py-1 border border-border rounded text-sm text-right" />
                          </td>
                          <td className="px-2 py-2">
                            <input type="number" value={item.unit_price} onChange={(e) => updateItem(idx, 'unit_price', parseInt(e.target.value) || 0)} className="w-full px-2 py-1 border border-border rounded text-sm text-right" />
                          </td>
                          <td className="px-2 py-2">
                            <input type="number" value={item.discount} onChange={(e) => updateItem(idx, 'discount', parseInt(e.target.value) || 0)} className="w-full px-2 py-1 border border-border rounded text-sm text-right" />
                          </td>
                          <td className="px-2 py-2 text-right text-sm font-mono">
                            {formatCurrency(item.amount)}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <button onClick={() => removeItem(idx)}>
                              <Trash2 className="w-4 h-4 text-danger" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-background">
                      <tr>
                        <td colSpan={4} className="px-2 py-2 text-right font-medium">Subtotal</td>
                        <td className="px-2 py-2 text-right font-mono">{formatCurrency(subtotal)}</td>
                        <td></td>
                      </tr>
                      <tr>
                        <td colSpan={4} className="px-2 py-2 text-right font-medium">PPN {currentCompany?.id === 1 ? '11%' : '1.1%'}</td>
                        <td className="px-2 py-2 text-right font-mono">{formatCurrency(ppn)}</td>
                        <td></td>
                      </tr>
                      <tr className="font-bold">
                        <td colSpan={4} className="px-2 py-2 text-right">TOTAL</td>
                        <td className="px-2 py-2 text-right text-accent">{formatCurrency(total)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-text mb-1">Catatan</label>
                <textarea rows={2} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="w-full px-4 py-2 border border-border rounded-lg" />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowModal(false); resetForm(); }} className="px-4 py-2 border border-border rounded-lg">Batal</button>
              <button onClick={handleCreateInvoice} className="px-4 py-2 bg-accent text-white rounded-lg">Simpan Invoice</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Edit Invoice */}
      {showEditModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-auto">
          <div className="bg-surface rounded-xl p-6 w-full max-w-4xl my-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-display text-xl font-bold text-text">Edit Invoice - {selectedInvoice.invoice_number}</h2>
              <button onClick={() => setShowEditModal(false)} className="text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text mb-1">Tanggal Invoice</label>
                  <input type="date" value={editForm.invoice_date} onChange={(e) => setEditForm({ ...editForm, invoice_date: e.target.value })} className="w-full px-4 py-2 border border-border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text mb-1">Jatuh Tempo</label>
                  <input type="date" value={editForm.due_date} onChange={(e) => setEditForm({ ...editForm, due_date: e.target.value })} className="w-full px-4 py-2 border border-border rounded-lg" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-text mb-1">Item</label>
                <button onClick={addEditItem} className="text-sm text-accent mb-2">+ Tambah Item</button>
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-background">
                      <tr>
                        <th className="px-2 py-2 text-left text-xs text-text-muted">Deskripsi</th>
                        <th className="px-2 py-2 text-center text-xs text-text-muted w-20">Qty</th>
                        <th className="px-2 py-2 text-right text-xs text-text-muted w-32">Harga</th>
                        <th className="px-2 py-2 text-right text-xs text-text-muted w-32">Diskon</th>
                        <th className="px-2 py-2 text-right text-xs text-text-muted w-32">Jumlah</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {editItems.map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-2 py-2">
                            <input type="text" placeholder="Deskripsi" value={item.description} onChange={(e) => handleEditItem(idx, 'description', e.target.value)} className="w-full px-2 py-1 border border-border rounded text-sm" />
                          </td>
                          <td className="px-2 py-2">
                            <input type="number" value={item.quantity} onChange={(e) => handleEditItem(idx, 'quantity', parseInt(e.target.value) || 0)} className="w-full px-2 py-1 border border-border rounded text-sm text-right" />
                          </td>
                          <td className="px-2 py-2">
                            <input type="number" value={item.unit_price} onChange={(e) => handleEditItem(idx, 'unit_price', parseInt(e.target.value) || 0)} className="w-full px-2 py-1 border border-border rounded text-sm text-right" />
                          </td>
                          <td className="px-2 py-2">
                            <input type="number" value={item.discount} onChange={(e) => handleEditItem(idx, 'discount', parseInt(e.target.value) || 0)} className="w-full px-2 py-1 border border-border rounded text-sm text-right" />
                          </td>
                          <td className="px-2 py-2 text-right text-sm font-mono">
                            {formatCurrency(item.amount)}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <button onClick={() => removeEditItem(idx)}>
                              <Trash2 className="w-4 h-4 text-danger" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-background">
                      <tr>
                        <td colSpan={4} className="px-2 py-2 text-right font-medium">Subtotal</td>
                        <td className="px-2 py-2 text-right font-mono">{formatCurrency(calculateEditTotals().subtotal)}</td>
                        <td></td>
                      </tr>
                      <tr>
                        <td colSpan={4} className="px-2 py-2 text-right font-medium">PPN {currentCompany?.id === 1 ? '11%' : '1.1%'}</td>
                        <td className="px-2 py-2 text-right font-mono">{formatCurrency(calculateEditTotals().ppn)}</td>
                        <td></td>
                      </tr>
                      <tr className="font-bold">
                        <td colSpan={4} className="px-2 py-2 text-right">TOTAL</td>
                        <td className="px-2 py-2 text-right text-accent">{formatCurrency(calculateEditTotals().total)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-text mb-1">Catatan</label>
                <textarea rows={2} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} className="w-full px-4 py-2 border border-border rounded-lg" />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowEditModal(false)} className="px-4 py-2 border border-border rounded-lg">Batal</button>
              <button onClick={handleSaveEdit} className="px-4 py-2 bg-accent text-white rounded-lg">Simpan Perubahan</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detail Invoice */}
      {showDetailModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl p-6 w-full max-w-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-display text-xl font-bold text-text">Detail Invoice</h2>
              <button onClick={() => setShowDetailModal(false)} className="text-gray-500">✕</button>
            </div>
            <div className="space-y-3">
              <p><strong>No. Invoice:</strong> {selectedInvoice.invoice_number}</p>
              <p><strong>Tanggal:</strong> {selectedInvoice.invoice_date}</p>
              <p><strong>Jatuh Tempo:</strong> {selectedInvoice.due_date}</p>
              <p><strong>Customer:</strong> {selectedInvoice.customer_name}</p>
              <p><strong>Subtotal:</strong> {formatCurrency(selectedInvoice.subtotal)}</p>
              <p><strong>PPN:</strong> {formatCurrency(selectedInvoice.ppn)}</p>
              <p><strong>Total:</strong> {formatCurrency(selectedInvoice.total)}</p>
              <p><strong>Sudah Dibayar:</strong> {formatCurrency(selectedInvoice.paid_amount || 0)}</p>
              <p><strong>Sisa:</strong> {formatCurrency((selectedInvoice.total || 0) - (selectedInvoice.paid_amount || 0))}</p>
              <p><strong>Status:</strong> 
                <span className={`inline-flex ml-2 px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(selectedInvoice.status)}`}>
                  {getStatusLabel(selectedInvoice.status)}
                </span>
              </p>
              {selectedInvoice.notes && <p><strong>Catatan:</strong> {selectedInvoice.notes}</p>}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => handleDownloadPDF(selectedInvoice)} className="px-4 py-2 bg-accent text-white rounded-lg">
                <Download className="w-4 h-4 inline mr-2" /> Download PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Pembayaran */}
      {showPaymentModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-display text-xl font-bold text-text">Pembayaran Invoice</h2>
              <button onClick={() => setShowPaymentModal(false)} className="text-gray-500">✕</button>
            </div>
            <div className="space-y-4">
              <div><p className="text-sm text-text-muted">No. Invoice</p><p className="font-semibold">{selectedInvoice.invoice_number}</p></div>
              <div><p className="text-sm text-text-muted">Total Tagihan</p><p className="font-semibold">{formatCurrency(selectedInvoice.total)}</p></div>
              <div><p className="text-sm text-text-muted">Sudah Dibayar</p><p className="font-semibold text-success">{formatCurrency(selectedInvoice.paid_amount || 0)}</p></div>
              <div><p className="text-sm text-text-muted">Sisa Tagihan</p><p className="font-semibold text-warning">{formatCurrency(selectedInvoice.total - (selectedInvoice.paid_amount || 0))}</p></div>
              <div><label className="block text-sm font-medium text-text mb-1">Jumlah Bayar</label><input type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className="w-full px-4 py-2 border border-border rounded-lg" /></div>
              <div><label className="block text-sm font-medium text-text mb-1">Tanggal Bayar</label><input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="w-full px-4 py-2 border border-border rounded-lg" /></div>
              <div><label className="block text-sm font-medium text-text mb-1">Metode Pembayaran</label><select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-full px-4 py-2 border border-border rounded-lg">
                <option value="transfer">Transfer Bank</option>
                <option value="cash">Tunai</option>
                <option value="credit_card">Kartu Kredit</option>
              </select></div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowPaymentModal(false)} className="px-4 py-2 border border-border rounded-lg">Batal</button>
              <button onClick={handleRecordPayment} className="px-4 py-2 bg-accent text-white rounded-lg">Catat Pembayaran</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
