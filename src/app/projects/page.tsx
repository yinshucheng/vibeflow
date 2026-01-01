'use client';

/**
 * Projects List Page
 * 
 * Displays all projects grouped by status (ACTIVE, COMPLETED, ARCHIVED).
 * Requirements: 1.3, 21.4
 */

import { useState } from 'react';
import Link from 'next/link';
import { MainLayout, PageHeader, Card, CardContent, EmptyState } from '@/components/layout';
import { Button } from '@/components/ui';
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

const statusConfig: Record<ProjectStatus, { label: string; icon: string; color: string }> = {
  ACTIVE: { label: 'Active', icon: '🟢', color: 'bg-green-100 text-green-700' },
  COMPLETED: { label: 'Completed', icon: '✅', color: 'bg-blue-100 text-blue-700' },
  ARCHIVED: { label: 'Archived', icon: '📦', color: 'bg-gray-100 text-gray-500' },
};

export default function ProjectsPage() {
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const { data: projects, isLoading } = trpc.project.list.useQuery();
  
  // Get user settings for pomodoro duration (Requirements: 21.4)
  const { data: settings } = trpc.settings.get.useQuery();
  const pomodoroDuration = settings?.pomodoroDuration ?? 25;

  const filteredProjects = (projects as ProjectWithGoals[] | undefined)?.filter((p: ProjectWithGoals) => 
    filter === 'ALL' || p.status === filter
  ) ?? [];

  const groupedProjects = {
    ACTIVE: filteredProjects.filter((p: ProjectWithGoals) => p.status === 'ACTIVE'),
    COMPLETED: filteredProjects.filter((p: ProjectWithGoals) => p.status === 'COMPLETED'),
    ARCHIVED: filteredProjects.filter((p: ProjectWithGoals) => p.status === 'ARCHIVED'),
  };

  return (
    <MainLayout title="Projects">
      <PageHeader 
        title="Projects" 
        description="Manage your projects and deliverables"
        actions={
          <Link href="/projects/new">
            <Button>+ New Project</Button>
          </Link>
        }
      />

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        <button
          onClick={() => setFilter('ALL')}
          className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
            filter === 'ALL' 
              ? 'bg-blue-100 text-blue-700' 
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          All ({projects?.length ?? 0})
        </button>
        {(Object.keys(statusConfig) as ProjectStatus[]).map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              filter === status 
                ? statusConfig[status].color
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {statusConfig[status].icon} {statusConfig[status].label} (
            {(projects as ProjectWithGoals[] | undefined)?.filter((p: ProjectWithGoals) => p.status === status).length ?? 0})
          </button>
        ))}
      </div>

      {/* Projects List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse h-24 bg-gray-100 rounded-lg" />
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon="📁"
              title="No Projects Found"
              description={filter === 'ALL' 
                ? "Create your first project to get started" 
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
            
            return (
              <div key={status}>
                <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  {statusConfig[status].icon} {statusConfig[status].label}
                  <span className="text-sm font-normal text-gray-500">
                    ({statusProjects.length})
                  </span>
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {statusProjects.map((project: ProjectWithGoals) => (
                    <ProjectCard key={project.id} project={project} pomodoroDuration={pomodoroDuration} />
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
  
  return (
    <Link href={`/projects/${project.id}`}>
      <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
        <CardContent>
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="font-medium text-gray-900 line-clamp-1">{project.title}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full ${config.color}`}>
              {config.label}
            </span>
          </div>
          <p className="text-sm text-gray-500 line-clamp-2 mb-3">{project.deliverable}</p>
          
          {/* Time Estimation (Requirements: 21.4) */}
          {estimation && estimation.totalEstimatedMinutes > 0 && (
            <div className="mb-3">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>{estimation.completedPomodoros}/{estimation.totalEstimatedPomodoros} 🍅</span>
                <span>{estimation.completionPercentage}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div 
                  className={`h-1.5 rounded-full transition-all ${
                    estimation.completedMinutes > estimation.totalEstimatedMinutes
                      ? 'bg-red-500'
                      : 'bg-blue-500'
                  }`}
                  style={{ 
                    width: `${Math.min(100, estimation.completionPercentage)}%` 
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
                  className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded"
                >
                  🎯 {goal.title}
                </span>
              ))}
              {project.goals.length > 2 && (
                <span className="text-xs text-gray-400">
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
