export default function StatCard({ etiket, deger, alt }) {
  return (
    <div className="p-sayi">
      <p className="p-sayi-etiket">{etiket}</p>
      <p className="p-sayi-deger">{deger}</p>
      <p className="p-sayi-alt">{alt}</p>
    </div>
  );
}
