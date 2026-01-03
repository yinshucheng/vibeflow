'use client';

/**
 * EntertainmentSitesSettings Component
 * 
 * Manages entertainment site blacklist and whitelist for Browser Sentinel.
 * Shows preset sites with badges and allows custom entries.
 * Settings can only be modified outside work hours.
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 7.11, 7.12
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui';
import { Card, CardHeader, CardContent } from '@/components/layout';
import { trpc } from '@/lib/trpc';

// ============================================================================
// Types
// ============================================================================

interface EntertainmentBlacklistEntry {
  domain: string;
  isPreset: boolean;
  enabled: boolean;
  addedAt: number;
}

interface EntertainmentWhitelistEntry {
  pattern: string;
  description?: string;
  isPreset: boolean;
  enabled: boolean;
  addedAt: number;
}

// ============================================================================
// Constants - Preset Lists
// ============================================================================

const PRESET_BLACKLIST_DOMAINS = [
  'twitter.com',
  'x.com',
  'weibo.com',
  'youtube.com',
  'bilibili.com',
  'tiktok.com',
  'douyin.com',
  'instagram.com',
  'facebook.com',
  'reddit.com',
  'twitch.tv',
];

const PRESET_WHITELIST_PATTERNS = [
  'weibo.com/fav/*',
  'twitter.com/i/bookmarks',
  'bilibili.com/video/*',
  'bilibili.com/search/*',
];

// ============================================================================
// Helper Functions
// ============================================================================

function initializeBlacklist(existing: EntertainmentBlacklistEntry[] | undefined): EntertainmentBlacklistEntry[] {
  const existingDomains = new Set((existing || []).map(e => e.domain));
  
  // Start with preset entries
  const presetEntries: EntertainmentBlacklistEntry[] = PRESET_BLACKLIST_DOMAINS.map(domain => {
    const existingEntry = (existing || []).find(e => e.domain === domain);
    return existingEntry || {
      domain,
      isPreset: true,
      enabled: true,
      addedAt: Date.now(),
    };
  });
  
  // Add custom entries (non-preset)
  const customEntries = (existing || []).filter(e => !PRESET_BLACKLIST_DOMAINS.includes(e.domain));
  
  return [...presetEntries, ...customEntries];
}

function initializeWhitelist(existing: EntertainmentWhitelistEntry[] | undefined): EntertainmentWhitelistEntry[] {
  const existingPatterns = new Set((existing || []).map(e => e.pattern));
  
  // Start with preset entries
  const presetEntries: EntertainmentWhitelistEntry[] = PRESET_WHITELIST_PATTERNS.map(pattern => {
    const existingEntry = (existing || []).find(e => e.pattern === pattern);
    return existingEntry || {
      pattern,
      isPreset: true,
      enabled: true,
      addedAt: Date.now(),
    };
  });
  
  // Add custom entries (non-preset)
  const customEntries = (existing || []).filter(e => !PRESET_WHITELIST_PATTERNS.includes(e.pattern));
  
  return [...presetEntries, ...customEntries];
}

// ============================================================================
// Sub-Components
// ============================================================================

interface BlacklistSectionProps {
  entries: EntertainmentBlacklistEntry[];
  onToggle: (domain: string) => void;
  onAdd: (domain: string) => void;
  onRemove: (domain: string) => void;
  isLoading: boolean;
  isDisabled: boolean;
}

function BlacklistSection({ entries, onToggle, onAdd, onRemove, isLoading, isDisabled }: BlacklistSectionProps) {
  const [newDomain, setNewDomain] = useState('');
  const [error, setError] = useState('');

  const validateDomain = (domain: string): string | null => {
    if (!domain.trim()) {
      return '域名不能为空';
    }
    if (domain.length > 253) {
      return '域名过长（最多253个字符）';
    }
    if (entries.some(e => e.domain.toLowerCase() === domain.toLowerCase())) {
      return '该域名已存在';
    }
    // Basic domain validation
    const domainPattern = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/;
    if (!domainPattern.test(domain.trim())) {
      return '无效的域名格式';
    }
    return null;
  };

  const handleAdd = () => {
    const trimmed = newDomain.trim().toLowerCase();
    const validationError = validateDomain(trimmed);
    
    if (validationError) {
      setError(validationError);
      return;
    }

    onAdd(trimmed);
    setNewDomain('');
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
      <CardHeader 
        title="🚫 娱乐网站黑名单" 
        description="工作时间内将被屏蔽的娱乐网站域名" 
      />
      <CardContent className="space-y-4">
        {/* Add Domain Input */}
        <div className="flex gap-2">
          <div className="flex-1">
            <input
              type="text"
              value={newDomain}
              onChange={(e) => {
                setNewDomain(e.target.value);
                setError('');
              }}
              onKeyDown={handleKeyDown}
              placeholder="例如: example.com"
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                error ? 'border-red-300' : 'border-gray-300'
              } ${isDisabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
              disabled={isLoading || isDisabled}
            />
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
          </div>
          <Button
            onClick={handleAdd}
            disabled={isLoading || isDisabled || !newDomain.trim()}
            size="md"
          >
            添加
          </Button>
        </div>

        {/* Domain List */}
        {entries.length === 0 ? (
          <div className="py-8 text-center text-gray-500">
            <span className="text-2xl block mb-2">📋</span>
            <p className="text-sm">暂无黑名单网站</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {entries.map((entry) => (
              <li
                key={entry.domain}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  entry.enabled 
                    ? 'bg-red-50 border-red-100' 
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex items-center gap-2 flex-1">
                  {/* Toggle Switch */}
                  <button
                    onClick={() => onToggle(entry.domain)}
                    disabled={isLoading || isDisabled}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      entry.enabled ? 'bg-red-500' : 'bg-gray-300'
                    } ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        entry.enabled ? 'translate-x-4' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  
                  <code className={`text-sm font-mono ${entry.enabled ? 'text-gray-800' : 'text-gray-400'}`}>
                    {entry.domain}
                  </code>
                  
                  {entry.isPreset && (
                    <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                      预设
                    </span>
                  )}
                </div>
                
                {/* Remove button (only for custom entries) */}
                {!entry.isPreset && (
                  <button
                    onClick={() => onRemove(entry.domain)}
                    disabled={isLoading || isDisabled}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                    title="删除"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

interface WhitelistSectionProps {
  entries: EntertainmentWhitelistEntry[];
  onToggle: (pattern: string) => void;
  onAdd: (pattern: string, description?: string) => void;
  onRemove: (pattern: string) => void;
  isLoading: boolean;
  isDisabled: boolean;
}

function WhitelistSection({ entries, onToggle, onAdd, onRemove, isLoading, isDisabled }: WhitelistSectionProps) {
  const [newPattern, setNewPattern] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [error, setError] = useState('');

  const validatePattern = (pattern: string): string | null => {
    if (!pattern.trim()) {
      return 'URL 模式不能为空';
    }
    if (pattern.length > 500) {
      return 'URL 模式过长（最多500个字符）';
    }
    if (entries.some(e => e.pattern.toLowerCase() === pattern.toLowerCase())) {
      return '该模式已存在';
    }
    return null;
  };

  const handleAdd = () => {
    const trimmed = newPattern.trim().toLowerCase();
    const validationError = validatePattern(trimmed);
    
    if (validationError) {
      setError(validationError);
      return;
    }

    onAdd(trimmed, newDescription.trim() || undefined);
    setNewPattern('');
    setNewDescription('');
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
      <CardHeader 
        title="✅ 娱乐网站白名单" 
        description="即使域名在黑名单中，这些特定页面仍可访问" 
      />
      <CardContent className="space-y-4">
        {/* Add Pattern Input */}
        <div className="space-y-2">
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
                placeholder="例如: weibo.com/fav/*"
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  error ? 'border-red-300' : 'border-gray-300'
                } ${isDisabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                disabled={isLoading || isDisabled}
              />
              {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
            </div>
            <Button
              onClick={handleAdd}
              disabled={isLoading || isDisabled || !newPattern.trim()}
              size="md"
            >
              添加
            </Button>
          </div>
          <input
            type="text"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="备注（可选）"
            className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              isDisabled ? 'bg-gray-100 cursor-not-allowed' : ''
            }`}
            disabled={isLoading || isDisabled}
          />
        </div>

        {/* Pattern List */}
        {entries.length === 0 ? (
          <div className="py-8 text-center text-gray-500">
            <span className="text-2xl block mb-2">📋</span>
            <p className="text-sm">暂无白名单模式</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {entries.map((entry) => (
              <li
                key={entry.pattern}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  entry.enabled 
                    ? 'bg-green-50 border-green-100' 
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {/* Toggle Switch */}
                  <button
                    onClick={() => onToggle(entry.pattern)}
                    disabled={isLoading || isDisabled}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${
                      entry.enabled ? 'bg-green-500' : 'bg-gray-300'
                    } ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        entry.enabled ? 'translate-x-4' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  
                  <div className="min-w-0 flex-1">
                    <code className={`text-sm font-mono block truncate ${entry.enabled ? 'text-gray-800' : 'text-gray-400'}`}>
                      {entry.pattern}
                    </code>
                    {entry.description && (
                      <span className="text-xs text-gray-500 block truncate">{entry.description}</span>
                    )}
                  </div>
                  
                  {entry.isPreset && (
                    <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full flex-shrink-0">
                      预设
                    </span>
                  )}
                </div>
                
                {/* Remove button (only for custom entries) */}
                {!entry.isPreset && (
                  <button
                    onClick={() => onRemove(entry.pattern)}
                    disabled={isLoading || isDisabled}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50 flex-shrink-0 ml-2"
                    title="删除"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Pattern Help */}
        <div className="p-3 bg-gray-50 rounded-lg">
          <h4 className="text-xs font-medium text-gray-700 mb-2">URL 模式示例</h4>
          <ul className="text-xs text-gray-500 space-y-1">
            <li><code className="bg-gray-200 px-1 rounded">weibo.com/fav/*</code> - 微博收藏页面</li>
            <li><code className="bg-gray-200 px-1 rounded">twitter.com/i/bookmarks</code> - Twitter 书签</li>
            <li><code className="bg-gray-200 px-1 rounded">bilibili.com/video/*</code> - B站视频页面</li>
            <li><code className="bg-gray-200 px-1 rounded">*.example.com/*</code> - 所有子域名</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function EntertainmentSitesSettings() {
  const utils = trpc.useUtils();
  
  // Fetch entertainment status to check work time
  const { data: entertainmentStatus, isLoading: statusLoading } = trpc.entertainment.getStatus.useQuery();
  
  // Fetch current settings
  const { data: settings, isLoading: settingsLoading } = trpc.settings.get.useQuery();
  
  // Local state for blacklist and whitelist
  const [blacklist, setBlacklist] = useState<EntertainmentBlacklistEntry[]>([]);
  const [whitelist, setWhitelist] = useState<EntertainmentWhitelistEntry[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Initialize lists from settings
  useEffect(() => {
    if (settings) {
      // Type assertion needed as Prisma types may not be fully synced
      const settingsData = settings as {
        entertainmentBlacklist?: EntertainmentBlacklistEntry[];
        entertainmentWhitelist?: EntertainmentWhitelistEntry[];
      };
      
      setBlacklist(initializeBlacklist(settingsData.entertainmentBlacklist));
      setWhitelist(initializeWhitelist(settingsData.entertainmentWhitelist));
    }
  }, [settings]);
  
  // Update settings mutation
  const updateSettings = trpc.entertainment.updateSettings.useMutation({
    onSuccess: () => {
      utils.settings.get.invalidate();
      utils.entertainment.getStatus.invalidate();
      setHasChanges(false);
    },
  });
  
  const isLoading = statusLoading || settingsLoading || updateSettings.isPending;
  const isWithinWorkTime = entertainmentStatus?.isWithinWorkTime ?? false;
  const isDisabled = isWithinWorkTime;
  
  // Handlers for blacklist
  const handleBlacklistToggle = (domain: string) => {
    setBlacklist(prev => prev.map(entry => 
      entry.domain === domain ? { ...entry, enabled: !entry.enabled } : entry
    ));
    setHasChanges(true);
  };
  
  const handleBlacklistAdd = (domain: string) => {
    const newEntry: EntertainmentBlacklistEntry = {
      domain,
      isPreset: false,
      enabled: true,
      addedAt: Date.now(),
    };
    setBlacklist(prev => [...prev, newEntry]);
    setHasChanges(true);
  };
  
  const handleBlacklistRemove = (domain: string) => {
    setBlacklist(prev => prev.filter(entry => entry.domain !== domain));
    setHasChanges(true);
  };
  
  // Handlers for whitelist
  const handleWhitelistToggle = (pattern: string) => {
    setWhitelist(prev => prev.map(entry => 
      entry.pattern === pattern ? { ...entry, enabled: !entry.enabled } : entry
    ));
    setHasChanges(true);
  };
  
  const handleWhitelistAdd = (pattern: string, description?: string) => {
    const newEntry: EntertainmentWhitelistEntry = {
      pattern,
      description,
      isPreset: false,
      enabled: true,
      addedAt: Date.now(),
    };
    setWhitelist(prev => [...prev, newEntry]);
    setHasChanges(true);
  };
  
  const handleWhitelistRemove = (pattern: string) => {
    setWhitelist(prev => prev.filter(entry => entry.pattern !== pattern));
    setHasChanges(true);
  };
  
  // Save changes
  const handleSave = () => {
    updateSettings.mutate({
      entertainmentBlacklist: blacklist,
      entertainmentWhitelist: whitelist,
    });
  };
  
  // Reset changes
  const handleReset = () => {
    if (settings) {
      // Type assertion needed as Prisma types may not be fully synced
      const settingsData = settings as {
        entertainmentBlacklist?: EntertainmentBlacklistEntry[];
        entertainmentWhitelist?: EntertainmentWhitelistEntry[];
      };
      
      setBlacklist(initializeBlacklist(settingsData.entertainmentBlacklist));
      setWhitelist(initializeWhitelist(settingsData.entertainmentWhitelist));
      setHasChanges(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Work Time Restriction Banner */}
      {isWithinWorkTime && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <h3 className="text-sm font-medium text-yellow-900">工作时间内无法修改</h3>
              <p className="mt-1 text-sm text-yellow-700">
                娱乐网站设置只能在非工作时间修改。请在工作时间结束后再进行调整。
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Info Banner */}
      <div className="p-4 bg-purple-50 border border-purple-100 rounded-lg">
        <div className="flex gap-3">
          <span className="text-xl">🎮</span>
          <div>
            <h3 className="text-sm font-medium text-purple-900">娱乐网站管理</h3>
            <p className="mt-1 text-sm text-purple-700">
              黑名单中的网站在工作时间内会被屏蔽。白名单中的特定页面即使域名在黑名单中也可以访问。
              开启娱乐模式后，所有娱乐网站都可以访问。
            </p>
          </div>
        </div>
      </div>

      {/* Blacklist Section */}
      <BlacklistSection
        entries={blacklist}
        onToggle={handleBlacklistToggle}
        onAdd={handleBlacklistAdd}
        onRemove={handleBlacklistRemove}
        isLoading={isLoading}
        isDisabled={isDisabled}
      />

      {/* Whitelist Section */}
      <WhitelistSection
        entries={whitelist}
        onToggle={handleWhitelistToggle}
        onAdd={handleWhitelistAdd}
        onRemove={handleWhitelistRemove}
        isLoading={isLoading}
        isDisabled={isDisabled}
      />
      
      {/* Save/Reset Buttons */}
      {hasChanges && !isDisabled && (
        <div className="flex gap-3 justify-end">
          <Button
            onClick={handleReset}
            disabled={isLoading}
            variant="secondary"
          >
            取消
          </Button>
          <Button
            onClick={handleSave}
            disabled={isLoading}
          >
            {updateSettings.isPending ? '保存中...' : '保存更改'}
          </Button>
        </div>
      )}
      
      {/* Error Display */}
      {updateSettings.error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">
            {updateSettings.error.message}
          </p>
        </div>
      )}
    </div>
  );
}
