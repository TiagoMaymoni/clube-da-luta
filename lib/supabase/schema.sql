-- ============================================
-- CLUBE DA LUTA — Schema Supabase
-- Cole e execute no Supabase SQL Editor
-- ============================================

CREATE TABLE IF NOT EXISTS academias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL DEFAULT 'Clube da Luta',
  owner_id UUID REFERENCES auth.users(id),
  valor_aula DECIMAL(10,2) DEFAULT 20.00,
  mensagem_cobranca TEXT DEFAULT 'Olá, [nome]! Você tem [qtd] aulas em aberto (R$[valor]) no Clube da Luta. Quando puder, acerta com o professor. Bora pra cima! 🥊',
  limite_alerta_devedor INT DEFAULT 5,
  pin_checkin VARCHAR(4) DEFAULT '1234',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alunos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academia_id UUID REFERENCES academias(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  telefone TEXT,
  foto_url TEXT,
  observacoes TEXT,
  status TEXT DEFAULT 'ativo' CHECK (status IN ('ativo','inativo')),
  data_cadastro DATE DEFAULT CURRENT_DATE,
  aulas_credito INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alunos_nome ON alunos(nome);
CREATE INDEX IF NOT EXISTS idx_alunos_academia ON alunos(academia_id);

CREATE TABLE IF NOT EXISTS aulas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id UUID REFERENCES alunos(id) ON DELETE CASCADE,
  academia_id UUID REFERENCES academias(id),
  data_aula DATE NOT NULL DEFAULT CURRENT_DATE,
  hora_aula TIME NOT NULL DEFAULT CURRENT_TIME,
  valor DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'pendente' CHECK (status IN ('pendente','paga')),
  pagamento_id UUID,
  origem TEXT DEFAULT 'checkin' CHECK (origem IN ('checkin','manual','credito')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aulas_aluno_status ON aulas(aluno_id, status);
CREATE INDEX IF NOT EXISTS idx_aulas_data ON aulas(data_aula);

CREATE TABLE IF NOT EXISTS pagamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id UUID REFERENCES alunos(id) ON DELETE CASCADE,
  academia_id UUID REFERENCES academias(id),
  valor_recebido DECIMAL(10,2) NOT NULL,
  qtd_aulas_pagas INT NOT NULL DEFAULT 0,
  qtd_aulas_credito INT NOT NULL DEFAULT 0,
  forma_pagamento TEXT CHECK (forma_pagamento IN ('pix','dinheiro','cartao','outro')),
  data_pagamento DATE DEFAULT CURRENT_DATE,
  observacao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pagamentos_aluno ON pagamentos(aluno_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_data ON pagamentos(data_pagamento);

-- Storage bucket para fotos dos alunos
-- Execute também: INSERT INTO storage.buckets (id, name, public) VALUES ('fotos-alunos', 'fotos-alunos', true);

-- RLS (Row Level Security)
ALTER TABLE academias ENABLE ROW LEVEL SECURITY;
ALTER TABLE alunos ENABLE ROW LEVEL SECURITY;
ALTER TABLE aulas ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagamentos ENABLE ROW LEVEL SECURITY;

-- Professor só vê dados da própria academia
CREATE POLICY "owner_academias" ON academias FOR ALL USING (owner_id = auth.uid());
CREATE POLICY "owner_alunos" ON alunos FOR ALL USING (
  academia_id IN (SELECT id FROM academias WHERE owner_id = auth.uid())
);
CREATE POLICY "owner_aulas" ON aulas FOR ALL USING (
  academia_id IN (SELECT id FROM academias WHERE owner_id = auth.uid())
);
CREATE POLICY "owner_pagamentos" ON pagamentos FOR ALL USING (
  academia_id IN (SELECT id FROM academias WHERE owner_id = auth.uid())
);

-- Modo Check-in: acesso público para leitura de alunos ativos (apenas nome e foto)
CREATE POLICY "checkin_read_alunos" ON alunos FOR SELECT USING (status = 'ativo');
CREATE POLICY "checkin_insert_aulas" ON aulas FOR INSERT WITH CHECK (true);
