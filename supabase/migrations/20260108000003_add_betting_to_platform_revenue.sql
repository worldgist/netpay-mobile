-- Add betting to platform_revenue transaction_type constraint
-- Update the CHECK constraint to include 'betting'

DO $$
BEGIN
  -- Drop the old constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_schema = 'public' 
    AND table_name = 'platform_revenue' 
    AND constraint_name = 'platform_revenue_transaction_type_check'
  ) THEN
    ALTER TABLE public.platform_revenue
    DROP CONSTRAINT platform_revenue_transaction_type_check;
  END IF;
  
  -- Add new constraint with betting included
  ALTER TABLE public.platform_revenue
  ADD CONSTRAINT platform_revenue_transaction_type_check
  CHECK (transaction_type IN ('education', 'electricity', 'airtime', 'data', 'cable', 'betting'));
  
  RAISE NOTICE 'Updated platform_revenue transaction_type constraint to include betting';
END $$;

-- Update the record_platform_revenue function to handle betting_transactions
CREATE OR REPLACE FUNCTION public.record_platform_revenue()
RETURNS TRIGGER AS $$
DECLARE
  v_transaction_type TEXT;
  v_charge_fee_rate NUMERIC;
  v_revenue_amount NUMERIC;
  v_purchase_amount NUMERIC;
  v_metadata JSONB;
BEGIN
  -- Only record revenue for completed/successful transactions
  -- Data transactions use 'success', others use 'completed'
  IF TG_TABLE_NAME = 'data_transactions' THEN
    IF NEW.status != 'success' AND NEW.status != 'completed' THEN
      RETURN NEW;
    END IF;
  ELSE
    IF NEW.status != 'completed' THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Determine transaction type and calculate revenue based on table
  IF TG_TABLE_NAME = 'education_transactions' THEN
    v_transaction_type := 'education';
    v_charge_fee_rate := 0.07; -- 7% for education
    
    -- Skip if charge_fee is null or zero
    IF NEW.charge_fee IS NULL OR NEW.charge_fee = 0 THEN
      RETURN NEW;
    END IF;
    
    v_revenue_amount := NEW.charge_fee;
    v_purchase_amount := COALESCE(NEW.purchase_amount, NEW.amount - NEW.charge_fee);
    v_metadata := jsonb_build_object(
      'exam_type', NEW.exam_type,
      'phone_number', NEW.phone_number
    );
    
  ELSIF TG_TABLE_NAME = 'electricity_transactions' THEN
    v_transaction_type := 'electricity';
    v_charge_fee_rate := 0.10; -- 10% for electricity
    
    -- Skip if charge_fee is null or zero
    IF NEW.charge_fee IS NULL OR NEW.charge_fee = 0 THEN
      RETURN NEW;
    END IF;
    
    v_revenue_amount := NEW.charge_fee;
    v_purchase_amount := COALESCE(NEW.purchase_amount, NEW.amount - NEW.charge_fee);
    v_metadata := jsonb_build_object(
      'provider', NEW.provider,
      'meter_number', NEW.meter_number,
      'meter_type', NEW.meter_type,
      'customer_name', NEW.customer_name
    );
    
  ELSIF TG_TABLE_NAME = 'cable_tv_transactions' THEN
    v_transaction_type := 'cable';
    v_charge_fee_rate := 0.02; -- 2% for cable TV
    
    -- Skip if charge_fee is null or zero
    IF NEW.charge_fee IS NULL OR NEW.charge_fee = 0 THEN
      RETURN NEW;
    END IF;
    
    v_revenue_amount := NEW.charge_fee;
    v_purchase_amount := COALESCE(NEW.purchase_amount, NEW.amount - NEW.charge_fee);
    v_metadata := jsonb_build_object(
      'provider', NEW.provider,
      'smartcard_number', NEW.smartcard_number,
      'plan_name', NEW.plan_name,
      'customer_name', NEW.customer_name
    );
    
  ELSIF TG_TABLE_NAME = 'betting_transactions' THEN
    v_transaction_type := 'betting';
    -- Charge fee rate varies by provider, calculate from charge_fee and purchase_amount
    -- Default to 5% if we can't calculate
    IF NEW.purchase_amount IS NOT NULL AND NEW.purchase_amount > 0 AND NEW.charge_fee IS NOT NULL THEN
      v_charge_fee_rate := NEW.charge_fee / NEW.purchase_amount;
    ELSE
      v_charge_fee_rate := 0.05; -- Default 5% for betting
    END IF;
    
    -- Skip if charge_fee is null or zero
    IF NEW.charge_fee IS NULL OR NEW.charge_fee = 0 THEN
      RETURN NEW;
    END IF;
    
    v_revenue_amount := NEW.charge_fee;
    v_purchase_amount := COALESCE(NEW.purchase_amount, NEW.amount - NEW.charge_fee);
    v_metadata := jsonb_build_object(
      'betting_provider', NEW.betting_provider,
      'account_number', NEW.account_number,
      'phone_number', NEW.phone_number,
      'bet_type', NEW.bet_type,
      'game_type', NEW.game_type,
      'ticket_number', NEW.ticket_number
    );
    
  ELSIF TG_TABLE_NAME = 'data_transactions' THEN
    v_transaction_type := 'data';
    v_charge_fee_rate := 0; -- Not a percentage, it's a fixed markup
    
    -- Calculate revenue: admin_revenue if available, otherwise amount - api_cost
    -- Revenue = custom_price - original_price (or admin_revenue column)
    IF NEW.admin_revenue IS NOT NULL THEN
      v_revenue_amount := NEW.admin_revenue;
    ELSIF NEW.api_cost IS NOT NULL AND NEW.amount IS NOT NULL THEN
      v_revenue_amount := NEW.amount - NEW.api_cost;
    ELSE
      -- Cannot calculate revenue without api_cost, skip
      RETURN NEW;
    END IF;
    
    -- Skip if revenue is zero or negative
    IF v_revenue_amount IS NULL OR v_revenue_amount <= 0 THEN
      RETURN NEW;
    END IF;
    
    -- Purchase amount is the API cost (original price)
    v_purchase_amount := COALESCE(NEW.api_cost, 0);
    
    v_metadata := jsonb_build_object(
      'network', NEW.network,
      'plan_name', NEW.plan_name,
      'phone_number', NEW.phone_number,
      'provider', NEW.provider
    );
    
  ELSE
    -- Unknown table, skip
    RETURN NEW;
  END IF;

  -- Insert revenue record (only if it doesn't already exist)
  -- Check if record already exists to prevent duplicates
  IF NOT EXISTS (
    SELECT 1 FROM public.platform_revenue 
    WHERE transaction_id = NEW.id 
    AND transaction_table = TG_TABLE_NAME
  ) THEN
    INSERT INTO public.platform_revenue (
      transaction_id,
      transaction_type,
      transaction_table,
      revenue_amount,
      purchase_amount,
      charge_fee_rate,
      user_id,
      transaction_reference,
      transaction_status,
      metadata
    )
    VALUES (
      NEW.id,
      v_transaction_type,
      TG_TABLE_NAME,
      v_revenue_amount,
      v_purchase_amount,
      v_charge_fee_rate,
      NEW.user_id,
      NEW.reference,
      CASE WHEN NEW.status = 'success' THEN 'completed' ELSE NEW.status END,
      v_metadata
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for betting_transactions
DROP TRIGGER IF EXISTS trigger_record_betting_revenue ON public.betting_transactions;
CREATE TRIGGER trigger_record_betting_revenue
AFTER INSERT OR UPDATE ON public.betting_transactions
FOR EACH ROW
WHEN (
  NEW.status = 'completed'
  AND NEW.charge_fee IS NOT NULL 
  AND NEW.charge_fee > 0
)
EXECUTE FUNCTION public.record_platform_revenue();

-- Update comment
COMMENT ON FUNCTION public.record_platform_revenue() IS 'Automatically records platform revenue when transactions are completed. Supports education, electricity, cable TV, betting, and data transactions.';






