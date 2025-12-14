-- Create demo user setup for Apple review testing
-- This migration creates helper comments for demo user setup
-- The actual demo user should be created via Supabase Auth API first, then use the setup-demo-user edge function

-- Note: To create the demo user:
-- 1. Create auth user via Supabase Auth API with email: demo@netpayy.ng
-- 2. Call the setup-demo-user edge function to create all demo data
-- 3. Demo user will have:
--    - Email: demo@netpayy.ng
--    - Virtual Account: 1234567890
--    - Initial Balance: ₦50,000
--    - Demo transactions for all service types (airtime, data, cable, electricity, transfer)
--    - Demo PIN setup capability
--    - Demo delete account capability

-- The setup-demo-user edge function will create:
-- 1. Profile with balance
-- 2. Virtual account
-- 3. Sample transactions (credit, debit, purchases)
-- 4. Funding transaction record

COMMENT ON SCHEMA public IS 'Demo user setup: Create auth user with email demo@netpayy.ng, then call setup-demo-user edge function to initialize all demo data.';
