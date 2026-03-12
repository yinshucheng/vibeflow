# Requirements Document

## Introduction

本文档定义 VibeFlow 上线前的收尾打磨需求，涵盖密钥安全、性能基线、用户引导和隐私合规等散项。这些不构成独立大功能，但都是生产环境上线的必要条件。

## Glossary

- **Secret_Management**: 生产环境密钥（API Key、DB 密码）的安全管理
- **Performance_Baseline**: 核心页面和 API 的性能基准指标
- **Onboarding_Tour**: 新用户首次使用时的引导流程
- **Privacy_Policy**: 隐私政策声明页面

## Requirements

### Requirement 1: 密钥安全

**User Story:** As a system administrator, I want production secrets to be managed securely, so that API keys and credentials are not exposed.

#### Acceptance Criteria

1. WHEN checking `.gitignore` THEN `.env`, `.env.local`, `.env.production` SHALL be included
2. WHEN LLM API quota is exhausted THEN the System SHALL gracefully degrade (返回友好错误而非 crash）
3. WHEN `NEXTAUTH_SECRET` is configured THEN it SHALL be at least 32 random characters
4. WHEN a new developer runs the project THEN `.env.example` SHALL document all required variables with dummy values

### Requirement 2: 性能基线

**User Story:** As a developer, I want performance baselines established, so that regressions can be detected.

#### Acceptance Criteria

1. WHEN measuring dashboard page THEN LCP SHALL be under 2.5 seconds
2. WHEN measuring task list with 100+ tasks THEN render time SHALL be under 1 second
3. WHEN checking Prisma queries THEN there SHALL be no N+1 queries on list endpoints
4. WHEN checking database THEN frequently queried columns SHALL have appropriate indexes

### Requirement 3: 用户引导

**User Story:** As a new user, I want to understand how VibeFlow works on first use, so that I can start being productive quickly.

#### Acceptance Criteria

1. WHEN a user logs in for the first time THEN the System SHALL show a brief onboarding tour highlighting key features
2. WHEN a user dismisses the tour THEN it SHALL not appear again
3. WHEN a user wants to revisit the tour THEN it SHALL be accessible from Settings

### Requirement 4: 隐私与合规

**User Story:** As a user, I want to know how my data is handled and have control over it.

#### Acceptance Criteria

1. WHEN a user visits `/privacy` THEN the System SHALL display the privacy policy
2. WHEN a user requests data export THEN the System SHALL provide a downloadable archive of their data
3. WHEN a user requests account deletion THEN the System SHALL permanently delete all their data within 30 days
