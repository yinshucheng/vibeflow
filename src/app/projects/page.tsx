'use client';

/**
 * Projects List Page
 *
 * Notion-style project management with status filtering.
 * Requirements: 1.3, 21.4
 */

import { useState } from 'react';
import Link from 'next/link';
import { MainLayout, PageHeader, Card, CardContent, EmptyState } from '@/components/layout';
import { Button } from '@/components/ui';
import { Icons } from '@/lib/icons';
import { trpc } from '@/lib/trpc';
import type { Project, ProjectStatus, Goal, ProjectGoal } from '@prisma/client';

type StatusFilter = 'ALL' | ProjectStatus;

type ProjectWithGoals = Project & {
  goals?: (ProjectGoal & { goal: Goal })[];
};

// Project estimation interface (Requirements: 21.4)
interface ProjectEstimation {
  projectId: string;
  totalEstimatedMinutes: number;
  totalEstimatedPomodoros: number;
  completedMinutes: number;
  completedPomodoros: number;
  remainingMinutes: number;
  remainingPomodoros: number;
  taskCount: number;
  tasksWithEstimates: number;
  completionPercentage: number;
}

const statusConfig: Record<
  ProjectStatus,
  { label: string; icon: keyof typeof Icons; colorClass: string }
> = {
  ACTIVE: {
    label: 'Active',
    icon: 'play',
    colorClass: 'bg-notion-accent-green-bg text-notion-accent-green',
  },
  COMPLETED: {
    label: 'Completed',
    icon: 'check',
    colorClass: 'bg-notion-accent-blue-bg text-notion-accent-blue',
  },
  ARCHIVED: {
    label: 'Archived',
    icon: 'projects',
    colorClass: 'bg-notion-bg-tertiary text-notion-text-tertiary',
  },
};

export default function ProjectsPage() {
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const { data: projects, isLoading } = trpc.project.list.useQuery();

  // Get user settings for pomodoro duration (Requirements: 21.4)
  const { data: settings } = trpc.settings.get.useQuery();
  const pomodoroDuration = settings?.pomodoroDuration ?? 25;

  const filteredProjects =
    (projects as ProjectWithGoals[] | undefined)?.filter(
      (p: ProjectWithGoals) => filter === 'ALL' || p.status === filter
    ) ?? [];

  const groupedProjects = {
    ACTIVE: filteredProjects.filter((p: ProjectWithGoals) => p.status === 'ACTIVE'),
    COMPLETED: filteredProjects.filter((p: ProjectWithGoals) => p.status === 'COMPLETED'),
    ARCHIVED: filteredProjects.filter((p: ProjectWithGoals) => p.status === 'ARCHIVED'),
  };

  const PlusIcon = Icons.plus;
  const ProjectIcon = Icons.projects;

  return (
    <MainLayout title="Projects">
      <PageHeader
        title="Projects"
        description="Manage your projects and deliverables"
        actions={
          <Link href="/projects/new">
            <Button>
              <PlusIcon className="w-4 h-4" />
              New Project
            </Button>
          </Link>
        }
      />

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        <button
          onClick={() => setFilter('ALL')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-notion-md text-sm font-medium whitespace-nowrap transition-colors ${
            filter === 'ALL'
              ? 'bg-notion-accent-blue-bg text-notion-accent-blue'
              : 'bg-notion-bg-tertiary text-notion-text-secondary hover:bg-notion-bg-hover'
          }`}
        >
          All ({projects?.length ?? 0})
        </button>
        {(Object.keys(statusConfig) as ProjectStatus[]).map((status) => {
          const config = statusConfig[status];
          const StatusIcon = Icons[config.icon];
          return (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-notion-md text-sm font-medium whitespace-nowrap transition-colors ${
                filter === status
                  ? config.colorClass
                  : 'bg-notion-bg-tertiary text-notion-text-secondary hover:bg-notion-bg-hover'
              }`}
            >
              <StatusIcon className="w-3.5 h-3.5" />
              {config.label} (
              {(projects as ProjectWithGoals[] | undefined)?.filter(
                (p: ProjectWithGoals) => p.status === status
              ).length ?? 0}
              )
            </button>
          );
        })}
      </div>

      {/* Projects List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse h-24 bg-notion-bg-tertiary rounded-notion-lg" />
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<ProjectIcon className="w-8 h-8" />}
              title="No Projects Found"
              description={
                filter === 'ALL'
                  ? 'Create your first project to get started'
                  : `No ${filter.toLowerCase()} projects`
              }
              action={
                filter === 'ALL' && (
                  <Link href="/projects/new">
                    <Button>Create Project</Button>
                  </Link>
                )
              }
            />
          </CardContent>
        </Card>
      ) : filter === 'ALL' ? (
        // Grouped view when showing all
        <div className="space-y-8">
          {(Object.keys(groupedProjects) as ProjectStatus[]).map((status) => {
            const statusProjects = groupedProjects[status];
            if (statusProjects.length === 0) return null;
            const config = statusConfig[status];
            const StatusIcon = Icons[config.icon];

            return (
              <div key={status}>
                <h2 className="text-lg font-semibold text-notion-text mb-3 flex items-center gap-2">
                  <StatusIcon className="w-4 h-4" />
                  {config.label}
                  <span className="text-sm font-normal text-notion-text-tertiary">
                    ({statusProjects.length})
                  </span>
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {statusProjects.map((project: ProjectWithGoals) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      pomodoroDuration={pomodoroDuration}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // Flat view when filtered
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project: ProjectWithGoals) => (
            <ProjectCard key={project.id} project={project} pomodoroDuration={pomodoroDuration} />
          ))}
        </div>
      )}
    </MainLayout>
  );
}

interface ProjectCardProps {
  project: ProjectWithGoals;
  pomodoroDuration: number;
}

function ProjectCard({ project, pomodoroDuration }: ProjectCardProps) {
  const config = statusConfig[project.status];

  // Get project estimation (Requirements: 21.4)
  const { data: estimation } = trpc.project.getProjectEstimation.useQuery(
    { id: project.id, pomodoroDuration },
    { enabled: !!project.id }
  );

  const TimerIcon = Icons.pomodoro;
  const GoalIcon = Icons.goals;

  return (
    <Link href={`/projects/${project.id}`}>
      <Card className="h-full hover:shadow-notion-md transition-shadow cursor-pointer">
        <CardContent>
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="font-medium text-notion-text line-clamp-1">{project.title}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-notion-sm ${config.colorClass}`}>
              {config.label}
            </span>
          </div>
          <p className="text-sm text-notion-text-secondary line-clamp-2 mb-3">
            {project.deliverable}
          </p>

          {/* Time Estimation (Requirements: 21.4) */}
          {estimation && estimation.totalEstimatedMinutes > 0 && (
            <div className="mb-3">
              <div className="flex items-center justify-between text-xs text-notion-text-tertiary mb-1">
                <span className="inline-flex items-center gap-1">
                  <TimerIcon className="w-3 h-3" />
                  {estimation.completedPomodoros}/{estimation.totalEstimatedPomodoros}
                </span>
                <span>{estimation.completionPercentage}%</span>
              </div>
              <div className="w-full bg-notion-bg-tertiary rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all ${
                    estimation.completedMinutes > estimation.totalEstimatedMinutes
                      ? 'bg-notion-accent-red'
                      : 'bg-notion-accent-blue'
                  }`}
                  style={{
                    width: `${Math.min(100, estimation.completionPercentage)}%`,
                  }}
                />
              </div>
            </div>
          )}

          {project.goals && project.goals.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {project.goals.slice(0, 2).map(({ goal }) => (
                <span
                  key={goal.id}
                  className="inline-flex items-center gap-1 text-xs bg-notion-accent-purple-bg text-notion-accent-purple px-2 py-0.5 rounded-notion-sm"
                >
                  <GoalIcon className="w-3 h-3" />
                  {goal.title}
                </span>
              ))}
              {project.goals.length > 2 && (
                <span className="text-xs text-notion-text-tertiary">
                  +{project.goals.length - 2} more
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
