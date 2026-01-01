/**
 * Health Check API Endpoint
 * 
 * Used by desktop and browser clients to verify server availability
 * before establishing WebSocket connections.
 */

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: Date.now(),
    version: '1.0.0',
  });
}

// Also support HEAD requests for lightweight health checks
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
