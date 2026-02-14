CREATE TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT,
  symbol TEXT NOT NULL,
  type TEXT NOT NULL,
  entry_price NUMERIC NOT NULL,
  exit_price NUMERIC NOT NULL,
  quantity NUMERIC NOT NULL,
  fees NUMERIC DEFAULT 0,
  pnl NUMERIC NOT NULL,
  analysis TEXT,
  emotions TEXT,
  attachment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
