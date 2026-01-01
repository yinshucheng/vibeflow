# Design Document

## Overview

本设计文档描述 VibeFlow E2E 测试框架的技术架构和实现方案。采用 Playwright 作为核心测试框架，结合 Page Object 模式、测试数据工厂和自动化报告生成，建立一个可靠、可维护的端到端测试体系。

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        E2E Test Suite                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  Airlock    │  │  Pomodoro   │  │  Project    │  ...        │
│  │  Tests      │  │  Tests      │  │  Tests      │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
│  ┌──────▼────────────────▼────────────────▼──────┐             │
│  │              Page Objects Layer               │             │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐      │             │
│  │  │ Airlock  │ │ Pomodoro │ │ Projects │ ...  │             │
│  │  │ Page     │ │ Page     │ │ Page     │      │             │
│  │  └──────────┘ └──────────┘ └──────────┘      │             │
│  └──────────────────────┬────────────────────────┘             │
│                         │                                       │
│  ┌──────────────────────▼────────────────────────┐             │
│  │              Test Fixtures Layer              │             │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐      │             │
│  │  │ Auth     │ │ Database │ │ API      │      │             │
│  │  │ Fixture  │ │ Fixture  │ │ Fixture  │      │             │
│  │  └──────────┘ └──────────┘ └──────────┘      │             │
│  └──────────────────────┬────────────────────────┘             │
│                         │                                       │
│  ┌──────────────────────▼────────────────────────┐             │
│  │              Data Factory Layer               │             │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐      │             │
│  │  │ User     │ │ Project  │ │ Task     │ ...  │             │
│  │  │ Factory  │ │ Factory  │ │ Factory  │      │             │
│  │  └──────────┘ └──────────┘ └──────────┘      │             │
│  └───────────────────────────────────────────────┘             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    VibeFlow Application                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  Next.js    │  │  tRPC API   │  │  PostgreSQL │             │
│  │  Frontend   │  │  Backend    │  │  Database   │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Playwright Configuration

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results.json' }],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

### 2. Test Fixtures

```typescript
// e2e/fixtures/index.ts
import { test as base, Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { UserFactory, ProjectFactory, TaskFactory, GoalFactory } from './factories';

// Page Objects
import { LoginPage } from '../pages/login.page';
import { DashboardPage } from '../pages/dashboard.page';
import { AirlockPage } from '../pages/airlock.page';
import { PomodoroPage } from '../pages/pomodoro.page';
import { ProjectsPage } from '../pages/projects.page';
import { TasksPage } from '../pages/tasks.page';
import { GoalsPage } from '../pages/goals.page';

interface TestFixtures {
  // Database
  prisma: PrismaClient;
  
  // Factories
  userFactory: UserFactory;
  projectFactory: ProjectFactory;
  taskFactory: TaskFactory;
  goalFactory: GoalFactory;
  
  // Page Objects
  loginPage: LoginPage;
  dashboardPage: DashboardPage;
  airlockPage: AirlockPage;
  pomodoroPage: PomodoroPage;
  projectsPage: ProjectsPage;
  tasksPage: TasksPage;
  goalsPage: GoalsPage;
  
  // Auth
  authenticatedPage: Page;
  testUser: { id: string; email: string };
}

export const test = base.extend<TestFixtures>({
  prisma: async ({}, use) => {
    const prisma = new PrismaClient();
    await use(prisma);
    await prisma.$disconnect();
  },
  
  userFactory: async ({ prisma }, use) => {
    await use(new UserFactory(prisma));
  },
  
  // ... other fixtures
});
```

### 3. Page Object Base Class

```typescript
// e2e/pages/base.page.ts
import { Page, Locator, expect } from '@playwright/test';

export abstract class BasePage {
  protected page: Page;
  protected abstract url: string;
  
  constructor(page: Page) {
    this.page = page;
  }
  
  async navigate(): Promise<void> {
    await this.page.goto(this.url);
  }
  
  async waitForLoad(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }
  
  async getStateIndicator(): Promise<string> {
    const indicator = this.page.locator('[data-testid="state-indicator"]');
    return indicator.textContent() ?? '';
  }
  
  async expectState(state: 'LOCKED' | 'PLANNING' | 'FOCUS' | 'REST'): Promise<void> {
    const indicator = this.page.locator('[data-testid="state-indicator"]');
    await expect(indicator).toContainText(state);
  }
}
```

### 4. Airlock Page Object

```typescript
// e2e/pages/airlock.page.ts
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

export class AirlockPage extends BasePage {
  protected url = '/airlock';
  
  // Step indicators
  readonly stepIndicator: Locator;
  readonly currentStep: Locator;
  
  // Step 1: Review
  readonly yesterdayTasks: Locator;
  readonly deferButton: (taskId: string) => Locator;
  readonly deleteButton: (taskId: string) => Locator;
  readonly step1NextButton: Locator;
  
  // Step 2: Plan
  readonly projectBacklog: Locator;
  readonly todayList: Locator;
  readonly step2NextButton: Locator;
  
  // Step 3: Commit
  readonly taskCheckboxes: Locator;
  readonly selectedCount: Locator;
  readonly startDayButton: Locator;
  
  constructor(page: Page) {
    super(page);
    this.stepIndicator = page.locator('[data-testid="step-indicator"]');
    this.currentStep = page.locator('[data-testid="current-step"]');
    
    // Step 1
    this.yesterdayTasks = page.locator('[data-testid="yesterday-tasks"]');
    this.deferButton = (taskId) => page.locator(`[data-testid="defer-${taskId}"]`);
    this.deleteButton = (taskId) => page.locator(`[data-testid="delete-${taskId}"]`);
    this.step1NextButton = page.locator('[data-testid="step1-next"]');
    
    // Step 2
    this.projectBacklog = page.locator('[data-testid="project-backlog"]');
    this.todayList = page.locator('[data-testid="today-list"]');
    this.step2NextButton = page.locator('[data-testid="step2-next"]');
    
    // Step 3
    this.taskCheckboxes = page.locator('[data-testid="top3-checkbox"]');
    this.selectedCount = page.locator('[data-testid="selected-count"]');
    this.startDayButton = page.locator('[data-testid="start-day"]');
  }
  
  async expectStep(step: 1 | 2 | 3): Promise<void> {
    await expect(this.currentStep).toHaveAttribute('data-step', String(step));
  }
  
  async deferTask(taskId: string): Promise<void> {
    await this.deferButton(taskId).click();
  }
  
  async deleteTask(taskId: string): Promise<void> {
    await this.deleteButton(taskId).click();
  }
  
  async dragTaskToToday(taskId: string): Promise<void> {
    const task = this.page.locator(`[data-testid="backlog-task-${taskId}"]`);
    const dropZone = this.todayList;
    await task.dragTo(dropZone);
  }
  
  async selectTop3Task(taskId: string): Promise<void> {
    await this.page.locator(`[data-testid="top3-${taskId}"]`).click();
  }
  
  async completeWizard(): Promise<void> {
    await this.startDayButton.click();
    await this.page.waitForURL('/');
  }
}
```

### 5. Pomodoro Page Object

```typescript
// e2e/pages/pomodoro.page.ts
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

export class PomodoroPage extends BasePage {
  protected url = '/pomodoro';
  
  readonly taskSelector: Locator;
  readonly timerDisplay: Locator;
  readonly startButton: Locator;
  readonly stopButton: Locator;
  readonly completionModal: Locator;
  readonly confirmButton: Locator;
  readonly restTimer: Locator;
  readonly dailyCapModal: Locator;
  readonly overrideButton: Locator;
  
  constructor(page: Page) {
    super(page);
    this.taskSelector = page.locator('[data-testid="task-selector"]');
    this.timerDisplay = page.locator('[data-testid="timer-display"]');
    this.startButton = page.locator('[data-testid="start-pomodoro"]');
    this.stopButton = page.locator('[data-testid="stop-pomodoro"]');
    this.completionModal = page.locator('[data-testid="completion-modal"]');
    this.confirmButton = page.locator('[data-testid="confirm-completion"]');
    this.restTimer = page.locator('[data-testid="rest-timer"]');
    this.dailyCapModal = page.locator('[data-testid="daily-cap-modal"]');
    this.overrideButton = page.locator('[data-testid="override-cap"]');
  }
  
  async selectTask(taskId: string): Promise<void> {
    await this.taskSelector.click();
    await this.page.locator(`[data-testid="task-option-${taskId}"]`).click();
  }
  
  async startPomodoro(): Promise<void> {
    await this.startButton.click();
  }
  
  async stopPomodoro(): Promise<void> {
    await this.stopButton.click();
  }
  
  async confirmCompletion(): Promise<void> {
    await expect(this.completionModal).toBeVisible();
    await this.confirmButton.click();
  }
  
  async expectTimerRunning(): Promise<void> {
    await expect(this.timerDisplay).toBeVisible();
    await expect(this.stopButton).toBeVisible();
  }
  
  async expectRestMode(): Promise<void> {
    await expect(this.restTimer).toBeVisible();
    await expect(this.startButton).toBeDisabled();
  }
  
  async overrideDailyCap(): Promise<void> {
    await expect(this.dailyCapModal).toBeVisible();
    await this.overrideButton.click();
  }
}
```

### 6. Data Factories

```typescript
// e2e/fixtures/factories/user.factory.ts
import { PrismaClient, User } from '@prisma/client';
import { hash } from 'bcryptjs';

export class UserFactory {
  private prisma: PrismaClient;
  private createdIds: string[] = [];
  
  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }
  
  async create(overrides: Partial<User> = {}): Promise<User> {
    const email = overrides.email || `test-${Date.now()}@example.com`;
    const password = await hash('testpassword123', 10);
    
    const user = await this.prisma.user.create({
      data: {
        email,
        password,
        name: overrides.name || 'Test User',
        settings: overrides.settings || {},
        ...overrides,
      },
    });
    
    this.createdIds.push(user.id);
    return user;
  }
  
  async cleanup(): Promise<void> {
    await this.prisma.user.deleteMany({
      where: { id: { in: this.createdIds } },
    });
    this.createdIds = [];
  }
}

// e2e/fixtures/factories/project.factory.ts
export class ProjectFactory {
  private prisma: PrismaClient;
  private createdIds: string[] = [];
  
  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }
  
  async create(userId: string, overrides: Partial<Project> = {}): Promise<Project> {
    const project = await this.prisma.project.create({
      data: {
        title: overrides.title || `Test Project ${Date.now()}`,
        deliverable: overrides.deliverable || 'Test deliverable',
        status: overrides.status || 'ACTIVE',
        userId,
        ...overrides,
      },
    });
    
    this.createdIds.push(project.id);
    return project;
  }
  
  async cleanup(): Promise<void> {
    await this.prisma.project.deleteMany({
      where: { id: { in: this.createdIds } },
    });
    this.createdIds = [];
  }
}
```

### 7. Test Examples

```typescript
// e2e/tests/airlock.spec.ts
import { test, expect } from '../fixtures';

test.describe('Morning Airlock Wizard', () => {
  test.beforeEach(async ({ page, userFactory, projectFactory, taskFactory }) => {
    // Create test user and data
    const user = await userFactory.create();
    const project = await projectFactory.create(user.id);
    
    // Create yesterday's incomplete tasks
    await taskFactory.create(project.id, {
      title: 'Yesterday Task 1',
      status: 'TODO',
      planDate: new Date(Date.now() - 86400000), // yesterday
    });
    
    // Login and navigate
    await page.goto('/login');
    // ... login steps
  });
  
  test('completes full wizard flow', async ({ airlockPage }) => {
    await airlockPage.navigate();
    
    // Step 1: Review
    await airlockPage.expectStep(1);
    await expect(airlockPage.yesterdayTasks).toBeVisible();
    await airlockPage.step1NextButton.click();
    
    // Step 2: Plan
    await airlockPage.expectStep(2);
    await expect(airlockPage.projectBacklog).toBeVisible();
    await airlockPage.step2NextButton.click();
    
    // Step 3: Commit
    await airlockPage.expectStep(3);
    // Select 3 tasks
    await airlockPage.selectTop3Task('task-1');
    await airlockPage.selectTop3Task('task-2');
    await airlockPage.selectTop3Task('task-3');
    
    await expect(airlockPage.startDayButton).toBeEnabled();
    await airlockPage.completeWizard();
    
    // Verify state changed
    await expect(page).toHaveURL('/');
  });
});
```

## Data Models

### Test Configuration Schema

```typescript
interface E2EConfig {
  baseURL: string;
  testDatabase: {
    url: string;
    resetBeforeAll: boolean;
  };
  auth: {
    testUserEmail: string;
    testUserPassword: string;
  };
  timeouts: {
    navigation: number;
    action: number;
    assertion: number;
  };
  screenshots: {
    onFailure: boolean;
    fullPage: boolean;
  };
  video: {
    mode: 'off' | 'on' | 'retain-on-failure' | 'on-first-retry';
  };
}
```

### Manual Acceptance Checklist Schema

```typescript
interface ManualAcceptanceChecklist {
  feature: string;
  testRunId: string;
  timestamp: Date;
  automatedTestsPassed: boolean;
  items: AcceptanceItem[];
}

interface AcceptanceItem {
  id: string;
  category: 'visual' | 'ux' | 'edge-case' | 'performance';
  description: string;
  status: 'pending' | 'passed' | 'failed';
  notes?: string;
}
```



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*


Based on the prework analysis, the following correctness properties have been identified for the E2E testing framework:

### Property 1: Data Factory Consistency

*For any* entity type (User, Project, Task, Goal), the data factory SHALL produce valid entities that pass database constraints and can be successfully persisted and retrieved.

**Validates: Requirements 1.5, 2.2**

### Property 2: Test Data Isolation

*For any* test execution, the test data created during that test SHALL be isolated from other tests, and cleanup SHALL remove all created data without affecting other test data.

**Validates: Requirements 2.1, 2.3, 2.4**

### Property 3: Auth Fixture Reusability

*For any* test that requires authentication, the auth fixture SHALL successfully authenticate the test user and maintain session state throughout the test.

**Validates: Requirements 1.4**

### Property 4: Airlock State Transition

*For any* successful completion of the Morning Airlock wizard (with valid Top 3 selection), the System_State SHALL transition to PLANNING.

**Validates: Requirements 4.5**

### Property 5: Pomodoro Task Requirement

*For any* attempt to start a Pomodoro without selecting a task, the system SHALL reject the action and display an error.

**Validates: Requirements 5.1**

### Property 6: Pomodoro Abort Recording

*For any* manually stopped Pomodoro session, the system SHALL record the session with ABORTED status.

**Validates: Requirements 5.4**

### Property 7: REST State Blocking

*For any* attempt to start a new Pomodoro while System_State is REST, the system SHALL block the action until rest period ends.

**Validates: Requirements 5.5**

### Property 8: Project Validation

*For any* project creation attempt missing required fields (title or deliverable), the system SHALL reject the creation and display validation errors.

**Validates: Requirements 6.1**

### Property 9: Project Edit Round-Trip

*For any* project, editing and saving changes SHALL persist the data such that reloading the page displays the updated values.

**Validates: Requirements 6.3**

### Property 10: Archive Cascade

*For any* project archival action, all associated tasks SHALL also be moved to archived state.

**Validates: Requirements 6.4**

### Property 11: Task Project Binding

*For any* task creation attempt without selecting a parent project, the system SHALL reject the creation and display an error.

**Validates: Requirements 7.1**

### Property 12: Task Reorder Round-Trip

*For any* task reordering action within a project, the new order SHALL persist such that reloading the page displays tasks in the reordered sequence.

**Validates: Requirements 7.4**

### Property 13: Goal Timeframe Validation

*For any* goal creation, the system SHALL validate timeframe constraints (Long-term: 1-5 years, Short-term: 1 week - 6 months) and reject invalid values.

**Validates: Requirements 8.1**

### Property 14: Goal Progress Calculation

*For any* goal with linked projects, the progress percentage SHALL accurately reflect the completion status of linked projects.

**Validates: Requirements 8.5**

### Property 15: State Navigation Rules

*For any* System_State, the navigation restrictions SHALL be enforced: LOCKED allows only Airlock access, PLANNING/FOCUS/REST allow full navigation.

**Validates: Requirements 9.2, 9.3**

### Property 16: Daily Cap Enforcement

*For any* day where Pomodoro count reaches Daily_Cap, the system SHALL display the "Day Complete" modal and block new Pomodoro starts until override confirmation.

**Validates: Requirements 10.2**

## Error Handling

### Test Failure Handling

1. **Screenshot on Failure**: Capture full-page screenshot when any assertion fails
2. **Video Recording**: Record video for failed tests to aid debugging
3. **Trace Collection**: Collect Playwright trace for step-by-step analysis
4. **Retry Mechanism**: Retry flaky tests up to 2 times in CI environment

### Data Seeding Errors

1. **Validation Errors**: Log detailed validation errors from Prisma
2. **Connection Errors**: Retry database connection up to 3 times
3. **Cleanup Errors**: Log but don't fail test on cleanup errors (to avoid masking real failures)

### Network Errors

1. **Timeout Handling**: Configure appropriate timeouts for slow operations
2. **Retry on Network Failure**: Retry navigation on transient network errors
3. **Offline Detection**: Skip tests that require network when offline

## Testing Strategy

### Test Organization

```
e2e/
├── fixtures/
│   ├── index.ts              # Main fixture exports
│   ├── auth.fixture.ts       # Authentication setup
│   ├── database.fixture.ts   # Database reset/seed
│   └── factories/
│       ├── user.factory.ts
│       ├── project.factory.ts
│       ├── task.factory.ts
│       └── goal.factory.ts
├── pages/
│   ├── base.page.ts          # Base page object
│   ├── login.page.ts
│   ├── dashboard.page.ts
│   ├── airlock.page.ts
│   ├── pomodoro.page.ts
│   ├── projects.page.ts
│   ├── tasks.page.ts
│   └── goals.page.ts
├── tests/
│   ├── airlock.spec.ts       # Morning Airlock tests
│   ├── pomodoro.spec.ts      # Pomodoro timer tests
│   ├── projects.spec.ts      # Project management tests
│   ├── tasks.spec.ts         # Task management tests
│   ├── goals.spec.ts         # Goal management tests
│   ├── state.spec.ts         # System state tests
│   └── daily-cap.spec.ts     # Daily cap tests
└── utils/
    ├── test-helpers.ts       # Common test utilities
    └── acceptance-checklist.ts # Manual acceptance generator
```

### Test Execution Strategy

1. **Unit Tests First**: Run Vitest unit tests before E2E
2. **Smoke Tests**: Run critical path tests first (login, airlock, pomodoro)
3. **Full Suite**: Run complete E2E suite on PR merge
4. **Parallel Execution**: Run tests in parallel with data isolation

### Manual Acceptance Process

After all E2E tests pass, generate a checklist for human verification:

```typescript
// e2e/utils/acceptance-checklist.ts
export function generateAcceptanceChecklist(feature: string): AcceptanceItem[] {
  const commonItems: AcceptanceItem[] = [
    { category: 'visual', description: 'UI renders correctly without visual glitches' },
    { category: 'visual', description: 'Colors and fonts match design system' },
    { category: 'ux', description: 'Interactions feel responsive and smooth' },
    { category: 'ux', description: 'Error messages are clear and helpful' },
    { category: 'performance', description: 'Page loads within acceptable time' },
  ];
  
  const featureItems: Record<string, AcceptanceItem[]> = {
    airlock: [
      { category: 'ux', description: 'Step transitions are smooth' },
      { category: 'visual', description: 'Progress indicator is clear' },
      { category: 'edge-case', description: 'Works with 0 tasks from yesterday' },
    ],
    pomodoro: [
      { category: 'ux', description: 'Timer countdown is accurate' },
      { category: 'visual', description: 'Completion modal is prominent' },
      { category: 'edge-case', description: 'Works with very short durations' },
    ],
    // ... other features
  };
  
  return [...commonItems, ...(featureItems[feature] || [])];
}
```

