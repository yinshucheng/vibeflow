'use client';

/**
 * GoalProgressCard Component
 * 
 * Displays goal progress with linked projects.
 * Requirements: 11.9
 */

import Link from 'next/link';
import { Card, CardHeader, CardContent } from '@/components/layout';
import { trpc } from '@/lib/trpc';
import type { Goal, GoalStatus, Project, ProjectGoal } from '@prisma/client';

type GoalWithProjects = Goal & {
  projects?: (ProjectGoal & { project: Project })[];
};

interface GoalProgressCardProps {
  goal: GoalWithProjects;
  showDetails?: boolean;
}

export function GoalProgressCard({ goal, showDetails = false }: GoalProgressCardProps) {
  const { data: progress } = trpc.goal.getProgress.useQuery(
    { id: goal.id },
    { enabled: showDetails }
  );

  const linkedProjects = goal.projects ?? [];
  const completedProjects = linkedProjects.filter(p => p.project.status === 'COMPLETED').length;
  const totalProjects = linkedProjects.length;
  const percentage = totalProjects > 0 ? Math.round((completedProjects / totalProjects) * 100) : 0;

  return (
    <Card>
      <CardHeader 
        title="Progress" 
        description={`${completedProjects}/${totalProjects} projects completed`}
      />
      <CardContent>
        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-gray-600">Completion</span>
            <span className="font-medium text-gray-900">{percentage}%</span>
          </div>
          <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 ${
                percentage === 100 ? 'bg-green-500' : 
                percentage >= 50 ? 'bg-blue-500' : 
                'bg-yellow-500'
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

        {/* Linked Projects */}
        {linkedProjects.length > 0 ? (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Linked Projects</h4>
            <ul className="space-y-2">
              {linkedProjects.map(({ project }) => (
                <li key={project.id}>
                  <Link 
                    href={`/projects/${project.id}`}
                    className="flex items-center gap-2 p-2 rounded hover:bg-gray-50"
                  >
                    <span className={`w-2 h-2 rounded-full ${
                      project.status === 'COMPLETED' ? 'bg-green-500' :
                      project.status === 'ACTIVE' ? 'bg-blue-500' :
                      'bg-gray-400'
                    }`} />
                    <span className="text-sm text-gray-900 flex-1">{project.title}</span>
                    <span className="text-xs text-gray-500">
                      {project.status === 'COMPLETED' ? '✓' : project.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            No projects linked to this goal yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * GoalProgressDashboard - Overview of all goals progress
 */
export function GoalProgressDashboard() {
  const { data: goals, isLoading } = trpc.goal.list.useQuery();

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-24 bg-gray-100 rounded" />
        <div className="h-24 bg-gray-100 rounded" />
      </div>
    );
  }

  const typedGoals = (goals ?? []) as GoalWithProjects[];
  const activeGoals = typedGoals.filter(g => g.status === 'ACTIVE');

  if (activeGoals.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <span className="text-4xl mb-2 block">🎯</span>
          <p className="text-gray-500">No active goals</p>
          <Link href="/goals/new" className="text-blue-600 hover:underline text-sm">
            Create your first goal
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {activeGoals.slice(0, 3).map((goal: GoalWithProjects) => {
        const linkedProjects = goal.projects ?? [];
        const completedProjects = linkedProjects.filter(p => p.project.status === 'COMPLETED').length;
        const totalProjects = linkedProjects.length;
        const percentage = totalProjects > 0 ? Math.round((completedProjects / totalProjects) * 100) : 0;

        return (
          <Link key={goal.id} href={`/goals/${goal.id}`}>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="py-3">
                <div className="flex items-center gap-3">
                  <span>{goal.type === 'LONG_TERM' ? '🌟' : '🎯'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-sm truncate">{goal.title}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-500"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500">{percentage}%</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
      {activeGoals.length > 3 && (
        <Link href="/goals" className="block text-center text-sm text-blue-600 hover:underline">
          View all {activeGoals.length} goals →
        </Link>
      )}
    </div>
  );
}
