'use client';

/**
 * ConnectedDevices Component
 * 
 * Displays a list of connected client devices and their status.
 * Allows users to view and revoke connected devices.
 * 
 * Requirements: 9.3, 9.5
 */

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui';
import { Card, CardHeader, CardContent } from '@/components/layout';

// Client type display configuration
const CLIENT_TYPE_CONFIG: Record<string, { icon: string; label: string; description: string }> = {
  web: {
    icon: '🌐',
    label: 'Web Browser',
    description: 'VibeFlow web application',
  },
  desktop: {
    icon: '💻',
    label: 'Desktop App',
    description: 'VibeFlow desktop application (Electron)',
  },
  browser_ext: {
    icon: '🧩',
    label: 'Browser Extension',
    description: 'Browser Sentinel extension',
  },
  mobile: {
    icon: '📱',
    label: 'Mobile App',
    description: 'VibeFlow mobile application',
  },
};

// Platform display names
const PLATFORM_NAMES: Record<string, string> = {
  macos: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
  ios: 'iOS',
  android: 'Android',
  chrome: 'Chrome',
  firefox: 'Firefox',
  safari: 'Safari',
  edge: 'Edge',
};

interface ClientItemProps {
  client: {
    clientId: string;
    clientType: string;
    metadata: {
      clientVersion: string;
      platform: string;
      capabilities: string[];
      deviceName?: string;
    };
    status: string;
    lastSeenAt: number;
    registeredAt: number;
  };
  onRevoke: (clientId: string) => void;
  isRevoking: boolean;
}

function ClientItem({ client, onRevoke, isRevoking }: ClientItemProps) {
  const config = CLIENT_TYPE_CONFIG[client.clientType] || {
    icon: '❓',
    label: 'Unknown Device',
    description: 'Unknown client type',
  };
  
  const platformName = PLATFORM_NAMES[client.metadata.platform] || client.metadata.platform;
  const isOnline = client.status === 'online';
  const lastSeen = new Date(client.lastSeenAt);
  const registeredAt = new Date(client.registeredAt);
  
  // Format relative time
  const formatRelativeTime = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    
    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
    if (diffHour < 24) return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
    if (diffDay < 7) return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  return (
    <li className={`p-4 rounded-lg border ${
      isOnline 
        ? 'bg-green-50 border-green-100' 
        : 'bg-gray-50 border-gray-200'
    }`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <span className="text-2xl">{config.icon}</span>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900">
                {client.metadata.deviceName || config.label}
              </span>
              <span className={`px-2 py-0.5 text-xs rounded-full ${
                isOnline 
                  ? 'bg-green-200 text-green-800' 
                  : 'bg-gray-200 text-gray-600'
              }`}>
                {isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {config.description}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              <span>Platform: {platformName}</span>
              <span>Version: {client.metadata.clientVersion}</span>
              <span>Last seen: {formatRelativeTime(lastSeen)}</span>
            </div>
            {client.metadata.capabilities.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {client.metadata.capabilities.slice(0, 5).map((cap) => (
                  <span 
                    key={cap}
                    className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded"
                  >
                    {cap}
                  </span>
                ))}
                {client.metadata.capabilities.length > 5 && (
                  <span className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                    +{client.metadata.capabilities.length - 5} more
                  </span>
                )}
              </div>
            )}
            <p className="mt-2 text-xs text-gray-400">
              Registered: {registeredAt.toLocaleDateString()} {registeredAt.toLocaleTimeString()}
            </p>
          </div>
        </div>
        
        <Button
          onClick={() => onRevoke(client.clientId)}
          disabled={isRevoking}
          variant="secondary"
          size="sm"
          className="text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          {isRevoking ? 'Revoking...' : 'Revoke'}
        </Button>
      </div>
    </li>
  );
}

export function ConnectedDevices() {
  const [revokingClientId, setRevokingClientId] = useState<string | null>(null);
  
  const utils = trpc.useUtils();
  
  const { data: clients, isLoading, error } = trpc.clients.getConnectedClients.useQuery();
  
  const revokeMutation = trpc.clients.revokeClient.useMutation({
    onSuccess: () => {
      // Invalidate the clients query to refresh the list
      utils.clients.getConnectedClients.invalidate();
      setRevokingClientId(null);
    },
    onError: () => {
      setRevokingClientId(null);
    },
  });

  const handleRevoke = (clientId: string) => {
    if (confirm('Are you sure you want to revoke this device? It will need to reconnect and re-authenticate.')) {
      setRevokingClientId(clientId);
      revokeMutation.mutate({ clientId });
    }
  };

  // Group clients by type
  const groupedClients = clients?.reduce((acc, client) => {
    const type = client.clientType;
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type].push(client);
    return acc;
  }, {} as Record<string, typeof clients>);

  // Count online clients
  const onlineCount = clients?.filter(c => c.status === 'online').length ?? 0;
  const totalCount = clients?.length ?? 0;

  if (isLoading) {
    return (
      <Card>
        <CardHeader 
          title="📱 Connected Devices" 
          description="Manage devices connected to your VibeFlow account"
        />
        <CardContent>
          <div className="py-8 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-500">Loading connected devices...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader 
          title="📱 Connected Devices" 
          description="Manage devices connected to your VibeFlow account"
        />
        <CardContent>
          <div className="py-8 text-center">
            <span className="text-4xl block mb-4">⚠️</span>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Failed to Load Devices</h3>
            <p className="text-gray-500">{error.message}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Banner */}
      <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg">
        <div className="flex gap-3">
          <span className="text-xl">📊</span>
          <div>
            <h3 className="text-sm font-medium text-blue-900">Device Summary</h3>
            <p className="mt-1 text-sm text-blue-700">
              <strong>{onlineCount}</strong> of <strong>{totalCount}</strong> device{totalCount !== 1 ? 's' : ''} currently online.
              All devices share the same state and receive real-time updates.
            </p>
          </div>
        </div>
      </div>

      {/* Revoke Error */}
      {revokeMutation.error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-lg">
          <div className="flex gap-3">
            <span className="text-xl">❌</span>
            <div>
              <h3 className="text-sm font-medium text-red-900">Failed to Revoke Device</h3>
              <p className="mt-1 text-sm text-red-700">{revokeMutation.error.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* No Devices */}
      {(!clients || clients.length === 0) && (
        <Card>
          <CardHeader 
            title="📱 Connected Devices" 
            description="Manage devices connected to your VibeFlow account"
          />
          <CardContent>
            <div className="py-8 text-center">
              <span className="text-4xl block mb-4">📵</span>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Devices Connected</h3>
              <p className="text-gray-500 max-w-md mx-auto">
                Connect the VibeFlow desktop app, browser extension, or mobile app to see them here.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Devices by Type */}
      {groupedClients && Object.entries(groupedClients).map(([type, typeClients]) => {
        const config = CLIENT_TYPE_CONFIG[type] || {
          icon: '❓',
          label: 'Unknown Devices',
          description: '',
        };
        
        return (
          <Card key={type}>
            <CardHeader 
              title={`${config.icon} ${config.label}s`}
              description={`${typeClients?.length ?? 0} device${(typeClients?.length ?? 0) !== 1 ? 's' : ''} registered`}
            />
            <CardContent>
              <ul className="space-y-3">
                {typeClients?.map((client) => (
                  <ClientItem
                    key={client.clientId}
                    client={client}
                    onRevoke={handleRevoke}
                    isRevoking={revokingClientId === client.clientId}
                  />
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })}

      {/* Info Section */}
      <div className="p-4 bg-gray-50 rounded-lg">
        <h4 className="text-sm font-medium text-gray-700 mb-3">About Connected Devices</h4>
        <div className="space-y-2 text-sm text-gray-600">
          <p>
            <strong>Revoking a device</strong> will disconnect it and require re-authentication.
            Use this if you&apos;ve lost access to a device or suspect unauthorized access.
          </p>
          <p>
            <strong>Offline devices</strong> will automatically reconnect when they come back online.
            They will receive any state changes that occurred while offline.
          </p>
        </div>
      </div>
    </div>
  );
}
