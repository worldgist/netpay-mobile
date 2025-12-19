/**
 * Global error handler to suppress handled network errors
 * and improve error reporting
 */

const handledNetworkErrors = new Set<string>();

export const isNetworkError = (error: any): boolean => {
  if (!error) return false;
  
  const errorMessage = error?.message || String(error) || '';
  const errorName = error?.name || error?.constructor?.name || '';
  const errorStack = error?.stack || '';
  
  return (
    errorMessage.includes('Network request failed') ||
    errorMessage.includes('Failed to fetch') ||
    errorMessage.includes('Failed to send a request to the Edge Function') ||
    errorMessage.includes('ERR_INTERNET_DISCONNECTED') ||
    errorMessage.includes('ERR_NETWORK_CHANGED') ||
    errorMessage.includes('TypeError') ||
    errorStack.includes('fetch.umd.js') ||
    errorStack.includes('Network request failed') ||
    errorName === 'FunctionsFetchError' ||
    errorName === 'TypeError' ||
    error?.code === 'NETWORK_ERROR'
  );
};

export const suppressHandledNetworkError = (error: any): void => {
  if (isNetworkError(error)) {
    const errorKey = `${error?.message || ''}-${error?.stack?.substring(0, 100) || ''}`;
    handledNetworkErrors.add(errorKey);
  }
};

export const shouldSuppressError = (error: any): boolean => {
  if (!isNetworkError(error)) return false;
  
  const errorKey = `${error?.message || ''}-${error?.stack?.substring(0, 100) || ''}`;
  return handledNetworkErrors.has(errorKey);
};

// Set up global error handler for React Native
if (typeof ErrorUtils !== 'undefined') {
  const originalHandler = ErrorUtils.getGlobalHandler();
  
  ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    // Suppress network errors that are already being handled
    if (shouldSuppressError(error)) {
      // Silently ignore - error is already handled by the app
      return;
    }
    
    // For other errors, use the original handler
    if (originalHandler) {
      originalHandler(error, isFatal);
    } else {
      console.error('Unhandled error:', error);
    }
  });
}

// Also intercept console.error for network errors
const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  const firstArg = args[0];
  
  // Check if it's a network error that's already handled
  if (shouldSuppressError(firstArg)) {
    // Suppress the error log
    return;
  }
  
  // Check if error message contains network error patterns
  const errorString = args.map(arg => String(arg)).join(' ');
  if (
    errorString.includes('Network request failed') &&
    errorString.includes('fetch.umd.js')
  ) {
    // Check if this error was already handled
    const errorKey = errorString.substring(0, 200);
    if (handledNetworkErrors.has(errorKey)) {
      return; // Suppress
    }
  }
  
  // Use original console.error for other errors
  originalConsoleError.apply(console, args);
};

