# Debugging Electricity Transactions Not Showing

## Issue
eBills electricity purchases are not being recorded or shown in the mobile app's transaction history.

## What We Know
1. ✅ The purchase-electricity function calls `debitUserWallet` which creates records in `user_transactions`
2. ✅ The purchase-electricity function creates records in `electricity_transactions` table
3. ✅ The mobile app queries the `electricity_transactions` table
4. ✅ RLS policies exist for the `electricity_transactions` table

## Steps to Debug

### Step 1: Check if transactions exist in the database
Run the SQL queries in `check-electricity-transactions.sql` in your Supabase SQL Editor:

```bash
# Open the file
cat check-electricity-transactions.sql
```

Key things to check:
- Are there any records with `vending_provider = 'ebills'`?
- Do the `user_id` values match the authenticated user?
- Are the transactions recent (check `created_at`)?

### Step 2: Test a purchase and check logs
1. Make a test electricity purchase using eBills
2. Check the Supabase function logs for "purchase-electricity"
3. Look for these log messages:
   - "Inserting electricity transaction"
   - "Transaction verified after insertion"
   - "Transaction is queryable by user_id and reference"
   - Any errors mentioning "CRITICAL" or "WARNING"

### Step 3: Check mobile app logs
1. Open the mobile app
2. Navigate to the Transactions tab
3. Open the console/debug output
4. Look for the log message: "Electricity transactions query result:"
5. Check:
   - `success`: Should be `true`
   - `error`: Should be `null`
   - `count`: How many transactions were found
   - `data`: The actual transactions

### Step 4: Verify RLS policies
Run query #5 from the SQL file to check RLS policies. You should see:
- ✅ "Users can view their own electricity transactions" - `FOR SELECT USING (auth.uid() = user_id)`
- ✅ "System can insert electricity transactions" - `FOR INSERT WITH CHECK (true)`

### Step 5: Check authentication
The most common issue is authentication. Verify:
```sql
-- Run this to check if auth.uid() matches the user_id in transactions
SELECT 
  auth.uid() as current_auth_uid,
  user_id,
  provider,
  amount,
  reference,
  created_at
FROM electricity_transactions
WHERE vending_provider = 'ebills'
ORDER BY created_at DESC
LIMIT 5;
```

If `current_auth_uid` is NULL or doesn't match `user_id`, the RLS policy will block the query.

## Possible Issues and Fixes

### Issue 1: RLS Policy Too Restrictive
**Symptom**: Transactions exist but mobile app returns empty array

**Fix**: Check if the RLS policy uses `auth.uid()`. It should be:
```sql
CREATE POLICY "Users can view their own electricity transactions"
ON public.electricity_transactions
FOR SELECT
USING (auth.uid() = user_id);
```

### Issue 2: Transactions Not Being Created
**Symptom**: No records in `electricity_transactions` table for eBills purchases

**Fix**: Check the purchase-electricity function logs. Look for errors in the transaction insert section (around line 530-550 in the function).

### Issue 3: Session Expired
**Symptom**: Electricity transactions show empty but other transactions show up

**Fix**: The session might be expired when querying. Check if `getSessionOrRedirect()` is working correctly.

### Issue 4: Vending Provider Mismatch
**Symptom**: Transactions exist but with wrong or NULL vending_provider

**Fix**: Check query #4 in the SQL file. If transactions have NULL vending_provider, the issue is in the purchase function not setting it correctly.

## Quick Fix Tests

### Test 1: Temporarily disable RLS
**WARNING: Only do this in development!**
```sql
ALTER TABLE public.electricity_transactions DISABLE ROW LEVEL SECURITY;
```

Try viewing transactions in the mobile app. If they show up, the issue is RLS-related.

Don't forget to re-enable:
```sql
ALTER TABLE public.electricity_transactions ENABLE ROW LEVEL SECURITY;
```

### Test 2: Add a service role query
In the mobile app's transactions.tsx, temporarily add this query using service role to bypass RLS:

```typescript
// TEMPORARY DEBUG - use service role client
const { data: debugData } = await supabaseAdmin // You'd need to create this
  .from('electricity_transactions')
  .select('*')
  .eq('vending_provider', 'ebills')
  .order('created_at', { ascending: false })
  .limit(5);
  
console.log('Debug - eBills transactions (bypassing RLS):', debugData);
```

If this returns transactions but the normal query doesn't, it confirms RLS is blocking.

## Next Steps

1. ✅ Run the SQL checks (`check-electricity-transactions.sql`)
2. ✅ Make a test eBills purchase
3. ✅ Check the purchase-electricity function logs
4. ✅ Check the mobile app console logs
5. ✅ Report findings so we can pinpoint the exact issue

## Files Modified for Debugging
- `/mobile/app/(tabs)/transactions.tsx` - Added console logging for electricity transactions query
- `/check-electricity-transactions.sql` - Comprehensive SQL checks
- `/mobile/scripts/test-electricity-transactions.js` - Node.js test script

## Contact Support
If issue persists after these checks, provide:
1. Screenshots of Supabase function logs
2. Mobile app console logs
3. Results from SQL query #2 and #3
4. Your user ID
