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

  let paymentStamp = '';
  let stampClass = '';
  
  if (invoice.status === 'paid') {
    paymentStamp = 'LUNAS';
    stampClass = 'stamp-paid';
  } else if (invoice.status === 'partial') {
    paymentStamp = 'PARTIAL';
    stampClass = 'stamp-partial';
  }

  let itemsHtml = '';
  let totalSubtotal = 0;

  items.forEach((item, idx) => {
    const itemTotal = item.quantity * item.unit_price;
    totalSubtotal += itemTotal;
    itemsHtml += `
      <tr>
        <td style="padding: 10px 0; font-size: 11px; border-bottom: 1px solid #ccc; vertical-align: top;">
          ${item.description}
          ${item.notes ? `<br><span style="font-size: 10px; color: #555;">${item.notes}</span>` : ''}
        </td>
        <td style="padding: 10px 0; font-size: 11px; border-bottom: 1px solid #ccc; text-align: right;">${formatRupiah(itemTotal)}</td>
        <td style="padding: 10px 0; font-size: 11px; border-bottom: 1px solid #ccc; text-align: center;">${item.quantity}</td>
        <td style="padding: 10px 0; font-size: 11px; border-bottom: 1px solid #ccc; text-align: right;">${formatRupiah(itemTotal)}</td>
      </tr>
    `;
  });

  const ppn = Math.round(totalSubtotal * 0.11);
  const grandTotal = totalSubtotal + ppn;
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
    .items-table th { text-align: left; padding: 8px 0; font-size: 11px; font-weight: bold; border-bottom: 1px solid #000; }
    .items-table td { padding: 10px 0; font-size: 11px; border-bottom: 1px solid #ccc; vertical-align: top; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .summary-table { width: 100%; margin-bottom: 20px; }
    .summary-table td { padding: 3px 0; font-size: 11px; }
    .summary-table .grand-total td { font-weight: bold; padding-top: 8px; border-top: 1px solid #000; }
    
    .stamp-container {
      position: absolute;
      top: 35%;
      right: 8%;
      opacity: 0.75;
      transform: rotate(-15deg);
      pointer-events: none;
      z-index: 10;
    }
    .stamp-paid { border: 4px solid #dc2626; color: #dc2626; font-size: 42px; font-weight: bold; padding: 10px 20px; border-radius: 16px; background: rgba(220,38,38,0.05); font-family: Arial, sans-serif; letter-spacing: 4px; }
    .stamp-partial { border: 4px solid #f59e0b; color: #f59e0b; font-size: 36px; font-weight: bold; padding: 8px 16px; border-radius: 16px; background: rgba(245,158,11,0.05); font-family: Arial, sans-serif; letter-spacing: 4px; }
    
    .payment-section { margin-bottom: 20px; }
    .payment-title { font-weight: bold; font-size: 12px; margin-bottom: 6px; }
    .payment-details { font-size: 11px; line-height: 1.5; }
    
    /* Signature - DIPERKECIL dan DIBERI JARAK YANG PAS */
    .signature { text-align: right; margin-top: 20px; margin-bottom: 10px; }
    .signature-img { max-width: 100px; height: auto; margin-bottom: 4px; }
    .signature-line { width: 150px; margin-left: auto; border-top: 1px solid #000; margin-bottom: 4px; }
    .signature-name { font-size: 11px; font-weight: bold; }
    .signature-title { font-size: 10px; }
    
    .footer { background: #f8f8f8; padding: 15px 30px; border-top: 2px solid #d4a017; text-align: center; margin-top: auto; }
    .thankyou { font-weight: bold; font-size: 13px; color: #0a1628; margin-bottom: 10px; letter-spacing: 1px; }
    .contact { font-size: 9px; color: #555; line-height: 1.6; }
    
    @media print {
      body { background: white; padding: 0; margin: 0; }
      .invoice { box-shadow: none; margin: 0; width: 100%; }
      .banner { background: #0a1628 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .gold-separator { background: #d4a017 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .stamp-paid { border-color: #dc2626 !important; color: #dc2626 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .stamp-partial { border-color: #f59e0b !important; color: #f59e0b !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="invoice">
    ${paymentStamp ? `<div class="stamp-container"><div class="${stampClass}">${paymentStamp}</div></div>` : ''}
    
    <div class="banner">
      <div class="banner-top">
        <div class="logo">
          ${company?.logo_url ? `<img src="${company.logo_url}" alt="Logo">` : '<div style="width:70px;height:70px;background:#d4a017;border-radius:50%;"></div>'}
        </div>
        <div class="company-info">
          <h1>${company?.name?.toUpperCase() || 'ARTHA KONDANG'}</h1>
          <p>${company?.name || 'PT Artha Kondang Internasional'}</p>
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
      <div class="to-section">
        <div class="to-title">TO:</div>
        <div class="to-address">
          ${customer?.name || invoice.customer_name}<br>
          ${customer?.address || ''}<br>
          ${customer?.phone || ''}
        </div>
      </div>
      <table class="items-table">
        <thead><tr><th style="width: 45%">DESCRIPTION</th><th style="width: 20%" class="text-right">SUB TOTAL</th><th style="width: 15%" class="text-center">QTY</th><th style="width: 20%" class="text-right">TOTAL</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>
      <table class="summary-table">
        <tr><td style="width: 70%; text-align: right;">Total</td><td style="width: 30%; text-align: right;">${formatRupiah(totalSubtotal)}</td></tr>
        <tr><td style="text-align: right;">VAT 11%</td><td style="text-align: right;">${formatRupiah(ppn)}</td></tr>
        <tr class="grand-total"><td style="text-align: right;"><strong>Grand Total</strong></td><td style="text-align: right;"><strong>${formatRupiah(grandTotal)}</strong></td></tr>
        ${paidAmount > 0 ? `
        <tr><td style="text-align: right; color: #059669;">Sudah Dibayar</td><td style="text-align: right; color: #059669;">(${formatRupiah(paidAmount)})</td></tr>
        <tr><td style="text-align: right; font-weight: bold;">Sisa Tagihan</td><td style="text-align: right; font-weight: bold;">${formatRupiah(remainingAmount)}</td></tr>
        ` : ''}
      </table>
      <div class="payment-section">
        <div class="payment-title">PAYMENT METHODS</div>
        <div class="payment-details">
          Account No: ${company?.bank_account || '1010000777068'}<br>
          Account Name: ${company?.name || 'PT Artha Kondang Internasional'}<br>
          Branch Name: ${company?.bank_branch || 'Bank Mandiri KK Jkt Gandaria City'}<br>
          Swift Code: ${company?.swift_code || 'BMRIIDJXXX'}
        </div>
      </div>
      <div class="signature">
        ${(invoice.status === 'verified' || invoice.status === 'paid' || invoice.status === 'partial') && company?.signature_url ? 
          `<img src="${company.signature_url}" class="signature-img" />` : 
          `<div class="signature-line"></div>`
        }
        <div class="signature-name">${company?.director || 'Adis Nugroho Santoso'}</div>
        <div class="signature-title">Direktur Utama</div>
      </div>
    </div>
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
