-- Kho Chú Thắng - Inventory Management System
-- Run this in Supabase SQL Editor

-- 1. Items table
CREATE TABLE items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  unit_price INTEGER DEFAULT 0,
  current_stock INTEGER DEFAULT 0,
  min_stock INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Transactions table (stock in/out)
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('nhap', 'xuat')),
  quantity INTEGER NOT NULL,
  unit_price INTEGER,
  note TEXT DEFAULT '',
  transaction_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Settings table
CREATE TABLE settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  low_stock_threshold INTEGER DEFAULT 5,
  currency TEXT DEFAULT 'VNĐ',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Row Level Security
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Items policies
CREATE POLICY "Users can view own items"
  ON items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own items"
  ON items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own items"
  ON items FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own items"
  ON items FOR DELETE
  USING (auth.uid() = user_id);

-- Transaction policies
CREATE POLICY "Users can view own transactions"
  ON transactions FOR SELECT
  USING (EXISTS (SELECT 1 FROM items WHERE items.id = transactions.item_id AND items.user_id = auth.uid()));

CREATE POLICY "Users can insert transactions"
  ON transactions FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM items WHERE items.id = transactions.item_id AND items.user_id = auth.uid()));

CREATE POLICY "Users can update own transactions"
  ON transactions FOR UPDATE
  USING (EXISTS (SELECT 1 FROM items WHERE items.id = transactions.item_id AND items.user_id = auth.uid()));

CREATE POLICY "Users can delete own transactions"
  ON transactions FOR DELETE
  USING (EXISTS (SELECT 1 FROM items WHERE items.id = transactions.item_id AND items.user_id = auth.uid()));

-- Settings policies
CREATE POLICY "Users can view own settings"
  ON settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
  ON settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON settings FOR UPDATE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_items_user_id ON items(user_id);
CREATE INDEX idx_items_code ON items(code);
CREATE INDEX idx_transactions_item_id ON transactions(item_id);
CREATE INDEX idx_transactions_date ON transactions(transaction_date);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO authenticated;
