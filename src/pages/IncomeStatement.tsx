import { useState, useEffect } from 'react';
import { Calendar, Download, Printer, Loader2, FileSpreadsheet } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useCompany } from '../contexts/CompanyContext';
import { formatCurrency } from '../lib/accountingHelpers';

type AccountBalance = {
  id: number;
  account_code: string;
  account_name: string;
  balance: number;
  type: string;
};

type IncomeStatementData = {
  revenue: AccountBalance[];
  expenses: AccountBalance[];
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
};

export default function IncomeStatement() {
  const { currentCompany } = useCompany();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<IncomeStatementData>({
    revenue: [],
    expenses: [],
    totalRevenue: 0,
    totalExpenses: 0,
    netIncome: 0,
  });
  
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(1);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (currentCompany?.id) {
      fetchIncomeStatement();
    }
  }, [currentCompany, startDate, endDate]);

  const fetchIncomeStatement = async () => {
    if (!currentCompany?.id) return;
    setLoading(true);

    try {
      // Ambil data dari view income_statement
      const { data: viewData, error } = await supabase
        .from('income_statement')
        .select('*')
        .eq('company_id', currentCompany.id);

      if (error) {
        console.error('Error fetching income statement:', error);
        setLoading(false);
        return;
      }

      console.log('Income statement data:', viewData);

      if (!viewData || viewData.length === 0) {
        setLoading(false);
        return;
      }

      // Filter dan mapping untuk pendapatan
      const revenueList = viewData
        .filter(item => item.account_type === 'revenue' && item.balance !== 0)
        .map(item => ({
          id: item.coa_id,
          account_code: item.account_code,
          account_name: item.account_name,
          balance: item.balance,
          type: item.account_type,
        }));

      // Filter dan mapping untuk beban
      const expensesList = viewData
        .filter(item => item.account_type === 'expense' && item.balance !== 0)
        .map(item => ({
          id: item.coa_id,
          account_code: item.account_code,
          account_name: item.account_name,
          balance: item.balance,
          type: item.account_type,
        }));

      const totalRevenue = revenueList.reduce((sum, r) => sum + r.balance, 0);
      const totalExpenses = expensesList.reduce((sum, e) => sum + e.balance, 0);

      setData({
        revenue: revenueList,
        expenses: expensesList,
        totalRevenue,
        totalExpenses,
        netIncome: totalRevenue - totalExpenses,
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
        <title>Laba Rugi - ${currentCompany?.name}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Times New Roman', Times, serif; padding: 40px; }
          .header { text-align: center; margin-bottom: 30px; }
          .company-name { font-size: 18px; font-weight: bold; }
          .report-title { font-size: 16px; margin-top: 5px; }
          .period { font-size: 12px; margin-top: 3px; }
          .section { margin-bottom: 25px; }
          .section-title { font-size: 14px; font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 5px; margin-bottom: 10px; }
          .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; }
          .total-row { display: flex; justify-content: space-between; padding: 8px 0; margin-top: 8px; border-top: 1px solid #ccc; font-weight: bold; }
          .net-income { background: #f0f0f0; padding: 10px; margin-top: 20px; font-weight: bold; font-size: 14px; display: flex; justify-content: space-between; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-name">${currentCompany?.name || 'PT Artha Kondang Internasional'}</div>
          <div class="report-title">LAPORAN LABA RUGI</div>
          <div class="period">Periode: ${formatDate(startDate)} s/d ${formatDate(endDate)}</div>
        </div>
        <div class="section">
          <div class="section-title">PENDAPATAN</div>
          ${data.revenue.map(item => `<div class="row"><span>${item.account_name}</span><span>${formatRp(item.balance)}</span></div>`).join('')}
          <div class="total-row"><span>TOTAL PENDAPATAN</span><span>${formatRp(data.totalRevenue)}</span></div>
        </div>
        <div class="section">
          <div class="section-title">BEBAN</div>
          ${data.expenses.map(item => `<div class="row"><span>${item.account_name}</span><span>${formatRp(item.balance)}</span></div>`).join('')}
          <div class="total-row"><span>TOTAL BEBAN</span><span>${formatRp(data.totalExpenses)}</span></div>
        </div>
        <div class="net-income"><span>LABA BERSIH</span><span>${formatRp(data.netIncome)}</span></div>
        <div style="margin-top: 30px; font-size: 10px; text-align: center;">Dicetak: ${new Date().toLocaleDateString('id-ID')}</div>
      </body>
      </html>
    `;
  };

  // ========== DOWNLOAD EXCEL ==========
  const handleDownloadExcel = () => {
    let csvContent = "LAPORAN LABA RUGI\n\n";
    csvContent += `Periode: ${formatDate(startDate)} s/d ${formatDate(endDate)}\n\n`;
    csvContent += "PENDAPATAN\n";
    csvContent += "Akun,Jumlah\n";
    data.revenue.forEach(item => {
      csvContent += `${item.account_name},${item.balance}\n`;
    });
    csvContent += `TOTAL PENDAPATAN,${data.totalRevenue}\n\n`;
    csvContent += "BEBAN\n";
    csvContent += "Akun,Jumlah\n";
    data.expenses.forEach(item => {
      csvContent += `${item.account_name},${item.balance}\n`;
    });
    csvContent += `TOTAL BEBAN,${data.totalExpenses}\n\n`;
    csvContent += `LABA BERSIH,${data.netIncome}\n`;

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laba_rugi_${startDate}_to_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!currentCompany) return <div className="flex justify-center py-12">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="animate-slide-in-up">
        <h1 className="font-display text-3xl font-bold text-text">Laporan Laba Rugi</h1>
        <p className="text-text-muted mt-1">Ringkasan pendapatan dan beban perusahaan</p>
      </div>

      <div className="bg-surface rounded-xl border border-border p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Dari Tanggal</label>
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)} 
              className="w-full px-4 py-2 border rounded-lg" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Sampai Tanggal</label>
            <input 
              type="date" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)} 
              className="w-full px-4 py-2 border rounded-lg" 
            />
          </div>
          <div className="flex items-end gap-2">
            <button 
              onClick={fetchIncomeStatement} 
              className="px-4 py-2 bg-accent text-white rounded-lg"
            >
              Tampilkan
            </button>
          </div>
          <div className="flex items-end gap-2">
            <button 
              onClick={handleDownloadPDF} 
              className="px-4 py-2 border border-border rounded-lg hover:bg-background"
            >
              <Printer className="w-4 h-4 inline mr-2" />PDF
            </button>
            <button 
              onClick={handleDownloadExcel} 
              className="px-4 py-2 border border-border rounded-lg hover:bg-background"
            >
              <FileSpreadsheet className="w-4 h-4 inline mr-2" />Excel
            </button>
          </div>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden p-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-accent" />
          </div>
        ) : (
          <>
            <div className="text-center mb-8">
              <h2 className="font-display text-2xl font-bold">LAPORAN LABA RUGI</h2>
              <p className="text-text-muted">{formatDate(startDate)} s/d {formatDate(endDate)}</p>
              <p className="text-sm">{currentCompany.name}</p>
            </div>

            {/* PENDAPATAN */}
            <div className="mb-8">
              <h3 className="font-bold text-lg border-b-2 border-accent pb-2 mb-4">PENDAPATAN</h3>
              {data.revenue.length === 0 ? (
                <p className="text-text-muted">Tidak ada data pendapatan</p>
              ) : (
                data.revenue.map((item, idx) => (
                  <div key={idx} className="flex justify-between py-1">
                    <span className="text-text">{item.account_name}</span>
                    <span className="text-success">{formatCurrency(item.balance)}</span>
                  </div>
                ))
              )}
              <div className="flex justify-between pt-2 mt-2 border-t font-bold">
                <span>Total Pendapatan</span>
                <span className="text-success">{formatCurrency(data.totalRevenue)}</span>
              </div>
            </div>

            {/* BEBAN */}
            <div className="mb-8">
              <h3 className="font-bold text-lg border-b-2 border-accent pb-2 mb-4">BEBAN</h3>
              {data.expenses.length === 0 ? (
                <p className="text-text-muted">Tidak ada data beban</p>
              ) : (
                data.expenses.map((item, idx) => (
                  <div key={idx} className="flex justify-between py-1">
                    <span className="text-text">{item.account_name}</span>
                    <span className="text-danger">{formatCurrency(item.balance)}</span>
                  </div>
                ))
              )}
              <div className="flex justify-between pt-2 mt-2 border-t font-bold">
                <span>Total Beban</span>
                <span className="text-danger">{formatCurrency(data.totalExpenses)}</span>
              </div>
            </div>

            {/* LABA BERSIH */}
            <div className="bg-info/10 p-4 rounded-lg">
              <div className="flex justify-between font-bold text-xl">
                <span>LABA BERSIH</span>
                <span className={data.netIncome >= 0 ? 'text-success' : 'text-danger'}>
                  {formatCurrency(data.netIncome)}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
