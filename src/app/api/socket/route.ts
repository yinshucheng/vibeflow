/**
 * Socket.io API Route
 * 
 * This route handles WebSocket upgrade requests for Socket.io.
 * In Next.js App Router, we need a custom server setup for Socket.io.
 * This route provides a health check and connection info endpoint.
 * 
 * Requirements: 6.7
 */

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Socket.io endpoint. Connect via WebSocket.',
    info: {
      transport: ['websocket', 'polling'],
      path: '/api/socket',
    },
  });
}

export async function POST() {
  return NextResponse.json({
    success: false,
    error: {
      code: 'METHOD_NOT_ALLOWED',
      message: 'Use WebSocket connection for Socket.io',
    },
  }, { status: 405 });
}
