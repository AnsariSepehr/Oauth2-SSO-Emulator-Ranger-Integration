-- SSO schema
-- Mirrors the client/registration fields described in Declarations.pdf and ThirdPartyGuide.pdf

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================
-- Clients (registered systems)
-- ============================
CREATE TABLE clients (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id           VARCHAR(64) UNIQUE NOT NULL,
    client_secret_hash  TEXT NOT NULL,          -- bcrypt hash, never store plaintext
    company_name        VARCHAR(255),           -- نام شرکت
    system_name         VARCHAR(255) NOT NULL,  -- نام سامانه
    system_name_latin    VARCHAR(255),          -- نام لاتین سامانه
    client_uri          TEXT,                   -- ClientUri
    tech_contact_dept   VARCHAR(255),           -- اداره کل واحد فنی
    tech_contact_name   VARCHAR(255),           -- واحد رابط فنی
    tech_contact_code   VARCHAR(64),            -- کد پرسنلی رابط فنی
    biz_contact_dept    VARCHAR(255),           -- اداره کل واحد کسب و کار
    biz_contact_name    VARCHAR(255),           -- واحد رابط کسب و کار
    biz_contact_code    VARCHAR(64),            -- کد پرسنلی رابط کسب و کار
    allowed_origins     TEXT[] NOT NULL DEFAULT '{}',
    redirect_uris       TEXT[] NOT NULL DEFAULT '{}',
    display_urls        TEXT[] NOT NULL DEFAULT '{}',
    scopes              TEXT[] NOT NULL DEFAULT '{openid}',
    grant_types         TEXT[] NOT NULL DEFAULT '{authorization_code}', -- authorization_code | client_credentials
    use_pkce            BOOLEAN NOT NULL DEFAULT true,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================
-- Users (Resource Owners)
-- ============================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sub             VARCHAR(64) UNIQUE NOT NULL,   -- stable subject identifier returned in tokens/UserInfo
    username        VARCHAR(255) UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    email           VARCHAR(255),
    email_verified  BOOLEAN NOT NULL DEFAULT false,
    full_name       VARCHAR(255),
    employee_code   VARCHAR(64),                    -- maps to the EmployeeCode scope seen in the docs
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================
-- Authorization codes (single-use, short-lived)
-- ============================
CREATE TABLE authorization_codes (
    code                TEXT PRIMARY KEY,
    client_id           VARCHAR(64) NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    redirect_uri        TEXT NOT NULL,
    scope               TEXT NOT NULL,
    state               TEXT,
    nonce               TEXT,
    code_challenge      TEXT,
    code_challenge_method VARCHAR(16), -- S256 | plain
    used                BOOLEAN NOT NULL DEFAULT false,
    expires_at          TIMESTAMPTZ NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================
-- Issued access tokens (kept for introspection / audit / revocation)
-- Note: per ThirdPartyGuide.pdf, refresh_token is NOT operational in the
-- modelled SSO, so we deliberately do not implement refresh here either.
-- ============================
CREATE TABLE access_tokens (
    jti             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id       VARCHAR(64) NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE, -- null for client_credentials tokens
    scope           TEXT NOT NULL,
    grant_type      VARCHAR(32) NOT NULL, -- authorization_code | client_credentials
    issued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked         BOOLEAN NOT NULL DEFAULT false
);

-- ============================
-- Signing keys (for JWKS rotation)
-- ============================
CREATE TABLE signing_keys (
    kid             VARCHAR(64) PRIMARY KEY,
    public_pem      TEXT NOT NULL,
    private_pem     TEXT NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_auth_codes_client ON authorization_codes(client_id);
CREATE INDEX idx_access_tokens_client ON access_tokens(client_id);
CREATE INDEX idx_access_tokens_user ON access_tokens(user_id);
