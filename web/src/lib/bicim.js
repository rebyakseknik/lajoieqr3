/** Fiyati menude gorunecegi sekilde yazar: 200 -> ₺200, 95.5 -> ₺95,50 */
export function para(tutar, simge = '₺') {
  const sayi = Number(tutar) || 0;
  const ondalik = Math.abs(sayi - Math.round(sayi)) < 0.005 ? 0 : 2;
  return simge + sayi.toLocaleString('tr-TR', {
    minimumFractionDigits: ondalik,
    maximumFractionDigits: ondalik,
  });
}

/** Panelde fiyat alanina yazilan metni sayiya cevirir: "95,50" -> 95.5 */
export function fiyatiOku(metin) {
  const temiz = String(metin ?? '')
    .replace(/[\s₺]|TL/gi, '')
    .replace(',', '.');
  const sayi = Number.parseFloat(temiz);
  return Number.isFinite(sayi) && sayi >= 0 ? sayi : null;
}

/** Fiyati duzenleme kutusunda gorunecek hale getirir: 95.5 -> "95,50" */
export function fiyatiYaz(tutar) {
  const sayi = Number(tutar) || 0;
  const ondalik = Math.abs(sayi - Math.round(sayi)) < 0.005 ? 0 : 2;
  return sayi.toFixed(ondalik).replace('.', ',');
}

export function sayi(deger) {
  return (Number(deger) || 0).toLocaleString('tr-TR');
}

const GUN_ADI = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

export function gunKisaltmasi(tarih) {
  const d = new Date(tarih);
  const gun = (d.getDay() + 6) % 7;
  return { ad: GUN_ADI[gun], gun: d.getDate() };
}

export function yuzdeFark(simdi, onceki) {
  if (!onceki) return null;
  return Math.round(((simdi - onceki) / onceki) * 100);
}
