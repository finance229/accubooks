import { useState, useEffect } from 'react';
import { Calendar, Download, Printer, Loader2, FileSpreadsheet, Eye, ChevronDown, ChevronUp } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useCompany } from '../contexts/CompanyContext';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../lib/accountingHelpers';
import {
  getCashflowLangsung,
  getCashflowTidakLangsung,
  getLaporanPajak,
  CashflowData,
  PajakData,
} from '../lib/reportHelpers';

type TabType = 'cashflow' | 'pajak';

export default function ReportsGeneral() {
  const { currentCompany } = useCompany();
  const { user } = useAuth();
  
  const [activeTab, setActiveTab] = useState<TabType>('cashflow');
  const [metode, setMetode] = useState<'langsung' | 'tidak_langsung'>('langsung');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [loading, setLoading] = useState(false);
  const [cashflowData, setCashflowData] = useState<CashflowData | null>(null);
  const [pajakData, setPajakData] = useState<PajakData | null>(null);
  
  // State untuk detail transaksi (popup)
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailItems, setDetailItems] = useState<any[]>([]);
  const [detailTitle, setDetailTitle] = useState('');

  useEffect(() => {
    if (currentCompany?.id) {
      fetchData();
    }
  }, [currentCompany, startDate, endDate, activeTab, metode]);

  const fetchData = async () => {
    if (!currentCompany?.id) return;
    setLoading(true);
    try {
      if (activeTab === 'cashflow') {
        const data = metode === 'langsung'
          ? await getCashflowLangsung(currentCompany.id, startDate, endDate)
          : await getCashflowTidakLangsung(currentCompany.id, startDate, endDate);
        setCashflowData(data);
      } else {
        const data = await getLaporanPajak(currentCompany.id, startDate, endDate);
        setPajakData(data);
      }
    } catch (error) {
      console.error('Error fetching report:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  // Handler untuk klik detail
  const handleShowDetail = (items: any[], title: string) => {
    setDetailItems(items);
    setDetailTitle(title);
    setShowDetailModal(true);
  };

  const renderCashflow = () => {
    if (!cashflowData) return <div className="text-center py-12">Tidak ada data</div>;
    
    const { operasi, investasi, pendanaan, totalOperasi, totalInvestasi, totalPendanaan, kasAwal, kasAkhir, metode: m } = cashflowData;

    return (
      <div className="space-y-8">
        {/* Ringkasan */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-green-50 rounded-xl p-5 border border-green-200">
            <p className="text-sm text-green-700">Arus Kas Operasi</p>
            <p className={`text-2xl font-bold ${totalOperasi >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {formatCurrency(totalOperasi)}
            </p>
          </div>
          <div className="bg-blue-50 rounded-xl p-5 border border-blue-200">
            <p className="text-sm text-blue-700">Arus Kas Investasi</p>
            <p className={`text-2xl font-bold ${totalInvestasi >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
              {formatCurrency(totalInvestasi)}
            </p>
          </div>
          <div className="bg-purple-50 rounded-xl p-5 border border-purple-200">
            <p className="text-sm text-purple-700">Arus Kas Pendanaan</p>
            <p className={`text-2xl font-bold ${totalPendanaan >= 0 ? 'text-purple-700' : 'text-red-700'}`}>
              {formatCurrency(totalPendanaan)}
            </p>
          </div>
        </div>

        {/* Detail per kategori */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {renderSection('Operasi', operasi, totalOperasi, 'green')}
          {renderSection('Investasi', investasi, totalInvestasi, 'blue')}
          {renderSection('Pendanaan', pendanaan, totalPendanaan, 'purple')}
        </div>

        {/* Kas awal & akhir */}
        <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Saldo Kas Awal</p>
              <p className="text-xl font-bold">{formatCurrency(kasAwal)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Saldo Kas Akhir</p>
              <p className="text-xl font-bold">{formatCurrency(kasAkhir)}</p>
            </div>
          </div>
        </div>

        {m === 'tidak_langsung' && cashflowData.labaBersih !== undefined && (
          <div className="bg-blue-50 rounded-xl p-5 border border-blue-200">
            <p className="text-sm text-blue-700">Laba Bersih (awal)</p>
            <p className="text-xl font-bold">{formatCurrency(cashflowData.labaBersih)}</p>
          </div>
        )}
      </div>
    );
  };

  const renderSection = (title: string, items: any[], total: number, color: string) => {
    if (items.length === 0) {
      return (
        <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
          <h4 className="font-bold text-gray-700">{title}</h4>
          <p className="text-sm text-gray-400">Tidak ada transaksi</p>
        </div>
      );
    }

    const totalColor = total >= 0 ? `text-${color}-700` : 'text-red-700';

    return (
      <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
        <h4 className="font-bold text-gray-700 mb-3 flex justify-between">
          <span>{title}</span>
          <span className={totalColor}>{formatCurrency(total)}</span>
        </h4>
        {items.map((item, idx) => (
          <div key={idx} className="mb-2 border-b border-gray-100 pb-2 last:border-0">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">{item.kategori}</span>
              <span className="font-mono">{formatCurrency(item.total)}</span>
            </div>
            {item.items && item.items.length > 0 && (
              <button
                onClick={() => handleShowDetail(item.items, item.kategori)}
                className="text-xs text-blue-500 hover:underline flex items-center gap-1 mt-1"
              >
                <Eye className="w-3 h-3" /> Lihat detail ({item.items.length} transaksi)
              </button>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderPajak = () => {
    if (!pajakData) return <div className="text-center py-12">Tidak ada data</div>;

    const { ppn, pphFinal, pphTidakFinal, saldoKreditPajak } = pajakData;

    return (
      <div className="space-y-6">
        {/* PPN */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-bold text-lg mb-3">PPN</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-500">PPN Keluaran</p>
              <p className="text-lg font-bold text-blue-600">{formatCurrency(ppn.keluaran.total)}</p>
              <button
                onClick={() => handleShowDetail(ppn.keluaran.items, 'PPN Keluaran')}
                className="text-xs text-blue-500 hover:underline"
              >
                Lihat detail
              </button>
            </div>
            <div>
              <p className="text-sm text-gray-500">PPN Masukan</p>
              <p className="text-lg font-bold text-green-600">{formatCurrency(ppn.masukan.total)}</p>
              <button
                onClick={() => handleShowDetail(ppn.masukan.items, 'PPN Masukan')}
                className="text-xs text-blue-500 hover:underline"
              >
                Lihat detail
              </button>
            </div>
            <div>
              <p className="text-sm text-gray-500">Selisih (Kurang/Lebih Bayar)</p>
              <p className={`text-lg font-bold ${ppn.selisih >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                {formatCurrency(ppn.selisih)}
              </p>
            </div>
          </div>
        </div>

        {/* PPh Final */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-bold text-lg mb-3">PPh Final</h3>
          <div>
            <p className="text-lg font-bold text-purple-600">{formatCurrency(pphFinal.total)}</p>
            <button
              onClick={() => handleShowDetail(pphFinal.items, 'PPh Final')}
              className="text-xs text-blue-500 hover:underline"
            >
              Lihat detail
            </button>
          </div>
        </div>

        {/* PPh Tidak Final */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-bold text-lg mb-3">PPh Tidak Final</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-500">PPh 21</p>
              <p className="text-lg font-bold">{formatCurrency(pphTidakFinal.pph21.total)}</p>
              <button
                onClick={() => handleShowDetail(pphTidakFinal.pph21.items, 'PPh 21')}
                className="text-xs text-blue-500 hover:underline"
              >
                Lihat detail
              </button>
            </div>
            <div>
              <p className="text-sm text-gray-500">PPh 23</p>
              <p className="text-lg font-bold">{formatCurrency(pphTidakFinal.pph23.total)}</p>
              <button
                onClick={() => handleShowDetail(pphTidakFinal.pph23.items, 'PPh 23')}
                className="text-xs text-blue-500 hover:underline"
              >
                Lihat detail
              </button>
            </div>
            <div>
              <p className="text-sm text-gray-500">PPh 25</p>
              <p className="text-lg font-bold">{formatCurrency(pphTidakFinal.pph25.total)}</p>
              <button
                onClick={() => handleShowDetail(pphTidakFinal.pph25.items, 'PPh 25')}
                className="text-xs text-blue-500 hover:underline"
              >
                Lihat detail
              </button>
            </div>
            <div>
              <p className="text-sm text-gray-500">Total PPh Tidak Final</p>
              <p className="text-lg font-bold text-orange-600">{formatCurrency(pphTidakFinal.total)}</p>
            </div>
          </div>
        </div>

        {/* Saldo Kredit Pajak */}
        <div className="bg-blue-50 rounded-xl p-5 border border-blue-200">
          <p className="text-sm text-blue-700">Saldo PPh yang Bisa Dikurangkan (Kredit Pajak)</p>
          <p className="text-2xl font-bold text-blue-700">{formatCurrency(saldoKreditPajak)}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="animate-slide-in-up">
        <h1 className="font-display text-3xl font-bold text-text">Laporan Umum</h1>
        <p className="text-text-muted mt-1">Cashflow &amp; Laporan Pajak</p>
      </div>

      {/* Filter */}
      <div className="bg-surface rounded-xl border border-border p-6">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Dari Tanggal</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-4 py-2 border border-border rounded-lg bg-surface"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Sampai Tanggal</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-4 py-2 border border-border rounded-lg bg-surface"
            />
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Tampilkan'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border gap-4">
        <button
          onClick={() => setActiveTab('cashflow')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'cashflow'
              ? 'border-b-2 border-accent text-accent'
              : 'text-text-muted hover:text-text'
          }`}
        >
          Arus Kas (Cashflow)
        </button>
        <button
          onClick={() => setActiveTab('pajak')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'pajak'
              ? 'border-b-2 border-accent text-accent'
              : 'text-text-muted hover:text-text'
          }`}
        >
          Laporan Pajak
        </button>
      </div>

      {/* Metode dropdown (hanya untuk cashflow) */}
      {activeTab === 'cashflow' && (
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">Metode:</span>
          <select
            value={metode}
            onChange={(e) => setMetode(e.target.value as 'langsung' | 'tidak_langsung')}
            className="px-4 py-2 border border-border rounded-lg bg-surface"
          >
            <option value="langsung">Langsung</option>
            <option value="tidak_langsung">Tidak Langsung</option>
          </select>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-border p-6">
          {activeTab === 'cashflow' ? renderCashflow() : renderPajak()}
        </div>
      )}

      {/* Modal Detail Transaksi */}
      {showDetailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-border">
              <h3 className="font-display text-xl font-bold text-text">{detailTitle}</h3>
              <button onClick={() => setShowDetailModal(false)} className="text-text-muted hover:text-text">
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <table className="w-full">
                <thead className="bg-background">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-text-muted">Tanggal</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-text-muted">Deskripsi</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-text-muted">Jumlah</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {detailItems.map((item, idx) => (
                    <tr key={idx} className="hover:bg-background">
                      <td className="px-4 py-2 text-sm">{item.tanggal || formatDate(item.invoice_date || item.request_date || item.journal_date)}</td>
                      <td className="px-4 py-2 text-sm">{item.deskripsi || item.description || item.vendor_name || item.customer_name || '-'}</td>
                      <td className="px-4 py-2 text-right font-mono">{formatCurrency(item.jumlah || item.amount || item.total || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-6 border-t border-border flex justify-end">
              <button onClick={() => setShowDetailModal(false)} className="px-4 py-2 border border-border rounded-lg hover:bg-background">
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
