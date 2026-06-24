// src/lib/invoiceTemplate.ts

export function generateInvoiceHTML(invoice: any, company: any, customer: any, items: any[]) {
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

  // 🔥 LOOP ITEMS DAN TAMPILKAN
  let itemsHtml = '';
  let totalSubtotal = 0;

  if (items && items.length > 0) {
    items.forEach((item, index) => {
      const qty = item.quantity || 0;
      const price = item.unit_price || 0;
      const itemTotal = qty * price;
      totalSubtotal += itemTotal;
      const additionalText = item.additional || '';
      
      // Additional hanya muncul kalau diisi
      const additionalHtml = additionalText 
        ? `<span class="additional-text">${additionalText}</span>` 
        : '';
      
      itemsHtml += `
        <tr>
          <td style="padding: 8px 10px; border-bottom: 1px solid #eee; vertical-align: top; width: 35%;">
            <strong>${item.description || 'Item ' + (index + 1)}</strong>
            ${additionalHtml}
          </td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #eee; vertical-align: top; width: 25%;">
            ${additionalText ? additionalText : '-'}
          </td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: center; vertical-align: top; width: 15%;">
            ${qty}
          </td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #eee; text-align: right; vertical-align: top; width: 25%;">
            ${formatRupiah(itemTotal)}
          </td>
        </tr>
      `;
    });
  } else {
    itemsHtml = `
      <tr>
        <td colspan="4" style="padding: 20px 0; font-size: 12px; text-align: center; color: #999;">
          Tidak ada item
        </td>
      </tr>
    `;
  }

  const ppn = invoice.ppn || Math.round(totalSubtotal * 0.11);
  const grandTotal = invoice.total || totalSubtotal + ppn;
  const paidAmount = invoice.paid_amount || 0;
  const remainingAmount = grandTotal - paidAmount;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice ${invoice.invoice_number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Times New Roman', Times, serif; background: #e0e0e0; display: flex; justify-content: center; padding: 20px; }
    .invoice { width: 21cm; min-height: 29.7cm; background: white; margin: 0 auto; box-shadow: 0 0 10px rgba(0,0,0,0.1); padding: 20mm 25mm; position: relative; }
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
    table td { padding: 8px 10px; border-bottom: 1px solid #eee; vertical-align: top; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .additional-text {
      display: block;
      font-size: 10px;
      color: #666;
      font-style: italic;
      margin-top: 2px;
    }
    .total-row { display: flex; justify-content: flex-end; align-items: center; gap: 30px; margin-top: 10px; padding-top: 10px; border-top: 2px solid #000; }
    .total-row .label { font-size: 14px; font-weight: 600; }
    .total-row .amount { font-size: 20px; font-weight: 700; }
    .terbilang { margin-top: 16px; padding: 10px 14px; background: #f7f7f7; border-left: 4px solid #000; font-size: 12px; }
    .footer { margin-top: 30px; display: flex; justify-content: space-between; align-items: flex-end; }
    .footer .left { font-size: 11px; color: #555; line-height: 1.6; }
    .signature-area { text-align: center; min-width: 140px; }
    .signature-area .line { width: 140px; border-top: 1px solid #000; margin: 4px auto 2px auto; }
    .signature-area .name { font-size: 13px; font-weight: 600; }
    .signature-area .title { font-size: 11px; color: #555; }
    .signature-area .date { font-size: 11px; color: #555; margin-top: 2px; }
    .payment-section { margin-top: 20px; padding-top: 10px; border-top: 1px solid #ddd; }
    .payment-title { font-weight: bold; font-size: 12px; margin-bottom: 6px; }
    .payment-details { font-size: 11px; line-height: 1.5; color: #444; }
    @media print { body { background: white; padding: 0; } .invoice { box-shadow: none; margin: 0; width: 100%; } }
  </style>
</head>
<body>
  <div class="invoice">
    <!-- HEADER -->
    <div class="header">
      <div class="header-left">
        <div class="company-name">${company?.name?.toUpperCase() || 'PT ARTHA KONDANG INTERNASIONAL'}</div>
        <div class="company-detail">${company?.address || 'Taman Tekno X BSD Blok G No 2, Tangerang Selatan - Banten 15314'}</div>
        <div class="company-detail">Telp: ${company?.phone || '+62821-3017-2363'} | Email: ${company?.email || 'finance@arthakondang.co.id'}</div>
      </div>
      <div class="header-right">
        <div class="title">INVOICE</div>
        <div class="no">No. ${invoice.invoice_number}</div>
      </div>
    </div>

    <!-- INFO -->
    <div class="info-grid">
      <div class="left">
        <strong>TO:</strong><br>
        ${customer?.name || invoice.customer_name}<br>
        ${customer?.address || ''}<br>
        ${customer?.phone || ''}
      </div>
      <div class="right">
        <strong>INVOICE DATE</strong><br>
        ${formatDate(invoice.invoice_date)}<br><br>
        <strong>DUE DATE</strong><br>
        ${formatDate(invoice.due_date)}
      </div>
    </div>

    <!-- TABLE ITEMS -->
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th style="width:35%;">DESCRIPTION</th>
            <th style="width:25%;">ADDITIONAL</th>
            <th style="width:15%; text-align:center;">QTY</th>
            <th style="width:25%; text-align:right;">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
    </div>

    <!-- TOTAL -->
    <div style="display:flex; justify-content:flex-end; font-size:12px; padding:4px 0; margin-top:10px;">
      <span style="width:70%; text-align:right;">Subtotal</span>
      <span style="width:30%; text-align:right; font-weight:bold;">${formatRupiah(totalSubtotal)}</span>
    </div>
    <div style="display:flex; justify-content:flex-end; font-size:12px; padding:4px 0;">
      <span style="width:70%; text-align:right;">PPN 11%</span>
      <span style="width:30%; text-align:right; font-weight:bold;">${formatRupiah(ppn)}</span>
    </div>
    <div style="display:flex; justify-content:flex-end; font-size:14px; padding:8px 0; border-top:2px solid #000;">
      <span style="width:70%; text-align:right; font-weight:bold;">GRAND TOTAL</span>
      <span style="width:30%; text-align:right; font-weight:bold; font-size:18px;">${formatRupiah(grandTotal)}</span>
    </div>

    ${paidAmount > 0 ? `
    <div style="display:flex; justify-content:flex-end; font-size:12px; padding:4px 0; color:#059669;">
      <span style="width:70%; text-align:right;">Sudah Dibayar</span>
      <span style="width:30%; text-align:right;">(${formatRupiah(paidAmount)})</span>
    </div>
    <div style="display:flex; justify-content:flex-end; font-size:12px; padding:4px 0; font-weight:bold;">
      <span style="width:70%; text-align:right;">Sisa Tagihan</span>
      <span style="width:30%; text-align:right;">${formatRupiah(remainingAmount)}</span>
    </div>
    ` : ''}

    <!-- TERBILANG -->
    <div class="terbilang">
      <strong>Terbilang:</strong> ${terbilang(Math.round(grandTotal))} Rupiah
    </div>

    <!-- PAYMENT METHODS -->
    <div class="payment-section">
      <div class="payment-title">PAYMENT METHODS</div>
      <div class="payment-details">
        Account No: ${company?.bank_account || '1010000777068'}<br>
        Account Name: ${company?.name || 'PT Artha Kondang Internasional'}<br>
        Branch Name: ${company?.bank_branch || 'Bank Mandiri KK Jkt Gandaria City'}<br>
        Swift Code: ${company?.swift_code || 'BMRIIDJXXX'}
      </div>
    </div>

    <!-- SIGNATURE -->
    <div class="footer">
      <div class="left">
        <div>Dibayar melalui Transfer Bank</div>
        <div>Bank Mandiri - No. Rek 1010000777068</div>
        <div>a.n. ${company?.name || 'PT Artha Kondang'}</div>
      </div>
      <div class="signature-area">
        <div>Hormat Kami,</div>
        ${(invoice.status === 'verified' || invoice.status === 'paid' || invoice.status === 'partial') && company?.signature_url ? 
          `<img src="${company.signature_url}" style="max-width:120px; max-height:50px; margin-bottom:4px;" />` : 
          `<div class="line"></div>`
        }
        <div class="name">${company?.director || 'Adis Nugroho Santoso'}</div>
        <div class="title">Direktur Utama</div>
        <div class="date">${formatDate(new Date().toISOString())}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ============================================
// FUNGSI TERBILANG
// ============================================
function terbilang(angka: number): string {
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
}
