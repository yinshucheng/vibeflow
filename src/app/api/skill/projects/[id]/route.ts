/**
 * /api/skill/projects/[id]
 * GET — Project details
 * PUT — Update project
 */

import { NextRequest } from 'next/server';
import { authenticateRequest, resolveAuth, unauthorizedResponse, serviceResultResponse, errorResponse } from '@/lib/skill-auth';
import { projectService } from '@/services/project.service';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = resolveAuth(await authenticateRequest(req, 'read'));
  if (error) return error;

  try {
    const { id } = await params;
    const result = await projectService.getById(id, user.userId);
    return serviceResultResponse(result);
  } catch (error) {
    console.error('[Skill API] GET /projects/[id] error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to get project', 500);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = resolveAuth(await authenticateRequest(req, 'write'));
  if (error) return error;

  try {
    const { id } = await params;
    const body = await req.json();
    const result = await projectService.update(id, user.userId, body);
    return serviceResultResponse(result);
  } catch (error) {
    console.error('[Skill API] PUT /projects/[id] error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to update project', 500);
  }
}
