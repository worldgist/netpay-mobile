-- Create function to record platform revenue from completed transactions
-- This function is called by triggers when transactions are completed

CREATE OR REPLACE FUNCTION public.record_platform_revenue()
RETURNS TRIGGER AS $$
DECLARE
  v_transaction_type TEXT;
  v_charge_fee_rate NUMERIC;
  v_revenue_amount NUMERIC;
  v_purchase_amount NUMERIC;
  v_metadata JSONB;
BEGIN
  -- Only record revenue for completed transactions
  IF NEW.status != 'completed' THEN
    RETURN NEW;
  END IF;

  -- Skip if charge_fee is null or zero
  IF NEW.charge_fee IS NULL OR NEW.charge_fee = 0 THEN
    RETURN NEW;
  END IF;

  -- Determine transaction type and metadata based on table
  IF TG_TABLE_NAME = 'education_transactions' THEN
    v_transaction_type := 'education';
    v_charge_fee_rate := 0.07; -- 7% for education
    v_metadata := jsonb_build_object(
      'exam_type', NEW.exam_type,
      'phone_number', NEW.phone_number
    );
  ELSIF TG_TABLE_NAME = 'electricity_transactions' THEN
    v_transaction_type := 'electricity';
    v_charge_fee_rate := 0.10; -- 10% for electricity
    v_metadata := jsonb_build_object(
      'provider', NEW.provider,
      'meter_number', NEW.meter_number,
      'meter_type', NEW.meter_type,
      'customer_name', NEW.customer_name
    );
  ELSE
    -- Unknown table, skip
    RETURN NEW;
  END IF;

  -- Calculate revenue amount (charge fee)
  v_revenue_amount := NEW.charge_fee;
  v_purchase_amount := COALESCE(NEW.purchase_amount, NEW.amount - NEW.charge_fee);

  -- Insert revenue record (only if it doesn't already exist)
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
    NEW.status,
    v_metadata
  )
  ON CONFLICT DO NOTHING; -- Prevent duplicate entries

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers for education_transactions
DROP TRIGGER IF EXISTS trigger_record_education_revenue ON public.education_transactions;
CREATE TRIGGER trigger_record_education_revenue
AFTER INSERT OR UPDATE ON public.education_transactions
FOR EACH ROW
WHEN (NEW.status = 'completed' AND NEW.charge_fee IS NOT NULL AND NEW.charge_fee > 0)
EXECUTE FUNCTION public.record_platform_revenue();

-- Create triggers for electricity_transactions
DROP TRIGGER IF EXISTS trigger_record_electricity_revenue ON public.electricity_transactions;
CREATE TRIGGER trigger_record_electricity_revenue
AFTER INSERT OR UPDATE ON public.electricity_transactions
FOR EACH ROW
WHEN (NEW.status = 'completed' AND NEW.charge_fee IS NOT NULL AND NEW.charge_fee > 0)
EXECUTE FUNCTION public.record_platform_revenue();

-- Add comment
COMMENT ON FUNCTION public.record_platform_revenue() IS 'Automatically records platform revenue when transactions are completed';















