-- La Joie Dijital Menü — 1. adım: tablolar
-- Supabase panelinde SQL Editor'e yapıştırıp çalıştırın.

create extension if not exists "pgcrypto";

-- ---------- Yöneticiler ----------
-- Panele girebilecek kişiler. Buraya eklenmeyen bir kullanıcı
-- giriş yapsa bile hiçbir veriyi değiştiremez.
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);

-- ---------- Kategoriler ----------
create table if not exists public.categories (
  id         bigint generated always as identity primary key,
  name       text    not null check (char_length(name) between 1 and 80),
  position   integer not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists categories_position_idx on public.categories (position, id);

-- ---------- Ürünler ----------
create table if not exists public.products (
  id          bigint generated always as identity primary key,
  category_id bigint  not null references public.categories (id) on delete restrict,
  name        text    not null check (char_length(name) between 1 and 120),
  description text    not null default '' check (char_length(description) <= 400),
  price       numeric(10,2) not null default 0 check (price >= 0),
  image_path  text,
  position    integer not null default 0,
  active      boolean not null default true,
  sold_out    boolean not null default false,
  featured    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists products_category_idx on public.products (category_id, position, id);

-- ---------- Ayarlar ----------
-- Sadece görünürde olan bilgiler. Şifre burada tutulmaz;
-- kimlik doğrulamayı Supabase Auth yapar.
create table if not exists public.settings (
  key   text primary key,
  value text not null default ''
);

-- ---------- Ziyaret olayları ----------
create table if not exists public.events (
  id         bigint generated always as identity primary key,
  type       text not null check (type in ('open', 'category', 'product')),
  target_id  bigint,
  visitor    text not null default '',
  device     text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists events_created_idx on public.events (created_at desc);
create index if not exists events_type_target_idx on public.events (type, target_id);

-- ---------- Başlangıç ayarları ----------
insert into public.settings (key, value) values
  ('restaurant_name', 'La Joie'),
  ('tagline',         'Mersin · Dershaneler Sokağı'),
  ('address',         'Dershaneler Sokağı, Mersin'),
  ('phone',           ''),
  ('instagram',       ''),
  ('currency',        '₺'),
  ('farewell',        'Afiyet olsun')
on conflict (key) do nothing;
