-- La Joie Dijital Menü — 13. adım: denetim düzeltmeleri
--
-- 1) Kayıt tetikleyicisi: kupon üretimi ne olursa olsun KAYDI ENGELLEMEZ.
--    Kupon veremezsek kişi kuponsuz üye olur; üye olamamasından iyidir.
-- 2) Duyuru bağlantısı yalnızca iç sayfa (/...) ya da http(s) olabilir.

-- ---------- 1) Kayıt tetikleyicisi ----------
create or replace function public.profil_ac()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'campaign', '')), '');
  v_oto  text;
begin
  insert into public.profiles (user_id, name, phone)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'name', ''), 60),
    left(coalesce(nullif(new.raw_user_meta_data ->> 'phone', ''), new.phone, ''), 24)
  )
  on conflict (user_id) do nothing;

  -- Kupon üretimi "olsa güzel olur" işidir; hata verirse yutulur.
  begin
    select slug into v_oto from campaigns where auto_signup and active limit 1;
    if v_oto is not null then
      perform public.kampanya_kuponu_ver(new.id, v_oto);
    end if;

    if v_slug is not null and v_slug is distinct from v_oto then
      perform public.kampanya_kuponu_ver(new.id, v_slug);
    end if;
  exception when others then
    -- Kayıt sürsün; sorun günlüğe düşsün.
    raise warning 'Kampanya kuponu verilemedi (%): %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

-- ---------- 2) Duyuru bağlantısı sertleştirmesi ----------
-- Önce mevcut uymayan kayıt varsa temizle (boşa çevir), sonra kural koy.
update public.announcements
set link_url = ''
where link_url <> '' and link_url !~ '^(/|https?://)';

alter table public.announcements drop constraint if exists announcements_link_bicimi;
alter table public.announcements add constraint announcements_link_bicimi
  check (link_url = '' or link_url ~ '^(/|https?://)');
