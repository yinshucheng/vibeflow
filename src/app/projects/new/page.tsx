'use client';

/**
 * New Project Page
 * 
 * Page for creating a new project.
 * Requirements: 1.1
 */

import { MainLayout, PageHeader } from '@/components/layout';
import { ProjectForm } from '@/components/projects/project-form';

export default function NewProjectPage() {
  return (
    <MainLayout title="New Project">
      <PageHeader 
        title="Create New Project" 
        description="Define a project with a clear deliverable"
      />
      <div className="max-w-2xl">
        <ProjectForm />
      </div>
    </MainLayout>
  );
}
