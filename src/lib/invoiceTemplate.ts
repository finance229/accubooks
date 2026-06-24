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

  // 🔥 HITUNG TOTAL DARI ITEMS
  let totalSubtotal = 0;
  let itemsHtml = '';

  if (items && items.length > 0) {
    items.forEach((item, index) => {
      const qty = item.quantity || 0;
      const price = item.unit_price || 0;
      const itemTotal = qty * price;
      totalSubtotal += itemTotal;
      const additionalText = item.additional || '';
      
      // 🔥 Tambahan hanya muncul kalau diisi
      const additionalHtml = additionalText 
        ? `<br><span style="font-size: 10px; color: #666; font-style: italic;">${additionalText}</span>` 
        : '';
      
      itemsHtml += `
        <tr>
          <td style="padding: 8px 0; font-size: 11px; border-bottom: 1px solid #eee; vertical-align: top; width: 45%;">
            <strong>${item.description || 'Item ' + (index + 1)}</strong>
            ${additionalHtml}
          </td>
          <td style="padding: 8px 0; font-size: 11px; border-bottom: 1px solid #eee; text-align: right; vertical-align: top; width: 20%;">
            ${formatRupiah(itemTotal)}
          </td>
          <td style="padding: 8px 0; font-size: 11px; border-bottom: 1px solid #eee; text-align: center; vertical-align: top; width: 15%;">
            ${qty}
          </td>
          <td style="padding: 8px 0; font-size: 11px; border-bottom: 1px solid #eee; text-align: right; vertical-align: top; width: 20%;">
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
    .invoice { width: 21cm; min-height: 29.7cm; background: white; margin: 0 auto; box-shadow: 0 0 10px rgba(0,0,0,0.1); display: flex; flex-direction: column; position: relative; }
    .banner { background: #0a1628; padding: 20px 30px; }
    .banner-top { display: flex; align-items: center; gap: 20px; margin-bottom: 20px; }
    .logo { width: 70px; height: 70px; display: flex; align-items: center; justify-content: center; }
    .logo img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .company-info { flex: 1; }
    .company-info h1 { color: white; font-size: 22px; letter-spacing: 1px; margin-bottom: 4px; }
    .company-info p { color: #aaa; font-size: 11px; }
    .invoice-title { text-align: right; }
    .invoice-title h2 { font-size: 28px; color: #d4a017; letter-spacing: 2px; }
    .invoice-title .no { font-size: 11px; color: #aaa; }
    .banner-dates { display: flex; justify-content: flex-end; gap: 30px; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 12px; }
    .date-item { text-align: right; }
    .date-label { font-size: 9px; color: #aaa; margin-bottom: 2px; }
    .date-value { font-size: 12px; color: white; font-weight: 500; }
    .gold-separator { height: 3px; background: linear-gradient(90deg, #d4a017, #f0c040, #d4a017); width: 100%; }
    .content { padding: 25px 30px; flex: 1; }
    .to-section { margin-bottom: 25px; }
    .to-title { font-weight: bold; font-size: 11px; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
    .to-address { font-size: 11px; line-height: 1.5; }
    .items-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
    .items-table th { 
      text-align: left; 
      padding: 10px 0; 
      font-size: 11px; 
      font-weight: bold; 
      border-bottom: 2px solid #000; 
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .items-table td { padding: 8px 0; font-size: 11px; border-bottom: 1px solid #eee; vertical-align: top; }
    .items-table tr:last-child td { border-bottom: 1px solid #ccc; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .summary-table { width: 100%; margin-bottom: 20px; }
    .summary-table td { padding: 4px 0; font-size: 11px; }
    .summary-table .grand-total td { font-weight: bold; padding-top: 8px; border-top: 2px solid #000; }
    .payment-section { margin-bottom: 20px; padding-top: 10px; border-top: 1px solid #ddd; }
    .payment-title { font-weight: bold; font-size: 12px; margin-bottom: 6px; }
    .payment-details { font-size: 11px; line-height: 1.5; color: #444; }
    .signature { text-align: right; margin-top: 30px; margin-bottom: 10px; }
    .signature-img { max-width: 120px; height: auto; margin-bottom: 4px; }
    .signature-line { width: 150px; margin-left: auto; border-top: 1px solid #000; margin-bottom: 4px; }
    .signature-name { font-size: 12px; font-weight: bold; }
    .signature-title { font-size: 10px; color: #555; }
    .footer { background: #f8f8f8; padding: 15px 30px; border-top: 2px solid #d4a017; text-align: center; margin-top: auto; }
    .thankyou { font-weight: bold; font-size: 13px; color: #0a1628; margin-bottom: 10px; letter-spacing: 1px; }
    .contact { font-size: 9px; color: #555; line-height: 1.6; }
    @media print {
      body { background: white; padding: 0; margin: 0; }
      .invoice { box-shadow: none; margin: 0; width: 100%; }
      .banner { background: #0a1628 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .gold-separator { background: #d4a017 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="invoice">
    <div class="banner">
      <div class="banner-top">
        <div class="logo">
          ${company?.logo_url ? `<img src="${company.logo_url}" alt="Logo">` : '<div style="width:70px;height:70px;background:#d4a017;border-radius:50%;"></div>'}
        </div>
        <div class="company-info">
          <h1>${company?.name?.toUpperCase() || 'PT ARTHA KONDANG INTERNASIONAL'}</h1>
          <p>${company?.address || 'Taman Tekno X BSD Blok G No 2, Tangerang Selatan - Banten 15314'}</p>
          <p>${company?.phone || '+62821-3017-2363'} | ${company?.email || 'finance@arthakondang.co.id'}</p>
        </div>
        <div class="invoice-title">
          <h2>INVOICE</h2>
          <div class="no">No. ${invoice.invoice_number}</div>
        </div>
      </div>
      <div class="banner-dates">
        <div class="date-item"><div class="date-label">INVOICE DATE</div><div class="date-value">${formatDate(invoice.invoice_date)}</div></div>
        <div class="date-item"><div class="date-label">DUE DATE</div><div class="date-value">${formatDate(invoice.due_date)}</div></div>
      </div>
    </div>
    <div class="gold-separator"></div>
    <div class="content">
      <!-- TO SECTION -->
      <div class="to-section">
        <div class="to-title">TO:</div>
        <div class="to-address">
          ${customer?.name || invoice.customer_name}<br>
          ${customer?.address || ''}<br>
          ${customer?.phone || ''}
        </div>
      </div>

      <!-- ITEMS TABLE -->
      <table class="items-table">
        <thead>
          <tr>
            <th style="width: 45%">DESCRIPTION</th>
            <th style="width: 20%" class="text-right">SUB TOTAL</th>
            <th style="width: 15%" class="text-center">QTY</th>
            <th style="width: 20%" class="text-right">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <!-- SUMMARY -->
      <table class="summary-table">
        <tr>
          <td style="width: 70%; text-align: right;">Subtotal</td>
          <td style="width: 30%; text-align: right;">${formatRupiah(totalSubtotal)}</td>
        </tr>
        <tr>
          <td style="text-align: right;">PPN 11%</td>
          <td style="text-align: right;">${formatRupiah(ppn)}</td>
        </tr>
        <tr class="grand-total">
          <td style="text-align: right;"><strong>Grand Total</strong></td>
          <td style="text-align: right;"><strong>${formatRupiah(grandTotal)}</strong></td>
        </tr>
        ${paidAmount > 0 ? `
        <tr>
          <td style="text-align: right; color: #059669;">Sudah Dibayar</td>
          <td style="text-align: right; color: #059669;">(${formatRupiah(paidAmount)})</td>
        </tr>
        <tr>
          <td style="text-align: right; font-weight: bold;">Sisa Tagihan</td>
          <td style="text-align: right; font-weight: bold;">${formatRupiah(remainingAmount)}</td>
        </tr>
        ` : ''}
      </table>

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
      <div class="signature">
        ${(invoice.status === 'verified' || invoice.status === 'paid' || invoice.status === 'partial') && company?.signature_url ? 
          `<img src="${company.signature_url}" class="signature-img" />` : 
          `<div class="signature-line"></div>`
        }
        <div class="signature-name">${company?.director || 'Adis Nugroho Santoso'}</div>
        <div class="signature-title">Direktur Utama</div>
      </div>
    </div>

    <!-- FOOTER -->
    <div class="footer">
      <div class="thankyou">THANK YOU FOR YOUR BUSINESS</div>
      <div class="contact">
        ${company?.phone || '+62821-3017-2363'} | ${company?.email || 'finance@arthakondang.co.id'}<br>
        ${company?.address || 'Taman Tekno X BSD Blok G No 2, Tangerang Selatan - Banten 15314'}
      </div>
    </div>
  </div>
</body>
</html>`;
}
