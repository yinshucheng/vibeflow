# Requirements Document

## Introduction

本文档定义了 VibeFlow 状态感知应用/网站限制功能的需求。主要目标是：
1. 对应用和网站进行分类（工作类 vs 分心类）
2. 根据系统状态（FOCUS/REST/SLEEP）动态应用不同的限制策略
3. 确保用户在该工作时专注工作，该休息时真正休息，该睡觉时好好睡觉

## Glossary

- **Work_App**: 工作应用，如 IDE、终端、邮件客户端等，在休息/睡眠时应被限制
- **Distraction_App**: 分心应用，如社交、游戏、视频等，在专注时应被限制（已有）
- **Work_Site**: 工作网站，如 GitHub、Jira、公司内网等，在休息/睡眠时应被限制
- **Distraction_Site**: 分心网站，如 YouTube、Twitter、新闻等，在专注时应被限制（已有 blacklist）
- **State_Policy**: 状态策略，定义每个系统状态下的应用/网站限制规则
- **Enforcement_Mode**: 执行模式，strict（强制关闭）或 gentle（隐藏+提醒）

## Requirements

### Requirement 1: 应用分类管理

**User Story:** As a user, I want to classify my applications into work and distraction categories, so that the system can apply appropriate restrictions based on my current state.

#### Acceptance Criteria

1. THE System SHALL maintain two application lists: Work_Apps and Distraction_Apps
2. THE User_Settings SHALL provide preset Work_Apps list including:
   - IDE: VS Code, Cursor, IntelliJ IDEA, Xcode, Android Studio
   - Terminal: Terminal, iTerm, Warp, Hyper
   - Email: Mail, Outlook, Spark
   - Productivity: Notion, Obsidian
3. THE User_Settings SHALL allow users to add custom applications to Work_Apps list
4. THE User_Settings SHALL allow users to remove applications from Work_Apps list
5. THE existing Distraction_Apps functionality SHALL remain unchanged
6. EACH application entry SHALL contain: bundleId, name, category, isPreset

### Requirement 2: 网站分类管理

**User Story:** As a user, I want to classify websites into work and distraction categories, so that the browser extension can apply appropriate restrictions based on my current state.

#### Acceptance Criteria

1. THE System SHALL maintain two website lists: Work_Sites and Distraction_Sites
2. THE User_Settings SHALL provide preset Work_Sites list including:
   - Code: github.com, gitlab.com, bitbucket.org
   - Documentation: notion.so, confluence.*, docs.google.com
   - Project Management: jira.*, linear.app, asana.com, trello.com
3. THE User_Settings SHALL allow users to add custom URLs/patterns to Work_Sites list
4. THE User_Settings SHALL allow users to remove URLs from Work_Sites list
5. THE existing blacklist (Distraction_Sites) functionality SHALL remain unchanged
6. EACH site entry SHALL support pattern matching (e.g., *.company.com)

### Requirement 3: FOCUS 状态限制策略

**User Story:** As a user, I want distraction apps and sites to be blocked during FOCUS state, so that I can concentrate on my work.

#### Acceptance Criteria

1. WHILE in FOCUS state, THE Desktop_App SHALL enforce restrictions on Distraction_Apps
2. WHILE in FOCUS state, THE Browser_Extension SHALL enforce restrictions on Distraction_Sites
3. THE enforcement behavior SHALL follow the existing enforcementMode setting (strict/gentle)
4. THIS requirement documents existing behavior and SHALL NOT require new implementation

### Requirement 4: REST 状态限制策略

**User Story:** As a user, I want work apps and sites to be optionally blocked during REST state, so that I can truly rest and recover.

#### Acceptance Criteria

1. THE User_Settings SHALL provide restEnforcement configuration:
   - enabled: Boolean (default: false)
   - blockWorkApps: Boolean (default: true)
   - blockWorkSites: Boolean (default: true)
   - mode: 'gentle' | 'strict' (default: 'gentle')
2. WHILE in REST state AND restEnforcement.enabled is true:
   - IF blockWorkApps is true, THE Desktop_App SHALL enforce restrictions on Work_Apps
   - IF blockWorkSites is true, THE Browser_Extension SHALL enforce restrictions on Work_Sites
3. WHEN Work_App restriction is triggered in gentle mode, THE System SHALL show a reminder: "现在是休息时间，请放松一下"
4. WHEN Work_App restriction is triggered in strict mode, THE System SHALL close the Work_App
5. THE User SHALL be able to use Skip_Token to temporarily bypass REST restrictions

### Requirement 5: SLEEP 状态限制策略

**User Story:** As a user, I want work apps and sites to be blocked during sleep time, so that I can maintain healthy sleep habits.

#### Acceptance Criteria

1. THE User_Settings SHALL provide sleepEnforcement configuration:
   - enabled: Boolean (reuse existing sleepTimeEnabled)
   - blockWorkApps: Boolean (default: true)
   - blockWorkSites: Boolean (default: true)
   - mode: 'gentle' | 'strict' (default: 'strict')
2. WHILE within configured sleep time (sleepTimeStart to sleepTimeEnd) AND sleepEnforcement.enabled is true:
   - IF blockWorkApps is true, THE Desktop_App SHALL enforce restrictions on Work_Apps
   - IF blockWorkSites is true, THE Browser_Extension SHALL enforce restrictions on Work_Sites
3. WHEN Work_App restriction is triggered during sleep time, THE System SHALL show a reminder: "现在是睡眠时间，请休息"
4. THE existing sleepSnoozeLimit and sleepSnoozeDuration settings SHALL apply to sleep enforcement
5. THE System SHALL log sleep enforcement bypass attempts for user awareness

### Requirement 6: 设置界面

**User Story:** As a user, I want a unified settings interface to manage app/site classifications and state policies.

#### Acceptance Criteria

1. THE Settings_Page SHALL provide a "Work Apps" section to manage Work_Apps list
2. THE Settings_Page SHALL provide a "Work Sites" section to manage Work_Sites list
3. THE Settings_Page SHALL provide a "Rest Enforcement" section with toggle and options
4. THE Settings_Page SHALL provide a "Sleep Enforcement" section with toggle and options
5. THE Settings_Page SHALL display preset items with a badge indicating they are presets
6. THE Settings_Page SHALL allow searching/filtering in app and site lists
7. WHILE in production mode AND within Work_Time, THE Settings_Page SHALL lock sensitive settings

### Requirement 7: 策略分发

**User Story:** As a system, I need to distribute state-aware policies to all clients (desktop, browser extension, mobile).

#### Acceptance Criteria

1. THE Policy object SHALL include:
   - workApps: Work_App[]
   - distractionApps: Distraction_App[] (existing)
   - workSites: string[]
   - distractionSites: string[] (existing blacklist)
   - restEnforcement: RestEnforcementConfig
   - sleepEnforcement: SleepEnforcementConfig
2. WHEN user settings change, THE Server SHALL distribute updated policy to all connected clients
3. THE Desktop_App SHALL cache policy for offline operation
4. THE Browser_Extension SHALL cache policy for offline operation

## State-Policy Matrix

| State | Block Distraction Apps | Block Distraction Sites | Block Work Apps | Block Work Sites |
|-------|----------------------|------------------------|-----------------|------------------|
| PLANNING | No | No | No | No |
| FOCUS | Yes | Yes | No | No |
| REST | No | No | Configurable | Configurable |
| OVER_REST | No | No | Configurable | Configurable |
| SLEEP | No | No | Configurable | Configurable |

## Out of Scope

1. 移动端（iOS）的应用限制执行（iOS 系统限制）
2. 自动检测应用/网站分类（需用户手动配置）
3. 基于 AI 的智能分类建议（可作为后续增强）
