'use client';

/**
 * MCPIndicator Component
 * 
 * Displays MCP connection status indicator.
 * Requirements: 9.8 - Display "🧠 [Agent Name] is syncing context..." indicator
 */

import { useState, useEffect } from 'react';

export type MCPConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'syncing';

interface MCPIndicatorProps {
  status?: MCPConnectionStatus;
  agentName?: string;
  showLabel?: boolean;
}

const statusConfig: Record<MCPConnectionStatus, { 
  icon: string; 
  label: string; 
  color: string;
  pulse: boolean;
}> = {
  disconnected: {
    icon: '🔌',
    label: 'MCP Disconnected',
    color: 'text-gray-400',
    pulse: false,
  },
  connecting: {
    icon: '🔄',
    label: 'Connecting...',
    color: 'text-yellow-500',
    pulse: true,
  },
  connected: {
    icon: '🧠',
    label: 'MCP Connected',
    color: 'text-green-500',
    pulse: false,
  },
  syncing: {
    icon: '🧠',
    label: 'Syncing context...',
    color: 'text-blue-500',
    pulse: true,
  },
};

export function MCPIndicator({ 
  status = 'disconnected', 
  agentName,
  showLabel = true 
}: MCPIndicatorProps) {
  const config = statusConfig[status];
  
  const label = status === 'syncing' && agentName 
    ? `${agentName} is syncing context...`
    : config.label;
  
  return (
    <div 
      className={`
        inline-flex items-center gap-1.5 text-sm
        ${config.color}
        ${config.pulse ? 'animate-pulse' : ''}
      `}
      title={label}
    >
      <span>{config.icon}</span>
      {showLabel && <span className="hidden sm:inline">{label}</span>}
    </div>
  );
}

/**
 * MCPIndicatorWithPolling - Auto-updates MCP status
 * This is a placeholder that will be connected to actual MCP status later
 */
export function MCPIndicatorWithPolling() {
  const [status, setStatus] = useState<MCPConnectionStatus>('disconnected');
  const [agentName, setAgentName] = useState<string | undefined>();

  // Placeholder: In production, this would poll or subscribe to MCP status
  useEffect(() => {
    // For now, just show disconnected
    // This will be connected to actual MCP server status in Task 9
    setStatus('disconnected');
    setAgentName(undefined);
  }, []);

  return <MCPIndicator status={status} agentName={agentName} />;
}
