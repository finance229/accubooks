import { useState, useEffect } from 'react';
import { Plus, Search, Eye, Send, DollarSign, Clock, CheckCircle, Download, X, Trash2, User, FolderOpen, Edit } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useCompany } from '../contexts/CompanyContext';
import { useAuth } from '../contexts/AuthContext';
import { 
  formatCurrency, 
  createGeneralJournal,
  getDefaultAccount,
  createCustomerIfNotExist,
  createProjectIfNotExist,
  getBankAccounts,
  generateInvoiceNo
} from '../lib/accountingHelpers';
import { generateInvoiceHTML } from '../lib/invoiceTemplate';
import { generateKwitansiHTML } from '../lib/kwitansiTemplate';
import AgingModal from '../components/AgingModal';

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
  additional: string;
  quantity: number;
  unit_price: number;
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
  budget: number;
  spent: number;
};

export default function Invoices() {
  const { currentCompany } = useCompany();
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showAgingModal, setShowAgingModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState('transfer');
  const [selectedBankId, setSelectedBankId] = useState(0);
  
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', email: '', phone: '', address: '' });
  
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProject, setNewProject] = useState({ code: '', name: '', budget: 0 });
  
  const [formData, setFormData] = useState({
    customer_id: 0,
    customer_name: '',
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    project_id: null as number | null,
    notes: '',
    items: [{ description: '', additional: '', quantity: 1, unit_price: 0, amount: 0 }] as InvoiceItem[],
  });
  
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  useEffect(() => {
    if (currentCompany?.id) {
      fetchInvoices();
      fetchCustomers();
      fetchProjects();
      fetchBankAccounts();
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
      .eq('type', 'customer')
      .order('name');
    setCustomers(data || []);
  };

  const fetchProjects = async () => {
    if (!currentCompany?.id) return;
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('company_id', currentCompany.id)
      .eq('status', 'active');
    setProjects(data || []);
  };

  const fetchBankAccounts = async () => {
    if (!currentCompany?.id) return;
    const banks = await getBankAccounts(currentCompany.id);
    setBankAccounts(banks);
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    
    if (field === 'quantity' || field === 'unit_price') {
      const qty = newItems[index].quantity || 0;
      const price = newItems[index].unit_price || 0;
      newItems[index].amount = qty * price;
    }
    
    setFormData({ ...formData, items: newItems });
  };

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { description: '', additional: '', quantity: 1, unit_price: 0, amount: 0 }]
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

  const handleCreateCustomer = async () => {
    if (!newCustomer.name) {
      alert('Nama customer wajib diisi');
      return;
    }
    try {
      const customerId = await createCustomerIfNotExist(
        currentCompany!.id,
        newCustomer.name,
        newCustomer.email,
        newCustomer.phone,
        newCustomer.address
      );
      await fetchCustomers();
      setFormData({ ...formData, customer_id: customerId, customer_name: newCustomer.name });
      setCustomerSearch(newCustomer.name);
      setShowNewCustomerModal(false);
      setNewCustomer({ name: '', email: '', phone: '', address: '' });
      alert('Customer berhasil ditambahkan');
    } catch (error) {
      alert('Gagal menambahkan customer');
    }
  };

  const handleCreateProject = async () => {
    if (!newProject.code || !newProject.name) {
      alert('Kode dan nama proyek wajib diisi');
      return;
    }
    try {
      const projectId = await createProjectIfNotExist(
        currentCompany!.id,
        newProject.code,
        newProject.name,
        newProject.budget
      );
      await fetchProjects();
      setFormData({ ...formData, project_id: projectId });
      setShowNewProjectModal(false);
      setNewProject({ code: '', name: '', budget: 0 });
      alert('Proyek berhasil ditambahkan');
    } catch (error) {
      alert('Gagal menambahkan proyek');
    }
  };

  const handleCreateInvoice = async () => {
    if (!formData.customer_id || formData.items.length === 0) {
      alert('Lengkapi customer dan minimal 1 item');
      return;
    }
    if (!currentCompany?.id) return;
    
    const projectCode = formData.project_id 
      ? projects.find(p => p.id === formData.project_id)?.code || null
      : null;
    const invoiceNumber = await generateInvoiceNo(
      currentCompany.id,
      new Date(formData.invoice_date),
      projectCode
    );

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
        additional: item.additional || '',
        quantity: item.quantity,
        unit_price: item.unit_price,
        amount: item.amount,
      }]);
    }

    alert('Invoice berhasil dibuat');
    setShowModal(false);
    resetForm();
    fetchInvoices();
  };

  const openEditModal = async (invoice: Invoice) => {
    setEditingInvoice(invoice);
    
    const { data: items } = await supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', invoice.id);
    
    setFormData({
      customer_id: invoice.customer_id,
      customer_name: invoice.customer_name,
      invoice_date: invoice.invoice_date,
      due_date: invoice.due_date,
      project_id: invoice.project_id,
      notes: invoice.notes || '',
      items: items && items.length > 0 
        ? items.map(item => ({
            description: item.description,
            additional: item.additional || '',
            quantity: item.quantity,
            unit_price: item.unit_price,
            amount: item.amount,
          }))
        : [{ description: '', additional: '', quantity: 1, unit_price: 0, amount: 0 }],
    });
    
    setCustomerSearch(invoice.customer_name);
    setShowEditModal(true);
  };

  const handleUpdateInvoice = async () => {
    if (!editingInvoice) return;
    if (!formData.customer_id || formData.items.length === 0) {
      alert('Lengkapi customer dan minimal 1 item');
      return;
    }
    if (!currentCompany?.id) return;

    const { subtotal, ppn, total } = calculateTotals();

    const { error: invoiceError } = await supabase
      .from('invoices')
      .update({
        invoice_date: formData.invoice_date,
        due_date: formData.due_date,
        customer_id: formData.customer_id,
        customer_name: formData.customer_name,
        project_id: formData.project_id,
        subtotal: subtotal,
        ppn: ppn,
        total: total,
        notes: formData.notes,
      })
      .eq('id', editingInvoice.id);

    if (invoiceError) {
      alert('Gagal update invoice: ' + invoiceError.message);
      return;
    }

    await supabase
      .from('invoice_items')
      .delete()
      .eq('invoice_id', editingInvoice.id);

    for (const item of formData.items) {
      await supabase.from('invoice_items').insert([{
        invoice_id: editingInvoice.id,
        description: item.description,
        additional: item.additional || '',
        quantity: item.quantity,
        unit_price: item.unit_price,
        amount: item.amount,
      }]);
    }

    alert('Invoice berhasil diupdate!');
    setShowEditModal(false);
    setEditingInvoice(null);
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
      items: [{ description: '', additional: '', quantity: 1, unit_price: 0, amount: 0 }],
    });
    setCustomerSearch('');
  };

  const handleVerifyInvoice = async (invoice: Invoice) => {
    try {
      const receivableAcc = await getDefaultAccount(currentCompany!.id, 'receivable');
      const revenueAcc = await getDefaultAccount(currentCompany!.id, 'revenue');
      const ppnOutAcc = await getDefaultAccount(currentCompany!.id, 'ppn_out');
      
      if (!receivableAcc || !revenueAcc) {
        alert('Akun tidak ditemukan. Cek COA untuk company ' + currentCompany?.name);
        return;
      }

      const entries = [
        { account_id: receivableAcc.id, account_code: receivableAcc.code, account_name: receivableAcc.name, debit: invoice.total, credit: 0 },
        { account_id: revenueAcc.id, account_code: revenueAcc.code, account_name: revenueAcc.name, debit: 0, credit: invoice.subtotal },
      ];
      
      if (invoice.ppn > 0 && ppnOutAcc) {
        entries.push({ account_id: ppnOutAcc.id, account_code: ppnOutAcc.code, account_name: ppnOutAcc.name, debit: 0, credit: invoice.ppn });
      }

      const journalId = await createGeneralJournal(
        currentCompany!.id,
        invoice.invoice_date,
        `Penjualan invoice ${invoice.invoice_number} - ${invoice.customer_name}`,
        invoice.invoice_number,
        'INVOICE',
        invoice.id,
        entries,
        invoice.project_id || undefined
      );

      if (!journalId) {
        alert('Gagal membuat jurnal');
        return;
      }

      const { error } = await supabase
        .from('invoices')
        .update({ status: 'verified' })
        .eq('id', invoice.id);

      if (error) throw error;

      alert('Invoice berhasil diverifikasi');
      fetchInvoices();
    } catch (error) {
      console.error('Error:', error);
      alert('Gagal verifikasi');
    }
  };

  const handleOpenPaymentModal = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    const remaining = invoice.total - (invoice.paid_amount || 0);
    setPaymentAmount(remaining.toString());
    setSelectedBankId(0);
    setShowPaymentModal(true);
  };

  const handleRecordPayment = async () => {
    if (!selectedInvoice) return;
    
    const amount = parseInt(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Masukkan jumlah pembayaran yang valid');
      return;
    }
    if (!selectedBankId) {
      alert('Pilih akun bank/kas');
      return;
    }
    
    const currentPaid = selectedInvoice.paid_amount || 0;
    const newPaid = currentPaid + amount;
    const newStatus = newPaid >= selectedInvoice.total ? 'paid' : 'partial';
    
    const bankAccount = bankAccounts.find(b => b.id === selectedBankId);
    const receivableAcc = await getDefaultAccount(currentCompany!.id, 'receivable');
    
    if (!receivableAcc || !bankAccount) {
      alert('Akun tidak ditemukan');
      return;
    }
    
    const entries = [
      { account_id: bankAccount.id, account_code: bankAccount.code, account_name: bankAccount.name, debit: amount, credit: 0 },
      { account_id: receivableAcc.id, account_code: receivableAcc.code, account_name: receivableAcc.name, debit: 0, credit: amount },
    ];
    
    const journalId = await createGeneralJournal(
      currentCompany!.id,
      paymentDate,
      `Penerimaan pembayaran dari ${selectedInvoice.customer_name} untuk invoice ${selectedInvoice.invoice_number}`,
      selectedInvoice.invoice_number,
      'INVOICE_PAYMENT',
      selectedInvoice.id,
      entries,
      selectedInvoice.project_id || undefined
    );
    
    if (!journalId) {
      alert('Gagal membuat jurnal pembayaran');
      return;
    }
    
    const { error } = await supabase
      .from('invoices')
      .update({ 
        paid_amount: newPaid,
        status: newStatus,
        last_payment_date: paymentDate
      })
      .eq('id', selectedInvoice.id);
    
    if (error) {
      alert('Gagal mencatat pembayaran');
      return;
    }
    
    await supabase.from('invoice_payments').insert([{
      invoice_id: selectedInvoice.id,
      payment_date: paymentDate,
      amount: amount,
      payment_method: paymentMethod,
      bank_account_id: selectedBankId,
      created_by: user?.email,
    }]);
    
    alert(`Pembayaran ${formatCurrency(amount)} berhasil dicatat`);
    setShowPaymentModal(false);
    setPaymentAmount('');
    fetchInvoices();
  };

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
      console.error('Error:', error);
      alert('Gagal generate PDF');
    }
  };

  const handlePrintKwitansi = async (invoice: Invoice) => {
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
      
      const { data: payments } = await supabase
        .from('invoice_payments')
        .select('*')
        .eq('invoice_id', invoice.id)
        .order('created_at', { ascending: false })
        .limit(1);
      
      const payment = payments?.[0] || null;
      
      const html = generateKwitansiHTML(invoice, company, customer, items || [], payment);
      const win = window.open('', '_blank');
      win?.document.write(html);
      win?.document.close();
    } catch (error) {
      console.error('Error printing kwitansi:', error);
      alert('Gagal cetak kwitansi');
    }
  };

  const handleSendEmail = async (invoice: Invoice) => {
    try {
      const { data: customer } = await supabase
        .from('contacts')
        .select('email')
        .eq('id', invoice.customer_id)
        .single();
      
      if (!customer?.email) {
        alert('Customer belum memiliki email');
        return;
      }
      
      const link = `${window.location.origin}/invoices/${invoice.id}`;
      const subject = `Invoice ${invoice.invoice_number} dari ${currentCompany?.name}`;
      const body = `Yth. ${invoice.customer_name},\n\nBerikut invoice Anda.\n\nLink: ${link}\n\nTerima kasih.`;
      
      window.location.href = `mailto:${customer.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    } catch (error) {
      alert('Gagal membuka email client');
    }
  };

  const calculateAging = (invoice: Invoice) => {
    const today = new Date();
    const dueDate = new Date(invoice.due_date);
    const diffTime = today.getTime() - dueDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (invoice.status === 'paid') return null;
    
    const remaining = invoice.total - (invoice.paid_amount || 0);
    if (remaining <= 0) return null;
    
    let agingCategory = '';
    if (diffDays <= 0) agingCategory = 'Belum Jatuh Tempo';
    else if (diffDays <= 30) agingCategory = '1-30 Hari';
    else if (diffDays <= 60) agingCategory = '31-60 Hari';
    else if (diffDays <= 90) agingCategory = '61-90 Hari';
    else agingCategory = '> 90 Hari';
    
    return {
      customer: invoice.customer_name,
      invoice: invoice.invoice_number,
      dueDate: invoice.due_date,
      remaining: remaining,
      agingCategory: agingCategory,
      diffDays: diffDays,
    };
  };

  const getAgingData = () => {
    const agingData = {
      'Belum Jatuh Tempo': { count: 0, total: 0, items: [] as any[] },
      '1-30 Hari': { count: 0, total: 0, items: [] as any[] },
      '31-60 Hari': { count: 0, total: 0, items: [] as any[] },
      '61-90 Hari': { count: 0, total: 0, items: [] as any[] },
      '> 90 Hari': { count: 0, total: 0, items: [] as any[] },
    };
    
    invoices.forEach(inv => {
      const result = calculateAging(inv);
      if (result && agingData[result.agingCategory]) {
        agingData[result.agingCategory].count++;
        agingData[result.agingCategory].total += result.remaining;
        agingData[result.agingCategory].items.push(result);
      }
    });
    
    return agingData;
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

  if (!currentCompany) return <div className="flex justify-center py-12">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-slide-in-up">
        <div>
          <h1 className="font-display text-3xl font-bold text-text">Invoice Penjualan</h1>
          <p className="text-text-muted mt-1">Kelola faktur penjualan dengan customer</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setShowAgingModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 border border-accent text-accent rounded-lg hover:bg-accent/5 transition-colors"
          >
            📊 Aging Report
          </button>
          <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium shadow-lg shadow-accent/30">
            <Plus className="w-5 h-5" /> Buat Invoice
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface rounded-xl border border-border p-4"><p className="text-text-muted text-xs">Total Invoice</p><p className="text-2xl font-bold">{stats.total}</p></div>
        <div className="bg-surface rounded-xl border border-border p-4"><p className="text-text-muted text-xs">Total Amount</p><p className="text-lg font-bold">{formatCurrency(stats.totalAmount)}</p></div>
        <div className="bg-surface rounded-xl border border-border p-4"><p className="text-text-muted text-xs">Lunas</p><p className="text-2xl font-bold">{stats.paid}</p></div>
        <div className="bg-surface rounded-xl border border-border p-4"><p className="text-text-muted text-xs">Pending</p><p className="text-2xl font-bold">{stats.pending}</p></div>
      </div>

      <div className="bg-surface rounded-xl border border-border p-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" /><input type="text" placeholder="Cari invoice..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg" /></div>
          <div className="flex gap-2 flex-wrap">{['all','draft','sent','verified','partial','paid'].map(s => (<button key={s} onClick={() => setFilterStatus(s)} className={`px-3 py-2 rounded-lg text-sm font-medium capitalize ${filterStatus === s ? 'bg-accent text-white' : 'border border-border hover:bg-background'}`}>{s === 'all' ? 'Semua' : getStatusLabel(s)}</button>))}</div>
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
                <tr><td colSpan={6} className="text-center py-8">Loading...</td></tr>
              ) : (
                filteredInvoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-background transition-colors">
                    <td className="px-6 py-4 text-sm font-mono font-semibold">{invoice.invoice_number}</td>
                    <td className="px-6 py-4 text-sm">{invoice.invoice_date}</td>
                    <td className="px-6 py-4 text-sm">{invoice.customer_name}</td>
                    <td className="px-6 py-4 text-right font-mono font-semibold">{formatCurrency(invoice.total)}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${getStatusBadge(invoice.status)}`}>
                        {getStatusLabel(invoice.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => { setSelectedInvoice(invoice); setShowDetailModal(true); }} className="p-2 text-text-muted hover:text-info hover:bg-info/10 rounded-lg"><Eye className="w-4 h-4" /></button>
                        {invoice.status === 'draft' && (
                          <button onClick={() => openEditModal(invoice)} className="p-2 text-text-muted hover:text-info hover:bg-info/10 rounded-lg"><Edit className="w-4 h-4" /></button>
                        )}
                        {(invoice.status === 'draft' || invoice.status === 'sent') && <button onClick={() => handleVerifyInvoice(invoice)} className="p-2 text-text-muted hover:text-success hover:bg-success/10 rounded-lg"><CheckCircle className="w-4 h-4" /></button>}
                        {invoice.status !== 'paid' && <button onClick={() => handleOpenPaymentModal(invoice)} className="p-2 text-text-muted hover:text-warning hover:bg-warning/10 rounded-lg"><DollarSign className="w-4 h-4" /></button>}
                        <button onClick={() => handleDownloadPDF(invoice)} className="p-2 text-text-muted hover:text-info hover:bg-info/10 rounded-lg"><Download className="w-4 h-4" /></button>
                        <button onClick={() => handleSendEmail(invoice)} className="p-2 text-text-muted hover:text-success hover:bg-success/10 rounded-lg"><Send className="w-4 h-4" /></button>
                        {(invoice.status === 'verified' || invoice.status === 'partial' || invoice.status === 'paid') && (
                          <button onClick={() => handlePrintKwitansi(invoice)} className="p-2 text-text-muted hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors" title="Cetak Kwitansi">🧾</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-auto">
          <div className="bg-surface rounded-xl p-6 w-full max-w-4xl my-8">
            <div className="flex justify-between items-center mb-4"><h2 className="font-display text-xl font-bold">Buat Invoice Baru</h2><button onClick={() => { setShowModal(false); resetForm(); }}><X className="w-5 h-5" /></button></div>
            <div className="space-y-4">
              <div className="relative"><label className="block text-sm font-medium mb-1">Customer *</label><div className="flex gap-2"><div className="flex-1 relative"><input type="text" placeholder="Cari customer..." value={customerSearch} onChange={(e) => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); }} className="w-full px-4 py-2 border rounded-lg" />{showCustomerDropdown && filteredCustomers.length > 0 && (<div className="absolute z-10 w-full bg-white border rounded-lg mt-1 max-h-48 overflow-auto">{filteredCustomers.map(c => (<button key={c.id} className="w-full text-left px-4 py-2 hover:bg-gray-100" onClick={() => { setFormData({ ...formData, customer_id: c.id, customer_name: c.name }); setCustomerSearch(c.name); setShowCustomerDropdown(false); }}>{c.name}</button>))}</div>)}</div><button onClick={() => setShowNewCustomerModal(true)} className="px-4 py-2 text-accent border border-accent rounded-lg">+ Baru</button></div></div>
              <div className="grid grid-cols-2 gap-4"><div><label>Tanggal Invoice</label><input type="date" value={formData.invoice_date} onChange={e => setFormData({...formData, invoice_date: e.target.value})} className="w-full px-4 py-2 border rounded-lg" /></div><div><label>Jatuh Tempo</label><input type="date" value={formData.due_date} onChange={e => setFormData({...formData, due_date: e.target.value})} className="w-full px-4 py-2 border rounded-lg" /></div></div>
              <div><label>Proyek (Opsional)</label><div className="flex gap-2"><select value={formData.project_id || ''} onChange={e => setFormData({...formData, project_id: e.target.value ? parseInt(e.target.value) : null})} className="flex-1 px-4 py-2 border rounded-lg"><option value="">-- Tidak Ada Proyek --</option>{projects.map(p => (<option key={p.id} value={p.id}>{p.code} - {p.name}</option>))}</select><button onClick={() => setShowNewProjectModal(true)} className="px-4 py-2 text-accent border border-accent rounded-lg">+ Baru</button></div></div>
              
              <div><label className="block text-sm font-medium mb-1">Item</label><button onClick={addItem} className="text-sm text-accent mb-2">+ Tambah Item</button>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-2 py-2 text-left text-xs">Deskripsi</th>
                        <th className="px-2 py-2 text-left text-xs">Additional</th>
                        <th className="px-2 py-2 text-center w-16">Qty</th>
                        <th className="px-2 py-2 text-right w-28">Harga</th>
                        <th className="px-2 py-2 text-right w-28">Jumlah</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-2 py-2">
                            <input type="text" placeholder="Deskripsi" value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} className="w-full px-2 py-1 border rounded text-sm" />
                          </td>
                          <td className="px-2 py-2">
                            <input type="text" placeholder="STNK / No.Pol / dll" value={item.additional || ''} onChange={e => updateItem(idx, 'additional', e.target.value)} className="w-full px-2 py-1 border rounded text-sm" />
                          </td>
                          <td className="px-2 py-2">
                            <input type="number" value={item.quantity} onChange={e => updateItem(idx, 'quantity', parseInt(e.target.value) || 0)} className="w-full px-2 py-1 border rounded text-right text-sm" />
                          </td>
                          <td className="px-2 py-2">
                            <input type="number" value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', parseInt(e.target.value) || 0)} className="w-full px-2 py-1 border rounded text-right text-sm" />
                          </td>
                          <td className="px-2 py-2 text-right text-sm font-mono">{formatCurrency(item.amount)}</td>
                          <td className="px-2 py-2 text-center"><button onClick={() => removeItem(idx)}><Trash2 className="w-4 h-4 text-danger" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr><td colSpan={4} className="px-2 py-2 text-right font-medium">Subtotal</td><td className="px-2 py-2 text-right font-mono">{formatCurrency(subtotal)}</td><td></td></tr>
                      <tr><td colSpan={4} className="px-2 py-2 text-right font-medium">PPN {currentCompany?.id === 1 ? '11%' : '1.1%'}</td><td className="px-2 py-2 text-right font-mono">{formatCurrency(ppn)}</td><td></td></tr>
                      <tr className="font-bold"><td colSpan={4} className="px-2 py-2 text-right">TOTAL</td><td className="px-2 py-2 text-right text-accent">{formatCurrency(total)}</td><td></td></tr>
                    </tfoot>
                  </table>
                </div>
              </div>
              
              <div><label>Catatan</label><textarea rows={2} value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full px-4 py-2 border rounded-lg" /></div>
            </div>
            <div className="flex justify-end gap-3 mt-6"><button onClick={() => setShowModal(false)} className="px-4 py-2 border rounded-lg">Batal</button><button onClick={handleCreateInvoice} className="px-4 py-2 bg-accent text-white rounded-lg">Simpan</button></div>
          </div>
        </div>
      )}

      {showEditModal && editingInvoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-auto">
          <div className="bg-surface rounded-xl p-6 w-full max-w-4xl my-8">
            <div className="flex justify-between items-center mb-4"><h2 className="font-display text-xl font-bold">Edit Invoice - {editingInvoice.invoice_number}</h2><button onClick={() => { setShowEditModal(false); resetForm(); setEditingInvoice(null); }}><X className="w-5 h-5" /></button></div>
            <div className="space-y-4">
              <div className="relative"><label className="block text-sm font-medium mb-1">Customer *</label><div className="flex gap-2"><div className="flex-1 relative"><input type="text" placeholder="Cari customer..." value={customerSearch} onChange={(e) => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); }} className="w-full px-4 py-2 border rounded-lg" />{showCustomerDropdown && filteredCustomers.length > 0 && (<div className="absolute z-10 w-full bg-white border rounded-lg mt-1 max-h-48 overflow-auto">{filteredCustomers.map(c => (<button key={c.id} className="w-full text-left px-4 py-2 hover:bg-gray-100" onClick={() => { setFormData({ ...formData, customer_id: c.id, customer_name: c.name }); setCustomerSearch(c.name); setShowCustomerDropdown(false); }}>{c.name}</button>))}</div>)}</div><button onClick={() => setShowNewCustomerModal(true)} className="px-4 py-2 text-accent border border-accent rounded-lg">+ Baru</button></div></div>
              <div className="grid grid-cols-2 gap-4"><div><label>Tanggal Invoice</label><input type="date" value={formData.invoice_date} onChange={e => setFormData({...formData, invoice_date: e.target.value})} className="w-full px-4 py-2 border rounded-lg" /></div><div><label>Jatuh Tempo</label><input type="date" value={formData.due_date} onChange={e => setFormData({...formData, due_date: e.target.value})} className="w-full px-4 py-2 border rounded-lg" /></div></div>
              <div><label>Proyek (Opsional)</label><div className="flex gap-2"><select value={formData.project_id || ''} onChange={e => setFormData({...formData, project_id: e.target.value ? parseInt(e.target.value) : null})} className="flex-1 px-4 py-2 border rounded-lg"><option value="">-- Tidak Ada Proyek --</option>{projects.map(p => (<option key={p.id} value={p.id}>{p.code} - {p.name}</option>))}</select><button onClick={() => setShowNewProjectModal(true)} className="px-4 py-2 text-accent border border-accent rounded-lg">+ Baru</button></div></div>
              
              <div><label className="block text-sm font-medium mb-1">Item</label><button onClick={addItem} className="text-sm text-accent mb-2">+ Tambah Item</button>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-2 py-2 text-left text-xs">Deskripsi</th>
                        <th className="px-2 py-2 text-left text-xs">Additional</th>
                        <th className="px-2 py-2 text-center w-16">Qty</th>
                        <th className="px-2 py-2 text-right w-28">Harga</th>
                        <th className="px-2 py-2 text-right w-28">Jumlah</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-2 py-2">
                            <input type="text" placeholder="Deskripsi" value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} className="w-full px-2 py-1 border rounded text-sm" />
                          </td>
                          <td className="px-2 py-2">
                            <input type="text" placeholder="STNK / No.Pol / dll" value={item.additional || ''} onChange={e => updateItem(idx, 'additional', e.target.value)} className="w-full px-2 py-1 border rounded text-sm" />
                          </td>
                          <td className="px-2 py-2">
                            <input type="number" value={item.quantity} onChange={e => updateItem(idx, 'quantity', parseInt(e.target.value) || 0)} className="w-full px-2 py-1 border rounded text-right text-sm" />
                          </td>
                          <td className="px-2 py-2">
                            <input type="number" value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', parseInt(e.target.value) || 0)} className="w-full px-2 py-1 border rounded text-right text-sm" />
                          </td>
                          <td className="px-2 py-2 text-right text-sm font-mono">{formatCurrency(item.amount)}</td>
                          <td className="px-2 py-2 text-center"><button onClick={() => removeItem(idx)}><Trash2 className="w-4 h-4 text-danger" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr><td colSpan={4} className="px-2 py-2 text-right font-medium">Subtotal</td><td className="px-2 py-2 text-right font-mono">{formatCurrency(subtotal)}</td><td></td></tr>
                      <tr><td colSpan={4} className="px-2 py-2 text-right font-medium">PPN {currentCompany?.id === 1 ? '11%' : '1.1%'}</td><td className="px-2 py-2 text-right font-mono">{formatCurrency(ppn)}</td><td></td></tr>
                      <tr className="font-bold"><td colSpan={4} className="px-2 py-2 text-right">TOTAL</td><td className="px-2 py-2 text-right text-accent">{formatCurrency(total)}</td><td></td></tr>
                    </tfoot>
                  </table>
                </div>
              </div>
              
              <div><label>Catatan</label><textarea rows={2} value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full px-4 py-2 border rounded-lg" /></div>
            </div>
            <div className="flex justify-end gap-3 mt-6"><button onClick={() => { setShowEditModal(false); resetForm(); setEditingInvoice(null); }} className="px-4 py-2 border rounded-lg">Batal</button><button onClick={handleUpdateInvoice} className="px-4 py-2 bg-accent text-white rounded-lg">Update Invoice</button></div>
          </div>
        </div>
      )}

      {showPaymentModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl p-6 w-full max-w-md">
            <h2 className="font-display text-xl font-bold mb-4">Pembayaran Invoice</h2><button onClick={() => setShowPaymentModal(false)} className="float-right">✕</button>
            <div className="space-y-4 mt-4"><div><p className="text-sm text-text-muted">No. Invoice</p><p className="font-semibold">{selectedInvoice.invoice_number}</p></div>
            <div><p className="text-sm text-text-muted">Total</p><p className="font-semibold">{formatCurrency(selectedInvoice.total)}</p></div>
            <div><p className="text-sm text-text-muted">Sudah Dibayar</p><p className="font-semibold text-success">{formatCurrency(selectedInvoice.paid_amount || 0)}</p></div>
            <div><p className="text-sm text-text-muted">Sisa</p><p className="font-semibold text-warning">{formatCurrency(selectedInvoice.total - (selectedInvoice.paid_amount || 0))}</p></div>
            <div><label className="block text-sm font-medium mb-1">Jumlah Bayar</label><input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} className="w-full px-4 py-2 border rounded-lg" /></div>
            <div><label className="block text-sm font-medium mb-1">Tanggal Bayar</label><input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="w-full px-4 py-2 border rounded-lg" /></div>
            <div><label className="block text-sm font-medium mb-1">Metode</label><select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="w-full px-4 py-2 border rounded-lg"><option value="transfer">Transfer</option><option value="cash">Tunai</option><option value="credit_card">Kartu Kredit</option></select></div>
            <div><label className="block text-sm font-medium mb-1">Akun Bank / Kas</label><select value={selectedBankId} onChange={e => setSelectedBankId(parseInt(e.target.value))} className="w-full px-4 py-2 border rounded-lg"><option value={0}>-- Pilih Akun --</option>{bankAccounts.map(acc => (<option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>))}</select></div>
            <div className="flex justify-end gap-3 mt-6"><button onClick={() => setShowPaymentModal(false)} className="px-4 py-2 border rounded-lg">Batal</button><button onClick={handleRecordPayment} className="px-4 py-2 bg-accent text-white rounded-lg">Catat</button></div></div>
          </div>
        </div>
      )}

      {showNewCustomerModal && (<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"><div className="bg-surface rounded-xl p-6 w-full max-w-md"><h2 className="font-display text-xl font-bold mb-4">Tambah Customer</h2><div className="space-y-3"><input type="text" placeholder="Nama *" value={newCustomer.name} onChange={e => setNewCustomer({...newCustomer, name: e.target.value})} className="w-full px-4 py-2 border rounded-lg" /><input type="email" placeholder="Email" value={newCustomer.email} onChange={e => setNewCustomer({...newCustomer, email: e.target.value})} className="w-full px-4 py-2 border rounded-lg" /><input type="text" placeholder="Telepon" value={newCustomer.phone} onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})} className="w-full px-4 py-2 border rounded-lg" /><textarea placeholder="Alamat" rows={2} value={newCustomer.address} onChange={e => setNewCustomer({...newCustomer, address: e.target.value})} className="w-full px-4 py-2 border rounded-lg" /></div><div className="flex justify-end gap-3 mt-6"><button onClick={() => setShowNewCustomerModal(false)} className="px-4 py-2 border rounded-lg">Batal</button><button onClick={handleCreateCustomer} className="px-4 py-2 bg-accent text-white rounded-lg">Simpan</button></div></div></div>)}

      {showNewProjectModal && (<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"><div className="bg-surface rounded-xl p-6 w-full max-w-md"><h2 className="font-display text-xl font-bold mb-4">Tambah Proyek</h2><div className="space-y-3"><input type="text" placeholder="Kode *" value={newProject.code} onChange={e => setNewProject({...newProject, code: e.target.value.toUpperCase()})} className="w-full px-4 py-2 border rounded-lg" /><input type="text" placeholder="Nama *" value={newProject.name} onChange={e => setNewProject({...newProject, name: e.target.value})} className="w-full px-4 py-2 border rounded-lg" /><input type="number" placeholder="Anggaran" value={newProject.budget || ''} onChange={e => setNewProject({...newProject, budget: parseInt(e.target.value) || 0})} className="w-full px-4 py-2 border rounded-lg" /></div><div className="flex justify-end gap-3 mt-6"><button onClick={() => setShowNewProjectModal(false)} className="px-4 py-2 border rounded-lg">Batal</button><button onClick={handleCreateProject} className="px-4 py-2 bg-accent text-white rounded-lg">Simpan</button></div></div></div>)}

      {showDetailModal && selectedInvoice && (<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"><div className="bg-surface rounded-xl p-6 w-full max-w-lg"><div className="flex justify-between"><h2 className="font-display text-xl font-bold">Detail Invoice</h2><button onClick={() => setShowDetailModal(false)}>✕</button></div><div className="space-y-2 mt-4"><p><strong>No:</strong> {selectedInvoice.invoice_number}</p><p><strong>Customer:</strong> {selectedInvoice.customer_name}</p><p><strong>Tanggal:</strong> {selectedInvoice.invoice_date}</p><p><strong>Jatuh Tempo:</strong> {selectedInvoice.due_date}</p><p><strong>Total:</strong> {formatCurrency(selectedInvoice.total)}</p><p><strong>Sudah Dibayar:</strong> {formatCurrency(selectedInvoice.paid_amount || 0)}</p><p><strong>Sisa:</strong> {formatCurrency(selectedInvoice.total - (selectedInvoice.paid_amount || 0))}</p><p><strong>Status:</strong> {getStatusLabel(selectedInvoice.status)}</p></div><div className="flex justify-end mt-6"><button onClick={() => handleDownloadPDF(selectedInvoice)} className="px-4 py-2 bg-accent text-white rounded-lg">Download PDF</button></div></div></div>)}

      {showAgingModal && (
        <AgingModal
          isOpen={showAgingModal}
          onClose={() => setShowAgingModal(false)}
          title="Aging Report - Piutang Usaha (AR)"
          data={getAgingData()}
          type="AR"
        />
      )}
    </div>
  );
}
