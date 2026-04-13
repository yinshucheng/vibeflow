'use client';

/**
 * API Keys Settings Component
 *
 * Allows users to create, view, and revoke API keys.
 * Requirements: R7.2, R7.3, R7.4, R7.5, R7.6
 */

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui';
import { Icons } from '@/lib/icons';

type ScopeOption = 'read' | 'write' | 'admin';

const SCOPE_LABELS: Record<ScopeOption, string> = {
  read: '读取',
  write: '读写',
  admin: '管理',
};

const SCOPE_DESCRIPTIONS: Record<ScopeOption, string> = {
  read: '查询任务、项目、状态等',
  write: '创建/修改任务、启动番茄钟等',
  admin: '管理设置、吊销 Key 等',
};

function formatDate(date: Date | string | null): string {
  if (!date) return '—';
  const d = new Date(date);
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelativeTime(date: Date | string | null): string {
  if (!date) return '从未使用';
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin} 分钟前`;
  if (diffHour < 24) return `${diffHour} 小时前`;
  if (diffDay < 30) return `${diffDay} 天前`;
  return formatDate(date);
}

// --- Create Dialog ---

interface CreateDialogProps {
  onClose: () => void;
  onCreated: (token: string, name: string) => void;
}

function CreateApiKeyDialog({ onClose, onCreated }: CreateDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scopes, setScopes] = useState<ScopeOption[]>(['read', 'write']);

  const createMutation = trpc.apiKey.create.useMutation({
    onSuccess: (data) => {
      onCreated(data!.token, data!.tokenInfo.name);
    },
  });

  const toggleScope = (scope: ScopeOption) => {
    setScopes(prev =>
      prev.includes(scope)
        ? prev.filter(s => s !== scope)
        : [...prev, scope]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || scopes.length === 0) return;
    createMutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      scopes,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-notion-bg rounded-notion-lg shadow-notion-lg max-w-md w-full mx-4 border border-notion-border">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-notion-border">
          <h3 className="text-base font-medium text-notion-text">创建 API Key</h3>
          <button onClick={onClose} className="text-notion-text-tertiary hover:text-notion-text">
            <Icons.close className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-notion-text mb-1">
              名称 <span className="text-notion-accent-red">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：MCP Server、Claude Code"
              maxLength={50}
              className="w-full px-3 py-2 text-sm border border-notion-border rounded-notion-md
                         bg-notion-bg text-notion-text placeholder:text-notion-text-tertiary
                         focus:outline-none focus:ring-2 focus:ring-notion-accent-blue focus:border-transparent"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-notion-text mb-1">
              描述
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="可选，说明用途"
              maxLength={200}
              className="w-full px-3 py-2 text-sm border border-notion-border rounded-notion-md
                         bg-notion-bg text-notion-text placeholder:text-notion-text-tertiary
                         focus:outline-none focus:ring-2 focus:ring-notion-accent-blue focus:border-transparent"
            />
          </div>

          {/* Scopes */}
          <div>
            <label className="block text-sm font-medium text-notion-text mb-2">
              权限 <span className="text-notion-accent-red">*</span>
            </label>
            <div className="space-y-2">
              {(Object.keys(SCOPE_LABELS) as ScopeOption[]).map((scope) => (
                <label
                  key={scope}
                  className="flex items-start gap-3 p-2.5 rounded-notion-md border border-notion-border
                             hover:bg-notion-bg-hover cursor-pointer transition-colors duration-fast"
                >
                  <input
                    type="checkbox"
                    checked={scopes.includes(scope)}
                    onChange={() => toggleScope(scope)}
                    className="mt-0.5 rounded"
                  />
                  <div>
                    <span className="text-sm font-medium text-notion-text">
                      {SCOPE_LABELS[scope]}
                    </span>
                    <p className="text-xs text-notion-text-secondary mt-0.5">
                      {SCOPE_DESCRIPTIONS[scope]}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Error */}
          {createMutation.error && (
            <div className="text-sm text-notion-accent-red bg-notion-accent-red/5 px-3 py-2 rounded-notion-md">
              {createMutation.error.message}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={onClose}>
              取消
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || scopes.length === 0}
              isLoading={createMutation.isPending}
            >
              创建
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- Created (Token Display) Dialog ---

interface CreatedDialogProps {
  token: string;
  name: string;
  onClose: () => void;
}

function ApiKeyCreatedDialog({ token, name, onClose }: CreatedDialogProps) {
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      {/* Clicking backdrop does NOT close — user must confirm */}
      <div className="bg-notion-bg rounded-notion-lg shadow-notion-lg max-w-md w-full mx-4 border border-notion-border">
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-notion-border">
          <Icons.check className="w-5 h-5 text-notion-accent-green" />
          <h3 className="text-base font-medium text-notion-text">API Key 已创建</h3>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-notion-text-secondary">
            <strong>{name}</strong> 的 API Key 已生成。请立即复制保存，此 Key <strong>只显示一次</strong>。
          </p>

          {/* Token display */}
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 text-xs bg-notion-bg-secondary border border-notion-border
                             rounded-notion-md font-mono break-all select-all text-notion-text">
              {token}
            </code>
            <Button
              variant={copied ? 'secondary' : 'outline'}
              size="sm"
              onClick={handleCopy}
            >
              {copied ? '已复制' : '复制'}
            </Button>
          </div>

          {/* Security warning */}
          <div className="flex items-start gap-2 px-3 py-2.5 bg-notion-accent-orange/5 border border-notion-accent-orange/20 rounded-notion-md">
            <Icons.alertTriangle className="w-4 h-4 text-notion-accent-orange mt-0.5 shrink-0" />
            <div className="text-xs text-notion-text-secondary space-y-1">
              <p>此 Key 不会再次显示。如果丢失，吊销后重新创建即可。</p>
              <p>如果 Key 泄露，请立即吊销。</p>
            </div>
          </div>

          {/* Confirm checkbox */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-notion-text">我已安全保存此 Key</span>
          </label>

          {/* Action */}
          <div className="flex justify-end">
            <Button
              onClick={onClose}
              disabled={!confirmed}
            >
              完成
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Revoke Dialog ---

interface RevokeDialogProps {
  tokenName: string;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}

function RevokeApiKeyDialog({ tokenName, onConfirm, onCancel, isPending }: RevokeDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-notion-bg rounded-notion-lg shadow-notion-lg max-w-sm w-full mx-4 border border-notion-border">
        <div className="px-5 py-4 space-y-4">
          <div className="flex items-center gap-2">
            <Icons.alertTriangle className="w-5 h-5 text-notion-accent-red" />
            <h3 className="text-base font-medium text-notion-text">吊销 API Key</h3>
          </div>
          <p className="text-sm text-notion-text-secondary">
            确定要吊销 <strong>{tokenName}</strong>？使用此 Key 的所有服务将立即失去访问权限。
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onCancel}>
              取消
            </Button>
            <Button variant="danger" onClick={onConfirm} isLoading={isPending}>
              吊销
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Main Component ---

export function ApiKeysSettings() {
  const [showCreate, setShowCreate] = useState(false);
  const [createdToken, setCreatedToken] = useState<{ token: string; name: string } | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null);

  const utils = trpc.useUtils();
  const { data: keys, isLoading } = trpc.apiKey.list.useQuery();

  const revokeMutation = trpc.apiKey.revoke.useMutation({
    onSuccess: () => {
      setRevokeTarget(null);
      utils.apiKey.list.invalidate();
    },
  });

  const handleCreated = (token: string, name: string) => {
    setShowCreate(false);
    setCreatedToken({ token, name });
    utils.apiKey.list.invalidate();
  };

  const handleCreatedClose = () => {
    setCreatedToken(null);
  };

  const handleRevoke = () => {
    if (!revokeTarget) return;
    revokeMutation.mutate({ tokenId: revokeTarget.id });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-medium text-notion-text">API Keys</h3>
          <p className="text-sm text-notion-text-secondary mt-0.5">
            管理外部服务（MCP、Skill、Agent）的访问令牌
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Icons.plus className="w-3.5 h-3.5" />
          创建
        </Button>
      </div>

      {/* Key list */}
      {isLoading ? (
        <div className="text-sm text-notion-text-tertiary py-8 text-center">
          加载中...
        </div>
      ) : !keys || keys.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-notion-border rounded-notion-lg">
          <Icons.info className="w-8 h-8 text-notion-text-tertiary mx-auto mb-2" />
          <p className="text-sm text-notion-text-secondary">
            还没有 API Key
          </p>
          <p className="text-xs text-notion-text-tertiary mt-1">
            创建一个 Key 来连接 MCP Server 或 Claude Code Skill
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {keys.map((key) => (
            <div
              key={key.id}
              className="flex items-center justify-between px-4 py-3 border border-notion-border
                         rounded-notion-md hover:bg-notion-bg-hover transition-colors duration-fast"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-notion-text truncate">
                    {key.name}
                  </span>
                  <div className="flex gap-1">
                    {key.scopes.map((scope) => (
                      <span
                        key={scope}
                        className="inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded
                                   bg-notion-bg-tertiary text-notion-text-secondary"
                      >
                        {scope}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-notion-text-tertiary">
                  {key.description && (
                    <span className="truncate max-w-[200px]">{key.description}</span>
                  )}
                  <span>创建于 {formatDate(key.createdAt)}</span>
                  <span>最后使用 {formatRelativeTime(key.lastUsedAt)}</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRevokeTarget({ id: key.id, name: key.name })}
                className="text-notion-accent-red hover:text-notion-accent-red shrink-0 ml-2"
              >
                吊销
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Dialogs */}
      {showCreate && (
        <CreateApiKeyDialog
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
      {createdToken && (
        <ApiKeyCreatedDialog
          token={createdToken.token}
          name={createdToken.name}
          onClose={handleCreatedClose}
        />
      )}
      {revokeTarget && (
        <RevokeApiKeyDialog
          tokenName={revokeTarget.name}
          onConfirm={handleRevoke}
          onCancel={() => setRevokeTarget(null)}
          isPending={revokeMutation.isPending}
        />
      )}
    </div>
  );
}
