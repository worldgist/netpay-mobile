// Run this in browser console to diagnose cable provider setting
// Make sure you're logged in as admin first

(async () => {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  
  const supabaseUrl = 'YOUR_SUPABASE_URL'; // Replace with your actual Supabase URL
  const supabaseKey = 'YOUR_SUPABASE_ANON_KEY'; // Replace with your actual anon key
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  console.log('=== Checking Cable Provider Setting ===');
  
  // Check current setting
  const { data: setting, error: settingError } = await supabase
    .from('app_settings')
    .select('*')
    .eq('setting_key', 'cable_provider')
    .maybeSingle();
  
  console.log('Current cable_provider setting:', setting);
  console.log('Error (if any):', settingError);
  
  if (setting) {
    console.log('Provider value:', setting.setting_value?.provider);
  } else {
    console.log('⚠️ No cable_provider setting found in database!');
  }
  
  // Try to update to mobilenig
  console.log('\n=== Attempting to update to mobilenig ===');
  const { data: updateData, error: updateError } = await supabase
    .from('app_settings')
    .update({
      setting_value: { provider: 'mobilenig' },
      updated_at: new Date().toISOString()
    })
    .eq('setting_key', 'cable_provider')
    .select();
  
  console.log('Update result:', updateData);
  console.log('Update error (if any):', updateError);
  
  // Verify the update
  console.log('\n=== Verifying update ===');
  const { data: verifyData, error: verifyError } = await supabase
    .from('app_settings')
    .select('*')
    .eq('setting_key', 'cable_provider')
    .maybeSingle();
  
  console.log('After update:', verifyData);
  console.log('Provider value:', verifyData?.setting_value?.provider);
})();
