'use client';

/**
 * Edit Project Page
 * 
 * Page for editing an existing project.
 * Requirements: 1.4
 */

import { useParams } from 'next/navigation';
import { MainLayout, PageHeader, EmptyState } from '@/components/layout';
import { ProjectForm } from '@/components/projects/project-form';
import { Button } from '@/components/ui';
import { trpc } from '@/lib/trpc';
import Link from 'next/link';
import type { Goal, ProjectGoal } from '@prisma/client';

type ProjectWithGoals = {
  id: string;
  title: string;
  deliverable: string;
  goals?: (ProjectGoal & { goal: Goal })[];
};

export default function EditProjectPage() {
  const params = useParams();
  const projectId = params.id as string;

  const { data: project, isLoading } = trpc.project.getById.useQuery(
    { id: projectId },
    { enabled: !!projectId }
  );

  if (isLoading) {
    return (
      <MainLayout title="Loading...">
        <div className="animate-pulse space-y-4 max-w-2xl">
          <div className="h-8 bg-gray-200 rounded w-1/3" />
          <div className="h-4 bg-gray-200 rounded w-1/2" />
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </MainLayout>
    );
  }

  const typedProject = project as ProjectWithGoals | undefined;

  if (!typedProject) {
    return (
      <MainLayout title="Not Found">
        <EmptyState
          icon="❌"
          title="Project Not Found"
          description="The project you're trying to edit doesn't exist."
          action={
            <Link href="/projects">
              <Button>Back to Projects</Button>
            </Link>
          }
        />
      </MainLayout>
    );
  }

  return (
    <MainLayout title={`Edit: ${typedProject.title}`}>
      <PageHeader 
        title="Edit Project" 
        description={`Editing: ${typedProject.title}`}
      />
      <div className="max-w-2xl">
        <ProjectForm 
          projectId={projectId}
          initialData={{
            title: typedProject.title,
            deliverable: typedProject.deliverable,
            goalIds: typedProject.goals?.map((g: ProjectGoal & { goal: Goal }) => g.goal.id) ?? [],
          }}
        />
      </div>
    </MainLayout>
  );
}
