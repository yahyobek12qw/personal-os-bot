-- Personal OS 2.0 — bitta "element" modeli
create extension if not exists pg_trgm;

create table if not exists sohalar (
  id text primary key,
  nom text not null,
  rang text not null default 'ish',
  ikon text not null default 'work',
  izoh text,
  tartib int not null default 0,
  arxiv boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists elementlar (
  id uuid primary key default gen_random_uuid(),
  tur text not null default 'vazifa',      -- vazifa, voqea, qayd, goya, havola, xarajat, daromad, odat, loyiha, kurs, dars, kitob, qadam, qarz, maqsad, tolov
  nom text not null,
  matn text,
  soha_id text references sohalar(id) on delete set null,
  ota_id uuid references elementlar(id) on delete cascade,
  holat text not null default 'ochiq',     -- ochiq, jarayonda, bajarildi, bekor
  inbox boolean not null default false,
  sana date,
  vaqt time,
  davomiylik int,
  eslatma timestamptz,
  eslatildi boolean not null default false,
  summa numeric,
  kategoriya text,
  progress int,
  havola text,
  meta jsonb not null default '{}'::jsonb,
  tartib int,
  manba text,
  notion_id text unique,
  bajarildi_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists el_sana on elementlar (sana);
create index if not exists el_soha on elementlar (soha_id);
create index if not exists el_ota on elementlar (ota_id);
create index if not exists el_tur on elementlar (tur);
create index if not exists el_inbox on elementlar (inbox) where inbox;
create index if not exists el_nom_trgm on elementlar using gin (nom gin_trgm_ops);
create index if not exists el_upd on elementlar (updated_at);

create table if not exists fayllar (
  id uuid primary key default gen_random_uuid(),
  element_id uuid not null references elementlar(id) on delete cascade,
  tur text not null,                        -- rasm, video, ovoz, fayl
  nom text,
  hajm bigint,
  file_id text,
  thumb_id text,
  tg_msg int,
  tg_bolim text,
  url text,
  created_at timestamptz not null default now()
);
create index if not exists f_el on fayllar (element_id);

create table if not exists odat_belgi (
  odat_id uuid not null references elementlar(id) on delete cascade,
  sana date not null,
  primary key (odat_id, sana)
);

create table if not exists kundalik (
  sana date primary key,
  kayfiyat int,
  matn text,
  updated_at timestamptz not null default now()
);

create table if not exists sozlamalar (
  kalit text primary key,
  qiymat jsonb
);

insert into sohalar (id, nom, rang, ikon, tartib) values
  ('ish', 'Ish · texnikum', 'ish', 'work', 1),
  ('oqish', 'O''qish · TATU', 'oqish', 'cap', 2),
  ('loy', 'Loyihalar', 'loy', 'folder', 3),
  ('pul', 'Moliya', 'pul', 'coins', 4),
  ('sog', 'Sog''liq', 'sog', 'heart', 5),
  ('oila', 'Oila', 'oila', 'home', 6),
  ('riv', 'Rivojlanish', 'riv', 'star', 7),
  ('qiz', 'Qiziqishlar', 'qiz', 'spark', 8)
on conflict (id) do nothing;
