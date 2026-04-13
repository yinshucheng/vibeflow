/**
 * /api/skill/projects
 * GET  — List projects
 * POST — Create a project
 */

import { NextRequest } from 'next/server';
import { authenticateRequest, unauthorizedResponse, serviceResultResponse, errorResponse } from '@/lib/skill-auth';
import { projectService } from '@/services/project.service';

export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req, 'read');
  if (!user) return unauthorizedResponse();

  try {
    const result = await projectService.getByUser(user.userId);
    return serviceResultResponse(result);
  } catch (error) {
    console.error('[Skill API] GET /projects error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to list projects', 500);
  }
}

export async function POST(req: NextRequest) {
  const user = await authenticateRequest(req, 'write');
  if (!user) return unauthorizedResponse();

  try {
    const body = await req.json();
    const result = await projectService.create(user.userId, body);
    return serviceResultResponse(result);
  } catch (error) {
    console.error('[Skill API] POST /projects error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to create project', 500);
  }
}
