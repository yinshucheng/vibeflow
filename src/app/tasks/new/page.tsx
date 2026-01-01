'use client';

/**
 * New Task Page
 * 
 * Page for creating a new task.
 * Requirements: 2.1
 */

import { Suspense } from 'react';
import { MainLayout, PageHeader } from '@/components/layout';
import { TaskForm } from '@/components/tasks/task-form';

function NewTaskContent() {
  return (
    <MainLayout title="New Task">
      <PageHeader 
        title="Create New Task" 
        description="Add a task to a project"
      />
      <div className="max-w-2xl">
        <TaskForm />
      </div>
    </MainLayout>
  );
}

export default function NewTaskPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <NewTaskContent />
    </Suspense>
  );
}
