# Implementation Plan: Desktop Tray Enhancement

## Overview

This implementation plan converts the desktop tray enhancement design into discrete coding tasks. The approach focuses on incremental development, building upon the existing `TrayManager` class and integrating with the current state management system.

## Tasks

- [x] 1. Enhance TrayMenuState interface and type definitions
  - Update `TrayMenuState` interface in `vibeflow-desktop/electron/modules/tray-manager.ts`
  - Add new fields: `systemState`, `restTimeRemaining`, `overRestDuration`
  - Add TypeScript type definitions for IPC events
  - Update existing interface documentation
  - _Requirements: 2.1-2.4, 8.1-8.3_

- [x] 1.1 Write unit tests for interface changes
  - Test interface compatibility with existing code
  - Validate type definitions for IPC events
  - _Requirements: 1.1, 2.1_

- [x] 2. Add time formatting utilities
  - [x] 2.1 Implement time formatting functions in renderer process
    - Create `TimeFormatter` utility class
    - Implement MM:SS formatting for countdowns
    - Implement duration formatting for over-rest display
    - _Requirements: 1.7, 8.7_

  - [x] 2.2 Integrate time formatting with state updates
    - Format times before sending to tray via IPC
    - Ensure consistent formatting across all displays
    - Handle edge cases (0 seconds, very long durations)
    - _Requirements: 1.7, 8.7_

  - [ ]* 2.3 Write unit tests for time formatting
    - Test MM:SS format accuracy
    - Test over-rest duration formatting
    - Test edge cases and boundary conditions
    - _Requirements: 1.7, 8.7_

- [x] 3. Implement enhanced menu building logic
  - [x] 3.1 Update `buildMenuTemplate()` method to handle new system states
    - Add REST state display with countdown format
    - Add OVER_REST state display with duration format
    - Update PLANNING and LOCKED state displays
    - _Requirements: 2.1-2.4, 8.1-8.3_

  - [x] 3.2 Implement dynamic menu content based on system state
    - Show appropriate status information at menu top
    - Handle state-specific menu items and separators
    - Ensure proper menu organization and grouping
    - _Requirements: 4.1, 4.2_

  - [ ]* 3.3 Write unit tests for menu building logic
    - Test menu structure for each system state
    - Verify correct status display formatting
    - Test menu item organization and separators
    - _Requirements: 2.1-2.4, 4.1-4.2_

- [x] 4. Enhance tooltip display functionality
  - [x] 4.1 Update `updateTooltip()` method for new states
    - Implement REST state tooltip with countdown
    - Implement OVER_REST state tooltip with duration
    - Update existing state tooltip formats
    - _Requirements: 1.3, 8.3_

  - [ ]* 4.2 Write unit tests for tooltip functionality
    - Test tooltip content for each system state
    - Verify tooltip format consistency
    - Test tooltip update timing
    - _Requirements: 1.3, 8.3_

- [x] 5. Implement icon optimization
  - [x] 5.1 Create placeholder icon generation
    - Implement `createPlaceholderIcon()` method with brand colors
    - Use circular shape with proper contrast
    - Ensure 16x16 pixel size for menu bar
    - _Requirements: 3.3, 3.4_

  - [x] 5.2 Enhance template image handling
    - Verify template image mode is properly set on macOS
    - Add fallback logic for template image failures
    - Test icon visibility in both light and dark modes
    - _Requirements: 3.1, 3.2_

  - [ ]* 5.3 Write unit tests for icon functionality
    - Test placeholder icon generation
    - Test template image mode setting
    - Test fallback behavior for missing icons
    - _Requirements: 3.1-3.4_

- [x] 6. Implement state synchronization
  - [x] 6.1 Add IPC event handlers for new state types
    - Handle `system:stateChange` events
    - Handle enhanced `pomodoro:stateChange` events
    - Update existing `tray:updateState` handler
    - _Requirements: 5.1-5.5_

  - [x] 6.2 Update main process IPC setup
    - Add new IPC handlers in `main.ts`
    - Ensure proper event routing to TrayManager
    - Test IPC communication flow
    - _Requirements: 5.1-5.5_

  - [ ]* 6.3 Write integration tests for state synchronization
    - Test IPC event handling
    - Verify state update propagation
    - Test update timing requirements (1 second)
    - _Requirements: 5.1-5.5_

- [x] 7. Implement pomodoro completion logic fixes (Cross-module changes)
  - [x] 7.1 Update renderer process state management
    - Modify pomodoro completion handlers to check current state
    - Skip rest prompts when already in OVER_REST
    - Handle auto-rest configuration properly
    - **Note: This involves changes to XState machine and pomodoro service**
    - _Requirements: 7.1-7.9_

  - [x] 7.2 Update tray state emission for completion events
    - Send correct state information after pomodoro completion
    - Ensure immediate tray update for state transitions
    - Handle over-rest duration calculation
    - _Requirements: 7.1-7.3, 7.8_

  - [ ]* 7.3 Write unit tests for completion logic
    - Test state transition logic for various scenarios
    - Test auto-rest configuration handling
    - Test over-rest state management
    - _Requirements: 7.1-7.9_

- [-] 8. Enhance user interaction handling
  - [x] 8.1 Update click handlers for new functionality
    - Ensure proper window show/hide behavior
    - Update context menu action handlers
    - Test tooltip display timing
    - _Requirements: 6.1-6.6_

  - [ ]* 8.2 Write integration tests for user interactions
    - Test click and hover behaviors
    - Test menu action execution
    - _Requirements: 6.1-6.6_

- [x] 9. Checkpoint - Integration testing and validation
  - Ensure all components work together correctly
  - Test complete state transition flows
  - Verify tray display accuracy across all states
  - Test error handling and edge cases
  - Ask the user if questions arise

- [x] 10. Write property-based tests for core correctness properties
  - [x] 10.1 Property test for countdown display accuracy
    - **Property 1: Countdown Display Accuracy**
    - **Validates: Requirements 1.1, 1.2**

  - [x] 10.2 Property test for state display consistency
    - **Property 2: State Display Consistency**
    - **Validates: Requirements 2.5, 5.1, 5.2, 5.3**

  - [x] 10.3 Property test for state transition logic
    - **Property 6: State Transition Logic**
    - **Validates: Requirements 7.1, 7.2, 7.5**

  - [x] 10.4 Property test for time format consistency
    - **Property 8: Time Format Consistency**
    - **Validates: Requirements 1.7, 8.7**

- [x] 11. Final checkpoint - Complete system validation
  - Run all tests and ensure they pass
  - Test complete user workflows
  - Verify performance and resource usage
  - Validate against all requirements
  - Ask the user if questions arise

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Focus on building upon existing `TrayManager` implementation
- State calculation logic remains in renderer process (XState machine)
- TrayManager only handles display and user interaction
- Task 7 involves cross-module changes to pomodoro completion logic
- Property tests reduced to 4 core properties for essential correctness validation