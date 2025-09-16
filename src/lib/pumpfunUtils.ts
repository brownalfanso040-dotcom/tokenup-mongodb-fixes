/**
 * PumpFun Token Utilities
 * Handles detection and processing of PumpFun tokens (addresses ending with "pump")
 */

export interface PumpFunTokenInfo {
  mint: string;
  name: string;
  symbol: string;
  description?: string;
  image?: string;
  creator?: string;
  createdOn: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
  marketCap?: number;
  bondingCurve?: string;
  associatedBondingCurve?: string;
  virtualTokenReserves?: number;
  virtualSolReserves?: number;
  totalSupply?: number;
  complete?: boolean;
}

/**
 * Check if a token address ends with "pump" (indicating it's a PumpFun token)
 */
export function isPumpFunToken(address: string): boolean {
  if (!address || typeof address !== 'string') {
    return false;
  }
  return address.toLowerCase().endsWith('pump');
}

/**
 * Fetch PumpFun token information from their API
 */
export async function fetchPumpFunTokenInfo(mintAddress: string): Promise<PumpFunTokenInfo | null> {
  if (!isPumpFunToken(mintAddress)) {
    return null;
  }

  try {
    // Using PumpFun's frontend API endpoint
    const response = await fetch(`https://frontend-api.pump.fun/coins/${mintAddress}`);
    
    if (!response.ok) {
      console.warn(`PumpFun API returned ${response.status} for token ${mintAddress}`);
      return null;
    }

    const data = await response.json();
    
    return {
      mint: data.mint || mintAddress,
      name: data.name || 'Unknown PumpFun Token',
      symbol: data.symbol || 'PUMP',
      description: data.description,
      image: data.image_uri,
      creator: data.creator,
      createdOn: 'pump.fun',
      website: data.website,
      twitter: data.twitter,
      telegram: data.telegram,
      discord: data.discord,
      marketCap: data.market_cap,
      bondingCurve: data.bonding_curve,
      associatedBondingCurve: data.associated_bonding_curve,
      virtualTokenReserves: data.virtual_token_reserves,
      virtualSolReserves: data.virtual_sol_reserves,
      totalSupply: data.total_supply,
      complete: data.complete
    };
  } catch (error) {
    console.error('Error fetching PumpFun token info:', error);
    return null;
  }
}

/**
 * Enhanced token detection that includes PumpFun metadata check
 */
export async function detectTokenType(mintAddress: string): Promise<{
  isPumpFun: boolean;
  tokenType: 'pumpfun' | 'spl' | 'spl-2022' | 'unknown';
  metadata?: any;
}> {
  const isPumpFun = isPumpFunToken(mintAddress);
  
  if (isPumpFun) {
    const pumpFunData = await fetchPumpFunTokenInfo(mintAddress);
    return {
      isPumpFun: true,
      tokenType: 'pumpfun',
      metadata: pumpFunData
    };
  }

  // For non-PumpFun tokens, we can add additional detection logic here
  return {
    isPumpFun: false,
    tokenType: 'spl', // Default assumption
    metadata: null
  };
}

/**
 * Get creator information for PumpFun tokens
 */
export async function getPumpFunCreator(mintAddress: string): Promise<string | null> {
  if (!isPumpFunToken(mintAddress)) {
    return null;
  }

  try {
    const tokenInfo = await fetchPumpFunTokenInfo(mintAddress);
    return tokenInfo?.creator || null;
  } catch (error) {
    console.error('Error fetching PumpFun creator:', error);
    return null;
  }
}

/**
 * Check if a token has PumpFun metadata indicators
 */
export function hasPumpFunMetadata(metadata: any): boolean {
  if (!metadata) return false;
  
  // Check for "createdOn" field with "pump.fun" value
  return metadata.createdOn === 'pump.fun' || 
         (metadata.extensions && metadata.extensions.createdOn === 'pump.fun');
}

/**
 * Validate PumpFun token address format
 */
export function validatePumpFunAddress(address: string): {
  isValid: boolean;
  isPumpFun: boolean;
  error?: string;
} {
  if (!address || typeof address !== 'string') {
    return {
      isValid: false,
      isPumpFun: false,
      error: 'Address is required'
    };
  }

  // Basic Solana address validation (should be 32-44 characters)
  if (address.length < 32 || address.length > 44) {
    return {
      isValid: false,
      isPumpFun: false,
      error: 'Invalid address length'
    };
  }

  const isPumpFun = isPumpFunToken(address);
  
  return {
    isValid: true,
    isPumpFun,
    error: undefined
  };
}