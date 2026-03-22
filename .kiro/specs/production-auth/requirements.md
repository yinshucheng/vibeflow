# Requirements Document

## Introduction

本文档定义 VibeFlow 生产级认证系统的需求。当前系统仅有 Email/Password Credentials Provider 和开发模式 Header Bypass，缺少登录/注册 UI、密码重置、邮箱验证、OAuth 集成等生产必需功能。本 Spec 覆盖从认证 UI 到安全加固的完整上线要求。

## Glossary

- **Auth_Page**: 认证相关页面（登录、注册、密码重置）
- **OAuth_Provider**: 第三方 OAuth 认证（Google、GitHub、Apple）
- **Password_Reset**: 密码重置流程（发送邮件 → 验证 Token → 修改密码）
- **Email_Verification**: 注册后邮箱验证流程
- **Route_Guard**: 前端路由守卫，未认证用户重定向到登录页
- **Dev_Bypass**: 开发模式下通过 `X-Dev-User-Email` Header 绕过认证的机制

## Requirements

### Requirement 1: 登录页面

**User Story:** As a user, I want to see a login page when I'm not authenticated, so that I can sign in to my account.

#### Acceptance Criteria

1. WHEN an unauthenticated user visits any protected route THEN the System SHALL redirect to `/login`
2. WHEN a user is on `/login` THEN the System SHALL display email/password form and OAuth buttons
3. WHEN a user submits valid credentials THEN the System SHALL authenticate and redirect to dashboard
4. WHEN a user submits invalid credentials THEN the System SHALL display an error message without revealing which field is wrong
5. WHEN a user clicks an OAuth button THEN the System SHALL initiate the OAuth flow

### Requirement 2: 注册页面

**User Story:** As a new user, I want to create an account, so that I can start using VibeFlow.

#### Acceptance Criteria

1. WHEN a user visits `/register` THEN the System SHALL display a registration form with email, password, and confirm password fields
2. WHEN a user submits a valid registration THEN the System SHALL create the account and send a verification email
3. WHEN a user submits a password shorter than 8 characters THEN the System SHALL reject with a validation error
4. WHEN a user submits an already-registered email THEN the System SHALL display a generic error (prevent email enumeration)

### Requirement 3: 密码重置

**User Story:** As a user who forgot my password, I want to reset it via email, so that I can regain access to my account.

#### Acceptance Criteria

1. WHEN a user clicks "Forgot Password" on login page THEN the System SHALL navigate to `/forgot-password`
2. WHEN a user submits their email THEN the System SHALL send a password reset link (valid for 1 hour)
3. WHEN a user clicks the reset link THEN the System SHALL display a new password form
4. WHEN a user submits a new password THEN the System SHALL update the password and redirect to login

### Requirement 4: OAuth 集成

**User Story:** As a user, I want to sign in with my Google account, so that I don't need to remember another password.

#### Acceptance Criteria

1. WHEN a user clicks "Sign in with Google" THEN the System SHALL redirect to Google OAuth consent screen
2. WHEN Google returns a valid token THEN the System SHALL create or link the user account
3. WHEN a user has both credentials and OAuth linked THEN the System SHALL allow login via either method
4. WHEN OAuth fails THEN the System SHALL display an appropriate error and allow retry

### Requirement 5: 生产环境安全加固

**User Story:** As a system administrator, I want production security hardened, so that the application is safe for public use.

#### Acceptance Criteria

1. WHEN `DEV_MODE` is not `true` THEN the System SHALL reject all `X-Dev-User-Email` header bypasses
2. WHEN setting a session cookie THEN the System SHALL use HttpOnly, Secure, SameSite=Lax flags
3. WHEN a CSRF token is missing or invalid on mutation requests THEN the System SHALL reject the request
4. WHEN `NEXTAUTH_SECRET` is less than 32 characters THEN the Server SHALL refuse to start

### Requirement 6: 路由守卫

**User Story:** As a user, I want to be redirected to login when my session expires, so that I understand why I can't access the page.

#### Acceptance Criteria

1. WHEN an unauthenticated request hits a `protectedProcedure` THEN the tRPC layer SHALL return `UNAUTHORIZED`
2. WHEN the frontend receives `UNAUTHORIZED` THEN it SHALL redirect to `/login` with a return URL parameter
3. WHEN a user logs in with a return URL THEN the System SHALL redirect back to the original page
