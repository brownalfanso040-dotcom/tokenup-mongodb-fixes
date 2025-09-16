/**
 * Utility functions for the SPL Token Creator
 * Provides common helper functions used across the application
 */

// Using global window.solanaWeb3 instead of ES6 imports for browser compatibility
const { PublicKey, LAMPORTS_PER_SOL } = window.solanaWeb3 || {};

/**
 * Sleep utility for delays
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Format SOL amount from lamports
 * @param {number} lamports - Amount in lamports
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted SOL amount
 */
export const formatSOL = (lamports, decimals = 4) => {
  const sol = lamports / LAMPORTS_PER_SOL;
  return sol.toFixed(decimals);
};

/**
 * Convert SOL to lamports
 * @param {number} sol - Amount in SOL
 * @returns {number} Amount in lamports
 */
export const solToLamports = (sol) => {
  return Math.floor(sol * LAMPORTS_PER_SOL);
};

/**
 * Validate Solana public key
 * @param {string} key - Public key string
 * @returns {boolean} True if valid
 */
export const isValidPublicKey = (key) => {
  try {
    new PublicKey(key);
    return true;
  } catch {
    return false;
  }
};

/**
 * Truncate public key for display
 * @param {string} key - Public key string
 * @param {number} start - Characters to show at start
 * @param {number} end - Characters to show at end
 * @returns {string} Truncated key
 */
export const truncateKey = (key, start = 4, end = 4) => {
  if (!key || key.length <= start + end) {
    return key;
  }
  return `${key.slice(0, start)}...${key.slice(-end)}`;
};

/**
 * Generate random string
 * @param {number} length - Length of string
 * @returns {string} Random string
 */
export const generateRandomString = (length = 8) => {
  return Math.random().toString(36).substring(2, 2 + length);
};

/**
 * Validate URL
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid URL
 */
export const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * Format number with commas
 * @param {number} num - Number to format
 * @returns {string} Formatted number
 */
export const formatNumber = (num) => {
  return num.toLocaleString();
};

/**
 * Calculate percentage
 * @param {number} value - Current value
 * @param {number} total - Total value
 * @param {number} decimals - Decimal places
 * @returns {number} Percentage
 */
export const calculatePercentage = (value, total, decimals = 2) => {
  if (total === 0) return 0;
  return Number(((value / total) * 100).toFixed(decimals));
};

/**
 * Retry function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum retry attempts
 * @param {number} baseDelay - Base delay in ms
 * @param {number} backoffMultiplier - Backoff multiplier
 * @returns {Promise<any>} Function result
 */
export const retryWithBackoff = async (fn, maxRetries = 3, baseDelay = 1000, backoffMultiplier = 2) => {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        break;
      }
      
      const delay = baseDelay * Math.pow(backoffMultiplier, attempt - 1);
      await sleep(delay);
    }
  }
  
  throw lastError;
};

/**
 * Deep clone object
 * @param {any} obj - Object to clone
 * @returns {any} Cloned object
 */
export const deepClone = (obj) => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }
  
  if (obj instanceof Array) {
    return obj.map(item => deepClone(item));
  }
  
  if (typeof obj === 'object') {
    const cloned = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = deepClone(obj[key]);
      }
    }
    return cloned;
  }
  
  return obj;
};

/**
 * Debounce function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Function} Debounced function
 */
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * Throttle function
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in ms
 * @returns {Function} Throttled function
 */
export const throttle = (func, limit) => {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

/**
 * Check if running in browser
 * @returns {boolean} True if in browser
 */
export const isBrowser = () => {
  return typeof window !== 'undefined' && typeof window.document !== 'undefined';
};

/**
 * Check if running in Node.js
 * @returns {boolean} True if in Node.js
 */
export const isNode = () => {
  return typeof process !== 'undefined' && process.versions && process.versions.node;
};

/**
 * Safe JSON parse
 * @param {string} str - JSON string
 * @param {any} defaultValue - Default value if parse fails
 * @returns {any} Parsed object or default value
 */
export const safeJsonParse = (str, defaultValue = null) => {
  try {
    return JSON.parse(str);
  } catch {
    return defaultValue;
  }
};

/**
 * Safe JSON stringify
 * @param {any} obj - Object to stringify
 * @param {string} defaultValue - Default value if stringify fails
 * @returns {string} JSON string or default value
 */
export const safeJsonStringify = (obj, defaultValue = '{}') => {
  try {
    return JSON.stringify(obj);
  } catch {
    return defaultValue;
  }
};

/**
 * Get current timestamp
 * @returns {number} Current timestamp
 */
export const getCurrentTimestamp = () => {
  return Math.floor(Date.now() / 1000);
};

/**
 * Format timestamp to readable date
 * @param {number} timestamp - Unix timestamp
 * @returns {string} Formatted date
 */
export const formatTimestamp = (timestamp) => {
  return new Date(timestamp * 1000).toLocaleString();
};

/**
 * Calculate time difference in human readable format
 * @param {number} timestamp - Unix timestamp
 * @returns {string} Time difference
 */
export const timeAgo = (timestamp) => {
  const now = Date.now();
  const diff = now - (timestamp * 1000);
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return `${seconds} second${seconds > 1 ? 's' : ''} ago`;
};

/**
 * Validate token symbol
 * @param {string} symbol - Token symbol
 * @returns {boolean} True if valid
 */
export const isValidTokenSymbol = (symbol) => {
  if (!symbol || typeof symbol !== 'string') {
    return false;
  }
  
  // Symbol should be 1-10 characters, alphanumeric, uppercase
  return /^[A-Z0-9]{1,10}$/.test(symbol);
};

/**
 * Validate token name
 * @param {string} name - Token name
 * @returns {boolean} True if valid
 */
export const isValidTokenName = (name) => {
  if (!name || typeof name !== 'string') {
    return false;
  }
  
  // Name should be 1-32 characters
  return name.length >= 1 && name.length <= 32;
};

/**
 * Validate token decimals
 * @param {number} decimals - Token decimals
 * @returns {boolean} True if valid
 */
export const isValidTokenDecimals = (decimals) => {
  return Number.isInteger(decimals) && decimals >= 0 && decimals <= 9;
};

/**
 * Validate token supply
 * @param {number} supply - Token supply
 * @returns {boolean} True if valid
 */
export const isValidTokenSupply = (supply) => {
  return Number.isFinite(supply) && supply > 0;
};

/**
 * Convert token amount to display format
 * @param {number} amount - Raw token amount
 * @param {number} decimals - Token decimals
 * @param {number} displayDecimals - Display decimals
 * @returns {string} Formatted amount
 */
export const formatTokenAmount = (amount, decimals, displayDecimals = 2) => {
  const divisor = Math.pow(10, decimals);
  const displayAmount = amount / divisor;
  return displayAmount.toFixed(displayDecimals);
};

/**
 * Convert display amount to raw token amount
 * @param {number} displayAmount - Display amount
 * @param {number} decimals - Token decimals
 * @returns {number} Raw token amount
 */
export const parseTokenAmount = (displayAmount, decimals) => {
  const multiplier = Math.pow(10, decimals);
  return Math.floor(displayAmount * multiplier);
};

/**
 * Generate a unique ID
 * @returns {string} Unique ID
 */
export const generateUniqueId = () => {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Check if value is empty
 * @param {any} value - Value to check
 * @returns {boolean} True if empty
 */
export const isEmpty = (value) => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
};

/**
 * Capitalize first letter
 * @param {string} str - String to capitalize
 * @returns {string} Capitalized string
 */
export const capitalize = (str) => {
  if (!str || typeof str !== 'string') return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

/**
 * Convert camelCase to kebab-case
 * @param {string} str - CamelCase string
 * @returns {string} kebab-case string
 */
export const camelToKebab = (str) => {
  return str.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();
};

/**
 * Convert kebab-case to camelCase
 * @param {string} str - kebab-case string
 * @returns {string} camelCase string
 */
export const kebabToCamel = (str) => {
  return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
};

/**
 * Display title with ASCII art
 */
export const displayTitle = () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    Enhanced SPL Token Creator                ║
║                  with Jito Bundle Integration                ║
╚══════════════════════════════════════════════════════════════╝
`);
};

/**
 * Display success message
 * @param {string} message - Success message
 */
export const displaySuccess = (message) => {
  console.log(`\n✅ ${message}\n`);
};

/**
 * Display error message
 * @param {string} message - Error message
 */
export const displayError = (message) => {
  console.log(`\n❌ ${message}\n`);
};

/**
 * Display warning message
 * @param {string} message - Warning message
 */
export const displayWarning = (message) => {
  console.log(`\n⚠️  ${message}\n`);
};

/**
 * Display info message
 * @param {string} message - Info message
 */
export const displayInfo = (message) => {
  console.log(`\nℹ️  ${message}\n`);
};

export default {
  sleep,
  formatSOL,
  solToLamports,
  isValidPublicKey,
  truncateKey,
  generateRandomString,
  isValidUrl,
  formatNumber,
  calculatePercentage,
  retryWithBackoff,
  deepClone,
  debounce,
  throttle,
  isBrowser,
  isNode,
  safeJsonParse,
  safeJsonStringify,
  getCurrentTimestamp,
  formatTimestamp,
  timeAgo,
  isValidTokenSymbol,
  isValidTokenName,
  isValidTokenDecimals,
  isValidTokenSupply,
  formatTokenAmount,
  parseTokenAmount,
  generateUniqueId,
  isEmpty,
  capitalize,
  camelToKebab,
  kebabToCamel,
  displayTitle,
  displaySuccess,
  displayError,
  displayWarning,
  displayInfo
};