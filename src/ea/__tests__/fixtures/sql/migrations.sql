-- Users table
CREATE TABLE public.users (
  id UUID PRIMARY KEY NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP,
  deleted_at TIMESTAMP
);

-- Orders table with foreign key
CREATE TABLE public.orders (
  id UUID PRIMARY KEY NOT NULL,
  user_id UUID NOT NULL REFERENCES public.users(id),
  total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Products table
CREATE TABLE inventory.products (
  id SERIAL PRIMARY KEY,
  sku VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0
);

-- Order items join table
CREATE TABLE IF NOT EXISTS public.order_items (
  order_id UUID NOT NULL REFERENCES public.orders(id),
  product_id INTEGER NOT NULL REFERENCES inventory.products(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (order_id, product_id)
);
