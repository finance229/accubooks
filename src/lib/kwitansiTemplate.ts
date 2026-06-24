// src/lib/kwitansiTemplate.ts

export function generateKwitansiHTML(
  invoice: any,
  company: any,
  customer: any,
  items: any[],
  payment: any
) {
  const formatRupiah = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (date: string) => {
    if (!date) return '';
    const d = new Date(date);
    const bulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return `${d.getDate()} ${bulan[d.getMonth()]} ${d.getFullYear()}`;
  };

  const terbilang = (angka: number) => {
    const satuan = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan'];
    const belasan = ['Sepuluh', 'Sebelas', 'Dua Belas', 'Tiga Belas', 'Empat Belas', 'Lima Belas', 'Enam Belas', 'Tujuh Belas', 'Delapan Belas', 'Sembilan Belas'];
    const puluhan = ['', '', 'Dua Puluh', 'Tiga Puluh', 'Empat Puluh', 'Lima Puluh', 'Enam Puluh', 'Tujuh Puluh', 'Delapan Puluh', 'Sembilan Puluh'];

    if (angka === 0) return 'Nol';
    if (angka < 10) return satuan[angka];
    if (angka < 20) return belasan[angka - 10];
    if (angka < 100) {
      const puluh = Math.floor(angka / 10);
      const sisa = angka % 10;
      return puluhan[puluh] + (sisa > 0 ? ' ' + satuan[sisa] : '');
    }
    if (angka < 1000) {
      const ratus = Math.floor(angka / 100);
      const sisa = angka % 100;
      return satuan[ratus] + ' Ratus' + (sisa > 0 ? ' ' + terbilang(sisa) : '');
    }
    if (angka < 1000000) {
      const ribu = Math.floor(angka / 1000);
      const sisa = angka % 1000;
      return terbilang(ribu) + ' Ribu' + (sisa > 0 ? ' ' + terbilang(sisa) : '');
    }
    if (angka < 1000000000) {
      const juta = Math.floor(angka / 1000000);
      const sisa = angka % 1000000;
      return terbilang(juta) + ' Juta' + (sisa > 0 ? ' ' + terbilang(sisa) : '');
    }
    return angka.toString();
  };

  let itemsHtml = '';
  let totalSubtotal = 0;

  items.forEach((item) => {
    const itemTotal = item.quantity * item.unit_price;
    totalSubtotal += itemTotal;
    itemsHtml += `
      <tr>
        <td style="padding: 8px 10px; font-size: 12px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
        <td style="padding: 8px 10px; font-size: 12px; border-bottom: 1px solid #eee;">${item.description}</td>
        <td style="padding: 8px 10px; font-size: 12px; border-bottom: 1px solid #eee; text-align: right;">${formatRupiah(item.unit_price)}</td>
        <td style="padding: 8px 10px; font-size: 12px; border-bottom: 1px solid #eee; text-align: right;">${formatRupiah(itemTotal)}</td>
      </tr>
    `;
  });

  const ppn = invoice.ppn || 0;
  const grandTotal = invoice.total || totalSubtotal + ppn;

  // Tanda tangan dari company
  const signatureImg = company?.signature_url 
    ? `<img src="${company.signature_url}" style="max-width: 120px; max-height: 50px; margin-bottom: 4px;" />` 
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Kwitansi ${invoice.invoice_number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Times New Roman', Times, serif; background: #e0e0e0; display: flex; justify-content: center; padding: 20px; }
    .kwitansi { width: 21cm; min-height: 29.7cm; background: white; margin: 0 auto; box-shadow: 0 0 10px rgba(0,0,0,0.1); padding: 20mm 25mm; position: relative; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 20px; }
    .header-left { flex: 1; }
    .header-left .company-name { font-size: 18px; font-weight: bold; }
    .header-left .company-detail { font-size: 10px; color: #555; margin-top: 2px; }
    .header-right { text-align: right; }
    .header-right .title { font-size: 28px; font-weight: bold; letter-spacing: 2px; }
    .header-right .no { font-size: 12px; color: #555; }
    .info-grid { display: flex; justify-content: space-between; margin-bottom: 18px; font-size: 12px; }
    .info-grid .right { text-align: right; }
    .info-grid strong { font-weight: 600; }
    .table-wrap { margin: 14px 0 18px 0; border: 1px solid #ccc; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    table th { background: #f5f5f5; padding: 8px 10px; text-align: left; font-weight: 600; border-bottom: 1px solid #ccc; }
    table td { padding: 8px 10px; border-bottom: 1px solid #eee; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .total-row { display: flex; justify-content: flex-end; align-items: center; gap: 30px; margin-top: 10px; padding-top: 10px; border-top: 2px solid #000; }
    .total-row .label { font-size: 14px; font-weight: 600; }
    .total-row .amount { font-size: 20px; font-weight: 700; }
    .terbilang { margin-top: 16px; padding: 10px 14px; background: #f7f7f7; border-left: 4px solid #000; font-size: 12px; }
    .footer { margin-top: 30px; display: flex; justify-content: space-between; align-items: flex-end; }
    .footer .left { font-size: 11px; color: #555; line-height: 1.6; }
    .signature-area { text-align: center; min-width: 140px; }
    .signature-area .signature-img { max-width: 120px; max-height: 50px; margin-bottom: 4px; }
    .signature-area .line { width: 140px; border-top: 1px solid #000; margin: 4px auto 2px auto; }
    .signature-area .name { font-size: 13px; font-weight: 600; }
    .signature-area .title { font-size: 11px; color: #555; }
    .signature-area .date { font-size: 11px; color: #555; margin-top: 2px; }
    @media print { body { background: white; padding: 0; } .kwitansi { box-shadow: none; margin: 0; width: 100%; } }
  </style>
</head>
<body>
  <div class="kwitansi">
    <!-- HEADER -->
    <div class="header">
      <div class="header-left">
        <div class="company-name">${company?.name || 'PT Artha Kondang Internasional'}</div>
        <div class="company-detail">${company?.address || 'Taman Tekno X BSD Blok G No 2, Tangerang Selatan - Banten 15314'}</div>
        <div class="company-detail">Telp: ${company?.phone || '+62821-3017-2363'} | Email: ${company?.email || 'finance@arthakondang.co.id'}</div>
      </div>
      <div class="header-right">
        <div class="title">KWITANSI</div>
        <div class="no">No. ${invoice.invoice_number}</div>
      </div>
    </div>

    <!-- INFO -->
    <div class="info-grid">
      <div class="left">
        <strong>Diterima dari</strong><br>
        ${customer?.name || invoice.customer_name}<br>
        ${customer?.address || ''}<br>
        ${customer?.phone || ''}
      </div>
      <div class="right">
        <strong>Tanggal</strong><br>
        ${formatDate(invoice.invoice_date)}
      </div>
    </div>

    <!-- TABLE -->
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th style="width:10%; text-align:center;">Qty</th>
            <th style="width:45%;">Keterangan</th>
            <th style="width:20%; text-align:right;">Harga</th>
            <th style="width:25%; text-align:right;">Jumlah</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
          <tr>
            <td colspan="3" style="text-align:right; font-weight:600; border-top:1px solid #ccc;">Subtotal</td>
            <td style="text-align:right; font-weight:600; border-top:1px solid #ccc;">${formatRupiah(totalSubtotal)}</td>
          </tr>
          ${ppn > 0 ? `
          <tr>
            <td colspan="3" style="text-align:right; border-bottom:1px solid #ccc;">PPN 11%</td>
            <td style="text-align:right; border-bottom:1px solid #ccc;">${formatRupiah(ppn)}</td>
          </tr>
          ` : ''}
        </tbody>
      </table>
    </div>

    <!-- TOTAL -->
    <div class="total-row">
      <span class="label">Total Dibayar</span>
      <span class="amount">${formatRupiah(grandTotal)}</span>
    </div>

    <!-- TERBILANG -->
    <div class="terbilang">
      <strong>Terbilang:</strong> ${terbilang(Math.round(grandTotal))} Rupiah
    </div>

    <!-- FOOTER -->
    <div class="footer">
      <div class="left">
        <div>${payment?.payment_method ? `Metode: ${payment.payment_method}` : '-'}</div>
        <div>${payment?.bank_name ? `Bank: ${payment.bank_name} - No. Rek ${payment.bank_account || ''}` : ''}</div>
        <div>a.n. ${company?.name || ''}</div>
      </div>
      <div class="signature-area">
        <div>Hormat Kami,</div>
        <div style="height: 50px; display: flex; align-items: flex-end; justify-content: center;">
          ${signatureImg}
        </div>
        <div class="line"></div>
        <div class="name">${company?.director || 'Adis Nugroho Santoso'}</div>
        <div class="title">Direktur Utama</div>
        <div class="date">${formatDate(new Date().toISOString())}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}
