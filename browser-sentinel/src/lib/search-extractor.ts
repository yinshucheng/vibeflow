/**
 * Search Query Extractor
 * 
 * Extracts search queries from URLs of major search engines.
 * Requirements: 5.12
 */

import type { SearchEngine } from '../types/index.js';

/**
 * Search query extraction result
 */
export interface SearchQueryResult {
  engine: SearchEngine;
  query: string;
  url: string;
}

/**
 * Search engine configuration
 */
interface SearchEngineConfig {
  name: SearchEngine;
  hostPatterns: string[];
  queryParams: string[];
  pathPattern?: RegExp;
}

/**
 * Supported search engine configurations
 */
const SEARCH_ENGINES: SearchEngineConfig[] = [
  {
    name: 'google',
    hostPatterns: ['google.com', 'google.co.', 'google.'],
    queryParams: ['q', 'query'],
    pathPattern: /^\/search/,
  },
  {
    name: 'bing',
    hostPatterns: ['bing.com'],
    queryParams: ['q'],
    pathPattern: /^\/search/,
  },
  {
    name: 'duckduckgo',
    hostPatterns: ['duckduckgo.com'],
    queryParams: ['q'],
  },
];

export class SearchExtractor {
  private engines: SearchEngineConfig[];

  constructor() {
    this.engines = SEARCH_ENGINES;
  }

  /**
   * Extract search query from a URL
   * Requirements: 5.12
   * 
   * @param url - The URL to extract search query from
   * @returns SearchQueryResult if a search query is found, null otherwise
   */
  extractQuery(url: string): SearchQueryResult | null {
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname.toLowerCase();

      // Find matching search engine
      for (const engine of this.engines) {
        if (this.matchesEngine(hostname, parsedUrl.pathname, engine)) {
          const query = this.extractQueryParam(parsedUrl, engine.queryParams);
          if (query) {
            return {
              engine: engine.name,
              query: query.trim(),
              url,
            };
          }
        }
      }

      return null;
    } catch (error) {
      // Invalid URL
      return null;
    }
  }

  /**
   * Check if a hostname matches a search engine
   */
  private matchesEngine(
    hostname: string,
    pathname: string,
    engine: SearchEngineConfig
  ): boolean {
    // Check hostname patterns
    const hostnameMatches = engine.hostPatterns.some(pattern => {
      if (pattern.endsWith('.')) {
        // Pattern like 'google.' matches 'google.com', 'google.co.uk', etc.
        return hostname.includes(pattern) || hostname.startsWith(pattern.slice(0, -1));
      }
      return hostname.includes(pattern);
    });

    if (!hostnameMatches) return false;

    // Check path pattern if specified
    if (engine.pathPattern) {
      return engine.pathPattern.test(pathname);
    }

    return true;
  }

  /**
   * Extract query parameter from URL
   */
  private extractQueryParam(url: URL, paramNames: string[]): string | null {
    for (const param of paramNames) {
      const value = url.searchParams.get(param);
      if (value) {
        return decodeURIComponent(value);
      }
    }
    return null;
  }

  /**
   * Get list of supported search engines
   */
  getSupportedEngines(): SearchEngine[] {
    return this.engines.map(e => e.name);
  }

  /**
   * Check if a URL is from a supported search engine
   */
  isSearchEngineUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname.toLowerCase();

      return this.engines.some(engine => 
        this.matchesEngine(hostname, parsedUrl.pathname, engine)
      );
    } catch {
      return false;
    }
  }

  /**
   * Get the search engine name for a URL
   */
  getSearchEngine(url: string): SearchEngine | null {
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname.toLowerCase();

      for (const engine of this.engines) {
        if (this.matchesEngine(hostname, parsedUrl.pathname, engine)) {
          return engine.name;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Add a custom search engine configuration
   */
  addEngine(config: SearchEngineConfig): void {
    // Check if engine already exists
    const existingIndex = this.engines.findIndex(e => e.name === config.name);
    if (existingIndex >= 0) {
      this.engines[existingIndex] = config;
    } else {
      this.engines.push(config);
    }
  }

  /**
   * Remove a search engine configuration
   */
  removeEngine(name: SearchEngine): boolean {
    const index = this.engines.findIndex(e => e.name === name);
    if (index >= 0) {
      this.engines.splice(index, 1);
      return true;
    }
    return false;
  }
}

// Singleton instance
export const searchExtractor = new SearchExtractor();

/**
 * Convenience function to extract search query from URL
 */
export function extractSearchQuery(url: string): SearchQueryResult | null {
  return searchExtractor.extractQuery(url);
}

/**
 * Convenience function to check if URL is from a search engine
 */
export function isSearchEngineUrl(url: string): boolean {
  return searchExtractor.isSearchEngineUrl(url);
}
