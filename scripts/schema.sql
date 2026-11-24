-- SynapseVault: Local PostgreSQL Graph Schema
-- optimized for "Second Brain" interrelations

CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Nodes Table: Stores Ideas, Projects, Tasks
CREATE TABLE IF NOT EXISTS nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL, -- 'idea', 'project', 'task', 'label'
    name TEXT NOT NULL,
    description TEXT,
    properties JSONB DEFAULT '{}', -- flexible metadata (status, priority, etc.)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Vector search (Cloudflare bge-m3, 1024 dimensions)
    embedding vector(1024),
    embedding_model TEXT,
    embedding_updated_at TIMESTAMP WITH TIME ZONE,
    content_hash TEXT,
    source TEXT,
    -- Full-text search with Portuguese stemming; maintained by PostgreSQL.
    search_tsv tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('portuguese', COALESCE(name, '')), 'A') ||
        setweight(to_tsvector('portuguese', COALESCE(description, '')), 'B')
    ) STORED
);
CREATE INDEX IF NOT EXISTS idx_nodes_search_tsv ON nodes USING GIN (search_tsv);

-- 2. Edges Table: Stores relationships
CREATE TABLE IF NOT EXISTS edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    target_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    label VARCHAR(50) NOT NULL, -- 'relates_to', 'contains', 'depends_on', 'tagged_with'
    properties JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Prevent duplicate edges of the same type between same nodes
    CONSTRAINT unique_edge UNIQUE (source_id, target_id, label)
);

-- 2b. KAREN leads: Google Maps prospects with ready-to-copy outreach drafts.
-- Dedupe by Google place_id; `suppressed` means "do not contact again".
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    place_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    neighborhood TEXT,
    city TEXT,
    category TEXT,
    rating NUMERIC(3,1),
    reviews_count INTEGER,
    website TEXT,
    maps_url TEXT,
    draft JSONB NOT NULL DEFAULT '{}',
    suppressed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_leads_suppressed ON leads(suppressed);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);

-- 2b-2. Phase 0: leads carry a brand/context so Karen and Climara stay apart.
-- confirmed_* records the operator who qualified the lead.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS brand TEXT NOT NULL DEFAULT 'karen';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS confirmed_by TEXT;
CREATE INDEX IF NOT EXISTS idx_leads_brand ON leads(brand);

-- 2b-3. Conversation intelligence: a pasted/ingested transcript is classified
-- (client vs not), then produces a versioned system prompt + final message.
-- Delivery is always human-approved; `sent_at` is only filled after a send.
CREATE TABLE IF NOT EXISTS lead_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    brand TEXT NOT NULL DEFAULT 'karen',
    source TEXT NOT NULL DEFAULT 'manual',
    transcript_hash TEXT NOT NULL,
    transcript TEXT NOT NULL,
    classification TEXT NOT NULL DEFAULT 'unclear',
    score NUMERIC(4,3) NOT NULL DEFAULT 0,
    reason TEXT NOT NULL DEFAULT '',
    system_prompt TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    prompt_version TEXT NOT NULL DEFAULT 'v1',
    status TEXT NOT NULL DEFAULT 'pending',
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (lead_id, transcript_hash)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_conv_orphan
    ON lead_conversations (brand, transcript_hash) WHERE lead_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_lead_conv_status ON lead_conversations(status);
CREATE INDEX IF NOT EXISTS idx_lead_conv_brand ON lead_conversations(brand);

-- 2c. KAREN command permission audit log.
CREATE TABLE IF NOT EXISTS command_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    command_id TEXT NOT NULL,
    args JSONB NOT NULL DEFAULT '{}',
    risk TEXT NOT NULL,
    decision TEXT NOT NULL,
    status TEXT NOT NULL,
    source TEXT NOT NULL,
    exit_code INTEGER,
    stdout TEXT,
    stderr TEXT,
    duration_ms INTEGER,
    approval_token_hash TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_command_runs_created ON command_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_command_runs_status ON command_runs(status);

-- 3. Indexes for fast traversal
CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
CREATE INDEX IF NOT EXISTS idx_nodes_properties ON nodes USING GIN (properties);
CREATE INDEX IF NOT EXISTS idx_nodes_embedding
    ON nodes USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_nodes_content_hash ON nodes(content_hash);

-- 4. Audit Trigger (Optional but good practice)
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trg_nodes_update
BEFORE UPDATE ON nodes
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();
