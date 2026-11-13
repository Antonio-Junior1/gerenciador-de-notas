CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('Nota fiscal', 'Boleto')),
  company TEXT NOT NULL,
  document TEXT NOT NULL,
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  issue_date DATE NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Pendente', 'Pago', 'Vencido', 'Revisar')),
  source TEXT NOT NULL CHECK (source IN ('Manual', 'XML', 'PDF', 'Imagem', 'Scanner', 'Planilha')),
  taxes NUMERIC(14, 2) NOT NULL DEFAULT 0,
  review_required BOOLEAN NOT NULL DEFAULT false,
  stored_file_name TEXT,
  original_file_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notes_user_created_idx ON notes (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notes_user_due_idx ON notes (user_id, due_date);
