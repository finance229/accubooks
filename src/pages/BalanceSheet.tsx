import { useState, useEffect } from 'react';
import { Calendar, Download, Printer, Loader2, FileSpreadsheet } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useCompany } from '../contexts/CompanyContext';
import { formatCurrency } from '../lib/accountingHelpers';

type AccountBalance = {
  account_id: number;
  account_code: string;
  account_name: string;
  balance: number;
  type: string;
};

type BalanceSheetData = {
  assets: AccountBalance[];
  liabilities: AccountBalance[];
  equity: AccountBalance[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
};

export default function BalanceSheet() {
  const { currentCompany } = useCompany();
  const [loading, setLoading] = useState(true);
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);
  const [data, setData] = useState<BalanceSheetData>({
    assets: [],
    liabilities: [],
    equity: [],
    totalAssets: 0,
    totalLiabilities: 0,
    totalEquity: 0,
  });

  useEffect(() => {
    if (currentCompany?.id) {
      fetchBalanceSheet();
    }
  }, [currentCompany, asOfDate]);

const fetchBalanceSheet = async () => {
  if (!currentCompany?.id) return;
  setLoading(true);

  try {
    // Ambil data dari view balance_sheet
    const { data, error } = await supabase
      .from('balance_sheet')
      .select('*')
      .eq('company_id', currentCompany.id);

    if (error) {
      console.error('Error fetching balance sheet:', error);
      setLoading(false);
      return;
    }

    console.log('Balance sheet data:', data);

    if (!data || data.length === 0) {
      setLoading(false);
      return;
    }

    const assetsList = data
      .filter(item => item.account_type === 'asset' && item.balance !== 0)
      .map(item => ({
        account_code: item.account_code,
        account_name: item.account_name,
        balance: item.balance,
      }));

    const liabilitiesList = data
      .filter(item => item.account_type === 'liability' && item.balance !== 0)
      .map(item => ({
        account_code: item.account_code,
        account_name: item.account_name,
        balance: item.balance,
      }));

    const equityList = data
      .filter(item => item.account_type === 'equity' && item.balance !== 0)
      .map(item => ({
        account_code: item.account_code,
        account_name: item.account_name,
        balance: item.balance,
      }));

    const totalAssets = assetsList.reduce((sum, a) => sum + a.balance, 0);
    const totalLiabilities = liabilitiesList.reduce((sum, l) => sum + l.balance, 0);
    const totalEquity = equityList.reduce((sum, e) => sum + e.balance, 0);

    setData({
      assets: assetsList,
      liabilities: liabilitiesList,
      equity: equityList,
      totalAssets,
      totalLiabilities,
      totalEquity,
    });
  } catch (error) {
    console.error('Error:', error);
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

  // ========== DOWNLOAD PDF ==========
  const handleDownloadPDF = () => {
    const printWindow = window.open('', '_blank');
    const html = generatePDFHTML();
    printWindow?.document.write(html);
    printWindow?.document.close();
  };

  const generatePDFHTML = () => {
    const formatRp = (amount: number) => {
      return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
    };

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Neraca - ${currentCompany?.name}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Times New Roman', Times, serif; padding: 40px; }
          .header { text-align: center; margin-bottom: 30px; }
          .company-name { font-size: 18px; font-weight: bold; }
          .report-title { font-size: 16px; margin-top: 5px; }
          .period { font-size: 12px; margin-top: 3px; }
          .balance-grid { display: flex; gap: 40px; margin-top: 20px; }
          .balance-col { flex: 1; }
          .section-title { font-size: 14px; font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 5px; margin-bottom: 10px; }
          .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; }
          .total-row { display: flex; justify-content: space-between; padding: 8px 0; margin-top: 8px; border-top: 1px solid #ccc; font-weight: bold; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-name">${currentCompany?.name || 'PT Artha Kondang Internasional'}</div>
          <div class="report-title">NERACA</div>
          <div class="period">Per Tanggal: ${formatDate(asOfDate)}</div>
        </div>
        <div class="balance-grid">
          <div class="balance-col">
            <div class="section-title">AKTIVA (ASET)</div>
            ${data.assets.map(item => `<div class="row"><span>${item.name}</span><span>${formatRp(item.balance)}</span></div>`).join('')}
            <div class="total-row"><span>TOTAL AKTIVA</span><span>${formatRp(data.totalAssets)}</span></div>
          </div>
          <div class="balance-col">
            <div class="section-title">PASIVA</div>
            <div style="margin-bottom: 20px;"><div style="font-weight: bold; margin-bottom: 5px;">Kewajiban (Liabilitas)</div>${data.liabilities.map(item => `<div class="row"><span>${item.name}</span><span>${formatRp(item.balance)}</span></div>`).join('')}<div class="total-row"><span>Total Kewajiban</span><span>${formatRp(data.totalLiabilities)}</span></div></div>
            <div><div style="font-weight: bold; margin-bottom: 5px;">Ekuitas</div>${data.equity.map(item => `<div class="row"><span>${item.name}</span><span>${formatRp(item.balance)}</span></div>`).join('')}<div class="total-row"><span>Total Ekuitas</span><span>${formatRp(data.totalEquity)}</span></div></div>
            <div class="total-row" style="margin-top: 15px; border-top: 2px solid #000;"><span>TOTAL PASIVA</span><span>${formatRp(data.totalLiabilities + data.totalEquity)}</span></div>
          </div>
        </div>
        <div style="margin-top: 30px; font-size: 10px; text-align: center;">Dicetak: ${new Date().toLocaleDateString('id-ID')}</div>
      </body>
      </html>
    `;
  };

  // ========== DOWNLOAD EXCEL ==========
  const handleDownloadExcel = () => {
    let csvContent = "NERACA\n\n";
    csvContent += `Per Tanggal: ${formatDate(asOfDate)}\n\n`;
    csvContent += "AKTIVA (ASET)\n";
    csvContent += "Akun,Jumlah\n";
    data.assets.forEach(item => {
      csvContent += `${item.name},${item.balance}\n`;
    });
    csvContent += `TOTAL AKTIVA,${data.totalAssets}\n\n`;
    csvContent += "PASIVA\n";
    csvContent += "KEWAJIBAN (LIABILITAS)\n";
    data.liabilities.forEach(item => {
      csvContent += `${item.name},${item.balance}\n`;
    });
    csvContent += `TOTAL KEWAJIBAN,${data.totalLiabilities}\n`;
    csvContent += "EKUITAS\n";
    data.equity.forEach(item => {
      csvContent += `${item.name},${item.balance}\n`;
    });
    csvContent += `TOTAL EKUITAS,${data.totalEquity}\n`;
    csvContent += `TOTAL PASIVA,${data.totalLiabilities + data.totalEquity}\n`;

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `neraca_${asOfDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!currentCompany) return <div className="flex justify-center py-12">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="animate-slide-in-up">
        <h1 className="font-display text-3xl font-bold text-text">Neraca</h1>
        <p className="text-text-muted mt-1">Posisi keuangan perusahaan</p>
      </div>

      <div className="bg-surface rounded-xl border border-border p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div><label className="block text-sm font-medium mb-2">Per Tanggal</label><input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className="w-full px-4 py-2 border rounded-lg" /></div>
          <div className="flex items-end gap-2"><button onClick={fetchBalanceSheet} className="px-4 py-2 bg-accent text-white rounded-lg">Tampilkan</button></div>
          <div className="flex items-end gap-2"><button onClick={handleDownloadPDF} className="px-4 py-2 border border-border rounded-lg hover:bg-background"><Printer className="w-4 h-4 inline mr-2" />PDF</button><button onClick={handleDownloadExcel} className="px-4 py-2 border border-border rounded-lg hover:bg-background"><FileSpreadsheet className="w-4 h-4 inline mr-2" />Excel</button></div>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden p-6">
        {loading ? <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div> : (
          <>
            <div className="text-center mb-8"><h2 className="font-display text-2xl font-bold">NERACA</h2><p className="text-text-muted">Per {formatDate(asOfDate)}</p><p className="text-sm">{currentCompany.name}</p></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div><h3 className="font-bold text-lg border-b-2 border-accent pb-2 mb-4">AKTIVA (ASET)</h3>{data.assets.length === 0 ? <p className="text-text-muted">Tidak ada data</p> : data.assets.map(item => (<div key={item.id} className="flex justify-between py-1"><span>{item.name}</span><span>{formatCurrency(item.balance)}</span></div>))}<div className="flex justify-between pt-2 mt-2 border-t font-bold"><span>Total Aktiva</span><span>{formatCurrency(data.totalAssets)}</span></div></div>
              <div><h3 className="font-bold text-lg border-b-2 border-accent pb-2 mb-4">PASIVA</h3><div className="mb-4"><h4 className="font-semibold text-md mb-2">Kewajiban (Liabilitas)</h4>{data.liabilities.length === 0 ? <p className="text-text-muted">Tidak ada data</p> : data.liabilities.map(item => (<div key={item.id} className="flex justify-between py-1"><span>{item.name}</span><span>{formatCurrency(item.balance)}</span></div>))}<div className="flex justify-between pt-2 mt-2 border-t font-semibold"><span>Total Kewajiban</span><span>{formatCurrency(data.totalLiabilities)}</span></div></div>
              <div><h4 className="font-semibold text-md mb-2">Ekuitas</h4>{data.equity.length === 0 ? <p className="text-text-muted">Tidak ada data</p> : data.equity.map(item => (<div key={item.id} className="flex justify-between py-1"><span>{item.name}</span><span>{formatCurrency(item.balance)}</span></div>))}<div className="flex justify-between pt-2 mt-2 border-t font-semibold"><span>Total Ekuitas</span><span>{formatCurrency(data.totalEquity)}</span></div></div>
              <div className="flex justify-between pt-3 mt-3 border-t-2 border-accent font-bold text-lg"><span>TOTAL PASIVA</span><span>{formatCurrency(data.totalLiabilities + data.totalEquity)}</span></div></div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
