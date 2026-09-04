ALTER TABLE users DROP CONSTRAINT IF EXISTS users_plan_check;
ALTER TABLE users ALTER COLUMN plan SET DEFAULT 'free';
ALTER TABLE users ADD CONSTRAINT users_plan_check
  CHECK (plan IN ('free', 'standard', 'plus', 'corporate'));
