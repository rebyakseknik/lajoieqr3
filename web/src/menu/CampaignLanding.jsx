import { useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { kampanyayiHatirla } from '../lib/hesap';

/**
 * /kayit/<slug> adresine gelen ziyaretciyi karsilar.
 *
 * Yaptigi tek is: kampanyayi hatirlayip menuye yollamak. Kupon,
 * kisi hesap actiginda veritabaninda tanimlanir; burada bir sey
 * uretilmez ki adresi paylasan biri bedava kupon basamasin.
 */
export default function CampaignLanding() {
  const { slug } = useParams();

  useEffect(() => {
    if (slug) kampanyayiHatirla(slug.toLowerCase());
  }, [slug]);

  return <Navigate to="/" replace state={{ kampanya: true }} />;
}
