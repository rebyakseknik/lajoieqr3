-- La Joie Dijital Menü — 12. adım: duyurular
--
-- Ana sayfanın tepesinde dönen vitrin kartları: kampanya, yeni ürün,
-- çalışma saati değişikliği... Fotoğraf + başlık + kısa metin + isteğe
-- bağlı bağlantı. Panelden yönetilir, anında menüye yansır.
--
-- Fotoğraflar ürünlerle aynı kovada (menu-images) "duyuru/" klasöründe
-- durur; yeni kova ve yeni izin gerekmez.

create table if not exists public.announcements (
  id          bigint generated always as identity primary key,
  title       text not null check (char_length(title) between 2 and 60),
  body        text not null default '' check (char_length(body) <= 160),
  image_path  text not null default '',

  -- '/kayit/hosgeldin' gibi iç sayfa ya da tam adres olabilir; boşsa
  -- kart tıklanamaz, yalnızca bilgi verir.
  link_url    text not null default '' check (char_length(link_url) <= 200),

  sort        integer not null default 0,
  starts_at   timestamptz,          -- boş = hemen
  ends_at     timestamptz,          -- boş = süresiz
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists announcements_sira_idx on public.announcements (active, sort, id);

-- ---------- İzinler ----------
alter table public.announcements enable row level security;

grant select on public.announcements to anon, authenticated;
grant insert, update, delete on public.announcements to authenticated;

drop policy if exists announcements_public_read on public.announcements;
drop policy if exists announcements_admin_all   on public.announcements;

-- Müşteri yalnızca yayında olanı görür: aktif + tarih penceresi içinde.
create policy announcements_public_read on public.announcements
  for select to anon, authenticated
  using (
    active
    and (starts_at is null or starts_at <= now())
    and (ends_at   is null or ends_at   >= now())
  );

-- Yönetici hepsini görür ve düzenler.
create policy announcements_admin_all on public.announcements
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
