import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateDSTVPackage } from "../_shared/dstv-prices.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CABLE_SERVICE_MAP: Record<string, string> = {
  "DSTV": "dstv",
  "GOTV": "gotv",
  "STARTIMES": "startimes",
};

const resolveServiceId = (provider?: string | null) => {
  if (!provider) return "dstv";
  const upper = provider.toUpperCase().trim();
  return CABLE_SERVICE_MAP[upper] || "dstv";
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 405, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  try {
    const VTPASS_API_KEY = Deno.env.get("VTPASS_API_KEY");
    const VTPASS_PUBLIC_KEY = Deno.env.get("VTPASS_PUBLIC_KEY");
    const VTPASS_MODE = (Deno.env.get("VTPASS_MODE") || "live").toLowerCase();

    if (!VTPASS_API_KEY || !VTPASS_PUBLIC_KEY) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "VTpass credentials not configured. Please set VTPASS_API_KEY and VTPASS_PUBLIC_KEY.",
        }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Allow any authenticated user to fetch packages (packages are public information)

    let parsedBody: Record<string, unknown> | null = null;
    try {
      const bodyText = await req.text();
      if (bodyText && bodyText.trim().length > 0) {
        parsedBody = JSON.parse(bodyText);
      }
    } catch (error) {
      console.error("fetch-vtpass-cable-packages: unable to parse request body:", error);
      parsedBody = null;
    }

    const provider = parsedBody?.provider || "DSTV";
    const serviceId = resolveServiceId(typeof provider === "string" ? provider : null);
    
    console.log("fetch-vtpass-cable-packages request:", {
      provider: typeof provider === "string" ? provider : "DSTV",
      serviceId,
      parsedBody,
    });

    const baseUrl = VTPASS_MODE === "sandbox"
      ? "https://sandbox.vtpass.com"
      : "https://vtpass.com";

    const headers: HeadersInit = {
      "api-key": VTPASS_API_KEY || VTPASS_PUBLIC_KEY,
      "public-key": VTPASS_PUBLIC_KEY,
      "Content-Type": "application/json",
    };

    console.log("fetch-vtpass-cable-packages -> fetching variations:", {
      serviceID: serviceId,
      provider: typeof provider === "string" ? provider : "DSTV",
      mode: VTPASS_MODE,
      baseUrl,
      url: `${baseUrl}/api/service-variations?serviceID=${serviceId}`,
    });

    const response = await fetch(`${baseUrl}/api/service-variations?serviceID=${serviceId}`, {
      method: "GET",
      headers,
    });

    const responseText = await response.text();
    console.log("VTpass service-variations response status:", response.status);
    console.log("VTpass service-variations response:", responseText);

    if (!response.ok) {
      console.error("VTpass API error:", response.status, responseText);
      return new Response(
        JSON.stringify({
          success: false,
          error: `VTpass API error: ${response.status}`,
          details: responseText,
        }),
        { status: response.status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    let responseJson: any = null;
    try {
      responseJson = JSON.parse(responseText);
    } catch (error) {
      console.error("Unable to parse VTpass response:", responseText, error);
      return new Response(
        JSON.stringify({ success: false, error: "Invalid response from VTpass" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // Check if request was successful
    // VTpass may return variations in different formats
    let variations: any[] = [];
    
    if (responseJson.content) {
      // Try different possible field names
      if (Array.isArray(responseJson.content.varations)) {
        variations = responseJson.content.varations;
      } else if (Array.isArray(responseJson.content.variations)) {
        variations = responseJson.content.variations;
      } else if (Array.isArray(responseJson.content)) {
        variations = responseJson.content;
      } else if (responseJson.content.content && Array.isArray(responseJson.content.content)) {
        variations = responseJson.content.content;
      }
    }
    
    if (variations.length > 0) {

      // Transform VTpass variations to match our cable_tv_plans schema
      const providerUpper = typeof provider === "string" ? provider.toUpperCase() : "DSTV";
      const packages = variations
        .filter((variation: any) => {
          // Accept variations that have either variation_code or code, and a name
          return variation && 
                 (variation.variation_code || variation.code) && 
                 (variation.name || variation.variation_name || variation.package_name);
        })
        .map((variation: any) => {
          // Clean and normalize the package name
          const packageName = (variation.name || variation.variation_name || variation.package_name || "").trim();
          const price = parseFloat(variation.variation_amount || variation.amount || variation.price || "0") || 0;
          const apiCode = (variation.variation_code || variation.code || "").trim();

          const packageData = {
            provider: providerUpper,
            package_name: packageName,
            price: price,
            api_code: apiCode,
          };

          // Validate and correct DSTV prices
          if (providerUpper === 'DSTV') {
            return validateDSTVPackage(packageData);
          }

          return packageData;
        })
        .filter((pkg: any) => pkg.api_code && pkg.package_name); // Remove invalid entries

      // Deduplicate packages by package name (normalized) and api_code
      // After price validation, multiple API codes might map to the same package name
      const seenIds = new Set<string>();
      const seenPackageNames = new Set<string>();
      const uniquePackages = packages.filter((pkg) => {
        const id = pkg.api_code || '';
        const normalizedName = (pkg.package_name || '').toLowerCase().trim();
        
        // Check for duplicate by ID first
        if (id && seenIds.has(id)) {
          console.log(`Removing duplicate package by ID: ${pkg.package_name} (ID: ${id})`);
          return false;
        }
        
        // Check for duplicate by normalized package name (for DSTV after price validation)
        if (providerUpper === 'DSTV' && normalizedName && seenPackageNames.has(normalizedName)) {
          console.log(`Removing duplicate package by name: ${pkg.package_name} (ID: ${id})`);
          return false;
        }
        
        if (id) seenIds.add(id);
        if (normalizedName) seenPackageNames.add(normalizedName);
        return true;
      });

      console.log(`Transformed ${packages.length} VTpass cable packages for ${provider} from ${variations.length} variations (${uniquePackages.length} unique)`);

      if (packages.length === 0) {
        console.warn("No valid packages found after transformation. Raw response:", JSON.stringify(responseJson, null, 2));
        return new Response(
          JSON.stringify({
            success: false,
            error: "No valid cable packages found in VTpass response",
            details: responseJson,
          }),
          { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: uniquePackages,
          metadata: {
            total_packages: packages.length,
            unique_packages: uniquePackages.length,
            provider: typeof provider === "string" ? provider.toUpperCase() : "DSTV",
            service_id: serviceId,
            vending_provider: "vtpass",
          },
        }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // No variations found - log the full response for debugging
    console.error("No variations found in VTpass response. Full response:", JSON.stringify(responseJson, null, 2));
    
    // Check if there's an error code or message
    const errorMessage = responseJson.response_description || 
                        responseJson.message || 
                        responseJson.error || 
                        "No cable packages found";
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        code: responseJson.code,
        details: responseJson,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in fetch-vtpass-cable-packages function:", error);
    const message = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});

