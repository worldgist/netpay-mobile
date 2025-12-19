import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Exam type to Mobilenig service ID mapping
const EXAM_TO_MOBILENIG_SERVICE_ID: Record<string, string> = {
  'WAEC': 'AJA',
  'NECO': 'AJC',
  'JAMB': 'AJB',
};

interface EducationPrice {
  exam_type: string;
  service_id: string;
  product_code?: string;
  name: string;
  price: number; // Purchase amount (base price)
  charge_fee: number; // 7% charge fee
  total_amount: number; // Total amount (price + charge_fee)
  api_code: string;
}

// Education charge fee is 7%
const EDUCATION_CHARGE_FEE_RATE = 0.07;

async function fetchPricesFromMobilenig(examType: string): Promise<EducationPrice[]> {
  // Try public key first, then secret key as fallback
  const MOBILENIG_PUBLIC_KEY = Deno.env.get('MOBILENIG_PUBLIC_KEY');
  const MOBILENIG_SECRET_KEY = Deno.env.get('MOBILENIG_SECRET_KEY');
  const API_KEY = MOBILENIG_PUBLIC_KEY || MOBILENIG_SECRET_KEY;
  
  if (!API_KEY) {
    throw new Error('Mobilenig credentials not configured. Please set MOBILENIG_PUBLIC_KEY or MOBILENIG_SECRET_KEY environment variable.');
  }

  const serviceId = EXAM_TO_MOBILENIG_SERVICE_ID[examType.toUpperCase()];
  if (!serviceId) {
    throw new Error(`Unsupported exam type for Mobilenig: ${examType}. Supported types: WAEC, NECO, JAMB`);
  }

  const apiUrl = 'https://enterprise.mobilenig.com/api/v2/services/packages';
  
  console.log('Fetching Mobilenig prices from:', apiUrl);
  console.log('Exam type:', examType, 'Service ID:', serviceId);
  console.log('Using API Key:', MOBILENIG_PUBLIC_KEY ? 'Public Key' : 'Secret Key');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        service_id: serviceId,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    console.log('Mobilenig API HTTP response status:', response.status, response.statusText);

    const responseText = await response.text();
    console.log('Mobilenig API raw response text (first 1000 chars):', responseText.substring(0, 1000));
    
    if (!responseText || !responseText.trim()) {
      throw new Error('Empty response from Mobilenig API');
    }
    
    const data = JSON.parse(responseText);
    console.log('Mobilenig API parsed response:', JSON.stringify(data, null, 2));

    // Check for API errors
    if (!response.ok || data.statusCode !== '200' && data.statusCode !== 200) {
      const errorMsg = data.message || data.error || 'Failed to fetch prices from Mobilenig API';
      throw new Error(errorMsg);
    }

    const prices: EducationPrice[] = [];

    if (examType.toUpperCase() === 'WAEC' || examType.toUpperCase() === 'NECO') {
      // WAEC and NECO return single package object
      const packageData = data.details || data.data || data;
      
      if (packageData && typeof packageData === 'object') {
        const purchaseAmount = parseFloat(packageData.price || packageData.amount || '0');
        const chargeFee = Math.round(purchaseAmount * EDUCATION_CHARGE_FEE_RATE * 100) / 100; // Round to 2 decimal places
        const totalAmount = purchaseAmount + chargeFee;
        const productCode = packageData.productCode || packageData.code || examType;
        const name = packageData.name || `${examType} Result Checker PIN`;
        
        prices.push({
          exam_type: examType.toUpperCase(),
          service_id: serviceId,
          product_code: productCode,
          name: name,
          price: purchaseAmount,
          charge_fee: chargeFee,
          total_amount: totalAmount,
          api_code: productCode.toUpperCase(),
        });
      }
    } else if (examType.toUpperCase() === 'JAMB') {
      // JAMB returns array of packages
      const packages = data.details || data.data || data.packages || [];
      
      if (!Array.isArray(packages)) {
        throw new Error(`Invalid JAMB response structure. Expected array, got: ${typeof packages}`);
      }
      
      for (const pkg of packages) {
        const purchaseAmount = parseFloat(pkg.price || pkg.amount || '0');
        const chargeFee = Math.round(purchaseAmount * EDUCATION_CHARGE_FEE_RATE * 100) / 100; // Round to 2 decimal places
        const totalAmount = purchaseAmount + chargeFee;
        const productCode = pkg.productCode || pkg.code || '';
        const name = pkg.name || `${examType} ${productCode}`;
        const apiCode = productCode || examType;

        prices.push({
          exam_type: examType.toUpperCase(),
          service_id: serviceId,
          product_code: productCode,
          name: name,
          price: purchaseAmount,
          charge_fee: chargeFee,
          total_amount: totalAmount,
          api_code: apiCode.toUpperCase(),
        });
      }
    }

    return prices;
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      throw new Error('Request timeout while fetching prices from Mobilenig API');
    }
    
    throw error;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Verify authentication
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    let body: any = {};
    try {
      body = await req.json();
    } catch (e) {
      // If body parsing fails, try query params
      const url = new URL(req.url);
      const examType = url.searchParams.get('exam_type');
      if (examType) {
        body.exam_type = examType;
      }
    }

    const examType = body.exam_type || body.examType;
    if (!examType) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'exam_type is required. Supported values: WAEC, NECO, JAMB' 
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const normalizedExamType = examType.toUpperCase().trim();
    if (!['WAEC', 'NECO', 'JAMB'].includes(normalizedExamType)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid exam_type. Supported values: WAEC, NECO, JAMB' 
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching prices for exam type:', normalizedExamType);

    // Fetch prices from Mobilenig
    const prices = await fetchPricesFromMobilenig(normalizedExamType);

    return new Response(
      JSON.stringify({
        success: true,
        exam_type: normalizedExamType,
        prices: prices,
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error fetching education prices:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to fetch education prices',
        details: error.stack,
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});

