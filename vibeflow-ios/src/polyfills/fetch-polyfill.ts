/**
 * Fetch polyfill using XMLHttpRequest.
 *
 * Expo SDK 54 / React Native 0.81 with Hermes has a known networking bug
 * where fetch() fails with "Network request failed" on real iOS devices.
 *
 * XMLHttpRequest uses a different native networking path (RCTNetworking)
 * that bypasses the broken Hermes fetch implementation.
 *
 * Reference: https://github.com/expo/expo/issues/40061
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const _originalFetch = globalThis.fetch;

function xhrFetch(input: any, init?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let url: string;
    if (typeof input === 'string') {
      url = input;
    } else if (input && typeof input === 'object' && input.href) {
      url = input.href;
    } else if (input && typeof input === 'object' && input.url) {
      url = input.url;
    } else {
      // Fallback to original for anything we can't handle
      return _originalFetch(input, init).then(resolve, reject);
    }

    const method = (init && init.method) || 'GET';

    // Respect AbortController
    if (init && init.signal && init.signal.aborted) {
      return reject(new Error('Aborted'));
    }

    const xhr = new XMLHttpRequest();

    const onAbort = () => {
      xhr.abort();
      reject(new Error('Aborted'));
    };

    if (init && init.signal) {
      init.signal.addEventListener('abort', onAbort);
    }

    const cleanup = () => {
      if (init && init.signal) {
        init.signal.removeEventListener('abort', onAbort);
      }
    };

    xhr.onload = () => {
      cleanup();
      // Build a response-like object
      const responseHeaders: Record<string, string> = {};
      const rawHeaders = xhr.getAllResponseHeaders() || '';
      for (const line of rawHeaders.split('\r\n')) {
        const idx = line.indexOf(': ');
        if (idx > 0) {
          responseHeaders[line.slice(0, idx).toLowerCase()] = line.slice(idx + 2);
        }
      }

      const response = {
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        statusText: xhr.statusText || '',
        headers: {
          get: (name: string) => responseHeaders[name.toLowerCase()] || null,
          has: (name: string) => name.toLowerCase() in responseHeaders,
          forEach: (cb: (value: string, key: string) => void) => {
            for (const [k, v] of Object.entries(responseHeaders)) {
              cb(v, k);
            }
          },
          entries: () => Object.entries(responseHeaders)[Symbol.iterator](),
        },
        url,
        _text: xhr.responseText,
        json: async () => JSON.parse(xhr.responseText),
        text: async () => xhr.responseText,
        clone: function () { return { ...this }; },
      };
      resolve(response);
    };

    xhr.onerror = () => {
      cleanup();
      reject(new TypeError('Network request failed'));
    };

    xhr.ontimeout = () => {
      cleanup();
      reject(new TypeError('Network request failed'));
    };

    try {
      xhr.open(method, url, true);

      // Set headers
      if (init && init.headers) {
        const h = init.headers;
        if (typeof h.forEach === 'function') {
          h.forEach((value: string, key: string) => {
            xhr.setRequestHeader(key, value);
          });
        } else if (typeof h === 'object') {
          for (const [key, value] of Object.entries(h)) {
            xhr.setRequestHeader(key, value as string);
          }
        }
      }

      // Set timeout (match our FETCH_TIMEOUT_MS)
      xhr.timeout = 15000;

      // Send body
      const body = init && init.body;
      if (!body) {
        xhr.send();
      } else {
        xhr.send(body);
      }
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

/**
 * Install XHR-based fetch polyfill.
 */
export function installFetchPolyfill(): void {
  try {
    console.log('[FetchPolyfill] Installing XHR-based fetch for iOS');
    (globalThis as any).fetch = xhrFetch;
  } catch (e) {
    console.error('[FetchPolyfill] Failed to install:', e);
  }
}
