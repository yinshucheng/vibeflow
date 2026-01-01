'use client';

/**
 * New Goal Page
 * 
 * Page for creating a new goal.
 * Requirements: 11.1, 11.2, 11.3
 */

import { MainLayout, PageHeader } from '@/components/layout';
import { GoalForm } from '@/components/goals/goal-form';

export default function NewGoalPage() {
  return (
    <MainLayout title="New Goal">
      <PageHeader 
        title="Create New Goal" 
        description="Define a goal to align your work with your vision"
      />
      <div className="max-w-2xl">
        <GoalForm />
      </div>
    </MainLayout>
  );
}
