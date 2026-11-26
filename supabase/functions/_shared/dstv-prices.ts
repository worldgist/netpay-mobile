/**
 * DSTV Official Price Mapping
 * 
 * This file contains the official DSTV package prices.
 * Prices are validated and corrected to ensure accuracy.
 */

// Official DSTV package prices (as of 2024)
// Prices are in Naira (₦)
export const DSTV_OFFICIAL_PRICES: Record<string, number> = {
  'DSTV Padi': 2500,
  'DSTV Yanga': 3000,
  'DSTV Confam': 4900,
  'DSTV Compact': 19000,
  'DSTV Compact Plus': 12900,
  'DSTV Premium': 24500,
  'DSTV Premium + Asia': 29500,
  'DSTV Premium + French': 32500,
};

// Alternative package name mappings (case-insensitive matching)
const PACKAGE_NAME_VARIANTS: Record<string, string[]> = {
  'DSTV Padi': ['padi', 'dstv padi'],
  'DSTV Yanga': ['yanga', 'dstv yanga'],
  'DSTV Confam': ['confam', 'dstv confam'],
  'DSTV Compact': ['compact', 'dstv compact'],
  'DSTV Compact Plus': ['compact plus', 'dstv compact plus', 'compact+'],
  'DSTV Premium': ['premium', 'dstv premium'],
  'DSTV Premium + Asia': ['premium + asia', 'premium +asia', 'premium+asia', 'dstv premium + asia', 'premium asia'],
  'DSTV Premium + French': ['premium + french', 'premium +french', 'premium+french', 'dstv premium + french', 'premium french'],
};

/**
 * Normalize package name for matching
 */
function normalizePackageName(name: string): string {
  return name.toLowerCase().trim();
}

/**
 * Find the official package name from a given package name
 */
export function findOfficialPackageName(packageName: string): string | null {
  const normalized = normalizePackageName(packageName);
  
  // Direct match
  for (const [officialName, price] of Object.entries(DSTV_OFFICIAL_PRICES)) {
    if (normalizePackageName(officialName) === normalized) {
      return officialName;
    }
  }
  
  // Check variants
  for (const [officialName, variants] of Object.entries(PACKAGE_NAME_VARIANTS)) {
    for (const variant of variants) {
      if (normalized.includes(variant) || variant.includes(normalized)) {
        return officialName;
      }
    }
  }
  
  return null;
}

/**
 * Get the official price for a DSTV package
 * Returns null if package is not found
 */
export function getOfficialDSTVPrice(packageName: string): number | null {
  const officialName = findOfficialPackageName(packageName);
  if (!officialName) {
    return null;
  }
  return DSTV_OFFICIAL_PRICES[officialName] || null;
}

/**
 * Validate and correct DSTV package price
 * Returns the official price if package is recognized, otherwise returns the original price
 */
export function validateDSTVPrice(packageName: string, apiPrice: number): number {
  const officialPrice = getOfficialDSTVPrice(packageName);
  
  if (officialPrice !== null) {
    // Use official price if found
    if (Math.abs(apiPrice - officialPrice) > 100) {
      // Log if there's a significant difference (more than ₦100)
      console.warn(`DSTV price correction: ${packageName} - API price: ₦${apiPrice}, Official price: ₦${officialPrice}`);
    }
    return officialPrice;
  }
  
  // If package not recognized, return original price
  return apiPrice;
}

/**
 * Validate DSTV package and return corrected data
 */
export function validateDSTVPackage(pkg: {
  package_name: string;
  price: number;
  [key: string]: any;
}): {
  package_name: string;
  price: number;
  original_price?: number;
  [key: string]: any;
} {
  const officialName = findOfficialPackageName(pkg.package_name);
  const officialPrice = officialName ? DSTV_OFFICIAL_PRICES[officialName] : null;
  
  if (officialName && officialPrice !== null) {
    return {
      ...pkg,
      package_name: officialName,
      price: officialPrice,
      original_price: pkg.price, // Keep original for reference
    };
  }
  
  return pkg;
}

