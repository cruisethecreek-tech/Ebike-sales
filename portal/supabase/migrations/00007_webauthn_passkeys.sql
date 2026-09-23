-- Real passkeys (WebAuthn), replacing a biometrics feature that never stored
-- anything.
--
-- What was there before: "Activate Biometrics" called
-- navigator.credentials.create(), threw the resulting credential away, and
-- wrote a localStorage flag. Nothing reached a server, so nothing could ever
-- be matched at sign-in time. Worse, every error other than a cancelled
-- prompt was caught and reported as "✅ Device registered!", so the feature
-- announced success precisely when it had failed. Sign-in then leaned on
-- navigator.credentials.get({password:true}) — a Chromium-only API that
-- returns the browser's saved password, not a biometric — which is why it
-- did nothing at all on iPhone.
--
-- A passkey is a key pair. The private half never leaves the phone's secure
-- element and is released by Face ID / Touch ID / fingerprint; the public
-- half has to live here, or there is nothing to check the signature against.
-- That is the table below.

create table if not exists public.webauthn_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Base64URL credential ID, exactly as the browser reports it. Unique across
  -- the whole table: one physical authenticator must not be claimable by two
  -- accounts, or sign-in could not tell whose key just signed.
  credential_id text not null unique,

  -- The COSE public key, base64url-encoded. Public by definition — this is
  -- the half that is safe to store.
  public_key text not null,

  -- Signature counter. An authenticator increments it every use; a value that
  -- does not advance is the signature of a cloned key, so it is checked and
  -- written back on every sign-in.
  counter bigint not null default 0,

  transports text[],
  device_type text,
  backed_up boolean not null default false,

  -- What the rider sees in their device list, e.g. "iPhone".
  label text,

  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists webauthn_credentials_user_id_idx
  on public.webauthn_credentials(user_id);

alter table public.webauthn_credentials enable row level security;

-- A rider may see and remove their own devices. Nobody may insert or update
-- through PostgREST: registration is verified server-side with the service
-- role, because a self-asserted public key row would let anyone mint a key
-- that signs them in as someone else.
create policy "own: read passkeys"
  on public.webauthn_credentials for select
  to authenticated
  using (auth.uid() = user_id);

create policy "own: delete passkeys"
  on public.webauthn_credentials for delete
  to authenticated
  using (auth.uid() = user_id);

-- One-shot challenges.
--
-- The challenge is what makes an assertion unreplayable, so it cannot live
-- anywhere the client can choose it. Keeping it in a cookie would let an
-- attacker pin an old challenge and replay an old assertion against it; a row
-- deleted the moment it is redeemed cannot be used twice.
create table if not exists public.webauthn_challenges (
  id uuid primary key default gen_random_uuid(),
  challenge text not null,
  kind text not null check (kind in ('registration', 'authentication')),
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists webauthn_challenges_expires_at_idx
  on public.webauthn_challenges(expires_at);

-- RLS on with no policies at all: unreachable through PostgREST by anyone,
-- including admins. Only the service role, which bypasses RLS, touches it.
alter table public.webauthn_challenges enable row level security;
