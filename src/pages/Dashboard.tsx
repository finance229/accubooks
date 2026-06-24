import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  TrendingUp, TrendingDown, DollarSign, Receipt, Users, FileText, 
  ArrowUpRight, ArrowDownRight, Calendar, RefreshCw, 
  Clock, AlertCircle, CheckCircle, Building2
} from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useCompany } from '../contexts/CompanyContext';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../lib/accountingHelpers';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  Filler,
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  Filler
);

type DashboardSummary = {
  totalPendapatan: number;
  totalPengeluaran: number;
  labaBersih: number;
  totalPiutang: number;
  totalHutang: number;
  totalKas: number;
  totalInvoice: number;
  totalPaymentPending: number;
  totalVendorInvoice: number;
  totalPaymentRequestPending: number;
  perubahan: {
    pendapatan: number;
    pengeluaran: number;
    laba: number;
    piutang: number;
    kas: number;
  };
};

type TrendData = {
  labels: string[];
  pendapatan: number[];
  pengeluaran: number[];
  laba: number[];
};

type AgingData = {
  '0-30': number;
  '31-60': number;
  '61-90': number;
  '>90': number;
};

type StatusPaymentData = {
  draft: number;
  submitted: number;
  verified: number;
  approved: number;
  rejected: number;
};

type KategoriTransaksi = Record<string, number>;

type TransaksiTerbaru = {
  id: number;
  tanggal: string;
  tipe: string;
  kategori: string;
  deskripsi: string;
  jumlah: number;
  status: string;
  reference?: string;
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { currentCompany } = useCompany();
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [trendData, setTrendData] = useState<TrendData | null>(null);
  const [agingData, setAgingData] = useState<AgingData | null>(null);
  const [statusPayment, setStatusPayment] = useState<StatusPaymentData | null>(null);
  const [kategoriTransaksi, setKategoriTransaksi] = useState<KategoriTransaksi | null>(null);
  const [transaksiTerbaru, setTransaksiTerbaru] = useState<TransaksiTerbaru[]>([]);

  useEffect(() => {
    if (currentCompany?.id) {
      fetchDashboardData();
    }
  }, [currentCompany, selectedMonth]);

  const fetchDashboardData = async () => {
    if (!currentCompany?.id) return;
    
    setLoading(true);
    try {
      const companyId = currentCompany.id;
      const [year, month] = selectedMonth.split('-').map(Number);

      const summaryData = await fetchSummaryFromJournal(companyId, year, month);
      setSummary(summaryData);

      const trend = await fetchTrendFromJournal(companyId, year, month);
      setTrendData(trend);

      const aging = await fetchAgingData(companyId);
      setAgingData(aging);

      const status = await fetchStatusPayment(companyId);
      setStatusPayment(status);

      const kategori = await fetchKategoriFromJournal(companyId, year, month);
      setKategoriTransaksi(kategori);

      const transaksi = await fetchTransaksiTerbaru(companyId);
      setTransaksiTerbaru(transaksi);

    } catch (error) {
      console.error('Error fetching dashboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  // ============================================
  // 1. SUMMARY DARI JURNAL
  // ============================================
  const fetchSummaryFromJournal = async (companyId: number, year: number, month: number) => {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
    
    // ✅ AMBIL SEMUA JOURNAL YANG SUDAH POSTED (tanpa filter tanggal dulu)
    const { data: journals, error: jError } = await supabase
      .from('journals')
      .select('id, journal_date')
      .eq('company_id', companyId)
      .eq('status', 'posted');
    
    if (jError || !journals) {
      console.error('Error fetching journals:', jError);
      return getEmptySummary();
    }
    
    // ✅ Filter tanggal di JavaScript
    const filteredJournals = journals.filter(j => {
      const date = new Date(j.journal_date);
      return date >= new Date(startDate) && date <= new Date(endDate);
    });
    
    const journalIds = filteredJournals.map(j => j.id);
    
    if (journalIds.length === 0) {
      return getEmptySummary();
    }
    
    // ✅ Ambil journal lines
    const { data: lines, error: lError } = await supabase
      .from('journal_lines')
      .select('debit, credit, coa_id')
      .in('journal_id', journalIds);
    
    if (lError || !lines) {
      console.error('Error fetching journal lines:', lError);
      return getEmptySummary();
    }
    
    // ✅ Ambil semua COA
    const { data: coaList } = await supabase
      .from('coa')
      .select('id, code, name, type')
      .eq('company_id', companyId);
    
    const coaMap = new Map();
    coaList?.forEach(c => coaMap.set(c.id, c));
    
    // ✅ Hitung
    let totalPendapatan = 0;
    let totalPengeluaran = 0;
    let totalPiutang = 0;
    let totalHutang = 0;
    let totalKas = 0;
    
    lines.forEach((line: any) => {
      const coa = coaMap.get(line.coa_id);
      if (!coa) return;
      
      const debit = line.debit || 0;
      const credit = line.credit || 0;
      const selisih = debit - credit;
      
      if (coa.type === 'revenue') {
        totalPendapatan += (credit - debit);
      } else if (coa.type === 'expense') {
        totalPengeluaran += (debit - credit);
      } else if (coa.code === '1111') {
        totalPiutang += selisih;
      } else if (coa.code === '2101') {
        totalHutang += (credit - debit);
      } else if (coa.code.startsWith('1101') || coa.code.startsWith('1102')) {
        totalKas += selisih;
      }
    });
    
    // Invoice count
    const { count: invoiceCount } = await supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .gte('invoice_date', startDate)
      .lte('invoice_date', endDate);
    
    // Pending PR
    const { count: pendingCount } = await supabase
      .from('payment_requests')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .in('status', ['submitted', 'verified']);
    
    return {
      totalPendapatan: totalPendapatan,
      totalPengeluaran: totalPengeluaran,
      labaBersih: totalPendapatan - totalPengeluaran,
      totalPiutang: totalPiutang > 0 ? totalPiutang : 0,
      totalHutang: totalHutang > 0 ? totalHutang : 0,
      totalKas: totalKas > 0 ? totalKas : 0,
      totalInvoice: invoiceCount || 0,
      totalPaymentPending: pendingCount || 0,
      totalVendorInvoice: 0,
      totalPaymentRequestPending: pendingCount || 0,
      perubahan: {
        pendapatan: 0,
        pengeluaran: 0,
        laba: 0,
        piutang: 0,
        kas: 0,
      }
    };
  };

  const getEmptySummary = (): DashboardSummary => ({
    totalPendapatan: 0,
    totalPengeluaran: 0,
    labaBersih: 0,
    totalPiutang: 0,
    totalHutang: 0,
    totalKas: 0,
    totalInvoice: 0,
    totalPaymentPending: 0,
    totalVendorInvoice: 0,
    totalPaymentRequestPending: 0,
    perubahan: { pendapatan: 0, pengeluaran: 0, laba: 0, piutang: 0, kas: 0 }
  });

  // ============================================
  // 2. TREND DARI JURNAL (6 BULAN) - DI-SEDERHANAKAN
  // ============================================
  const fetchTrendFromJournal = async (companyId: number, year: number, month: number) => {
    const months = [];
    const pendapatan = [];
    const pengeluaran = [];
    const laba = [];
    
    // Ambil semua journal + lines sekali
    const { data: allJournals } = await supabase
      .from('journals')
      .select('id, journal_date')
      .eq('company_id', companyId)
      .eq('status', 'posted');
    
    const allJournalIds = allJournals?.map(j => j.id) || [];
    
    let allLines: any[] = [];
    if (allJournalIds.length > 0) {
      const { data: lines } = await supabase
        .from('journal_lines')
        .select('debit, credit, coa_id')
        .in('journal_id', allJournalIds);
      allLines = lines || [];
    }
    
    // Ambil COA
    const { data: coaList } = await supabase
      .from('coa')
      .select('id, type')
      .eq('company_id', companyId);
    
    const coaMap = new Map();
    coaList?.forEach(c => coaMap.set(c.id, c));
    
    // Buat map journal_date per id
    const journalDateMap = new Map();
    allJournals?.forEach(j => journalDateMap.set(j.id, j.journal_date));
    
    for (let i = 5; i >= 0; i--) {
      let m = month - i;
      let y = year;
      if (m <= 0) {
        m += 12;
        y -= 1;
      }
      const label = `${String(m).padStart(2, '0')}/${y}`;
      months.push(label);
      
      const start = `${y}-${String(m).padStart(2, '0')}-01`;
      const end = `${y}-${String(m).padStart(2, '0')}-31`;
      
      // Filter lines berdasarkan tanggal journal
      let p = 0, q = 0;
      allLines.forEach((line: any) => {
        const journalDate = journalDateMap.get(line.journal_id);
        if (!journalDate) return;
        if (journalDate < start || journalDate > end) return;
        
        const coa = coaMap.get(line.coa_id);
        if (!coa) return;
        const debit = line.debit || 0;
        const credit = line.credit || 0;
        if (coa.type === 'revenue') {
          p += (credit - debit);
        } else if (coa.type === 'expense') {
          q += (debit - credit);
        }
      });
      
      pendapatan.push(p);
      pengeluaran.push(q);
      laba.push(p - q);
    }
    
    return { labels: months, pendapatan, pengeluaran, laba };
  };

  // ============================================
  // 3. AGING DARI INVOICES
  // ============================================
  const fetchAgingData = async (companyId: number) => {
    const { data: invoices } = await supabase
      .from('invoices')
      .select('id, total, paid_amount, due_date, status')
      .eq('company_id', companyId)
      .neq('status', 'paid');
    
    const today = new Date();
    const aging = { '0-30': 0, '31-60': 0, '61-90': 0, '>90': 0 };
    
    (invoices || []).forEach(inv => {
      const remaining = inv.total - (inv.paid_amount || 0);
      if (remaining <= 0) return;
      const due = new Date(inv.due_date);
      const diff = Math.ceil((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
      if (diff <= 30) aging['0-30'] += remaining;
      else if (diff <= 60) aging['31-60'] += remaining;
      else if (diff <= 90) aging['61-90'] += remaining;
      else aging['>90'] += remaining;
    });
    return aging;
  };

  // ============================================
  // 4. STATUS PAYMENT
  // ============================================
  const fetchStatusPayment = async (companyId: number) => {
    const { data } = await supabase
      .from('payment_requests')
      .select('status')
      .eq('company_id', companyId);
    
    const result = { draft: 0, submitted: 0, verified: 0, approved: 0, rejected: 0 };
    (data || []).forEach(r => {
      if (result[r.status as keyof typeof result] !== undefined) {
        result[r.status as keyof typeof result] += 1;
      }
    });
    return result;
  };

  // ============================================
  // 5. KATEGORI DARI JURNAL
  // ============================================
  const fetchKategoriFromJournal = async (companyId: number, year: number, month: number) => {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = `${year}-${String(month).padStart(2, '0')}-31`;
    
    const { data: coaList } = await supabase
      .from('coa')
      .select('id, name')
      .eq('company_id', companyId);
    
    const coaMap = new Map();
    coaList?.forEach(c => coaMap.set(c.id, c));
    
    const { data: journals } = await supabase
      .from('journals')
      .select('id, journal_date')
      .eq('company_id', companyId)
      .eq('status', 'posted');
    
    const filteredJournalIds = journals
      ?.filter(j => j.journal_date >= start && j.journal_date <= end)
      .map(j => j.id) || [];
    
    const kategori: Record<string, number> = {};
    
    if (filteredJournalIds.length > 0) {
      const { data: lines } = await supabase
        .from('journal_lines')
        .select('debit, credit, coa_id')
        .in('journal_id', filteredJournalIds);
      
      lines?.forEach((line: any) => {
        const coa = coaMap.get(line.coa_id);
        if (!coa) return;
        const amount = Math.abs((line.debit || 0) - (line.credit || 0));
        if (amount > 0) {
          const key = coa.name.replace('Beban ', '').replace('Pendapatan ', '');
          kategori[key] = (kategori[key] || 0) + amount;
        }
      });
    }
    
    const sorted = Object.entries(kategori).sort((a, b) => b[1] - a[1]);
    return Object.fromEntries(sorted.slice(0, 5));
  };

  // ============================================
  // 6. TRANSAKSI TERBARU DARI JURNAL
  // ============================================
  const fetchTransaksiTerbaru = async (companyId: number) => {
    const { data: journals } = await supabase
      .from('journals')
      .select('id, journal_number, journal_date, description')
      .eq('company_id', companyId)
      .eq('status', 'posted')
      .order('journal_date', { ascending: false })
      .limit(10);
    
    const results: TransaksiTerbaru[] = [];
    
    for (const j of journals || []) {
      const { data: lines } = await supabase
        .from('journal_lines')
        .select('debit, credit')
        .eq('journal_id', j.id);
      
      let total = 0;
      lines?.forEach((line: any) => {
        total += Math.abs((line.debit || 0) - (line.credit || 0));
      });
      
      if (total > 0) {
        results.push({
          id: j.id,
          tanggal: j.journal_date,
          tipe: 'Jurnal',
          kategori: 'Umum',
          deskripsi: j.description || j.journal_number,
          jumlah: total,
          status: 'posted',
          reference: j.journal_number,
        });
      }
    }
    
    return results.slice(0, 10);
  };

  // ============================================
  // RENDER HELPERS (sama seperti sebelumnya)
  // ============================================
  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      paid: 'bg-green-100 text-green-800',
      approved: 'bg-green-100 text-green-800',
      verified: 'bg-yellow-100 text-yellow-800',
      submitted: 'bg-blue-100 text-blue-800',
      draft: 'bg-gray-100 text-gray-800',
      partial: 'bg-orange-100 text-orange-800',
      pending: 'bg-yellow-100 text-yellow-800',
      rejected: 'bg-red-100 text-red-800',
      posted: 'bg-green-100 text-green-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusIcon = (status: string) => {
    if (status === 'paid' || status === 'approved' || status === 'posted') 
      return <CheckCircle className="w-4 h-4 text-green-600" />;
    if (status === 'rejected' || status === 'cancelled') 
      return <AlertCircle className="w-4 h-4 text-red-600" />;
    return <Clock className="w-4 h-4 text-gray-600" />;
  };

  // CHART OPTIONS
  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'top' as const } },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { callback: (value: any) => `Rp ${(value / 1000000).toFixed(0)}J` },
      },
    },
  };

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'top' as const } },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { callback: (value: any) => `Rp ${(value / 1000000).toFixed(0)}J` },
      },
    },
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'right' as const } },
  };

  // RENDER CHARTS
  const renderBarChart = (data: TrendData | null) => {
    if (!data) return <div className="h-64 flex items-center justify-center text-gray-400">Tidak ada data</div>;
    if (data.pendapatan.every(v => v === 0) && data.pengeluaran.every(v => v === 0)) {
      return <div className="h-64 flex items-center justify-center text-gray-400">Belum ada transaksi</div>;
    }
    return (
      <Bar
        data={{
          labels: data.labels,
          datasets: [
            {
              label: 'Pendapatan',
              data: data.pendapatan,
              backgroundColor: 'rgba(34, 197, 94, 0.6)',
              borderColor: 'rgb(34, 197, 94)',
              borderWidth: 1,
            },
            {
              label: 'Pengeluaran',
              data: data.pengeluaran,
              backgroundColor: 'rgba(239, 68, 68, 0.6)',
              borderColor: 'rgb(239, 68, 68)',
              borderWidth: 1,
            },
          ],
        }}
        options={barOptions}
      />
    );
  };

  const renderLineChart = (data: TrendData | null) => {
    if (!data) return <div className="h-64 flex items-center justify-center text-gray-400">Tidak ada data</div>;
    if (data.laba.every(v => v === 0)) {
      return <div className="h-64 flex items-center justify-center text-gray-400">Belum ada laba</div>;
    }
    return (
      <Line
        data={{
          labels: data.labels,
          datasets: [
            {
              label: 'Laba Bersih',
              data: data.laba,
              borderColor: 'rgb(59, 130, 246)',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              fill: true,
              tension: 0.3,
            },
          ],
        }}
        options={lineOptions}
      />
    );
  };

  const renderDoughnutChart = (data: StatusPaymentData | null) => {
    if (!data) return <div className="h-52 flex items-center justify-center text-gray-400">Tidak ada data</div>;
    const total = Object.values(data).reduce((sum, v) => sum + v, 0);
    if (total === 0) {
      return <div className="h-52 flex items-center justify-center text-gray-400">Belum ada payment request</div>;
    }
    return (
      <Doughnut
        data={{
          labels: ['Draft', 'Submitted', 'Verified', 'Approved', 'Rejected'],
          datasets: [
            {
              data: [data.draft, data.submitted, data.verified, data.approved, data.rejected],
              backgroundColor: [
                'rgba(156, 163, 175, 0.8)',
                'rgba(59, 130, 246, 0.8)',
                'rgba(234, 179, 8, 0.8)',
                'rgba(34, 197, 94, 0.8)',
                'rgba(239, 68, 68, 0.8)',
              ],
            },
          ],
        }}
        options={doughnutOptions}
      />
    );
  };

  const renderAgingBar = (data: AgingData | null) => {
    if (!data) return <div className="h-52 flex items-center justify-center text-gray-400">Tidak ada data</div>;
    const total = Object.values(data).reduce((sum, v) => sum + v, 0);
    if (total === 0) {
      return <div className="h-52 flex items-center justify-center text-gray-400">Tidak ada piutang</div>;
    }
    return (
      <Bar
        data={{
          labels: ['0-30 hari', '31-60 hari', '61-90 hari', '>90 hari'],
          datasets: [
            {
              label: 'Piutang',
              data: [data['0-30'], data['31-60'], data['61-90'], data['>90']],
              backgroundColor: [
                'rgba(34, 197, 94, 0.7)',
                'rgba(234, 179, 8, 0.7)',
                'rgba(251, 146, 60, 0.7)',
                'rgba(239, 68, 68, 0.7)',
              ],
            },
          ],
        }}
        options={barOptions}
      />
    );
  };

  const renderKategoriBar = (data: KategoriTransaksi | null) => {
    if (!data) return <div className="h-52 flex items-center justify-center text-gray-400">Tidak ada data</div>;
    const keys = Object.keys(data);
    if (keys.length === 0) {
      return <div className="h-52 flex items-center justify-center text-gray-400">Belum ada transaksi</div>;
    }
    return (
      <Bar
        data={{
          labels: keys,
          datasets: [
            {
              label: 'Jumlah',
              data: Object.values(data),
              backgroundColor: 'rgba(99, 102, 241, 0.7)',
            },
          ],
        }}
        options={{
          indexAxis: 'y' as const,
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: {
              beginAtZero: true,
              ticks: { callback: (value: any) => `Rp ${(value / 1000000).toFixed(0)}J` },
            },
          },
        }}
      />
    );
  };

  if (!currentCompany) {
    return <div className="flex justify-center py-12">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 animate-slide-in-up">
        <div>
          <h1 className="font-display text-3xl font-bold text-text">Dashboard</h1>
          <p className="text-text-muted mt-1">Selamat datang, {user?.name || user?.email}!</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3 py-2 border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent"></div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {summary && [
              { label: 'Pendapatan', value: summary.totalPendapatan, change: summary.perubahan.pendapatan, icon: TrendingUp, color: 'green' },
              { label: 'Pengeluaran', value: summary.totalPengeluaran, change: summary.perubahan.pengeluaran, icon: TrendingDown, color: 'red' },
              { label: 'Laba Bersih', value: summary.labaBersih, change: summary.perubahan.laba, icon: DollarSign, color: 'blue' },
              { label: 'Piutang', value: summary.totalPiutang, change: 0, icon: Receipt, color: 'yellow' },
              { label: 'Hutang', value: summary.totalHutang, change: 0, icon: FileText, color: 'orange' },
              { label: 'Saldo Kas', value: summary.totalKas, change: 0, icon: Building2, color: 'teal' },
              { label: 'Total Invoice', value: summary.totalInvoice, change: 0, icon: FileText, color: 'purple' },
              { label: 'Pending PR', value: summary.totalPaymentRequestPending, change: 0, icon: Clock, color: 'red' },
            ].map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.05, 0.5) }}
                className="bg-surface rounded-xl border border-border p-4 card-hover"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-text-muted text-xs font-medium truncate">{stat.label}</p>
                    <p className="text-text text-lg font-bold font-display mt-1 truncate">
                      {stat.label === 'Total Invoice' || stat.label === 'Pending PR' 
                        ? stat.value 
                        : formatCurrency(stat.value)}
                    </p>
                    {stat.change !== 0 && (
                      <div className="flex items-center gap-1 mt-1">
                        {stat.change > 0 ? (
                          <ArrowUpRight className={`w-3 h-3 text-${stat.color}-600`} />
                        ) : (
                          <ArrowDownRight className={`w-3 h-3 text-${stat.color}-600`} />
                        )}
                        <span className={`text-xs font-medium text-${stat.color}-600`}>
                          {stat.change > 0 ? '+' : ''}{stat.change.toFixed(1)}%
                        </span>
                        <span className="text-text-muted text-xs">vs bulan lalu</span>
                      </div>
                    )}
                  </div>
                  <div className={`w-10 h-10 rounded-lg bg-${stat.color}-100 flex items-center justify-center flex-shrink-0`}>
                    <stat.icon className={`w-5 h-5 text-${stat.color}-600`} strokeWidth={2} />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-surface rounded-xl border border-border p-5">
              <h3 className="font-display font-bold text-text mb-4">Pendapatan vs Pengeluaran</h3>
              <div className="h-64">{renderBarChart(trendData)}</div>
            </div>
            <div className="bg-surface rounded-xl border border-border p-5">
              <h3 className="font-display font-bold text-text mb-4">Trend Laba Bersih</h3>
              <div className="h-64">{renderLineChart(trendData)}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-surface rounded-xl border border-border p-5">
              <h3 className="font-display font-bold text-text mb-4">Status Payment Request</h3>
              <div className="h-52">{renderDoughnutChart(statusPayment)}</div>
            </div>
            <div className="bg-surface rounded-xl border border-border p-5">
              <h3 className="font-display font-bold text-text mb-4">Aging Piutang</h3>
              <div className="h-52">{renderAgingBar(agingData)}</div>
            </div>
            <div className="bg-surface rounded-xl border border-border p-5">
              <h3 className="font-display font-bold text-text mb-4">Kategori Transaksi</h3>
              <div className="h-52">{renderKategoriBar(kategoriTransaksi)}</div>
            </div>
          </div>

          <div className="bg-surface rounded-xl border border-border overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h3 className="font-display font-bold text-text">Transaksi Terbaru</h3>
              <button onClick={() => navigate('/transactions')} className="text-sm text-accent hover:underline">
                Lihat Semua →
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-background">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase">Tanggal</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase">Tipe</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase">Deskripsi</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-text-muted uppercase">Jumlah</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-text-muted uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {transaksiTerbaru.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-8 text-text-muted">Belum ada transaksi</td></tr>
                  ) : (
                    transaksiTerbaru.slice(0, 8).map((t, idx) => (
                      <motion.tr
                        key={idx}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: Math.min(idx * 0.03, 0.3) }}
                        className="hover:bg-background transition-colors cursor-pointer"
                        onClick={() => {
                          if (t.tipe === 'invoice') navigate(`/invoices/${t.id}`);
                          else if (t.tipe === 'payment_request') navigate(`/payment-requests/${t.id}`);
                          else navigate(`/transactions/${t.id}`);
                        }}
                      >
                        <td className="px-4 py-3 whitespace-nowrap text-sm">{formatDate(t.tanggal)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            t.tipe === 'sale' || t.tipe === 'income' || t.tipe === 'invoice' ? 'bg-green-100 text-green-800' :
                            t.tipe === 'purchase' || t.tipe === 'expense' ? 'bg-red-100 text-red-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {t.tipe}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm truncate max-w-xs">{t.deskripsi}</td>
                        <td className={`px-4 py-3 whitespace-nowrap text-right font-mono font-semibold ${
                          t.jumlah > 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {formatCurrency(t.jumlah)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center gap-1">
                            {getStatusIcon(t.status)}
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(t.status)}`}>
                              {t.status}
                            </span>
                          </div>
                        </td>
                      </motion.tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
