'use client';

/**
 * UrlListSettings Component
 * 
 * Manages blacklist and whitelist URL patterns for Browser Sentinel.
 * Requirements: 13.1, 6.3
 */

import { useState } from 'react';
import { Button } from '@/components/ui';
import { Card, CardHeader, CardContent } from '@/components/layout';
import { trpc } from '@/lib/trpc';

type ListType = 'blacklist' | 'whitelist';

interface UrlListProps {
  type: ListType;
  patterns: string[];
  onAdd: (pattern: string) => void;
  onRemove: (pattern: string) => void;
  isLoading: boolean;
}

function UrlList({ type, patterns, onAdd, onRemove, isLoading }: UrlListProps) {
  const [newPattern, setNewPattern] = useState('');
  const [error, setError] = useState('');

  const config = {
    blacklist: {
      title: '🚫 Blacklist',
      description: 'Sites blocked during focus mode',
      placeholder: 'e.g., twitter.com, reddit.com, *.youtube.com',
      emptyText: 'No blocked sites yet',
      addText: 'Block Site',
      color: 'red',
    },
    whitelist: {
      title: '✅ Whitelist',
      description: 'Sites always allowed during focus mode',
      placeholder: 'e.g., github.com, docs.*, stackoverflow.com',
      emptyText: 'No allowed sites yet',
      addText: 'Allow Site',
      color: 'green',
    },
  }[type];

  const validatePattern = (pattern: string): string | null => {
    if (!pattern.trim()) {
      return 'Pattern cannot be empty';
    }
    if (pattern.length > 500) {
      return 'Pattern is too long (max 500 characters)';
    }
    if (patterns.includes(pattern.trim())) {
      return 'Pattern already exists';
    }
    // Basic URL pattern validation
    const validPattern = /^[\w\-.*]+(\.[a-z]{2,})?$/i;
    if (!validPattern.test(pattern.trim()) && !pattern.includes('/')) {
      return 'Invalid URL pattern format';
    }
    return null;
  };

  const handleAdd = () => {
    const trimmed = newPattern.trim();
    const validationError = validatePattern(trimmed);
    
    if (validationError) {
      setError(validationError);
      return;
    }

    onAdd(trimmed);
    setNewPattern('');
    setError('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <Card>
      <CardHeader title={config.title} description={config.description} />
      <CardContent className="space-y-4">
        {/* Add Pattern Input */}
        <div className="flex gap-2">
          <div className="flex-1">
            <input
              type="text"
              value={newPattern}
              onChange={(e) => {
                setNewPattern(e.target.value);
                setError('');
              }}
              onKeyDown={handleKeyDown}
              placeholder={config.placeholder}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                error ? 'border-red-300' : 'border-gray-300'
              }`}
              disabled={isLoading}
            />
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
          </div>
          <Button
            onClick={handleAdd}
            disabled={isLoading || !newPattern.trim()}
            size="md"
          >
            {config.addText}
          </Button>
        </div>

        {/* Pattern List */}
        {patterns.length === 0 ? (
          <div className="py-8 text-center text-gray-500">
            <span className="text-2xl block mb-2">{type === 'blacklist' ? '🔓' : '📋'}</span>
            <p className="text-sm">{config.emptyText}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {patterns.map((pattern) => (
              <li
                key={pattern}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  type === 'blacklist' 
                    ? 'bg-red-50 border-red-100' 
                    : 'bg-green-50 border-green-100'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">{type === 'blacklist' ? '🚫' : '✅'}</span>
                  <code className="text-sm font-mono text-gray-800">{pattern}</code>
                </div>
                <button
                  onClick={() => onRemove(pattern)}
                  disabled={isLoading}
                  className="p-1 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                  title="Remove pattern"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Pattern Help */}
        <div className="p-3 bg-gray-50 rounded-lg">
          <h4 className="text-xs font-medium text-gray-700 mb-2">Pattern Examples</h4>
          <ul className="text-xs text-gray-500 space-y-1">
            <li><code className="bg-gray-200 px-1 rounded">twitter.com</code> - Exact domain match</li>
            <li><code className="bg-gray-200 px-1 rounded">*.youtube.com</code> - All YouTube subdomains</li>
            <li><code className="bg-gray-200 px-1 rounded">reddit.com/*</code> - All Reddit pages</li>
            <li><code className="bg-gray-200 px-1 rounded">docs.*</code> - Any docs subdomain</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

export function UrlListSettings() {
  const utils = trpc.useUtils();

  // Fetch current lists
  const { data: blacklist = [], isLoading: blacklistLoading } = trpc.settings.getBlacklist.useQuery();
  const { data: whitelist = [], isLoading: whitelistLoading } = trpc.settings.getWhitelist.useQuery();

  // Mutations for blacklist
  const addToBlacklist = trpc.settings.addToBlacklist.useMutation({
    onSuccess: () => {
      utils.settings.getBlacklist.invalidate();
    },
  });

  const removeFromBlacklist = trpc.settings.removeFromBlacklist.useMutation({
    onSuccess: () => {
      utils.settings.getBlacklist.invalidate();
    },
  });

  // Mutations for whitelist
  const addToWhitelist = trpc.settings.addToWhitelist.useMutation({
    onSuccess: () => {
      utils.settings.getWhitelist.invalidate();
    },
  });

  const removeFromWhitelist = trpc.settings.removeFromWhitelist.useMutation({
    onSuccess: () => {
      utils.settings.getWhitelist.invalidate();
    },
  });

  const isBlacklistLoading = blacklistLoading || addToBlacklist.isPending || removeFromBlacklist.isPending;
  const isWhitelistLoading = whitelistLoading || addToWhitelist.isPending || removeFromWhitelist.isPending;

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg">
        <div className="flex gap-3">
          <span className="text-xl">💡</span>
          <div>
            <h3 className="text-sm font-medium text-blue-900">How URL Filtering Works</h3>
            <p className="mt-1 text-sm text-blue-700">
              During <strong>Focus Mode</strong>, blacklisted sites are blocked and whitelisted sites are always allowed.
              Sites not in either list will trigger a soft intervention asking if the visit is work-related.
            </p>
          </div>
        </div>
      </div>

      {/* Blacklist */}
      <UrlList
        type="blacklist"
        patterns={blacklist}
        onAdd={(pattern) => addToBlacklist.mutate({ pattern })}
        onRemove={(pattern) => removeFromBlacklist.mutate({ pattern })}
        isLoading={isBlacklistLoading}
      />

      {/* Whitelist */}
      <UrlList
        type="whitelist"
        patterns={whitelist}
        onAdd={(pattern) => addToWhitelist.mutate({ pattern })}
        onRemove={(pattern) => removeFromWhitelist.mutate({ pattern })}
        isLoading={isWhitelistLoading}
      />
    </div>
  );
}
