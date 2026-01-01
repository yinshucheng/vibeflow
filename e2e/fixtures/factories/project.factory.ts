import { PrismaClient, Project, ProjectStatus } from '@prisma/client';
import { TestDataTracker } from '../database.fixture';

/**
 * Project factory for E2E tests
 * Creates test projects with configurable properties
 * 
 * Requirements: 2.2
 * - Provides factory function for Project entity
 * - Implements create() and cleanup() methods
 */

export interface CreateProjectInput {
  title?: string;
  deliverable?: string;
  status?: ProjectStatus;
  goalIds?: string[];
}

export class ProjectFactory {
  private prisma: PrismaClient;
  private tracker: TestDataTracker;
  private createdProjectIds: string[] = [];

  constructor(prisma: PrismaClient, tracker: TestDataTracker) {
    this.prisma = prisma;
    this.tracker = tracker;
  }

  /**
   * Generate a unique project title
   */
  private generateTitle(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 6);
    return `Test Project ${timestamp}-${random}`;
  }

  /**
   * Create a test project for a user
   */
  async create(userId: string, input: CreateProjectInput = {}): Promise<Project> {
    const title = input.title || this.generateTitle();
    const deliverable = input.deliverable || `Deliverable for ${title}`;
    const status = input.status || 'ACTIVE';

    const project = await this.prisma.project.create({
      data: {
        title,
        deliverable,
        status,
        userId,
      },
    });

    this.createdProjectIds.push(project.id);
    this.tracker.trackProject(project.id);

    // Link to goals if provided
    if (input.goalIds && input.goalIds.length > 0) {
      for (const goalId of input.goalIds) {
        const projectGoal = await this.prisma.projectGoal.create({
          data: {
            projectId: project.id,
            goalId,
          },
        });
        this.tracker.trackProjectGoal(projectGoal.id);
      }
    }

    return project;
  }

  /**
   * Create multiple projects for a user
   */
  async createMany(userId: string, count: number, input: CreateProjectInput = {}): Promise<Project[]> {
    const projects: Project[] = [];
    for (let i = 0; i < count; i++) {
      const project = await this.create(userId, {
        ...input,
        title: input.title ? `${input.title} ${i + 1}` : undefined,
      });
      projects.push(project);
    }
    return projects;
  }

  /**
   * Create an active project
   */
  async createActive(userId: string, input: Omit<CreateProjectInput, 'status'> = {}): Promise<Project> {
    return this.create(userId, { ...input, status: 'ACTIVE' });
  }

  /**
   * Create a completed project
   */
  async createCompleted(userId: string, input: Omit<CreateProjectInput, 'status'> = {}): Promise<Project> {
    return this.create(userId, { ...input, status: 'COMPLETED' });
  }

  /**
   * Create an archived project
   */
  async createArchived(userId: string, input: Omit<CreateProjectInput, 'status'> = {}): Promise<Project> {
    return this.create(userId, { ...input, status: 'ARCHIVED' });
  }

  /**
   * Get all created project IDs
   */
  getCreatedIds(): string[] {
    return [...this.createdProjectIds];
  }

  /**
   * Clean up all projects created by this factory
   */
  async cleanup(): Promise<void> {
    if (this.createdProjectIds.length === 0) return;

    try {
      // Delete tasks first (they reference projects)
      await this.prisma.task.deleteMany({
        where: { projectId: { in: this.createdProjectIds } },
      });

      // Delete project-goal relations
      await this.prisma.projectGoal.deleteMany({
        where: { projectId: { in: this.createdProjectIds } },
      });

      // Delete projects
      await this.prisma.project.deleteMany({
        where: { id: { in: this.createdProjectIds } },
      });
    } catch (error) {
      console.error('[ProjectFactory] Failed to cleanup projects:', error);
    }

    this.createdProjectIds = [];
  }
}
