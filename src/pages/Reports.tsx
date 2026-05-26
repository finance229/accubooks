import { useState, useEffect } from 'react';
import { FileText, Download, Calendar, TrendingUp, PieChart, BarChart3, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';

type ReportType = 'laba-rugi' | 'neraca' | 'arus-kas' | 'pajak';

const reportTypes = [
  { id: 'laba-rugi' as const, name: 'Laporan Laba Rugi', description: 'Ringkasan pendapatan dan pengeluaran', icon: TrendingUp, color: 'bg-blue-500' },
  { id: 'neraca' as const, name: 'Neraca', description: 'Posisi keuangan perusahaan', icon: BarChart3, color: 'bg-purple-500' },
  { id: 'arus-kas' as const, name: 'Arus Kas', description: 'Pergerakan kas masuk dan keluar', icon: PieChart, color: 'bg-green-500' },
  { id: 'pajak' as const, name: 'Laporan Pajak', description: 'Ringkasan kewajiban pajak', icon: FileText, color: 'bg-orange-500' },
];

export default function Reports() {
  const [loading, setLoading] = useState(false);
  const [selectedReport, setSelectedReport] = useState<ReportType>('laba-rugi');
  const [selectedPeriod, setSelectedPeriod] = useState('Januari 2024');
  const [showModal, setShowModal] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);

  useEffect(() => {
    if (showModal) {
      fetchData();
    }
  }, [showModal, selectedPeriod]);

  const fetchData = async () => {
    setLoading(true);
    
    const { data: txData } = await supabase
      .from('transactions')
      .select('*')
      .eq('company_id', 1);
    
    const { data: contactData } = await supabase
      .from('contacts')
      .select('*')
      .eq('company_id', 1);
    
    setTransactions(txData || []);
    setContacts(contactData || []);
    
    generateReport(selectedReport, txData || [], contactData || []);
    
    setLoading(false);
  };

  const generateReport = (type: ReportType, txData: any[], contactData: any[]) => {
    if (type === 'laba-rugi') {
      const pendapatan = txData.filter(t => t.type === 'sale' || t.type === 'income')
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      const beban = txData.filter(t => t.type === 'purchase' || t.type === 'expense')
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      const labaBersih = pendapatan - beban;
      
      setReportData({ pendapatan, beban, labaBersih, pendapatanDetail: txData.filter(t => t.type === 'sale' || t.type === 'income'), bebanDetail: txData.filter(t => t.type === 'purchase' || t.type === 'expense') });
    } 
    else if (type === 'neraca') {
      const totalAktiva = txData.filter(t => t.type === 'sale').reduce((sum, t) => sum + Math.abs(t.amount), 0);
      const piutang = contactData.filter(c => c.balance > 0).reduce((sum, c) => sum + c.balance, 0);
      const hutang = contactData.filter(c => c.balance < 0).reduce((sum, c) => sum + Math.abs(c.balance), 0);
      
      setReportData({ aktiva: { lancar: totalAktiva, tetap: 0, total: totalAktiva }, pasiva: { hutang, modal: totalAktiva - hutang, total: totalAktiva }, piutang });
    }
    else if (type === 'arus-kas') {
      const kasMasuk = txData.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
      const kasKeluar = txData.filter(t => t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0);
      
      setReportData({ kasMasuk, kasKeluar, kasBersih: kasMasuk - kasKeluar, detailMasuk: txData.filter(t => t.amount > 0), detailKeluar: txData.filter(t => t.amount < 0) });
    }
    else if (type === 'pajak') {
      const penjualan = txData.filter(t => t.type === 'sale').reduce((sum, t) => sum + Math.abs(t.amount), 0);
      const ppn = penjualan * 0.11;
      
      setReportData({ penjualan, ppn, pph21: 2250000, pph23: penjualan * 0.02, total: ppn + 2250000 + (penjualan * 0.02) });
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(Math.abs(amount));
  };

  const getReportTitle = () => {
    switch (selectedReport) {
      case 'laba-rugi': return 'Laporan Laba Rugi';
      case 'neraca': return 'Neraca';
      case 'arus-kas': return 'Laporan Arus Kas';
      case 'pajak': return 'Laporan Pajak';
      default: return 'Laporan';
    }
  };

  const renderLabaRugi = () => (
    <div className="space-y-6">
      <div className="bg-green-50 p-4 rounded-lg"><div className="flex justify-between font-bold text-lg"><span>PENDAPATAN</span><span className="text-green-600">{formatCurrency(reportData?.pendapatan || 0)}</span></div></div>
      <div className="bg-red-50 p-4 rounded-lg"><div className="flex justify-between font-bold text-lg"><span>BEBAN</span><span className="text-red-600">{formatCurrency(reportData?.beban || 0)}</span></div></div>
      <div className="bg-blue-50 p-4 rounded-lg border-2 border-blue-300"><div className="flex justify-between font-bold text-xl"><span>LABA BERSIH</span><span className="text-blue-600">{formatCurrency(reportData?.labaBersih || 0)}</span></div></div>
    </div>
  );

  const renderNeraca = () => (
    <div className="grid grid-cols-2 gap-6">
      <div className="bg-green-50 p-4 rounded-lg"><h3 className="font-bold mb-3">AKTIVA</h3><div className="space-y-2"><div className="flex justify-between"><span>Piutang</span><span>{formatCurrency(reportData?.piutang || 0)}</span></div><div className="flex justify-between"><span>Total Aktiva</span><span className="font-bold">{formatCurrency(reportData?.aktiva?.total || 0)}</span></div></div></div>
      <div className="bg-red-50 p-4 rounded-lg"><h3 className="font-bold mb-3">PASIVA</h3><div className="space-y-2"><div className="flex justify-between"><span>Hutang</span><span>{formatCurrency(reportData?.pasiva?.hutang || 0)}</span></div><div className="flex justify-between"><span>Modal</span><span>{formatCurrency(reportData?.pasiva?.modal || 0)}</span></div><div className="flex justify-between font-bold border-t pt-2"><span>Total Pasiva</span><span>{formatCurrency(reportData?.pasiva?.total || 0)}</span></div></div></div>
    </div>
  );

  const renderArusKas = () => (
    <div className="space-y-6">
      <div className="bg-green-50 p-4 rounded-lg"><div className="flex justify-between font-bold"><span>Kas Masuk</span><span className="text-green-600">{formatCurrency(reportData?.kasMasuk || 0)}</span></div></div>
      <div className="bg-red-50 p-4 rounded-lg"><div className="flex justify-between font-bold"><span>Kas Keluar</span><span className="text-red-600">{formatCurrency(reportData?.kasKeluar || 0)}</span></div></div>
      <div className="bg-blue-50 p-4 rounded-lg"><div className="flex justify-between font-bold text-xl"><span>Kas Bersih</span><span className="text-blue-600">{formatCurrency(reportData?.kasBersih || 0)}</span></div></div>
    </div>
  );

  const renderPajak = () => (
    <div className="space-y-4">
      <div className="flex justify-between py-2 border-b"><span>PPN (11%)</span><span className="font-bold">{formatCurrency(reportData?.ppn || 0)}</span></div>
      <div className="flex justify-between py-2 border-b"><span>PPh 21</span><span className="font-bold">{formatCurrency(reportData?.pph21 || 0)}</span></div>
      <div className="flex justify-between py-2 border-b"><span>PPh 23 (2%)</span><span className="font-bold">{formatCurrency(reportData?.pph23 || 0)}</span></div>
      <div className="flex justify-between py-3 bg-red-50 p-3 rounded-lg font-bold text-lg"><span>TOTAL PAJAK</span><span className="text-red-600">{formatCurrency(reportData?.total || 0)}</span></div>
    </div>
  );

  const renderReport = () => {
    if (selectedReport === 'laba-rugi') return renderLabaRugi();
    if (selectedReport === 'neraca') return renderNeraca();
    if (selectedReport === 'arus-kas') return renderArusKas();
    if (selectedReport === 'pajak') return renderPajak();
    return <div>Laporan tidak tersedia</div>;
  };

  return (
    <div className="space-y-6">
      <div className="animate-slide-in-up">
        <h1 className="font-display text-3xl font-bold text-text">Laporan Keuangan</h1>
        <p className="text-text-muted mt-1">Buat dan kelola laporan keuangan perusahaan Anda</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {reportTypes.map((report, index) => (
          <motion.button
            key={report.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            onClick={() => { setSelectedReport(report.id); setShowModal(true); }}
            className="bg-surface rounded-xl border-2 border-border hover:border-accent p-6 text-left transition-all duration-200 group card-hover"
          >
            <div className={`${report.color} w-14 h-14 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
              <report.icon className="w-7 h-7 text-white" strokeWidth={2} />
            </div>
            <h3 className="font-display text-lg font-bold text-text mb-1">{report.name}</h3>
            <p className="text-sm text-text-muted">{report.description}</p>
          </motion.button>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-surface rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-border flex justify-between items-center">
              <div><h2 className="font-display text-2xl font-bold text-text">{getReportTitle()}</h2><p className="text-sm text-text-muted">Periode: {selectedPeriod}</p></div>
              <button onClick={() => setShowModal(false)} className="text-text-muted hover:text-text">✕</button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {loading ? <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div> : renderReport()}
            </div>
            <div className="p-6 border-t border-border flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-border rounded-lg">Tutup</button>
              <button className="px-4 py-2 bg-accent text-white rounded-lg"><Download className="w-4 h-4 inline mr-2" />Download PDF</button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
