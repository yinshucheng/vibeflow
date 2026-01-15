# REST & SLEEP State Work App Blocking - Implementation Tasks

## Phase 1: Data Layer (1-2 days)

### Task 1.1: Extend Prisma Schema
- [ ] Add work apps configuration fields to UserSettings
- [ ] Add REST enforcement fields to UserSettings
- [ ] Add SLEEP enforcement actions field to UserSettings
- [ ] Add health limits fields to UserSettings
- [ ] Add skip token fields to UserSettings
- [ ] Create RestExemption model
- [ ] Add indexes for performance

### Task 1.2: Database Migration
- [ ] Generate Prisma client
- [ ] Create migration file
- [ ] Run migration on development database
- [ ] Verify schema changes

### Task 1.3: Data Layer Tests
- [ ] Test UserSettings CRUD operations
- [ ] Test RestExemption CRUD operations
- [ ] Test default values

## Phase 2: Service Layer (2-3 days)

### Task 2.1: HealthLimitService
- [ ] Implement check2HourLimit method
- [ ] Implement checkDailyLimit method
- [ ] Implement checkHealthLimit method
- [ ] Implement canUseSkipToken method
- [ ] Implement consumeSkipToken method
- [ ] Implement resetWeeklyTokens method
- [ ] Write unit tests

### Task 2.2: RestEnforcementService
- [ ] Implement shouldEnforceRest method
- [ ] Implement requestGrace method
- [ ] Implement requestSkipRest method
- [ ] Implement enforceWorkAppBlock method
- [ ] Integrate with HealthLimitService
- [ ] Write unit tests

### Task 2.3: SleepTimeService Extensions
- [ ] Implement enforceSleepWorkAppBlock method
- [ ] Integrate with existing snooze mechanism
- [ ] Write unit tests

## Phase 3: State Machine Integration (1-2 days)

### Task 3.1: Extend State Machine Context
- [ ] Add restGraceCount field
- [ ] Add restGraceExpiresAt field
- [ ] Add skipTokenRemaining field

### Task 3.2: Extend REST State
- [ ] Add checkRestEnforcement entry action
- [ ] Add REQUEST_GRACE event handler
- [ ] Add SKIP_REST event handler
- [ ] Add canGrantRestGrace guard
- [ ] Add canSkipRest guard
- [ ] Add grantRestGrace action
- [ ] Add consumeSkipToken action
- [ ] Add resetRestContext action

### Task 3.3: State Machine Tests
- [ ] Test REST state transitions
- [ ] Test grace request flow
- [ ] Test skip rest flow
- [ ] Test guard conditions

## Phase 4: API Layer (1 day)

### Task 4.1: REST Enforcement Router
- [ ] Create restEnforcement.router.ts
- [ ] Implement requestGrace endpoint
- [ ] Implement requestSkipRest endpoint
- [ ] Add input validation
- [ ] Write API tests

### Task 4.2: Health Limit Router
- [ ] Create healthLimit.router.ts
- [ ] Implement checkLimit endpoint
- [ ] Implement getSkipTokenStatus endpoint
- [ ] Add input validation
- [ ] Write API tests

### Task 4.3: Settings Router Extensions
- [ ] Add work apps CRUD endpoints
- [ ] Add REST enforcement settings endpoints
- [ ] Add health limit settings endpoints
- [ ] Write API tests

## Phase 5: UI Components (2-3 days)

### Task 5.1: WorkAppsSettings Component
- [ ] Create component structure
- [ ] Implement work apps list display
- [ ] Implement add preset app functionality
- [ ] Implement add custom app functionality
- [ ] Implement remove app functionality
- [ ] Implement running apps detection
- [ ] Add loading and error states
- [ ] Write component tests

### Task 5.2: RestEnforcementSettings Component
- [ ] Create component structure
- [ ] Implement enable/disable toggle
- [ ] Implement actions checkboxes
- [ ] Implement grace limit selector
- [ ] Implement grace duration selector
- [ ] Add settings lock indicator
- [ ] Add loading and error states
- [ ] Write component tests

### Task 5.3: HealthLimitSettings Component
- [ ] Create component structure
- [ ] Implement 2-hour limit input
- [ ] Implement daily limit input
- [ ] Implement skip token limit input
- [ ] Display current skip token usage
- [ ] Display next reset time
- [ ] Add settings lock indicator
- [ ] Add loading and error states
- [ ] Write component tests

### Task 5.4: REST State UI Extensions
- [ ] Add Grace button with remaining count
- [ ] Add Skip Rest button with token count
- [ ] Add countdown to work app blocking
- [ ] Add skip token confirmation dialog
- [ ] Add grace limit reached message
- [ ] Add no tokens remaining message
- [ ] Write component tests

## Phase 6: Desktop Integration (1-2 days)

### Task 6.1: Desktop App IPC
- [ ] Implement force-quit-work-apps IPC handler
- [ ] Implement hide-work-app-windows IPC handler
- [ ] Test IPC communication
- [ ] Handle errors gracefully

### Task 6.2: Work App Blocking
- [ ] Implement macOS app force quit
- [ ] Implement macOS window hiding
- [ ] Test with various apps
- [ ] Add error handling

### Task 6.3: Desktop Integration Tests
- [ ] Test force quit functionality
- [ ] Test hide window functionality
- [ ] Test error scenarios

## Phase 7: E2E Tests and Documentation (1-2 days)

### Task 7.1: E2E Tests
- [ ] Write rest-enforcement.spec.ts
- [ ] Test grace button flow
- [ ] Test skip rest button flow
- [ ] Test health limit + skip token flow
- [ ] Test no tokens remaining scenario
- [ ] Write sleep-enforcement.spec.ts
- [ ] Test SLEEP window entry
- [ ] Test work app blocking
- [ ] Test snooze integration

### Task 7.2: Documentation
- [ ] Update CLAUDE.md with new features
- [ ] Update .kiro/steering/product.md
- [ ] Update .kiro/steering/structure.md
- [ ] Add inline code comments where needed

### Task 7.3: Manual Testing
- [ ] Test complete REST flow
- [ ] Test complete SLEEP flow
- [ ] Test skip token reset
- [ ] Test settings lock mechanism
- [ ] Test with various work apps
- [ ] Test error scenarios

## Phase 8: Code Quality and Cleanup

### Task 8.1: Code Review
- [ ] Review all new code
- [ ] Check for security issues
- [ ] Check for performance issues
- [ ] Ensure consistent code style

### Task 8.2: Quality Gates
- [ ] Run TypeScript compilation
- [ ] Run all unit tests
- [ ] Run all E2E tests
- [ ] Run linter
- [ ] Fix any issues

### Task 8.3: Final Cleanup
- [ ] Remove debug code
- [ ] Remove unused imports
- [ ] Update dependencies if needed
- [ ] Final manual testing

## Estimated Timeline

- Phase 1: 1-2 days
- Phase 2: 2-3 days
- Phase 3: 1-2 days
- Phase 4: 1 day
- Phase 5: 2-3 days
- Phase 6: 1-2 days
- Phase 7: 1-2 days
- Phase 8: 1 day

**Total: 10-16 days**

## Dependencies

- Phase 2 depends on Phase 1 (data layer must exist)
- Phase 3 depends on Phase 2 (services must exist)
- Phase 4 depends on Phase 2 (services must exist)
- Phase 5 depends on Phase 4 (API must exist)
- Phase 6 can be done in parallel with Phase 5
- Phase 7 depends on all previous phases
- Phase 8 depends on all previous phases

## Notes

- Follow DDD principles throughout implementation
- Write tests for each phase before moving to next
- Run quality gates after each phase
- Update steering documents as needed
- Keep implementation minimal and focused
