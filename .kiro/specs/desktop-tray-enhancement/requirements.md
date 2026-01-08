# Requirements Document

## Introduction

本文档定义了 VibeFlow 桌面端系统托盘菜单增强功能的需求。主要目标是：
1. 在番茄工作时间显示实时倒计时
2. 在休息时间显示休息倒计时
3. 在非工作状态下显示当前系统状态（Planning、Rest、OverRest等）
4. 优化托盘图标的可见性（解决黑色块问题）
5. 修复番茄完成后的状态转换逻辑问题
6. 提供直观的状态反馈和快速操作入口

## Glossary

- **Tray_Manager**: 系统托盘管理器，负责管理托盘图标、菜单和状态显示
- **Pomodoro_Timer**: 番茄工作计时器，跟踪当前番茄工作会话的剩余时间
- **System_State**: 系统当前状态，包括 LOCKED、PLANNING、FOCUS、REST、OVER_REST 等
- **Countdown_Display**: 倒计时显示，在托盘中显示剩余时间的格式化文本
- **Status_Indicator**: 状态指示器，通过图标、颜色或文本显示当前系统状态
- **Tray_Icon**: 托盘图标，显示在系统菜单栏中的应用程序图标
- **Context_Menu**: 右键菜单，用户右键点击托盘图标时显示的操作菜单
- **Tooltip**: 工具提示，鼠标悬停在托盘图标上时显示的状态信息

## Requirements

### Requirement 1: 番茄工作时间倒计时显示

**User Story:** As a user, I want to see the remaining pomodoro time in the system tray, so that I can track my focus session progress without opening the main application.

#### Acceptance Criteria

1. WHEN a pomodoro session is active, THE Tray_Manager SHALL display the remaining time in MM:SS format in the tray menu
2. WHEN a pomodoro session is active, THE Tray_Manager SHALL update the countdown display every second
3. WHEN a pomodoro session is active, THE Tooltip SHALL show "VibeFlow - [MM:SS] remaining" format
4. WHEN a pomodoro session is active, THE Context_Menu SHALL show "⏱ [MM:SS] remaining" as the first menu item
5. WHEN the current task name is available, THE Context_Menu SHALL display the task name below the countdown
6. WHEN pomodoro time reaches 00:00, THE Tray_Manager SHALL immediately update to show completion status
7. THE Countdown_Display SHALL use a consistent format: minutes and seconds with leading zeros (e.g., "25:00", "03:45", "00:30")

### Requirement 2: 系统状态显示

**User Story:** As a user, I want to see the current system state in the tray when not in a pomodoro session, so that I understand what phase of my workflow I'm in.

#### Acceptance Criteria

1. WHEN no pomodoro is active AND system is in PLANNING state, THE Tray_Manager SHALL display "📋 Planning" in the context menu
2. WHEN no pomodoro is active AND system is in REST state, THE Tray_Manager SHALL display "☕ Rest Mode" with remaining rest time in the context menu
3. WHEN no pomodoro is active AND system is in OVER_REST state, THE Tray_Manager SHALL display "⚠️ Over Rest" with over-rest duration in the context menu
4. WHEN no pomodoro is active AND system is in LOCKED state, THE Tray_Manager SHALL display "🔒 Locked" in the context menu
5. WHEN system state changes, THE Tray_Manager SHALL update the display within 1 second
6. THE Tooltip SHALL reflect the current state when no pomodoro is active (e.g., "VibeFlow - Rest Mode")
7. WHEN in OVER_REST state, THE Context_Menu SHALL show the over-rest duration (e.g., "⚠️ Over Rest (15 min)")
8. WHEN in REST state, THE Context_Menu SHALL show the remaining rest time (e.g., "☕ Rest Mode (3:45 remaining)")
9. WHEN rest time expires and transitions to OVER_REST, THE Tray_Manager SHALL immediately update to show over-rest status

### Requirement 3: 托盘图标优化

**User Story:** As a user, I want the tray icon to be clearly visible in both light and dark menu bars, so that I can easily locate and interact with the application.

#### Acceptance Criteria

1. THE Tray_Icon SHALL use a non-solid color design that contrasts well with both light and dark menu bars
2. THE Tray_Icon SHALL be a template image on macOS to automatically adapt to system appearance
3. WHEN no proper icon file exists, THE Tray_Manager SHALL create a colored placeholder icon instead of a black block
4. THE Tray_Icon SHALL be 16x16 pixels for optimal menu bar display

### Requirement 4: 增强的上下文菜单

**User Story:** As a user, I want an informative and well-organized context menu, so that I can quickly understand my current status and access relevant actions.

#### Acceptance Criteria

1. THE Context_Menu SHALL show status information at the top (countdown or current state)
2. THE Context_Menu SHALL group related actions with separators for better organization
3. THE Context_Menu SHALL show current task name when a pomodoro is active (truncated to 30 characters if needed)
4. THE Context_Menu SHALL display remaining skip tokens for the day
5. THE Context_Menu SHALL show current enforcement mode (Strict/Gentle)
6. THE Context_Menu SHALL provide quick actions: "Start Pomodoro", "View Status", "Settings"

### Requirement 5: 实时状态同步

**User Story:** As a user, I want the tray display to stay synchronized with the main application state, so that I always see accurate information.

#### Acceptance Criteria

1. WHEN the main application state changes, THE Tray_Manager SHALL receive updates within 1 second
2. WHEN pomodoro starts, THE Tray_Manager SHALL immediately switch to countdown display mode
3. WHEN pomodoro ends, THE Tray_Manager SHALL immediately switch to state display mode
4. WHEN task changes during active pomodoro, THE Tray_Manager SHALL update the displayed task name
5. WHEN system state transitions (e.g., FOCUS to REST), THE Tray_Manager SHALL update the status display

### Requirement 6: 用户交互增强

**User Story:** As a user, I want intuitive interactions with the tray icon, so that I can efficiently control the application without confusion.

#### Acceptance Criteria

1. WHEN user left-clicks the tray icon, THE Desktop_App SHALL show/hide the main window
2. WHEN user right-clicks the tray icon (on Windows/Linux), THE Tray_Manager SHALL show the context menu
3. WHEN user hovers over the tray icon, THE Tooltip SHALL appear within 500ms
4. WHEN user clicks "Start Pomodoro" in the context menu, THE Desktop_App SHALL bring the main window to front and navigate to pomodoro page
5. WHEN user clicks "View Status" in the context menu, THE Desktop_App SHALL bring the main window to front and show the dashboard
6. WHEN user clicks "Settings" in the context menu, THE Desktop_App SHALL bring the main window to front and navigate to settings

### Requirement 7: 番茄完成后的状态逻辑优化

**User Story:** As a user, I want the system to handle pomodoro completion transitions intelligently, so that I don't see confusing rest prompts when I'm already in over-rest state.

#### Acceptance Criteria

1. WHEN a pomodoro completes AND current system state is OVER_REST, THE System SHALL skip the rest prompt and remain in OVER_REST state
2. WHEN a pomodoro completes AND current system state is OVER_REST, THE Tray_Manager SHALL immediately show over-rest status instead of rest countdown
3. WHEN a pomodoro completes AND auto-rest is enabled AND current state is not OVER_REST, THE System SHALL start rest period automatically
4. WHEN a pomodoro completes AND auto-rest is disabled AND current state is not OVER_REST, THE System SHALL show rest start prompt
5. WHEN navigating to pomodoro page while in OVER_REST state, THE System SHALL not show rest prompts or rest start buttons
6. WHEN in OVER_REST state AND user starts a new pomodoro, THE System SHALL transition directly to FOCUS state without rest period
7. THE System SHALL calculate over-rest duration from the end of the previous rest period, not from pomodoro completion time
8. WHEN rest period ends naturally, THE System SHALL transition to OVER_REST state and update tray display accordingly
9. WHEN auto-rest is enabled AND rest completes, THE System SHALL not show manual rest start prompts or buttons

### Requirement 8: 休息时间倒计时显示

**User Story:** As a user, I want to see the remaining rest time in the tray during break periods, so that I can track my break duration without opening the main application.

#### Acceptance Criteria

1. WHEN system is in REST state, THE Tray_Manager SHALL display rest countdown in MM:SS format
2. WHEN system is in REST state, THE Context_Menu SHALL show "☕ Rest Mode ([MM:SS] remaining)" format
3. WHEN system is in REST state, THE Tooltip SHALL show "VibeFlow - Rest ([MM:SS] remaining)" format
4. WHEN rest countdown reaches 00:00, THE Tray_Manager SHALL immediately update to show completion or over-rest status
5. THE Rest countdown SHALL update every second during rest periods
6. WHEN transitioning from REST to OVER_REST, THE Tray_Manager SHALL switch from countdown to over-rest duration display
7. THE Rest countdown SHALL use the same MM:SS format as pomodoro countdown for consistency
