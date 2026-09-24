// src/components/InvoiceFormFields.tsx

export type TemplateField = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date';
  placeholder?: string;
};

export const TEMPLATE_FIELDS: Record<string, TemplateField[]> = {
  general: [
    { key: 'description', label: 'Deskripsi', type: 'text', placeholder: 'Deskripsi item' },
    { key: 'quantity', label: 'Qty', type: 'number', placeholder: '0' },
    { key: 'unit_price', label: 'Harga', type: 'number', placeholder: '0' },
    { key: 'discount', label: 'Diskon', type: 'number', placeholder: '0' },
  ],
  a: [
    { key: 'tanggal', label: 'Tanggal', type: 'date' },
    { key: 'tujuan', label: 'Tujuan', type: 'text', placeholder: 'Tujuan' },
    { key: 'no_dokumen', label: 'No. Dokumen', type: 'text', placeholder: 'No. Dokumen' },
    { key: 'armada', label: 'Armada', type: 'text', placeholder: 'Armada' },
    { key: 'no_pol', label: 'No. Pol', type: 'text', placeholder: 'No. Pol' },
    { key: 'harga_ritase', label: 'Harga Ritase', type: 'number', placeholder: '0' },
    { key: 'harga_multi_drop', label: 'Harga Multi Drop', type: 'number', placeholder: '0' },
  ],
  b: [
    { key: 'tanggal', label: 'Tanggal', type: 'date' },
    { key: 'origin', label: 'Origin', type: 'text', placeholder: 'Origin' },
    { key: 'tujuan', label: 'Tujuan', type: 'text', placeholder: 'Tujuan' },
    { key: 'armada', label: 'Armada', type: 'text', placeholder: 'Armada' },
    { key: 'no_pol', label: 'No. Pol', type: 'text', placeholder: 'No. Pol' },
    { key: 'harga_ritase', label: 'Harga Ritase', type: 'number', placeholder: '0' },
  ],
  c: [
    { key: 'tanggal', label: 'Tanggal', type: 'date' },
    { key: 'keterangan', label: 'Keterangan', type: 'text', placeholder: 'Keterangan' },
    { key: 'unit', label: 'Unit', type: 'text', placeholder: 'Unit' },
    { key: 'no_pol', label: 'No. Pol', type: 'text', placeholder: 'No. Pol' },
    { key: 'no_kontrak', label: 'No Kontrak', type: 'text', placeholder: 'No Kontrak' },
    { key: 'harga', label: 'Harga', type: 'number', placeholder: '0' },
  ],
  d: [
    { key: 'no', label: 'No', type: 'text', placeholder: 'No' },
    { key: 'tanggal', label: 'Tanggal', type: 'date' },
    { key: 'tujuan', label: 'Tujuan', type: 'text', placeholder: 'Tujuan' },
    { key: 'no_spe', label: 'No. SPE', type: 'text', placeholder: 'No. SPE' },
    { key: 'armada', label: 'Armada', type: 'text', placeholder: 'Armada' },
    { key: 'no_pol', label: 'No. Pol', type: 'text', placeholder: 'No. Pol' },
    { key: 'harga_ritase', label: 'Harga Ritase', type: 'number', placeholder: '0' },
    { key: 'harga_multi_drop', label: 'Harga Multi Drop', type: 'number', placeholder: '0' },
    { key: 'reimburse_unloading', label: 'Reimburse Unloading', type: 'number', placeholder: '0' },
  ],
};

export function getTemplateFields(template: string): TemplateField[] {
  return TEMPLATE_FIELDS[template] || TEMPLATE_FIELDS.general;
}

export function getTemplateLabel(template: string): string {
  const labels: Record<string, string> = {
    general: 'General',
    a: 'YCH',
    b: 'BALIKAN',
    c: 'Mowilex',
    d: 'Mayora',
  };
  return labels[template] || 'General';
}

export function getTemplateOptions(): { value: string; label: string }[] {
  return [
    { value: 'general', label: 'General' },
    { value: 'a', label: 'YCH' },
    { value: 'b', label: 'BALIKAN' },
    { value: 'c', label: 'Mowilex' },
    { value: 'd', label: 'Mayora' },
  ];
}
