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

const isFontFaceObserverTimeout = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error || '');
  const stack = error instanceof Error ? error.stack || '' : '';
  return (
    message.includes('12000ms timeout exceeded') ||
    (message.includes('timeout exceeded') && (stack.includes('fontfaceobserver') || message.includes('fontfaceobserver')))
  );
};

// Expo web verifies icon fonts with FontFaceObserver (12s). On a slow Metro reload the
// check rejects even though the @font-face stylesheet already applied. Swallow that
// rejection here so it never becomes the full-screen "Uncaught Error" overlay.
try {
  const fontModule = require('fontfaceobserver') as {
    prototype: { load: (text?: string | null, timeout?: number) => Promise<unknown> };
  };
  const originalLoad = fontModule.prototype.load;
  fontModule.prototype.load = function loadWithoutTimeoutOverlay(
    this: unknown,
    text?: string | null,
    timeout?: number,
  ) {
    return Promise.resolve(originalLoad.call(this, text, timeout)).catch((error: unknown) => {
      if (isFontFaceObserverTimeout(error)) return undefined;
      throw error;
    });
  };
} catch {
  // fontfaceobserver is only present on web bundles.
}

// Set up global error handler for React Native
if (typeof ErrorUtils !== 'undefined') {
  const originalHandler = ErrorUtils.getGlobalHandler();
  
  ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    // Suppress network errors that are already being handled, and harmless font checks.
    if (shouldSuppressError(error) || isFontFaceObserverTimeout(error)) {
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

  // Expo web icon fonts can take longer than FontFaceObserver's 12s check during slow Metro reloads.
  // The stylesheet still applies; the rejection is noisy but not fatal.
  if (isFontFaceObserverTimeout(firstArg)) {
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

  if (errorString.includes('12000ms timeout exceeded') || errorString.includes('fontfaceobserver')) {
    return;
  }
  
  // Use original console.error for other errors
  originalConsoleError.apply(console, args);
};

// Swallow unhandled FontFaceObserver rejections on web before the Expo error overlay.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener(
    'unhandledrejection',
    (event) => {
      if (isFontFaceObserverTimeout(event.reason)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
  window.addEventListener(
    'error',
    (event) => {
      if (isFontFaceObserverTimeout(event.error || event.message)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
}













