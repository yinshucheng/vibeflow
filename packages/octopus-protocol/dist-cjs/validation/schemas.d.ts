/**
 * Octopus Architecture - Zod Validation Schemas
 *
 * Runtime validation schemas for all protocol types.
 */
import { z } from 'zod';
export declare const EventTypeSchema: z.ZodEnum<["ACTIVITY_LOG", "STATE_CHANGE", "USER_ACTION", "HEARTBEAT", "TIMELINE_EVENT", "BLOCK_EVENT", "INTERRUPTION_EVENT", "BROWSER_ACTIVITY", "BROWSER_SESSION", "TAB_SWITCH", "BROWSER_FOCUS", "ENTERTAINMENT_MODE", "WORK_START", "CHAT_MESSAGE", "CHAT_ACTION", "CHAT_HISTORY_REQUEST", "DESKTOP_APP_USAGE", "DESKTOP_IDLE", "DESKTOP_WINDOW_CHANGE"]>;
export declare const ClientTypeSchema: z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>;
export declare const CommandTypeSchema: z.ZodEnum<["SYNC_STATE", "EXECUTE_ACTION", "UPDATE_POLICY", "SHOW_UI", "ACTION_RESULT", "CHAT_RESPONSE", "CHAT_TOOL_CALL", "CHAT_TOOL_RESULT", "CHAT_SYNC"]>;
export declare const ActionTypeSchema: z.ZodEnum<["CLOSE_APP", "HIDE_APP", "BRING_TO_FRONT", "SHOW_NOTIFICATION", "CLOSE_TAB", "REDIRECT_TAB", "INJECT_OVERLAY", "ADD_SESSION_WHITELIST", "SEND_PUSH", "PLAY_SOUND", "VIBRATE"]>;
export declare const ActivityCategorySchema: z.ZodEnum<["productive", "neutral", "distracting"]>;
export declare const ConnectionQualitySchema: z.ZodEnum<["good", "degraded", "poor"]>;
export declare const NavigationTypeSchema: z.ZodEnum<["link", "typed", "reload", "back_forward", "other"]>;
export declare const SearchEngineSchema: z.ZodEnum<["google", "bing", "duckduckgo", "other"]>;
export declare const BrowserFocusStateSchema: z.ZodEnum<["focused", "blurred", "unknown"]>;
export declare const EntertainmentStopReasonSchema: z.ZodEnum<["manual", "quota_exhausted", "work_time_start"]>;
export declare const CommandPrioritySchema: z.ZodEnum<["low", "normal", "high", "critical"]>;
export declare const UITypeSchema: z.ZodEnum<["notification", "modal", "overlay", "toast"]>;
export declare const BaseEventSchema: z.ZodObject<{
    eventId: z.ZodString;
    eventType: z.ZodEnum<["ACTIVITY_LOG", "STATE_CHANGE", "USER_ACTION", "HEARTBEAT", "TIMELINE_EVENT", "BLOCK_EVENT", "INTERRUPTION_EVENT", "BROWSER_ACTIVITY", "BROWSER_SESSION", "TAB_SWITCH", "BROWSER_FOCUS", "ENTERTAINMENT_MODE", "WORK_START", "CHAT_MESSAGE", "CHAT_ACTION", "CHAT_HISTORY_REQUEST", "DESKTOP_APP_USAGE", "DESKTOP_IDLE", "DESKTOP_WINDOW_CHANGE"]>;
    userId: z.ZodString;
    clientId: z.ZodString;
    clientType: z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>;
    timestamp: z.ZodNumber;
    sequenceNumber: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    eventId: string;
    eventType: "ACTIVITY_LOG" | "STATE_CHANGE" | "USER_ACTION" | "HEARTBEAT" | "TIMELINE_EVENT" | "BLOCK_EVENT" | "INTERRUPTION_EVENT" | "BROWSER_ACTIVITY" | "BROWSER_SESSION" | "TAB_SWITCH" | "BROWSER_FOCUS" | "ENTERTAINMENT_MODE" | "WORK_START" | "CHAT_MESSAGE" | "CHAT_ACTION" | "CHAT_HISTORY_REQUEST" | "DESKTOP_APP_USAGE" | "DESKTOP_IDLE" | "DESKTOP_WINDOW_CHANGE";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
}, {
    eventId: string;
    eventType: "ACTIVITY_LOG" | "STATE_CHANGE" | "USER_ACTION" | "HEARTBEAT" | "TIMELINE_EVENT" | "BLOCK_EVENT" | "INTERRUPTION_EVENT" | "BROWSER_ACTIVITY" | "BROWSER_SESSION" | "TAB_SWITCH" | "BROWSER_FOCUS" | "ENTERTAINMENT_MODE" | "WORK_START" | "CHAT_MESSAGE" | "CHAT_ACTION" | "CHAT_HISTORY_REQUEST" | "DESKTOP_APP_USAGE" | "DESKTOP_IDLE" | "DESKTOP_WINDOW_CHANGE";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
}>;
export declare const ActivityLogPayloadSchema: z.ZodObject<{
    source: z.ZodEnum<["browser", "desktop_app", "mobile_app"]>;
    identifier: z.ZodString;
    title: z.ZodString;
    duration: z.ZodNumber;
    category: z.ZodEnum<["productive", "neutral", "distracting"]>;
    metadata: z.ZodOptional<z.ZodObject<{
        domain: z.ZodOptional<z.ZodString>;
        appBundleId: z.ZodOptional<z.ZodString>;
        windowTitle: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        domain?: string | undefined;
        appBundleId?: string | undefined;
        windowTitle?: string | undefined;
    }, {
        domain?: string | undefined;
        appBundleId?: string | undefined;
        windowTitle?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    source: "browser" | "desktop_app" | "mobile_app";
    identifier: string;
    title: string;
    duration: number;
    category: "productive" | "neutral" | "distracting";
    metadata?: {
        domain?: string | undefined;
        appBundleId?: string | undefined;
        windowTitle?: string | undefined;
    } | undefined;
}, {
    source: "browser" | "desktop_app" | "mobile_app";
    identifier: string;
    title: string;
    duration: number;
    category: "productive" | "neutral" | "distracting";
    metadata?: {
        domain?: string | undefined;
        appBundleId?: string | undefined;
        windowTitle?: string | undefined;
    } | undefined;
}>;
export declare const ActivityLogEventSchema: z.ZodObject<{
    eventId: z.ZodString;
    userId: z.ZodString;
    clientId: z.ZodString;
    clientType: z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>;
    timestamp: z.ZodNumber;
    sequenceNumber: z.ZodNumber;
} & {
    eventType: z.ZodLiteral<"ACTIVITY_LOG">;
    payload: z.ZodObject<{
        source: z.ZodEnum<["browser", "desktop_app", "mobile_app"]>;
        identifier: z.ZodString;
        title: z.ZodString;
        duration: z.ZodNumber;
        category: z.ZodEnum<["productive", "neutral", "distracting"]>;
        metadata: z.ZodOptional<z.ZodObject<{
            domain: z.ZodOptional<z.ZodString>;
            appBundleId: z.ZodOptional<z.ZodString>;
            windowTitle: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            domain?: string | undefined;
            appBundleId?: string | undefined;
            windowTitle?: string | undefined;
        }, {
            domain?: string | undefined;
            appBundleId?: string | undefined;
            windowTitle?: string | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        source: "browser" | "desktop_app" | "mobile_app";
        identifier: string;
        title: string;
        duration: number;
        category: "productive" | "neutral" | "distracting";
        metadata?: {
            domain?: string | undefined;
            appBundleId?: string | undefined;
            windowTitle?: string | undefined;
        } | undefined;
    }, {
        source: "browser" | "desktop_app" | "mobile_app";
        identifier: string;
        title: string;
        duration: number;
        category: "productive" | "neutral" | "distracting";
        metadata?: {
            domain?: string | undefined;
            appBundleId?: string | undefined;
            windowTitle?: string | undefined;
        } | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    eventId: string;
    eventType: "ACTIVITY_LOG";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        source: "browser" | "desktop_app" | "mobile_app";
        identifier: string;
        title: string;
        duration: number;
        category: "productive" | "neutral" | "distracting";
        metadata?: {
            domain?: string | undefined;
            appBundleId?: string | undefined;
            windowTitle?: string | undefined;
        } | undefined;
    };
}, {
    eventId: string;
    eventType: "ACTIVITY_LOG";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        source: "browser" | "desktop_app" | "mobile_app";
        identifier: string;
        title: string;
        duration: number;
        category: "productive" | "neutral" | "distracting";
        metadata?: {
            domain?: string | undefined;
            appBundleId?: string | undefined;
            windowTitle?: string | undefined;
        } | undefined;
    };
}>;
export declare const StateChangePayloadSchema: z.ZodObject<{
    previousState: z.ZodString;
    newState: z.ZodString;
    trigger: z.ZodString;
    timestamp: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    timestamp: number;
    previousState: string;
    newState: string;
    trigger: string;
}, {
    timestamp: number;
    previousState: string;
    newState: string;
    trigger: string;
}>;
export declare const StateChangeEventSchema: z.ZodObject<{
    eventId: z.ZodString;
    userId: z.ZodString;
    clientId: z.ZodString;
    clientType: z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>;
    timestamp: z.ZodNumber;
    sequenceNumber: z.ZodNumber;
} & {
    eventType: z.ZodLiteral<"STATE_CHANGE">;
    payload: z.ZodObject<{
        previousState: z.ZodString;
        newState: z.ZodString;
        trigger: z.ZodString;
        timestamp: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        timestamp: number;
        previousState: string;
        newState: string;
        trigger: string;
    }, {
        timestamp: number;
        previousState: string;
        newState: string;
        trigger: string;
    }>;
}, "strip", z.ZodTypeAny, {
    eventId: string;
    eventType: "STATE_CHANGE";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        timestamp: number;
        previousState: string;
        newState: string;
        trigger: string;
    };
}, {
    eventId: string;
    eventType: "STATE_CHANGE";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        timestamp: number;
        previousState: string;
        newState: string;
        trigger: string;
    };
}>;
export declare const UserActionPayloadSchema: z.ZodObject<{
    actionType: z.ZodString;
    targetEntity: z.ZodOptional<z.ZodString>;
    parameters: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    result: z.ZodOptional<z.ZodString>;
    optimisticId: z.ZodOptional<z.ZodString>;
    data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    actionType: string;
    targetEntity?: string | undefined;
    parameters?: Record<string, unknown> | undefined;
    result?: string | undefined;
    optimisticId?: string | undefined;
    data?: Record<string, unknown> | undefined;
}, {
    actionType: string;
    targetEntity?: string | undefined;
    parameters?: Record<string, unknown> | undefined;
    result?: string | undefined;
    optimisticId?: string | undefined;
    data?: Record<string, unknown> | undefined;
}>;
export declare const UserActionEventSchema: z.ZodObject<{
    eventId: z.ZodString;
    userId: z.ZodString;
    clientId: z.ZodString;
    clientType: z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>;
    timestamp: z.ZodNumber;
    sequenceNumber: z.ZodNumber;
} & {
    eventType: z.ZodLiteral<"USER_ACTION">;
    payload: z.ZodObject<{
        actionType: z.ZodString;
        targetEntity: z.ZodOptional<z.ZodString>;
        parameters: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        result: z.ZodOptional<z.ZodString>;
        optimisticId: z.ZodOptional<z.ZodString>;
        data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        actionType: string;
        targetEntity?: string | undefined;
        parameters?: Record<string, unknown> | undefined;
        result?: string | undefined;
        optimisticId?: string | undefined;
        data?: Record<string, unknown> | undefined;
    }, {
        actionType: string;
        targetEntity?: string | undefined;
        parameters?: Record<string, unknown> | undefined;
        result?: string | undefined;
        optimisticId?: string | undefined;
        data?: Record<string, unknown> | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    eventId: string;
    eventType: "USER_ACTION";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        actionType: string;
        targetEntity?: string | undefined;
        parameters?: Record<string, unknown> | undefined;
        result?: string | undefined;
        optimisticId?: string | undefined;
        data?: Record<string, unknown> | undefined;
    };
}, {
    eventId: string;
    eventType: "USER_ACTION";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        actionType: string;
        targetEntity?: string | undefined;
        parameters?: Record<string, unknown> | undefined;
        result?: string | undefined;
        optimisticId?: string | undefined;
        data?: Record<string, unknown> | undefined;
    };
}>;
export declare const HeartbeatPayloadSchema: z.ZodObject<{
    clientVersion: z.ZodString;
    platform: z.ZodString;
    connectionQuality: z.ZodEnum<["good", "degraded", "poor"]>;
    localStateHash: z.ZodString;
    capabilities: z.ZodArray<z.ZodString, "many">;
    uptime: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    uptime: number;
    clientVersion: string;
    platform: string;
    connectionQuality: "good" | "degraded" | "poor";
    localStateHash: string;
    capabilities: string[];
}, {
    uptime: number;
    clientVersion: string;
    platform: string;
    connectionQuality: "good" | "degraded" | "poor";
    localStateHash: string;
    capabilities: string[];
}>;
export declare const HeartbeatEventSchema: z.ZodObject<{
    eventId: z.ZodString;
    userId: z.ZodString;
    clientId: z.ZodString;
    clientType: z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>;
    timestamp: z.ZodNumber;
    sequenceNumber: z.ZodNumber;
} & {
    eventType: z.ZodLiteral<"HEARTBEAT">;
    payload: z.ZodObject<{
        clientVersion: z.ZodString;
        platform: z.ZodString;
        connectionQuality: z.ZodEnum<["good", "degraded", "poor"]>;
        localStateHash: z.ZodString;
        capabilities: z.ZodArray<z.ZodString, "many">;
        uptime: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        uptime: number;
        clientVersion: string;
        platform: string;
        connectionQuality: "good" | "degraded" | "poor";
        localStateHash: string;
        capabilities: string[];
    }, {
        uptime: number;
        clientVersion: string;
        platform: string;
        connectionQuality: "good" | "degraded" | "poor";
        localStateHash: string;
        capabilities: string[];
    }>;
}, "strip", z.ZodTypeAny, {
    eventId: string;
    eventType: "HEARTBEAT";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        uptime: number;
        clientVersion: string;
        platform: string;
        connectionQuality: "good" | "degraded" | "poor";
        localStateHash: string;
        capabilities: string[];
    };
}, {
    eventId: string;
    eventType: "HEARTBEAT";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        uptime: number;
        clientVersion: string;
        platform: string;
        connectionQuality: "good" | "degraded" | "poor";
        localStateHash: string;
        capabilities: string[];
    };
}>;
export declare const BrowserActivityPayloadSchema: z.ZodObject<{
    url: z.ZodString;
    title: z.ZodString;
    domain: z.ZodString;
    startTime: z.ZodNumber;
    endTime: z.ZodNumber;
    duration: z.ZodNumber;
    activeDuration: z.ZodNumber;
    idleTime: z.ZodNumber;
    category: z.ZodEnum<["productive", "neutral", "distracting"]>;
    productivityScore: z.ZodNumber;
    scrollDepth: z.ZodNumber;
    interactionCount: z.ZodNumber;
    isMediaPlaying: z.ZodBoolean;
    mediaPlayDuration: z.ZodNumber;
    referrer: z.ZodOptional<z.ZodString>;
    navigationType: z.ZodEnum<["link", "typed", "reload", "back_forward", "other"]>;
    searchQuery: z.ZodOptional<z.ZodString>;
    searchEngine: z.ZodOptional<z.ZodEnum<["google", "bing", "duckduckgo", "other"]>>;
}, "strip", z.ZodTypeAny, {
    title: string;
    duration: number;
    category: "productive" | "neutral" | "distracting";
    domain: string;
    url: string;
    startTime: number;
    endTime: number;
    activeDuration: number;
    idleTime: number;
    productivityScore: number;
    scrollDepth: number;
    interactionCount: number;
    isMediaPlaying: boolean;
    mediaPlayDuration: number;
    navigationType: "link" | "typed" | "reload" | "back_forward" | "other";
    referrer?: string | undefined;
    searchQuery?: string | undefined;
    searchEngine?: "other" | "google" | "bing" | "duckduckgo" | undefined;
}, {
    title: string;
    duration: number;
    category: "productive" | "neutral" | "distracting";
    domain: string;
    url: string;
    startTime: number;
    endTime: number;
    activeDuration: number;
    idleTime: number;
    productivityScore: number;
    scrollDepth: number;
    interactionCount: number;
    isMediaPlaying: boolean;
    mediaPlayDuration: number;
    navigationType: "link" | "typed" | "reload" | "back_forward" | "other";
    referrer?: string | undefined;
    searchQuery?: string | undefined;
    searchEngine?: "other" | "google" | "bing" | "duckduckgo" | undefined;
}>;
export declare const BrowserActivityEventSchema: z.ZodObject<{
    eventId: z.ZodString;
    userId: z.ZodString;
    clientId: z.ZodString;
    clientType: z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>;
    timestamp: z.ZodNumber;
    sequenceNumber: z.ZodNumber;
} & {
    eventType: z.ZodLiteral<"BROWSER_ACTIVITY">;
    payload: z.ZodObject<{
        url: z.ZodString;
        title: z.ZodString;
        domain: z.ZodString;
        startTime: z.ZodNumber;
        endTime: z.ZodNumber;
        duration: z.ZodNumber;
        activeDuration: z.ZodNumber;
        idleTime: z.ZodNumber;
        category: z.ZodEnum<["productive", "neutral", "distracting"]>;
        productivityScore: z.ZodNumber;
        scrollDepth: z.ZodNumber;
        interactionCount: z.ZodNumber;
        isMediaPlaying: z.ZodBoolean;
        mediaPlayDuration: z.ZodNumber;
        referrer: z.ZodOptional<z.ZodString>;
        navigationType: z.ZodEnum<["link", "typed", "reload", "back_forward", "other"]>;
        searchQuery: z.ZodOptional<z.ZodString>;
        searchEngine: z.ZodOptional<z.ZodEnum<["google", "bing", "duckduckgo", "other"]>>;
    }, "strip", z.ZodTypeAny, {
        title: string;
        duration: number;
        category: "productive" | "neutral" | "distracting";
        domain: string;
        url: string;
        startTime: number;
        endTime: number;
        activeDuration: number;
        idleTime: number;
        productivityScore: number;
        scrollDepth: number;
        interactionCount: number;
        isMediaPlaying: boolean;
        mediaPlayDuration: number;
        navigationType: "link" | "typed" | "reload" | "back_forward" | "other";
        referrer?: string | undefined;
        searchQuery?: string | undefined;
        searchEngine?: "other" | "google" | "bing" | "duckduckgo" | undefined;
    }, {
        title: string;
        duration: number;
        category: "productive" | "neutral" | "distracting";
        domain: string;
        url: string;
        startTime: number;
        endTime: number;
        activeDuration: number;
        idleTime: number;
        productivityScore: number;
        scrollDepth: number;
        interactionCount: number;
        isMediaPlaying: boolean;
        mediaPlayDuration: number;
        navigationType: "link" | "typed" | "reload" | "back_forward" | "other";
        referrer?: string | undefined;
        searchQuery?: string | undefined;
        searchEngine?: "other" | "google" | "bing" | "duckduckgo" | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    eventId: string;
    eventType: "BROWSER_ACTIVITY";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        title: string;
        duration: number;
        category: "productive" | "neutral" | "distracting";
        domain: string;
        url: string;
        startTime: number;
        endTime: number;
        activeDuration: number;
        idleTime: number;
        productivityScore: number;
        scrollDepth: number;
        interactionCount: number;
        isMediaPlaying: boolean;
        mediaPlayDuration: number;
        navigationType: "link" | "typed" | "reload" | "back_forward" | "other";
        referrer?: string | undefined;
        searchQuery?: string | undefined;
        searchEngine?: "other" | "google" | "bing" | "duckduckgo" | undefined;
    };
}, {
    eventId: string;
    eventType: "BROWSER_ACTIVITY";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        title: string;
        duration: number;
        category: "productive" | "neutral" | "distracting";
        domain: string;
        url: string;
        startTime: number;
        endTime: number;
        activeDuration: number;
        idleTime: number;
        productivityScore: number;
        scrollDepth: number;
        interactionCount: number;
        isMediaPlaying: boolean;
        mediaPlayDuration: number;
        navigationType: "link" | "typed" | "reload" | "back_forward" | "other";
        referrer?: string | undefined;
        searchQuery?: string | undefined;
        searchEngine?: "other" | "google" | "bing" | "duckduckgo" | undefined;
    };
}>;
export declare const DomainBreakdownEntrySchema: z.ZodObject<{
    domain: z.ZodString;
    duration: z.ZodNumber;
    activeDuration: z.ZodNumber;
    category: z.ZodEnum<["productive", "neutral", "distracting"]>;
    visitCount: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    duration: number;
    category: "productive" | "neutral" | "distracting";
    domain: string;
    activeDuration: number;
    visitCount: number;
}, {
    duration: number;
    category: "productive" | "neutral" | "distracting";
    domain: string;
    activeDuration: number;
    visitCount: number;
}>;
export declare const BrowserSessionPayloadSchema: z.ZodObject<{
    sessionId: z.ZodString;
    startTime: z.ZodNumber;
    endTime: z.ZodNumber;
    totalDuration: z.ZodNumber;
    activeDuration: z.ZodNumber;
    domainBreakdown: z.ZodArray<z.ZodObject<{
        domain: z.ZodString;
        duration: z.ZodNumber;
        activeDuration: z.ZodNumber;
        category: z.ZodEnum<["productive", "neutral", "distracting"]>;
        visitCount: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        duration: number;
        category: "productive" | "neutral" | "distracting";
        domain: string;
        activeDuration: number;
        visitCount: number;
    }, {
        duration: number;
        category: "productive" | "neutral" | "distracting";
        domain: string;
        activeDuration: number;
        visitCount: number;
    }>, "many">;
    tabSwitchCount: z.ZodNumber;
    rapidTabSwitches: z.ZodNumber;
    uniqueDomainsVisited: z.ZodNumber;
    productiveTime: z.ZodNumber;
    distractingTime: z.ZodNumber;
    neutralTime: z.ZodNumber;
    productivityScore: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    startTime: number;
    endTime: number;
    activeDuration: number;
    productivityScore: number;
    sessionId: string;
    totalDuration: number;
    domainBreakdown: {
        duration: number;
        category: "productive" | "neutral" | "distracting";
        domain: string;
        activeDuration: number;
        visitCount: number;
    }[];
    tabSwitchCount: number;
    rapidTabSwitches: number;
    uniqueDomainsVisited: number;
    productiveTime: number;
    distractingTime: number;
    neutralTime: number;
}, {
    startTime: number;
    endTime: number;
    activeDuration: number;
    productivityScore: number;
    sessionId: string;
    totalDuration: number;
    domainBreakdown: {
        duration: number;
        category: "productive" | "neutral" | "distracting";
        domain: string;
        activeDuration: number;
        visitCount: number;
    }[];
    tabSwitchCount: number;
    rapidTabSwitches: number;
    uniqueDomainsVisited: number;
    productiveTime: number;
    distractingTime: number;
    neutralTime: number;
}>;
export declare const BrowserSessionEventSchema: z.ZodObject<{
    eventId: z.ZodString;
    userId: z.ZodString;
    clientId: z.ZodString;
    clientType: z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>;
    timestamp: z.ZodNumber;
    sequenceNumber: z.ZodNumber;
} & {
    eventType: z.ZodLiteral<"BROWSER_SESSION">;
    payload: z.ZodObject<{
        sessionId: z.ZodString;
        startTime: z.ZodNumber;
        endTime: z.ZodNumber;
        totalDuration: z.ZodNumber;
        activeDuration: z.ZodNumber;
        domainBreakdown: z.ZodArray<z.ZodObject<{
            domain: z.ZodString;
            duration: z.ZodNumber;
            activeDuration: z.ZodNumber;
            category: z.ZodEnum<["productive", "neutral", "distracting"]>;
            visitCount: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            duration: number;
            category: "productive" | "neutral" | "distracting";
            domain: string;
            activeDuration: number;
            visitCount: number;
        }, {
            duration: number;
            category: "productive" | "neutral" | "distracting";
            domain: string;
            activeDuration: number;
            visitCount: number;
        }>, "many">;
        tabSwitchCount: z.ZodNumber;
        rapidTabSwitches: z.ZodNumber;
        uniqueDomainsVisited: z.ZodNumber;
        productiveTime: z.ZodNumber;
        distractingTime: z.ZodNumber;
        neutralTime: z.ZodNumber;
        productivityScore: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        startTime: number;
        endTime: number;
        activeDuration: number;
        productivityScore: number;
        sessionId: string;
        totalDuration: number;
        domainBreakdown: {
            duration: number;
            category: "productive" | "neutral" | "distracting";
            domain: string;
            activeDuration: number;
            visitCount: number;
        }[];
        tabSwitchCount: number;
        rapidTabSwitches: number;
        uniqueDomainsVisited: number;
        productiveTime: number;
        distractingTime: number;
        neutralTime: number;
    }, {
        startTime: number;
        endTime: number;
        activeDuration: number;
        productivityScore: number;
        sessionId: string;
        totalDuration: number;
        domainBreakdown: {
            duration: number;
            category: "productive" | "neutral" | "distracting";
            domain: string;
            activeDuration: number;
            visitCount: number;
        }[];
        tabSwitchCount: number;
        rapidTabSwitches: number;
        uniqueDomainsVisited: number;
        productiveTime: number;
        distractingTime: number;
        neutralTime: number;
    }>;
}, "strip", z.ZodTypeAny, {
    eventId: string;
    eventType: "BROWSER_SESSION";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        startTime: number;
        endTime: number;
        activeDuration: number;
        productivityScore: number;
        sessionId: string;
        totalDuration: number;
        domainBreakdown: {
            duration: number;
            category: "productive" | "neutral" | "distracting";
            domain: string;
            activeDuration: number;
            visitCount: number;
        }[];
        tabSwitchCount: number;
        rapidTabSwitches: number;
        uniqueDomainsVisited: number;
        productiveTime: number;
        distractingTime: number;
        neutralTime: number;
    };
}, {
    eventId: string;
    eventType: "BROWSER_SESSION";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        startTime: number;
        endTime: number;
        activeDuration: number;
        productivityScore: number;
        sessionId: string;
        totalDuration: number;
        domainBreakdown: {
            duration: number;
            category: "productive" | "neutral" | "distracting";
            domain: string;
            activeDuration: number;
            visitCount: number;
        }[];
        tabSwitchCount: number;
        rapidTabSwitches: number;
        uniqueDomainsVisited: number;
        productiveTime: number;
        distractingTime: number;
        neutralTime: number;
    };
}>;
export declare const TabSwitchPayloadSchema: z.ZodObject<{
    fromTabId: z.ZodNumber;
    toTabId: z.ZodNumber;
    fromUrl: z.ZodString;
    toUrl: z.ZodString;
    fromDomain: z.ZodString;
    toDomain: z.ZodString;
    timeSinceLastSwitch: z.ZodNumber;
    isRapidSwitch: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    fromTabId: number;
    toTabId: number;
    fromUrl: string;
    toUrl: string;
    fromDomain: string;
    toDomain: string;
    timeSinceLastSwitch: number;
    isRapidSwitch: boolean;
}, {
    fromTabId: number;
    toTabId: number;
    fromUrl: string;
    toUrl: string;
    fromDomain: string;
    toDomain: string;
    timeSinceLastSwitch: number;
    isRapidSwitch: boolean;
}>;
export declare const TabSwitchEventSchema: z.ZodObject<{
    eventId: z.ZodString;
    userId: z.ZodString;
    clientId: z.ZodString;
    clientType: z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>;
    timestamp: z.ZodNumber;
    sequenceNumber: z.ZodNumber;
} & {
    eventType: z.ZodLiteral<"TAB_SWITCH">;
    payload: z.ZodObject<{
        fromTabId: z.ZodNumber;
        toTabId: z.ZodNumber;
        fromUrl: z.ZodString;
        toUrl: z.ZodString;
        fromDomain: z.ZodString;
        toDomain: z.ZodString;
        timeSinceLastSwitch: z.ZodNumber;
        isRapidSwitch: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        fromTabId: number;
        toTabId: number;
        fromUrl: string;
        toUrl: string;
        fromDomain: string;
        toDomain: string;
        timeSinceLastSwitch: number;
        isRapidSwitch: boolean;
    }, {
        fromTabId: number;
        toTabId: number;
        fromUrl: string;
        toUrl: string;
        fromDomain: string;
        toDomain: string;
        timeSinceLastSwitch: number;
        isRapidSwitch: boolean;
    }>;
}, "strip", z.ZodTypeAny, {
    eventId: string;
    eventType: "TAB_SWITCH";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        fromTabId: number;
        toTabId: number;
        fromUrl: string;
        toUrl: string;
        fromDomain: string;
        toDomain: string;
        timeSinceLastSwitch: number;
        isRapidSwitch: boolean;
    };
}, {
    eventId: string;
    eventType: "TAB_SWITCH";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        fromTabId: number;
        toTabId: number;
        fromUrl: string;
        toUrl: string;
        fromDomain: string;
        toDomain: string;
        timeSinceLastSwitch: number;
        isRapidSwitch: boolean;
    };
}>;
export declare const BrowserFocusPayloadSchema: z.ZodObject<{
    isFocused: z.ZodBoolean;
    previousState: z.ZodEnum<["focused", "blurred", "unknown"]>;
    focusDuration: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    previousState: "focused" | "blurred" | "unknown";
    isFocused: boolean;
    focusDuration?: number | undefined;
}, {
    previousState: "focused" | "blurred" | "unknown";
    isFocused: boolean;
    focusDuration?: number | undefined;
}>;
export declare const BrowserFocusEventSchema: z.ZodObject<{
    eventId: z.ZodString;
    userId: z.ZodString;
    clientId: z.ZodString;
    clientType: z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>;
    timestamp: z.ZodNumber;
    sequenceNumber: z.ZodNumber;
} & {
    eventType: z.ZodLiteral<"BROWSER_FOCUS">;
    payload: z.ZodObject<{
        isFocused: z.ZodBoolean;
        previousState: z.ZodEnum<["focused", "blurred", "unknown"]>;
        focusDuration: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        previousState: "focused" | "blurred" | "unknown";
        isFocused: boolean;
        focusDuration?: number | undefined;
    }, {
        previousState: "focused" | "blurred" | "unknown";
        isFocused: boolean;
        focusDuration?: number | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    eventId: string;
    eventType: "BROWSER_FOCUS";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        previousState: "focused" | "blurred" | "unknown";
        isFocused: boolean;
        focusDuration?: number | undefined;
    };
}, {
    eventId: string;
    eventType: "BROWSER_FOCUS";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        previousState: "focused" | "blurred" | "unknown";
        isFocused: boolean;
        focusDuration?: number | undefined;
    };
}>;
export declare const EntertainmentModePayloadSchema: z.ZodObject<{
    action: z.ZodEnum<["start", "stop"]>;
    sessionId: z.ZodString;
    timestamp: z.ZodNumber;
    quotaUsedBefore: z.ZodNumber;
    quotaUsedAfter: z.ZodOptional<z.ZodNumber>;
    duration: z.ZodOptional<z.ZodNumber>;
    sitesVisited: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    reason: z.ZodOptional<z.ZodEnum<["manual", "quota_exhausted", "work_time_start"]>>;
}, "strip", z.ZodTypeAny, {
    timestamp: number;
    sessionId: string;
    action: "start" | "stop";
    quotaUsedBefore: number;
    duration?: number | undefined;
    quotaUsedAfter?: number | undefined;
    sitesVisited?: string[] | undefined;
    reason?: "manual" | "quota_exhausted" | "work_time_start" | undefined;
}, {
    timestamp: number;
    sessionId: string;
    action: "start" | "stop";
    quotaUsedBefore: number;
    duration?: number | undefined;
    quotaUsedAfter?: number | undefined;
    sitesVisited?: string[] | undefined;
    reason?: "manual" | "quota_exhausted" | "work_time_start" | undefined;
}>;
export declare const EntertainmentModeEventSchema: z.ZodObject<{
    eventId: z.ZodString;
    userId: z.ZodString;
    clientId: z.ZodString;
    clientType: z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>;
    timestamp: z.ZodNumber;
    sequenceNumber: z.ZodNumber;
} & {
    eventType: z.ZodLiteral<"ENTERTAINMENT_MODE">;
    payload: z.ZodObject<{
        action: z.ZodEnum<["start", "stop"]>;
        sessionId: z.ZodString;
        timestamp: z.ZodNumber;
        quotaUsedBefore: z.ZodNumber;
        quotaUsedAfter: z.ZodOptional<z.ZodNumber>;
        duration: z.ZodOptional<z.ZodNumber>;
        sitesVisited: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        reason: z.ZodOptional<z.ZodEnum<["manual", "quota_exhausted", "work_time_start"]>>;
    }, "strip", z.ZodTypeAny, {
        timestamp: number;
        sessionId: string;
        action: "start" | "stop";
        quotaUsedBefore: number;
        duration?: number | undefined;
        quotaUsedAfter?: number | undefined;
        sitesVisited?: string[] | undefined;
        reason?: "manual" | "quota_exhausted" | "work_time_start" | undefined;
    }, {
        timestamp: number;
        sessionId: string;
        action: "start" | "stop";
        quotaUsedBefore: number;
        duration?: number | undefined;
        quotaUsedAfter?: number | undefined;
        sitesVisited?: string[] | undefined;
        reason?: "manual" | "quota_exhausted" | "work_time_start" | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    eventId: string;
    eventType: "ENTERTAINMENT_MODE";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        timestamp: number;
        sessionId: string;
        action: "start" | "stop";
        quotaUsedBefore: number;
        duration?: number | undefined;
        quotaUsedAfter?: number | undefined;
        sitesVisited?: string[] | undefined;
        reason?: "manual" | "quota_exhausted" | "work_time_start" | undefined;
    };
}, {
    eventId: string;
    eventType: "ENTERTAINMENT_MODE";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        timestamp: number;
        sessionId: string;
        action: "start" | "stop";
        quotaUsedBefore: number;
        duration?: number | undefined;
        quotaUsedAfter?: number | undefined;
        sitesVisited?: string[] | undefined;
        reason?: "manual" | "quota_exhausted" | "work_time_start" | undefined;
    };
}>;
export declare const WorkStartPayloadSchema: z.ZodObject<{
    date: z.ZodString;
    configuredStartTime: z.ZodString;
    actualStartTime: z.ZodNumber;
    delayMinutes: z.ZodNumber;
    trigger: z.ZodEnum<["first_pomodoro", "airlock_complete"]>;
}, "strip", z.ZodTypeAny, {
    date: string;
    trigger: "first_pomodoro" | "airlock_complete";
    configuredStartTime: string;
    actualStartTime: number;
    delayMinutes: number;
}, {
    date: string;
    trigger: "first_pomodoro" | "airlock_complete";
    configuredStartTime: string;
    actualStartTime: number;
    delayMinutes: number;
}>;
export declare const WorkStartEventSchema: z.ZodObject<{
    eventId: z.ZodString;
    userId: z.ZodString;
    clientId: z.ZodString;
    clientType: z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>;
    timestamp: z.ZodNumber;
    sequenceNumber: z.ZodNumber;
} & {
    eventType: z.ZodLiteral<"WORK_START">;
    payload: z.ZodObject<{
        date: z.ZodString;
        configuredStartTime: z.ZodString;
        actualStartTime: z.ZodNumber;
        delayMinutes: z.ZodNumber;
        trigger: z.ZodEnum<["first_pomodoro", "airlock_complete"]>;
    }, "strip", z.ZodTypeAny, {
        date: string;
        trigger: "first_pomodoro" | "airlock_complete";
        configuredStartTime: string;
        actualStartTime: number;
        delayMinutes: number;
    }, {
        date: string;
        trigger: "first_pomodoro" | "airlock_complete";
        configuredStartTime: string;
        actualStartTime: number;
        delayMinutes: number;
    }>;
}, "strip", z.ZodTypeAny, {
    eventId: string;
    eventType: "WORK_START";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        date: string;
        trigger: "first_pomodoro" | "airlock_complete";
        configuredStartTime: string;
        actualStartTime: number;
        delayMinutes: number;
    };
}, {
    eventId: string;
    eventType: "WORK_START";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        date: string;
        trigger: "first_pomodoro" | "airlock_complete";
        configuredStartTime: string;
        actualStartTime: number;
        delayMinutes: number;
    };
}>;
export declare const ChatAttachmentSchema: z.ZodObject<{
    type: z.ZodEnum<["task", "project", "goal", "pomodoro"]>;
    id: z.ZodString;
    title: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "task" | "project" | "goal" | "pomodoro";
    title: string;
    id: string;
}, {
    type: "task" | "project" | "goal" | "pomodoro";
    title: string;
    id: string;
}>;
export declare const ChatMessagePayloadSchema: z.ZodObject<{
    conversationId: z.ZodString;
    messageId: z.ZodString;
    content: z.ZodString;
    attachments: z.ZodOptional<z.ZodArray<z.ZodObject<{
        type: z.ZodEnum<["task", "project", "goal", "pomodoro"]>;
        id: z.ZodString;
        title: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "task" | "project" | "goal" | "pomodoro";
        title: string;
        id: string;
    }, {
        type: "task" | "project" | "goal" | "pomodoro";
        title: string;
        id: string;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    conversationId: string;
    messageId: string;
    content: string;
    attachments?: {
        type: "task" | "project" | "goal" | "pomodoro";
        title: string;
        id: string;
    }[] | undefined;
}, {
    conversationId: string;
    messageId: string;
    content: string;
    attachments?: {
        type: "task" | "project" | "goal" | "pomodoro";
        title: string;
        id: string;
    }[] | undefined;
}>;
export declare const ChatMessageEventSchema: z.ZodObject<{
    eventId: z.ZodString;
    userId: z.ZodString;
    clientId: z.ZodString;
    clientType: z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>;
    timestamp: z.ZodNumber;
    sequenceNumber: z.ZodNumber;
} & {
    eventType: z.ZodLiteral<"CHAT_MESSAGE">;
    payload: z.ZodObject<{
        conversationId: z.ZodString;
        messageId: z.ZodString;
        content: z.ZodString;
        attachments: z.ZodOptional<z.ZodArray<z.ZodObject<{
            type: z.ZodEnum<["task", "project", "goal", "pomodoro"]>;
            id: z.ZodString;
            title: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: "task" | "project" | "goal" | "pomodoro";
            title: string;
            id: string;
        }, {
            type: "task" | "project" | "goal" | "pomodoro";
            title: string;
            id: string;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        conversationId: string;
        messageId: string;
        content: string;
        attachments?: {
            type: "task" | "project" | "goal" | "pomodoro";
            title: string;
            id: string;
        }[] | undefined;
    }, {
        conversationId: string;
        messageId: string;
        content: string;
        attachments?: {
            type: "task" | "project" | "goal" | "pomodoro";
            title: string;
            id: string;
        }[] | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    eventId: string;
    eventType: "CHAT_MESSAGE";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        conversationId: string;
        messageId: string;
        content: string;
        attachments?: {
            type: "task" | "project" | "goal" | "pomodoro";
            title: string;
            id: string;
        }[] | undefined;
    };
}, {
    eventId: string;
    eventType: "CHAT_MESSAGE";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        conversationId: string;
        messageId: string;
        content: string;
        attachments?: {
            type: "task" | "project" | "goal" | "pomodoro";
            title: string;
            id: string;
        }[] | undefined;
    };
}>;
export declare const ChatActionPayloadSchema: z.ZodObject<{
    conversationId: z.ZodString;
    toolCallId: z.ZodString;
    action: z.ZodEnum<["confirm", "cancel"]>;
}, "strip", z.ZodTypeAny, {
    action: "confirm" | "cancel";
    conversationId: string;
    toolCallId: string;
}, {
    action: "confirm" | "cancel";
    conversationId: string;
    toolCallId: string;
}>;
export declare const ChatActionEventSchema: z.ZodObject<{
    eventId: z.ZodString;
    userId: z.ZodString;
    clientId: z.ZodString;
    clientType: z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>;
    timestamp: z.ZodNumber;
    sequenceNumber: z.ZodNumber;
} & {
    eventType: z.ZodLiteral<"CHAT_ACTION">;
    payload: z.ZodObject<{
        conversationId: z.ZodString;
        toolCallId: z.ZodString;
        action: z.ZodEnum<["confirm", "cancel"]>;
    }, "strip", z.ZodTypeAny, {
        action: "confirm" | "cancel";
        conversationId: string;
        toolCallId: string;
    }, {
        action: "confirm" | "cancel";
        conversationId: string;
        toolCallId: string;
    }>;
}, "strip", z.ZodTypeAny, {
    eventId: string;
    eventType: "CHAT_ACTION";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        action: "confirm" | "cancel";
        conversationId: string;
        toolCallId: string;
    };
}, {
    eventId: string;
    eventType: "CHAT_ACTION";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        action: "confirm" | "cancel";
        conversationId: string;
        toolCallId: string;
    };
}>;
export declare const ChatHistoryRequestEventSchema: z.ZodObject<{
    eventId: z.ZodString;
    userId: z.ZodString;
    clientId: z.ZodString;
    clientType: z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>;
    timestamp: z.ZodNumber;
    sequenceNumber: z.ZodNumber;
} & {
    eventType: z.ZodLiteral<"CHAT_HISTORY_REQUEST">;
    payload: z.ZodObject<{}, "passthrough", z.ZodTypeAny, z.objectOutputType<{}, z.ZodTypeAny, "passthrough">, z.objectInputType<{}, z.ZodTypeAny, "passthrough">>;
}, "strip", z.ZodTypeAny, {
    eventId: string;
    eventType: "CHAT_HISTORY_REQUEST";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {} & {
        [k: string]: unknown;
    };
}, {
    eventId: string;
    eventType: "CHAT_HISTORY_REQUEST";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {} & {
        [k: string]: unknown;
    };
}>;
export declare const OctopusEventSchema: z.ZodDiscriminatedUnion<"eventType", [z.ZodObject<{
    eventId: z.ZodString;
    userId: z.ZodString;
    clientId: z.ZodString;
    clientType: z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>;
    timestamp: z.ZodNumber;
    sequenceNumber: z.ZodNumber;
} & {
    eventType: z.ZodLiteral<"ACTIVITY_LOG">;
    payload: z.ZodObject<{
        source: z.ZodEnum<["browser", "desktop_app", "mobile_app"]>;
        identifier: z.ZodString;
        title: z.ZodString;
        duration: z.ZodNumber;
        category: z.ZodEnum<["productive", "neutral", "distracting"]>;
        metadata: z.ZodOptional<z.ZodObject<{
            domain: z.ZodOptional<z.ZodString>;
            appBundleId: z.ZodOptional<z.ZodString>;
            windowTitle: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            domain?: string | undefined;
            appBundleId?: string | undefined;
            windowTitle?: string | undefined;
        }, {
            domain?: string | undefined;
            appBundleId?: string | undefined;
            windowTitle?: string | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        source: "browser" | "desktop_app" | "mobile_app";
        identifier: string;
        title: string;
        duration: number;
        category: "productive" | "neutral" | "distracting";
        metadata?: {
            domain?: string | undefined;
            appBundleId?: string | undefined;
            windowTitle?: string | undefined;
        } | undefined;
    }, {
        source: "browser" | "desktop_app" | "mobile_app";
        identifier: string;
        title: string;
        duration: number;
        category: "productive" | "neutral" | "distracting";
        metadata?: {
            domain?: string | undefined;
            appBundleId?: string | undefined;
            windowTitle?: string | undefined;
        } | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    eventId: string;
    eventType: "ACTIVITY_LOG";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        source: "browser" | "desktop_app" | "mobile_app";
        identifier: string;
        title: string;
        duration: number;
        category: "productive" | "neutral" | "distracting";
        metadata?: {
            domain?: string | undefined;
            appBundleId?: string | undefined;
            windowTitle?: string | undefined;
        } | undefined;
    };
}, {
    eventId: string;
    eventType: "ACTIVITY_LOG";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        source: "browser" | "desktop_app" | "mobile_app";
        identifier: string;
        title: string;
        duration: number;
        category: "productive" | "neutral" | "distracting";
        metadata?: {
            domain?: string | undefined;
            appBundleId?: string | undefined;
            windowTitle?: string | undefined;
        } | undefined;
    };
}>, z.ZodObject<{
    eventId: z.ZodString;
    userId: z.ZodString;
    clientId: z.ZodString;
    clientType: z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>;
    timestamp: z.ZodNumber;
    sequenceNumber: z.ZodNumber;
} & {
    eventType: z.ZodLiteral<"STATE_CHANGE">;
    payload: z.ZodObject<{
        previousState: z.ZodString;
        newState: z.ZodString;
        trigger: z.ZodString;
        timestamp: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        timestamp: number;
        previousState: string;
        newState: string;
        trigger: string;
    }, {
        timestamp: number;
        previousState: string;
        newState: string;
        trigger: string;
    }>;
}, "strip", z.ZodTypeAny, {
    eventId: string;
    eventType: "STATE_CHANGE";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        timestamp: number;
        previousState: string;
        newState: string;
        trigger: string;
    };
}, {
    eventId: string;
    eventType: "STATE_CHANGE";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        timestamp: number;
        previousState: string;
        newState: string;
        trigger: string;
    };
}>, z.ZodObject<{
    eventId: z.ZodString;
    userId: z.ZodString;
    clientId: z.ZodString;
    clientType: z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>;
    timestamp: z.ZodNumber;
    sequenceNumber: z.ZodNumber;
} & {
    eventType: z.ZodLiteral<"USER_ACTION">;
    payload: z.ZodObject<{
        actionType: z.ZodString;
        targetEntity: z.ZodOptional<z.ZodString>;
        parameters: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        result: z.ZodOptional<z.ZodString>;
        optimisticId: z.ZodOptional<z.ZodString>;
        data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        actionType: string;
        targetEntity?: string | undefined;
        parameters?: Record<string, unknown> | undefined;
        result?: string | undefined;
        optimisticId?: string | undefined;
        data?: Record<string, unknown> | undefined;
    }, {
        actionType: string;
        targetEntity?: string | undefined;
        parameters?: Record<string, unknown> | undefined;
        result?: string | undefined;
        optimisticId?: string | undefined;
        data?: Record<string, unknown> | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    eventId: string;
    eventType: "USER_ACTION";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        actionType: string;
        targetEntity?: string | undefined;
        parameters?: Record<string, unknown> | undefined;
        result?: string | undefined;
        optimisticId?: string | undefined;
        data?: Record<string, unknown> | undefined;
    };
}, {
    eventId: string;
    eventType: "USER_ACTION";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        actionType: string;
        targetEntity?: string | undefined;
        parameters?: Record<string, unknown> | undefined;
        result?: string | undefined;
        optimisticId?: string | undefined;
        data?: Record<string, unknown> | undefined;
    };
}>, z.ZodObject<{
    eventId: z.ZodString;
    userId: z.ZodString;
    clientId: z.ZodString;
    clientType: z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>;
    timestamp: z.ZodNumber;
    sequenceNumber: z.ZodNumber;
} & {
    eventType: z.ZodLiteral<"HEARTBEAT">;
    payload: z.ZodObject<{
        clientVersion: z.ZodString;
        platform: z.ZodString;
        connectionQuality: z.ZodEnum<["good", "degraded", "poor"]>;
        localStateHash: z.ZodString;
        capabilities: z.ZodArray<z.ZodString, "many">;
        uptime: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        uptime: number;
        clientVersion: string;
        platform: string;
        connectionQuality: "good" | "degraded" | "poor";
        localStateHash: string;
        capabilities: string[];
    }, {
        uptime: number;
        clientVersion: string;
        platform: string;
        connectionQuality: "good" | "degraded" | "poor";
        localStateHash: string;
        capabilities: string[];
    }>;
}, "strip", z.ZodTypeAny, {
    eventId: string;
    eventType: "HEARTBEAT";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        uptime: number;
        clientVersion: string;
        platform: string;
        connectionQuality: "good" | "degraded" | "poor";
        localStateHash: string;
        capabilities: string[];
    };
}, {
    eventId: string;
    eventType: "HEARTBEAT";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        uptime: number;
        clientVersion: string;
        platform: string;
        connectionQuality: "good" | "degraded" | "poor";
        localStateHash: string;
        capabilities: string[];
    };
}>, z.ZodObject<{
    eventId: z.ZodString;
    userId: z.ZodString;
    clientId: z.ZodString;
    clientType: z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>;
    timestamp: z.ZodNumber;
    sequenceNumber: z.ZodNumber;
} & {
    eventType: z.ZodLiteral<"BROWSER_ACTIVITY">;
    payload: z.ZodObject<{
        url: z.ZodString;
        title: z.ZodString;
        domain: z.ZodString;
        startTime: z.ZodNumber;
        endTime: z.ZodNumber;
        duration: z.ZodNumber;
        activeDuration: z.ZodNumber;
        idleTime: z.ZodNumber;
        category: z.ZodEnum<["productive", "neutral", "distracting"]>;
        productivityScore: z.ZodNumber;
        scrollDepth: z.ZodNumber;
        interactionCount: z.ZodNumber;
        isMediaPlaying: z.ZodBoolean;
        mediaPlayDuration: z.ZodNumber;
        referrer: z.ZodOptional<z.ZodString>;
        navigationType: z.ZodEnum<["link", "typed", "reload", "back_forward", "other"]>;
        searchQuery: z.ZodOptional<z.ZodString>;
        searchEngine: z.ZodOptional<z.ZodEnum<["google", "bing", "duckduckgo", "other"]>>;
    }, "strip", z.ZodTypeAny, {
        title: string;
        duration: number;
        category: "productive" | "neutral" | "distracting";
        domain: string;
        url: string;
        startTime: number;
        endTime: number;
        activeDuration: number;
        idleTime: number;
        productivityScore: number;
        scrollDepth: number;
        interactionCount: number;
        isMediaPlaying: boolean;
        mediaPlayDuration: number;
        navigationType: "link" | "typed" | "reload" | "back_forward" | "other";
        referrer?: string | undefined;
        searchQuery?: string | undefined;
        searchEngine?: "other" | "google" | "bing" | "duckduckgo" | undefined;
    }, {
        title: string;
        duration: number;
        category: "productive" | "neutral" | "distracting";
        domain: string;
        url: string;
        startTime: number;
        endTime: number;
        activeDuration: number;
        idleTime: number;
        productivityScore: number;
        scrollDepth: number;
        interactionCount: number;
        isMediaPlaying: boolean;
        mediaPlayDuration: number;
        navigationType: "link" | "typed" | "reload" | "back_forward" | "other";
        referrer?: string | undefined;
        searchQuery?: string | undefined;
        searchEngine?: "other" | "google" | "bing" | "duckduckgo" | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    eventId: string;
    eventType: "BROWSER_ACTIVITY";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        title: string;
        duration: number;
        category: "productive" | "neutral" | "distracting";
        domain: string;
        url: string;
        startTime: number;
        endTime: number;
        activeDuration: number;
        idleTime: number;
        productivityScore: number;
        scrollDepth: number;
        interactionCount: number;
        isMediaPlaying: boolean;
        mediaPlayDuration: number;
        navigationType: "link" | "typed" | "reload" | "back_forward" | "other";
        referrer?: string | undefined;
        searchQuery?: string | undefined;
        searchEngine?: "other" | "google" | "bing" | "duckduckgo" | undefined;
    };
}, {
    eventId: string;
    eventType: "BROWSER_ACTIVITY";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        title: string;
        duration: number;
        category: "productive" | "neutral" | "distracting";
        domain: string;
        url: string;
        startTime: number;
        endTime: number;
        activeDuration: number;
        idleTime: number;
        productivityScore: number;
        scrollDepth: number;
        interactionCount: number;
        isMediaPlaying: boolean;
        mediaPlayDuration: number;
        navigationType: "link" | "typed" | "reload" | "back_forward" | "other";
        referrer?: string | undefined;
        searchQuery?: string | undefined;
        searchEngine?: "other" | "google" | "bing" | "duckduckgo" | undefined;
    };
}>, z.ZodObject<{
    eventId: z.ZodString;
    userId: z.ZodString;
    clientId: z.ZodString;
    clientType: z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>;
    timestamp: z.ZodNumber;
    sequenceNumber: z.ZodNumber;
} & {
    eventType: z.ZodLiteral<"BROWSER_SESSION">;
    payload: z.ZodObject<{
        sessionId: z.ZodString;
        startTime: z.ZodNumber;
        endTime: z.ZodNumber;
        totalDuration: z.ZodNumber;
        activeDuration: z.ZodNumber;
        domainBreakdown: z.ZodArray<z.ZodObject<{
            domain: z.ZodString;
            duration: z.ZodNumber;
            activeDuration: z.ZodNumber;
            category: z.ZodEnum<["productive", "neutral", "distracting"]>;
            visitCount: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            duration: number;
            category: "productive" | "neutral" | "distracting";
            domain: string;
            activeDuration: number;
            visitCount: number;
        }, {
            duration: number;
            category: "productive" | "neutral" | "distracting";
            domain: string;
            activeDuration: number;
            visitCount: number;
        }>, "many">;
        tabSwitchCount: z.ZodNumber;
        rapidTabSwitches: z.ZodNumber;
        uniqueDomainsVisited: z.ZodNumber;
        productiveTime: z.ZodNumber;
        distractingTime: z.ZodNumber;
        neutralTime: z.ZodNumber;
        productivityScore: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        startTime: number;
        endTime: number;
        activeDuration: number;
        productivityScore: number;
        sessionId: string;
        totalDuration: number;
        domainBreakdown: {
            duration: number;
            category: "productive" | "neutral" | "distracting";
            domain: string;
            activeDuration: number;
            visitCount: number;
        }[];
        tabSwitchCount: number;
        rapidTabSwitches: number;
        uniqueDomainsVisited: number;
        productiveTime: number;
        distractingTime: number;
        neutralTime: number;
    }, {
        startTime: number;
        endTime: number;
        activeDuration: number;
        productivityScore: number;
        sessionId: string;
        totalDuration: number;
        domainBreakdown: {
            duration: number;
            category: "productive" | "neutral" | "distracting";
            domain: string;
            activeDuration: number;
            visitCount: number;
        }[];
        tabSwitchCount: number;
        rapidTabSwitches: number;
        uniqueDomainsVisited: number;
        productiveTime: number;
        distractingTime: number;
        neutralTime: number;
    }>;
}, "strip", z.ZodTypeAny, {
    eventId: string;
    eventType: "BROWSER_SESSION";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        startTime: number;
        endTime: number;
        activeDuration: number;
        productivityScore: number;
        sessionId: string;
        totalDuration: number;
        domainBreakdown: {
            duration: number;
            category: "productive" | "neutral" | "distracting";
            domain: string;
            activeDuration: number;
            visitCount: number;
        }[];
        tabSwitchCount: number;
        rapidTabSwitches: number;
        uniqueDomainsVisited: number;
        productiveTime: number;
        distractingTime: number;
        neutralTime: number;
    };
}, {
    eventId: string;
    eventType: "BROWSER_SESSION";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        startTime: number;
        endTime: number;
        activeDuration: number;
        productivityScore: number;
        sessionId: string;
        totalDuration: number;
        domainBreakdown: {
            duration: number;
            category: "productive" | "neutral" | "distracting";
            domain: string;
            activeDuration: number;
            visitCount: number;
        }[];
        tabSwitchCount: number;
        rapidTabSwitches: number;
        uniqueDomainsVisited: number;
        productiveTime: number;
        distractingTime: number;
        neutralTime: number;
    };
}>, z.ZodObject<{
    eventId: z.ZodString;
    userId: z.ZodString;
    clientId: z.ZodString;
    clientType: z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>;
    timestamp: z.ZodNumber;
    sequenceNumber: z.ZodNumber;
} & {
    eventType: z.ZodLiteral<"TAB_SWITCH">;
    payload: z.ZodObject<{
        fromTabId: z.ZodNumber;
        toTabId: z.ZodNumber;
        fromUrl: z.ZodString;
        toUrl: z.ZodString;
        fromDomain: z.ZodString;
        toDomain: z.ZodString;
        timeSinceLastSwitch: z.ZodNumber;
        isRapidSwitch: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        fromTabId: number;
        toTabId: number;
        fromUrl: string;
        toUrl: string;
        fromDomain: string;
        toDomain: string;
        timeSinceLastSwitch: number;
        isRapidSwitch: boolean;
    }, {
        fromTabId: number;
        toTabId: number;
        fromUrl: string;
        toUrl: string;
        fromDomain: string;
        toDomain: string;
        timeSinceLastSwitch: number;
        isRapidSwitch: boolean;
    }>;
}, "strip", z.ZodTypeAny, {
    eventId: string;
    eventType: "TAB_SWITCH";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        fromTabId: number;
        toTabId: number;
        fromUrl: string;
        toUrl: string;
        fromDomain: string;
        toDomain: string;
        timeSinceLastSwitch: number;
        isRapidSwitch: boolean;
    };
}, {
    eventId: string;
    eventType: "TAB_SWITCH";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        fromTabId: number;
        toTabId: number;
        fromUrl: string;
        toUrl: string;
        fromDomain: string;
        toDomain: string;
        timeSinceLastSwitch: number;
        isRapidSwitch: boolean;
    };
}>, z.ZodObject<{
    eventId: z.ZodString;
    userId: z.ZodString;
    clientId: z.ZodString;
    clientType: z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>;
    timestamp: z.ZodNumber;
    sequenceNumber: z.ZodNumber;
} & {
    eventType: z.ZodLiteral<"BROWSER_FOCUS">;
    payload: z.ZodObject<{
        isFocused: z.ZodBoolean;
        previousState: z.ZodEnum<["focused", "blurred", "unknown"]>;
        focusDuration: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        previousState: "focused" | "blurred" | "unknown";
        isFocused: boolean;
        focusDuration?: number | undefined;
    }, {
        previousState: "focused" | "blurred" | "unknown";
        isFocused: boolean;
        focusDuration?: number | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    eventId: string;
    eventType: "BROWSER_FOCUS";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        previousState: "focused" | "blurred" | "unknown";
        isFocused: boolean;
        focusDuration?: number | undefined;
    };
}, {
    eventId: string;
    eventType: "BROWSER_FOCUS";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        previousState: "focused" | "blurred" | "unknown";
        isFocused: boolean;
        focusDuration?: number | undefined;
    };
}>, z.ZodObject<{
    eventId: z.ZodString;
    userId: z.ZodString;
    clientId: z.ZodString;
    clientType: z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>;
    timestamp: z.ZodNumber;
    sequenceNumber: z.ZodNumber;
} & {
    eventType: z.ZodLiteral<"ENTERTAINMENT_MODE">;
    payload: z.ZodObject<{
        action: z.ZodEnum<["start", "stop"]>;
        sessionId: z.ZodString;
        timestamp: z.ZodNumber;
        quotaUsedBefore: z.ZodNumber;
        quotaUsedAfter: z.ZodOptional<z.ZodNumber>;
        duration: z.ZodOptional<z.ZodNumber>;
        sitesVisited: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        reason: z.ZodOptional<z.ZodEnum<["manual", "quota_exhausted", "work_time_start"]>>;
    }, "strip", z.ZodTypeAny, {
        timestamp: number;
        sessionId: string;
        action: "start" | "stop";
        quotaUsedBefore: number;
        duration?: number | undefined;
        quotaUsedAfter?: number | undefined;
        sitesVisited?: string[] | undefined;
        reason?: "manual" | "quota_exhausted" | "work_time_start" | undefined;
    }, {
        timestamp: number;
        sessionId: string;
        action: "start" | "stop";
        quotaUsedBefore: number;
        duration?: number | undefined;
        quotaUsedAfter?: number | undefined;
        sitesVisited?: string[] | undefined;
        reason?: "manual" | "quota_exhausted" | "work_time_start" | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    eventId: string;
    eventType: "ENTERTAINMENT_MODE";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        timestamp: number;
        sessionId: string;
        action: "start" | "stop";
        quotaUsedBefore: number;
        duration?: number | undefined;
        quotaUsedAfter?: number | undefined;
        sitesVisited?: string[] | undefined;
        reason?: "manual" | "quota_exhausted" | "work_time_start" | undefined;
    };
}, {
    eventId: string;
    eventType: "ENTERTAINMENT_MODE";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        timestamp: number;
        sessionId: string;
        action: "start" | "stop";
        quotaUsedBefore: number;
        duration?: number | undefined;
        quotaUsedAfter?: number | undefined;
        sitesVisited?: string[] | undefined;
        reason?: "manual" | "quota_exhausted" | "work_time_start" | undefined;
    };
}>, z.ZodObject<{
    eventId: z.ZodString;
    userId: z.ZodString;
    clientId: z.ZodString;
    clientType: z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>;
    timestamp: z.ZodNumber;
    sequenceNumber: z.ZodNumber;
} & {
    eventType: z.ZodLiteral<"WORK_START">;
    payload: z.ZodObject<{
        date: z.ZodString;
        configuredStartTime: z.ZodString;
        actualStartTime: z.ZodNumber;
        delayMinutes: z.ZodNumber;
        trigger: z.ZodEnum<["first_pomodoro", "airlock_complete"]>;
    }, "strip", z.ZodTypeAny, {
        date: string;
        trigger: "first_pomodoro" | "airlock_complete";
        configuredStartTime: string;
        actualStartTime: number;
        delayMinutes: number;
    }, {
        date: string;
        trigger: "first_pomodoro" | "airlock_complete";
        configuredStartTime: string;
        actualStartTime: number;
        delayMinutes: number;
    }>;
}, "strip", z.ZodTypeAny, {
    eventId: string;
    eventType: "WORK_START";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        date: string;
        trigger: "first_pomodoro" | "airlock_complete";
        configuredStartTime: string;
        actualStartTime: number;
        delayMinutes: number;
    };
}, {
    eventId: string;
    eventType: "WORK_START";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        date: string;
        trigger: "first_pomodoro" | "airlock_complete";
        configuredStartTime: string;
        actualStartTime: number;
        delayMinutes: number;
    };
}>, z.ZodObject<{
    eventId: z.ZodString;
    userId: z.ZodString;
    clientId: z.ZodString;
    clientType: z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>;
    timestamp: z.ZodNumber;
    sequenceNumber: z.ZodNumber;
} & {
    eventType: z.ZodLiteral<"CHAT_MESSAGE">;
    payload: z.ZodObject<{
        conversationId: z.ZodString;
        messageId: z.ZodString;
        content: z.ZodString;
        attachments: z.ZodOptional<z.ZodArray<z.ZodObject<{
            type: z.ZodEnum<["task", "project", "goal", "pomodoro"]>;
            id: z.ZodString;
            title: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: "task" | "project" | "goal" | "pomodoro";
            title: string;
            id: string;
        }, {
            type: "task" | "project" | "goal" | "pomodoro";
            title: string;
            id: string;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        conversationId: string;
        messageId: string;
        content: string;
        attachments?: {
            type: "task" | "project" | "goal" | "pomodoro";
            title: string;
            id: string;
        }[] | undefined;
    }, {
        conversationId: string;
        messageId: string;
        content: string;
        attachments?: {
            type: "task" | "project" | "goal" | "pomodoro";
            title: string;
            id: string;
        }[] | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    eventId: string;
    eventType: "CHAT_MESSAGE";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        conversationId: string;
        messageId: string;
        content: string;
        attachments?: {
            type: "task" | "project" | "goal" | "pomodoro";
            title: string;
            id: string;
        }[] | undefined;
    };
}, {
    eventId: string;
    eventType: "CHAT_MESSAGE";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        conversationId: string;
        messageId: string;
        content: string;
        attachments?: {
            type: "task" | "project" | "goal" | "pomodoro";
            title: string;
            id: string;
        }[] | undefined;
    };
}>, z.ZodObject<{
    eventId: z.ZodString;
    userId: z.ZodString;
    clientId: z.ZodString;
    clientType: z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>;
    timestamp: z.ZodNumber;
    sequenceNumber: z.ZodNumber;
} & {
    eventType: z.ZodLiteral<"CHAT_ACTION">;
    payload: z.ZodObject<{
        conversationId: z.ZodString;
        toolCallId: z.ZodString;
        action: z.ZodEnum<["confirm", "cancel"]>;
    }, "strip", z.ZodTypeAny, {
        action: "confirm" | "cancel";
        conversationId: string;
        toolCallId: string;
    }, {
        action: "confirm" | "cancel";
        conversationId: string;
        toolCallId: string;
    }>;
}, "strip", z.ZodTypeAny, {
    eventId: string;
    eventType: "CHAT_ACTION";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        action: "confirm" | "cancel";
        conversationId: string;
        toolCallId: string;
    };
}, {
    eventId: string;
    eventType: "CHAT_ACTION";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {
        action: "confirm" | "cancel";
        conversationId: string;
        toolCallId: string;
    };
}>, z.ZodObject<{
    eventId: z.ZodString;
    userId: z.ZodString;
    clientId: z.ZodString;
    clientType: z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>;
    timestamp: z.ZodNumber;
    sequenceNumber: z.ZodNumber;
} & {
    eventType: z.ZodLiteral<"CHAT_HISTORY_REQUEST">;
    payload: z.ZodObject<{}, "passthrough", z.ZodTypeAny, z.objectOutputType<{}, z.ZodTypeAny, "passthrough">, z.objectInputType<{}, z.ZodTypeAny, "passthrough">>;
}, "strip", z.ZodTypeAny, {
    eventId: string;
    eventType: "CHAT_HISTORY_REQUEST";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {} & {
        [k: string]: unknown;
    };
}, {
    eventId: string;
    eventType: "CHAT_HISTORY_REQUEST";
    userId: string;
    clientId: string;
    clientType: "web" | "desktop" | "browser_ext" | "mobile" | "api";
    timestamp: number;
    sequenceNumber: number;
    payload: {} & {
        [k: string]: unknown;
    };
}>]>;
export declare const BaseCommandSchema: z.ZodObject<{
    commandId: z.ZodString;
    commandType: z.ZodEnum<["SYNC_STATE", "EXECUTE_ACTION", "UPDATE_POLICY", "SHOW_UI", "ACTION_RESULT", "CHAT_RESPONSE", "CHAT_TOOL_CALL", "CHAT_TOOL_RESULT", "CHAT_SYNC"]>;
    targetClient: z.ZodUnion<[z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>, z.ZodLiteral<"all">]>;
    priority: z.ZodEnum<["low", "normal", "high", "critical"]>;
    requiresAck: z.ZodBoolean;
    expiryTime: z.ZodOptional<z.ZodNumber>;
    createdAt: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    commandId: string;
    commandType: "SYNC_STATE" | "EXECUTE_ACTION" | "UPDATE_POLICY" | "SHOW_UI" | "ACTION_RESULT" | "CHAT_RESPONSE" | "CHAT_TOOL_CALL" | "CHAT_TOOL_RESULT" | "CHAT_SYNC";
    targetClient: "web" | "desktop" | "browser_ext" | "mobile" | "api" | "all";
    priority: "low" | "normal" | "high" | "critical";
    requiresAck: boolean;
    createdAt: number;
    expiryTime?: number | undefined;
}, {
    commandId: string;
    commandType: "SYNC_STATE" | "EXECUTE_ACTION" | "UPDATE_POLICY" | "SHOW_UI" | "ACTION_RESULT" | "CHAT_RESPONSE" | "CHAT_TOOL_CALL" | "CHAT_TOOL_RESULT" | "CHAT_SYNC";
    targetClient: "web" | "desktop" | "browser_ext" | "mobile" | "api" | "all";
    priority: "low" | "normal" | "high" | "critical";
    requiresAck: boolean;
    createdAt: number;
    expiryTime?: number | undefined;
}>;
export declare const SystemStateSchema: z.ZodObject<{
    state: z.ZodString;
    timeContext: z.ZodOptional<z.ZodString>;
    dailyCapReached: z.ZodBoolean;
    skipTokensRemaining: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    state: string;
    dailyCapReached: boolean;
    skipTokensRemaining: number;
    timeContext?: string | undefined;
}, {
    state: string;
    dailyCapReached: boolean;
    skipTokensRemaining: number;
    timeContext?: string | undefined;
}>;
export declare const DailyStateSchema: z.ZodObject<{
    date: z.ZodString;
    completedPomodoros: z.ZodNumber;
    totalFocusMinutes: z.ZodNumber;
    top3TaskIds: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    date: string;
    completedPomodoros: number;
    totalFocusMinutes: number;
    top3TaskIds: string[];
}, {
    date: string;
    completedPomodoros: number;
    totalFocusMinutes: number;
    top3TaskIds: string[];
}>;
export declare const PomodoroStateSchema: z.ZodObject<{
    id: z.ZodString;
    taskId: z.ZodNullable<z.ZodString>;
    taskTitle: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    startTime: z.ZodNumber;
    duration: z.ZodNumber;
    status: z.ZodEnum<["active", "paused", "completed", "aborted"]>;
}, "strip", z.ZodTypeAny, {
    status: "active" | "paused" | "completed" | "aborted";
    duration: number;
    startTime: number;
    id: string;
    taskId: string | null;
    taskTitle?: string | null | undefined;
}, {
    status: "active" | "paused" | "completed" | "aborted";
    duration: number;
    startTime: number;
    id: string;
    taskId: string | null;
    taskTitle?: string | null | undefined;
}>;
export declare const TaskStateSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    status: z.ZodString;
    priority: z.ZodString;
}, "strip", z.ZodTypeAny, {
    status: string;
    title: string;
    id: string;
    priority: string;
}, {
    status: string;
    title: string;
    id: string;
    priority: string;
}>;
export declare const UserSettingsStateSchema: z.ZodObject<{
    pomodoroDuration: z.ZodNumber;
    shortBreakDuration: z.ZodNumber;
    longBreakDuration: z.ZodNumber;
    dailyCap: z.ZodNumber;
    enforcementMode: z.ZodEnum<["strict", "gentle"]>;
}, "strip", z.ZodTypeAny, {
    pomodoroDuration: number;
    shortBreakDuration: number;
    longBreakDuration: number;
    dailyCap: number;
    enforcementMode: "strict" | "gentle";
}, {
    pomodoroDuration: number;
    shortBreakDuration: number;
    longBreakDuration: number;
    dailyCap: number;
    enforcementMode: "strict" | "gentle";
}>;
export declare const FullStateSchema: z.ZodObject<{
    systemState: z.ZodObject<{
        state: z.ZodString;
        timeContext: z.ZodOptional<z.ZodString>;
        dailyCapReached: z.ZodBoolean;
        skipTokensRemaining: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        state: string;
        dailyCapReached: boolean;
        skipTokensRemaining: number;
        timeContext?: string | undefined;
    }, {
        state: string;
        dailyCapReached: boolean;
        skipTokensRemaining: number;
        timeContext?: string | undefined;
    }>;
    dailyState: z.ZodObject<{
        date: z.ZodString;
        completedPomodoros: z.ZodNumber;
        totalFocusMinutes: z.ZodNumber;
        top3TaskIds: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        date: string;
        completedPomodoros: number;
        totalFocusMinutes: number;
        top3TaskIds: string[];
    }, {
        date: string;
        completedPomodoros: number;
        totalFocusMinutes: number;
        top3TaskIds: string[];
    }>;
    activePomodoro: z.ZodNullable<z.ZodObject<{
        id: z.ZodString;
        taskId: z.ZodNullable<z.ZodString>;
        taskTitle: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        startTime: z.ZodNumber;
        duration: z.ZodNumber;
        status: z.ZodEnum<["active", "paused", "completed", "aborted"]>;
    }, "strip", z.ZodTypeAny, {
        status: "active" | "paused" | "completed" | "aborted";
        duration: number;
        startTime: number;
        id: string;
        taskId: string | null;
        taskTitle?: string | null | undefined;
    }, {
        status: "active" | "paused" | "completed" | "aborted";
        duration: number;
        startTime: number;
        id: string;
        taskId: string | null;
        taskTitle?: string | null | undefined;
    }>>;
    top3Tasks: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        status: z.ZodString;
        priority: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        status: string;
        title: string;
        id: string;
        priority: string;
    }, {
        status: string;
        title: string;
        id: string;
        priority: string;
    }>, "many">;
    settings: z.ZodObject<{
        pomodoroDuration: z.ZodNumber;
        shortBreakDuration: z.ZodNumber;
        longBreakDuration: z.ZodNumber;
        dailyCap: z.ZodNumber;
        enforcementMode: z.ZodEnum<["strict", "gentle"]>;
    }, "strip", z.ZodTypeAny, {
        pomodoroDuration: number;
        shortBreakDuration: number;
        longBreakDuration: number;
        dailyCap: number;
        enforcementMode: "strict" | "gentle";
    }, {
        pomodoroDuration: number;
        shortBreakDuration: number;
        longBreakDuration: number;
        dailyCap: number;
        enforcementMode: "strict" | "gentle";
    }>;
}, "strip", z.ZodTypeAny, {
    settings: {
        pomodoroDuration: number;
        shortBreakDuration: number;
        longBreakDuration: number;
        dailyCap: number;
        enforcementMode: "strict" | "gentle";
    };
    dailyState: {
        date: string;
        completedPomodoros: number;
        totalFocusMinutes: number;
        top3TaskIds: string[];
    };
    systemState: {
        state: string;
        dailyCapReached: boolean;
        skipTokensRemaining: number;
        timeContext?: string | undefined;
    };
    activePomodoro: {
        status: "active" | "paused" | "completed" | "aborted";
        duration: number;
        startTime: number;
        id: string;
        taskId: string | null;
        taskTitle?: string | null | undefined;
    } | null;
    top3Tasks: {
        status: string;
        title: string;
        id: string;
        priority: string;
    }[];
}, {
    settings: {
        pomodoroDuration: number;
        shortBreakDuration: number;
        longBreakDuration: number;
        dailyCap: number;
        enforcementMode: "strict" | "gentle";
    };
    dailyState: {
        date: string;
        completedPomodoros: number;
        totalFocusMinutes: number;
        top3TaskIds: string[];
    };
    systemState: {
        state: string;
        dailyCapReached: boolean;
        skipTokensRemaining: number;
        timeContext?: string | undefined;
    };
    activePomodoro: {
        status: "active" | "paused" | "completed" | "aborted";
        duration: number;
        startTime: number;
        id: string;
        taskId: string | null;
        taskTitle?: string | null | undefined;
    } | null;
    top3Tasks: {
        status: string;
        title: string;
        id: string;
        priority: string;
    }[];
}>;
export declare const SyncStatePayloadSchema: z.ZodObject<{
    syncType: z.ZodLiteral<"full">;
    version: z.ZodNumber;
    state: z.ZodOptional<z.ZodObject<{
        systemState: z.ZodObject<{
            state: z.ZodString;
            timeContext: z.ZodOptional<z.ZodString>;
            dailyCapReached: z.ZodBoolean;
            skipTokensRemaining: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            state: string;
            dailyCapReached: boolean;
            skipTokensRemaining: number;
            timeContext?: string | undefined;
        }, {
            state: string;
            dailyCapReached: boolean;
            skipTokensRemaining: number;
            timeContext?: string | undefined;
        }>;
        dailyState: z.ZodObject<{
            date: z.ZodString;
            completedPomodoros: z.ZodNumber;
            totalFocusMinutes: z.ZodNumber;
            top3TaskIds: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            date: string;
            completedPomodoros: number;
            totalFocusMinutes: number;
            top3TaskIds: string[];
        }, {
            date: string;
            completedPomodoros: number;
            totalFocusMinutes: number;
            top3TaskIds: string[];
        }>;
        activePomodoro: z.ZodNullable<z.ZodObject<{
            id: z.ZodString;
            taskId: z.ZodNullable<z.ZodString>;
            taskTitle: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            startTime: z.ZodNumber;
            duration: z.ZodNumber;
            status: z.ZodEnum<["active", "paused", "completed", "aborted"]>;
        }, "strip", z.ZodTypeAny, {
            status: "active" | "paused" | "completed" | "aborted";
            duration: number;
            startTime: number;
            id: string;
            taskId: string | null;
            taskTitle?: string | null | undefined;
        }, {
            status: "active" | "paused" | "completed" | "aborted";
            duration: number;
            startTime: number;
            id: string;
            taskId: string | null;
            taskTitle?: string | null | undefined;
        }>>;
        top3Tasks: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            title: z.ZodString;
            status: z.ZodString;
            priority: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            status: string;
            title: string;
            id: string;
            priority: string;
        }, {
            status: string;
            title: string;
            id: string;
            priority: string;
        }>, "many">;
        settings: z.ZodObject<{
            pomodoroDuration: z.ZodNumber;
            shortBreakDuration: z.ZodNumber;
            longBreakDuration: z.ZodNumber;
            dailyCap: z.ZodNumber;
            enforcementMode: z.ZodEnum<["strict", "gentle"]>;
        }, "strip", z.ZodTypeAny, {
            pomodoroDuration: number;
            shortBreakDuration: number;
            longBreakDuration: number;
            dailyCap: number;
            enforcementMode: "strict" | "gentle";
        }, {
            pomodoroDuration: number;
            shortBreakDuration: number;
            longBreakDuration: number;
            dailyCap: number;
            enforcementMode: "strict" | "gentle";
        }>;
    }, "strip", z.ZodTypeAny, {
        settings: {
            pomodoroDuration: number;
            shortBreakDuration: number;
            longBreakDuration: number;
            dailyCap: number;
            enforcementMode: "strict" | "gentle";
        };
        dailyState: {
            date: string;
            completedPomodoros: number;
            totalFocusMinutes: number;
            top3TaskIds: string[];
        };
        systemState: {
            state: string;
            dailyCapReached: boolean;
            skipTokensRemaining: number;
            timeContext?: string | undefined;
        };
        activePomodoro: {
            status: "active" | "paused" | "completed" | "aborted";
            duration: number;
            startTime: number;
            id: string;
            taskId: string | null;
            taskTitle?: string | null | undefined;
        } | null;
        top3Tasks: {
            status: string;
            title: string;
            id: string;
            priority: string;
        }[];
    }, {
        settings: {
            pomodoroDuration: number;
            shortBreakDuration: number;
            longBreakDuration: number;
            dailyCap: number;
            enforcementMode: "strict" | "gentle";
        };
        dailyState: {
            date: string;
            completedPomodoros: number;
            totalFocusMinutes: number;
            top3TaskIds: string[];
        };
        systemState: {
            state: string;
            dailyCapReached: boolean;
            skipTokensRemaining: number;
            timeContext?: string | undefined;
        };
        activePomodoro: {
            status: "active" | "paused" | "completed" | "aborted";
            duration: number;
            startTime: number;
            id: string;
            taskId: string | null;
            taskTitle?: string | null | undefined;
        } | null;
        top3Tasks: {
            status: string;
            title: string;
            id: string;
            priority: string;
        }[];
    }>>;
}, "strip", z.ZodTypeAny, {
    syncType: "full";
    version: number;
    state?: {
        settings: {
            pomodoroDuration: number;
            shortBreakDuration: number;
            longBreakDuration: number;
            dailyCap: number;
            enforcementMode: "strict" | "gentle";
        };
        dailyState: {
            date: string;
            completedPomodoros: number;
            totalFocusMinutes: number;
            top3TaskIds: string[];
        };
        systemState: {
            state: string;
            dailyCapReached: boolean;
            skipTokensRemaining: number;
            timeContext?: string | undefined;
        };
        activePomodoro: {
            status: "active" | "paused" | "completed" | "aborted";
            duration: number;
            startTime: number;
            id: string;
            taskId: string | null;
            taskTitle?: string | null | undefined;
        } | null;
        top3Tasks: {
            status: string;
            title: string;
            id: string;
            priority: string;
        }[];
    } | undefined;
}, {
    syncType: "full";
    version: number;
    state?: {
        settings: {
            pomodoroDuration: number;
            shortBreakDuration: number;
            longBreakDuration: number;
            dailyCap: number;
            enforcementMode: "strict" | "gentle";
        };
        dailyState: {
            date: string;
            completedPomodoros: number;
            totalFocusMinutes: number;
            top3TaskIds: string[];
        };
        systemState: {
            state: string;
            dailyCapReached: boolean;
            skipTokensRemaining: number;
            timeContext?: string | undefined;
        };
        activePomodoro: {
            status: "active" | "paused" | "completed" | "aborted";
            duration: number;
            startTime: number;
            id: string;
            taskId: string | null;
            taskTitle?: string | null | undefined;
        } | null;
        top3Tasks: {
            status: string;
            title: string;
            id: string;
            priority: string;
        }[];
    } | undefined;
}>;
export declare const SyncStateCommandSchema: z.ZodObject<{
    commandId: z.ZodString;
    targetClient: z.ZodUnion<[z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>, z.ZodLiteral<"all">]>;
    priority: z.ZodEnum<["low", "normal", "high", "critical"]>;
    requiresAck: z.ZodBoolean;
    expiryTime: z.ZodOptional<z.ZodNumber>;
    createdAt: z.ZodNumber;
} & {
    commandType: z.ZodLiteral<"SYNC_STATE">;
    payload: z.ZodObject<{
        syncType: z.ZodLiteral<"full">;
        version: z.ZodNumber;
        state: z.ZodOptional<z.ZodObject<{
            systemState: z.ZodObject<{
                state: z.ZodString;
                timeContext: z.ZodOptional<z.ZodString>;
                dailyCapReached: z.ZodBoolean;
                skipTokensRemaining: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                state: string;
                dailyCapReached: boolean;
                skipTokensRemaining: number;
                timeContext?: string | undefined;
            }, {
                state: string;
                dailyCapReached: boolean;
                skipTokensRemaining: number;
                timeContext?: string | undefined;
            }>;
            dailyState: z.ZodObject<{
                date: z.ZodString;
                completedPomodoros: z.ZodNumber;
                totalFocusMinutes: z.ZodNumber;
                top3TaskIds: z.ZodArray<z.ZodString, "many">;
            }, "strip", z.ZodTypeAny, {
                date: string;
                completedPomodoros: number;
                totalFocusMinutes: number;
                top3TaskIds: string[];
            }, {
                date: string;
                completedPomodoros: number;
                totalFocusMinutes: number;
                top3TaskIds: string[];
            }>;
            activePomodoro: z.ZodNullable<z.ZodObject<{
                id: z.ZodString;
                taskId: z.ZodNullable<z.ZodString>;
                taskTitle: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                startTime: z.ZodNumber;
                duration: z.ZodNumber;
                status: z.ZodEnum<["active", "paused", "completed", "aborted"]>;
            }, "strip", z.ZodTypeAny, {
                status: "active" | "paused" | "completed" | "aborted";
                duration: number;
                startTime: number;
                id: string;
                taskId: string | null;
                taskTitle?: string | null | undefined;
            }, {
                status: "active" | "paused" | "completed" | "aborted";
                duration: number;
                startTime: number;
                id: string;
                taskId: string | null;
                taskTitle?: string | null | undefined;
            }>>;
            top3Tasks: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                title: z.ZodString;
                status: z.ZodString;
                priority: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                status: string;
                title: string;
                id: string;
                priority: string;
            }, {
                status: string;
                title: string;
                id: string;
                priority: string;
            }>, "many">;
            settings: z.ZodObject<{
                pomodoroDuration: z.ZodNumber;
                shortBreakDuration: z.ZodNumber;
                longBreakDuration: z.ZodNumber;
                dailyCap: z.ZodNumber;
                enforcementMode: z.ZodEnum<["strict", "gentle"]>;
            }, "strip", z.ZodTypeAny, {
                pomodoroDuration: number;
                shortBreakDuration: number;
                longBreakDuration: number;
                dailyCap: number;
                enforcementMode: "strict" | "gentle";
            }, {
                pomodoroDuration: number;
                shortBreakDuration: number;
                longBreakDuration: number;
                dailyCap: number;
                enforcementMode: "strict" | "gentle";
            }>;
        }, "strip", z.ZodTypeAny, {
            settings: {
                pomodoroDuration: number;
                shortBreakDuration: number;
                longBreakDuration: number;
                dailyCap: number;
                enforcementMode: "strict" | "gentle";
            };
            dailyState: {
                date: string;
                completedPomodoros: number;
                totalFocusMinutes: number;
                top3TaskIds: string[];
            };
            systemState: {
                state: string;
                dailyCapReached: boolean;
                skipTokensRemaining: number;
                timeContext?: string | undefined;
            };
            activePomodoro: {
                status: "active" | "paused" | "completed" | "aborted";
                duration: number;
                startTime: number;
                id: string;
                taskId: string | null;
                taskTitle?: string | null | undefined;
            } | null;
            top3Tasks: {
                status: string;
                title: string;
                id: string;
                priority: string;
            }[];
        }, {
            settings: {
                pomodoroDuration: number;
                shortBreakDuration: number;
                longBreakDuration: number;
                dailyCap: number;
                enforcementMode: "strict" | "gentle";
            };
            dailyState: {
                date: string;
                completedPomodoros: number;
                totalFocusMinutes: number;
                top3TaskIds: string[];
            };
            systemState: {
                state: string;
                dailyCapReached: boolean;
                skipTokensRemaining: number;
                timeContext?: string | undefined;
            };
            activePomodoro: {
                status: "active" | "paused" | "completed" | "aborted";
                duration: number;
                startTime: number;
                id: string;
                taskId: string | null;
                taskTitle?: string | null | undefined;
            } | null;
            top3Tasks: {
                status: string;
                title: string;
                id: string;
                priority: string;
            }[];
        }>>;
    }, "strip", z.ZodTypeAny, {
        syncType: "full";
        version: number;
        state?: {
            settings: {
                pomodoroDuration: number;
                shortBreakDuration: number;
                longBreakDuration: number;
                dailyCap: number;
                enforcementMode: "strict" | "gentle";
            };
            dailyState: {
                date: string;
                completedPomodoros: number;
                totalFocusMinutes: number;
                top3TaskIds: string[];
            };
            systemState: {
                state: string;
                dailyCapReached: boolean;
                skipTokensRemaining: number;
                timeContext?: string | undefined;
            };
            activePomodoro: {
                status: "active" | "paused" | "completed" | "aborted";
                duration: number;
                startTime: number;
                id: string;
                taskId: string | null;
                taskTitle?: string | null | undefined;
            } | null;
            top3Tasks: {
                status: string;
                title: string;
                id: string;
                priority: string;
            }[];
        } | undefined;
    }, {
        syncType: "full";
        version: number;
        state?: {
            settings: {
                pomodoroDuration: number;
                shortBreakDuration: number;
                longBreakDuration: number;
                dailyCap: number;
                enforcementMode: "strict" | "gentle";
            };
            dailyState: {
                date: string;
                completedPomodoros: number;
                totalFocusMinutes: number;
                top3TaskIds: string[];
            };
            systemState: {
                state: string;
                dailyCapReached: boolean;
                skipTokensRemaining: number;
                timeContext?: string | undefined;
            };
            activePomodoro: {
                status: "active" | "paused" | "completed" | "aborted";
                duration: number;
                startTime: number;
                id: string;
                taskId: string | null;
                taskTitle?: string | null | undefined;
            } | null;
            top3Tasks: {
                status: string;
                title: string;
                id: string;
                priority: string;
            }[];
        } | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    payload: {
        syncType: "full";
        version: number;
        state?: {
            settings: {
                pomodoroDuration: number;
                shortBreakDuration: number;
                longBreakDuration: number;
                dailyCap: number;
                enforcementMode: "strict" | "gentle";
            };
            dailyState: {
                date: string;
                completedPomodoros: number;
                totalFocusMinutes: number;
                top3TaskIds: string[];
            };
            systemState: {
                state: string;
                dailyCapReached: boolean;
                skipTokensRemaining: number;
                timeContext?: string | undefined;
            };
            activePomodoro: {
                status: "active" | "paused" | "completed" | "aborted";
                duration: number;
                startTime: number;
                id: string;
                taskId: string | null;
                taskTitle?: string | null | undefined;
            } | null;
            top3Tasks: {
                status: string;
                title: string;
                id: string;
                priority: string;
            }[];
        } | undefined;
    };
    commandId: string;
    commandType: "SYNC_STATE";
    targetClient: "web" | "desktop" | "browser_ext" | "mobile" | "api" | "all";
    priority: "low" | "normal" | "high" | "critical";
    requiresAck: boolean;
    createdAt: number;
    expiryTime?: number | undefined;
}, {
    payload: {
        syncType: "full";
        version: number;
        state?: {
            settings: {
                pomodoroDuration: number;
                shortBreakDuration: number;
                longBreakDuration: number;
                dailyCap: number;
                enforcementMode: "strict" | "gentle";
            };
            dailyState: {
                date: string;
                completedPomodoros: number;
                totalFocusMinutes: number;
                top3TaskIds: string[];
            };
            systemState: {
                state: string;
                dailyCapReached: boolean;
                skipTokensRemaining: number;
                timeContext?: string | undefined;
            };
            activePomodoro: {
                status: "active" | "paused" | "completed" | "aborted";
                duration: number;
                startTime: number;
                id: string;
                taskId: string | null;
                taskTitle?: string | null | undefined;
            } | null;
            top3Tasks: {
                status: string;
                title: string;
                id: string;
                priority: string;
            }[];
        } | undefined;
    };
    commandId: string;
    commandType: "SYNC_STATE";
    targetClient: "web" | "desktop" | "browser_ext" | "mobile" | "api" | "all";
    priority: "low" | "normal" | "high" | "critical";
    requiresAck: boolean;
    createdAt: number;
    expiryTime?: number | undefined;
}>;
export declare const ExecuteActionPayloadSchema: z.ZodObject<{
    action: z.ZodEnum<["CLOSE_APP", "HIDE_APP", "BRING_TO_FRONT", "SHOW_NOTIFICATION", "CLOSE_TAB", "REDIRECT_TAB", "INJECT_OVERLAY", "ADD_SESSION_WHITELIST", "SEND_PUSH", "PLAY_SOUND", "VIBRATE"]>;
    parameters: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    timeout: z.ZodOptional<z.ZodNumber>;
    fallbackAction: z.ZodOptional<z.ZodEnum<["CLOSE_APP", "HIDE_APP", "BRING_TO_FRONT", "SHOW_NOTIFICATION", "CLOSE_TAB", "REDIRECT_TAB", "INJECT_OVERLAY", "ADD_SESSION_WHITELIST", "SEND_PUSH", "PLAY_SOUND", "VIBRATE"]>>;
}, "strip", z.ZodTypeAny, {
    parameters: Record<string, unknown>;
    action: "CLOSE_APP" | "HIDE_APP" | "BRING_TO_FRONT" | "SHOW_NOTIFICATION" | "CLOSE_TAB" | "REDIRECT_TAB" | "INJECT_OVERLAY" | "ADD_SESSION_WHITELIST" | "SEND_PUSH" | "PLAY_SOUND" | "VIBRATE";
    timeout?: number | undefined;
    fallbackAction?: "CLOSE_APP" | "HIDE_APP" | "BRING_TO_FRONT" | "SHOW_NOTIFICATION" | "CLOSE_TAB" | "REDIRECT_TAB" | "INJECT_OVERLAY" | "ADD_SESSION_WHITELIST" | "SEND_PUSH" | "PLAY_SOUND" | "VIBRATE" | undefined;
}, {
    parameters: Record<string, unknown>;
    action: "CLOSE_APP" | "HIDE_APP" | "BRING_TO_FRONT" | "SHOW_NOTIFICATION" | "CLOSE_TAB" | "REDIRECT_TAB" | "INJECT_OVERLAY" | "ADD_SESSION_WHITELIST" | "SEND_PUSH" | "PLAY_SOUND" | "VIBRATE";
    timeout?: number | undefined;
    fallbackAction?: "CLOSE_APP" | "HIDE_APP" | "BRING_TO_FRONT" | "SHOW_NOTIFICATION" | "CLOSE_TAB" | "REDIRECT_TAB" | "INJECT_OVERLAY" | "ADD_SESSION_WHITELIST" | "SEND_PUSH" | "PLAY_SOUND" | "VIBRATE" | undefined;
}>;
export declare const ExecuteActionCommandSchema: z.ZodObject<{
    commandId: z.ZodString;
    targetClient: z.ZodUnion<[z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>, z.ZodLiteral<"all">]>;
    priority: z.ZodEnum<["low", "normal", "high", "critical"]>;
    requiresAck: z.ZodBoolean;
    expiryTime: z.ZodOptional<z.ZodNumber>;
    createdAt: z.ZodNumber;
} & {
    commandType: z.ZodLiteral<"EXECUTE_ACTION">;
    payload: z.ZodObject<{
        action: z.ZodEnum<["CLOSE_APP", "HIDE_APP", "BRING_TO_FRONT", "SHOW_NOTIFICATION", "CLOSE_TAB", "REDIRECT_TAB", "INJECT_OVERLAY", "ADD_SESSION_WHITELIST", "SEND_PUSH", "PLAY_SOUND", "VIBRATE"]>;
        parameters: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        timeout: z.ZodOptional<z.ZodNumber>;
        fallbackAction: z.ZodOptional<z.ZodEnum<["CLOSE_APP", "HIDE_APP", "BRING_TO_FRONT", "SHOW_NOTIFICATION", "CLOSE_TAB", "REDIRECT_TAB", "INJECT_OVERLAY", "ADD_SESSION_WHITELIST", "SEND_PUSH", "PLAY_SOUND", "VIBRATE"]>>;
    }, "strip", z.ZodTypeAny, {
        parameters: Record<string, unknown>;
        action: "CLOSE_APP" | "HIDE_APP" | "BRING_TO_FRONT" | "SHOW_NOTIFICATION" | "CLOSE_TAB" | "REDIRECT_TAB" | "INJECT_OVERLAY" | "ADD_SESSION_WHITELIST" | "SEND_PUSH" | "PLAY_SOUND" | "VIBRATE";
        timeout?: number | undefined;
        fallbackAction?: "CLOSE_APP" | "HIDE_APP" | "BRING_TO_FRONT" | "SHOW_NOTIFICATION" | "CLOSE_TAB" | "REDIRECT_TAB" | "INJECT_OVERLAY" | "ADD_SESSION_WHITELIST" | "SEND_PUSH" | "PLAY_SOUND" | "VIBRATE" | undefined;
    }, {
        parameters: Record<string, unknown>;
        action: "CLOSE_APP" | "HIDE_APP" | "BRING_TO_FRONT" | "SHOW_NOTIFICATION" | "CLOSE_TAB" | "REDIRECT_TAB" | "INJECT_OVERLAY" | "ADD_SESSION_WHITELIST" | "SEND_PUSH" | "PLAY_SOUND" | "VIBRATE";
        timeout?: number | undefined;
        fallbackAction?: "CLOSE_APP" | "HIDE_APP" | "BRING_TO_FRONT" | "SHOW_NOTIFICATION" | "CLOSE_TAB" | "REDIRECT_TAB" | "INJECT_OVERLAY" | "ADD_SESSION_WHITELIST" | "SEND_PUSH" | "PLAY_SOUND" | "VIBRATE" | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    payload: {
        parameters: Record<string, unknown>;
        action: "CLOSE_APP" | "HIDE_APP" | "BRING_TO_FRONT" | "SHOW_NOTIFICATION" | "CLOSE_TAB" | "REDIRECT_TAB" | "INJECT_OVERLAY" | "ADD_SESSION_WHITELIST" | "SEND_PUSH" | "PLAY_SOUND" | "VIBRATE";
        timeout?: number | undefined;
        fallbackAction?: "CLOSE_APP" | "HIDE_APP" | "BRING_TO_FRONT" | "SHOW_NOTIFICATION" | "CLOSE_TAB" | "REDIRECT_TAB" | "INJECT_OVERLAY" | "ADD_SESSION_WHITELIST" | "SEND_PUSH" | "PLAY_SOUND" | "VIBRATE" | undefined;
    };
    commandId: string;
    commandType: "EXECUTE_ACTION";
    targetClient: "web" | "desktop" | "browser_ext" | "mobile" | "api" | "all";
    priority: "low" | "normal" | "high" | "critical";
    requiresAck: boolean;
    createdAt: number;
    expiryTime?: number | undefined;
}, {
    payload: {
        parameters: Record<string, unknown>;
        action: "CLOSE_APP" | "HIDE_APP" | "BRING_TO_FRONT" | "SHOW_NOTIFICATION" | "CLOSE_TAB" | "REDIRECT_TAB" | "INJECT_OVERLAY" | "ADD_SESSION_WHITELIST" | "SEND_PUSH" | "PLAY_SOUND" | "VIBRATE";
        timeout?: number | undefined;
        fallbackAction?: "CLOSE_APP" | "HIDE_APP" | "BRING_TO_FRONT" | "SHOW_NOTIFICATION" | "CLOSE_TAB" | "REDIRECT_TAB" | "INJECT_OVERLAY" | "ADD_SESSION_WHITELIST" | "SEND_PUSH" | "PLAY_SOUND" | "VIBRATE" | undefined;
    };
    commandId: string;
    commandType: "EXECUTE_ACTION";
    targetClient: "web" | "desktop" | "browser_ext" | "mobile" | "api" | "all";
    priority: "low" | "normal" | "high" | "critical";
    requiresAck: boolean;
    createdAt: number;
    expiryTime?: number | undefined;
}>;
export declare const TimeSlotSchema: z.ZodObject<{
    dayOfWeek: z.ZodNumber;
    startHour: z.ZodNumber;
    startMinute: z.ZodNumber;
    endHour: z.ZodNumber;
    endMinute: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    dayOfWeek: number;
    startHour: number;
    startMinute: number;
    endHour: number;
    endMinute: number;
}, {
    dayOfWeek: number;
    startHour: number;
    startMinute: number;
    endHour: number;
    endMinute: number;
}>;
export declare const SkipTokenConfigSchema: z.ZodObject<{
    maxPerDay: z.ZodNumber;
    delayMinutes: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    delayMinutes: number;
    maxPerDay: number;
}, {
    delayMinutes: number;
    maxPerDay: number;
}>;
export declare const DistractionAppSchema: z.ZodObject<{
    bundleId: z.ZodString;
    name: z.ZodString;
    action: z.ZodEnum<["force_quit", "hide_window"]>;
}, "strip", z.ZodTypeAny, {
    action: "force_quit" | "hide_window";
    bundleId: string;
    name: string;
}, {
    action: "force_quit" | "hide_window";
    bundleId: string;
    name: string;
}>;
export declare const AdhocFocusSessionSchema: z.ZodObject<{
    active: z.ZodBoolean;
    endTime: z.ZodNumber;
    overridesSleepTime: z.ZodOptional<z.ZodBoolean>;
    overridesWorkHours: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    active: boolean;
    endTime: number;
    overridesSleepTime?: boolean | undefined;
    overridesWorkHours?: boolean | undefined;
}, {
    active: boolean;
    endTime: number;
    overridesSleepTime?: boolean | undefined;
    overridesWorkHours?: boolean | undefined;
}>;
export declare const SleepEnforcementAppPolicySchema: z.ZodObject<{
    bundleId: z.ZodString;
    name: z.ZodString;
}, "strip", z.ZodTypeAny, {
    bundleId: string;
    name: string;
}, {
    bundleId: string;
    name: string;
}>;
export declare const SleepTimeConfigSchema: z.ZodObject<{
    enabled: z.ZodBoolean;
    startTime: z.ZodString;
    endTime: z.ZodString;
    enforcementApps: z.ZodArray<z.ZodObject<{
        bundleId: z.ZodString;
        name: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        bundleId: string;
        name: string;
    }, {
        bundleId: string;
        name: string;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    startTime: string;
    endTime: string;
    enabled: boolean;
    enforcementApps: {
        bundleId: string;
        name: string;
    }[];
}, {
    startTime: string;
    endTime: string;
    enabled: boolean;
    enforcementApps: {
        bundleId: string;
        name: string;
    }[];
}>;
export declare const RestEnforcementConfigSchema: z.ZodObject<{
    workApps: z.ZodArray<z.ZodObject<{
        bundleId: z.ZodString;
        name: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        bundleId: string;
        name: string;
    }, {
        bundleId: string;
        name: string;
    }>, "many">;
    actions: z.ZodArray<z.ZodString, "many">;
    graceDurationMinutes: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    workApps: {
        bundleId: string;
        name: string;
    }[];
    actions: string[];
    graceDurationMinutes: number;
}, {
    workApps: {
        bundleId: string;
        name: string;
    }[];
    actions: string[];
    graceDurationMinutes: number;
}>;
export declare const PolicyConfigSchema: z.ZodObject<{
    version: z.ZodNumber;
    updatedAt: z.ZodNumber;
    blacklist: z.ZodArray<z.ZodString, "many">;
    whitelist: z.ZodArray<z.ZodString, "many">;
    enforcementMode: z.ZodEnum<["strict", "gentle"]>;
    workTimeSlots: z.ZodArray<z.ZodObject<{
        dayOfWeek: z.ZodNumber;
        startHour: z.ZodNumber;
        startMinute: z.ZodNumber;
        endHour: z.ZodNumber;
        endMinute: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        dayOfWeek: number;
        startHour: number;
        startMinute: number;
        endHour: number;
        endMinute: number;
    }, {
        dayOfWeek: number;
        startHour: number;
        startMinute: number;
        endHour: number;
        endMinute: number;
    }>, "many">;
    skipTokens: z.ZodObject<{
        maxPerDay: z.ZodNumber;
        delayMinutes: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        delayMinutes: number;
        maxPerDay: number;
    }, {
        delayMinutes: number;
        maxPerDay: number;
    }>;
    distractionApps: z.ZodArray<z.ZodObject<{
        bundleId: z.ZodString;
        name: z.ZodString;
        action: z.ZodEnum<["force_quit", "hide_window"]>;
    }, "strip", z.ZodTypeAny, {
        action: "force_quit" | "hide_window";
        bundleId: string;
        name: string;
    }, {
        action: "force_quit" | "hide_window";
        bundleId: string;
        name: string;
    }>, "many">;
    sleepTime: z.ZodOptional<z.ZodObject<{
        enabled: z.ZodBoolean;
        startTime: z.ZodString;
        endTime: z.ZodString;
        enforcementApps: z.ZodArray<z.ZodObject<{
            bundleId: z.ZodString;
            name: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            bundleId: string;
            name: string;
        }, {
            bundleId: string;
            name: string;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        startTime: string;
        endTime: string;
        enabled: boolean;
        enforcementApps: {
            bundleId: string;
            name: string;
        }[];
    }, {
        startTime: string;
        endTime: string;
        enabled: boolean;
        enforcementApps: {
            bundleId: string;
            name: string;
        }[];
    }>>;
    overRestEnforcementApps: z.ZodOptional<z.ZodArray<z.ZodObject<{
        bundleId: z.ZodString;
        name: z.ZodString;
        action: z.ZodEnum<["force_quit", "hide_window"]>;
    }, "strip", z.ZodTypeAny, {
        action: "force_quit" | "hide_window";
        bundleId: string;
        name: string;
    }, {
        action: "force_quit" | "hide_window";
        bundleId: string;
        name: string;
    }>, "many">>;
    restEnforcement: z.ZodOptional<z.ZodObject<{
        workApps: z.ZodArray<z.ZodObject<{
            bundleId: z.ZodString;
            name: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            bundleId: string;
            name: string;
        }, {
            bundleId: string;
            name: string;
        }>, "many">;
        actions: z.ZodArray<z.ZodString, "many">;
        graceDurationMinutes: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        workApps: {
            bundleId: string;
            name: string;
        }[];
        actions: string[];
        graceDurationMinutes: number;
    }, {
        workApps: {
            bundleId: string;
            name: string;
        }[];
        actions: string[];
        graceDurationMinutes: number;
    }>>;
}, "strip", z.ZodTypeAny, {
    enforcementMode: "strict" | "gentle";
    version: number;
    updatedAt: number;
    blacklist: string[];
    whitelist: string[];
    workTimeSlots: {
        dayOfWeek: number;
        startHour: number;
        startMinute: number;
        endHour: number;
        endMinute: number;
    }[];
    skipTokens: {
        delayMinutes: number;
        maxPerDay: number;
    };
    distractionApps: {
        action: "force_quit" | "hide_window";
        bundleId: string;
        name: string;
    }[];
    sleepTime?: {
        startTime: string;
        endTime: string;
        enabled: boolean;
        enforcementApps: {
            bundleId: string;
            name: string;
        }[];
    } | undefined;
    overRestEnforcementApps?: {
        action: "force_quit" | "hide_window";
        bundleId: string;
        name: string;
    }[] | undefined;
    restEnforcement?: {
        workApps: {
            bundleId: string;
            name: string;
        }[];
        actions: string[];
        graceDurationMinutes: number;
    } | undefined;
}, {
    enforcementMode: "strict" | "gentle";
    version: number;
    updatedAt: number;
    blacklist: string[];
    whitelist: string[];
    workTimeSlots: {
        dayOfWeek: number;
        startHour: number;
        startMinute: number;
        endHour: number;
        endMinute: number;
    }[];
    skipTokens: {
        delayMinutes: number;
        maxPerDay: number;
    };
    distractionApps: {
        action: "force_quit" | "hide_window";
        bundleId: string;
        name: string;
    }[];
    sleepTime?: {
        startTime: string;
        endTime: string;
        enabled: boolean;
        enforcementApps: {
            bundleId: string;
            name: string;
        }[];
    } | undefined;
    overRestEnforcementApps?: {
        action: "force_quit" | "hide_window";
        bundleId: string;
        name: string;
    }[] | undefined;
    restEnforcement?: {
        workApps: {
            bundleId: string;
            name: string;
        }[];
        actions: string[];
        graceDurationMinutes: number;
    } | undefined;
}>;
export declare const HealthLimitSchema: z.ZodObject<{
    type: z.ZodEnum<["2hours", "daily"]>;
    message: z.ZodString;
    repeating: z.ZodOptional<z.ZodBoolean>;
    intervalMinutes: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    message: string;
    type: "2hours" | "daily";
    repeating?: boolean | undefined;
    intervalMinutes?: number | undefined;
}, {
    message: string;
    type: "2hours" | "daily";
    repeating?: boolean | undefined;
    intervalMinutes?: number | undefined;
}>;
export declare const TemporaryUnblockSchema: z.ZodObject<{
    active: z.ZodBoolean;
    endTime: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    active: boolean;
    endTime: number;
}, {
    active: boolean;
    endTime: number;
}>;
export declare const PolicyStateSchema: z.ZodObject<{
    skipTokensRemaining: z.ZodNumber;
    isSleepTimeActive: z.ZodBoolean;
    isSleepSnoozed: z.ZodBoolean;
    sleepSnoozeEndTime: z.ZodOptional<z.ZodNumber>;
    isOverRest: z.ZodBoolean;
    overRestMinutes: z.ZodNumber;
    overRestBringToFront: z.ZodBoolean;
    isRestEnforcementActive: z.ZodBoolean;
    restGrace: z.ZodOptional<z.ZodObject<{
        available: z.ZodBoolean;
        remaining: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        available: boolean;
        remaining: number;
    }, {
        available: boolean;
        remaining: number;
    }>>;
    adhocFocusSession: z.ZodOptional<z.ZodObject<{
        active: z.ZodBoolean;
        endTime: z.ZodNumber;
        overridesSleepTime: z.ZodOptional<z.ZodBoolean>;
        overridesWorkHours: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        active: boolean;
        endTime: number;
        overridesSleepTime?: boolean | undefined;
        overridesWorkHours?: boolean | undefined;
    }, {
        active: boolean;
        endTime: number;
        overridesSleepTime?: boolean | undefined;
        overridesWorkHours?: boolean | undefined;
    }>>;
    temporaryUnblock: z.ZodOptional<z.ZodObject<{
        active: z.ZodBoolean;
        endTime: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        active: boolean;
        endTime: number;
    }, {
        active: boolean;
        endTime: number;
    }>>;
    healthLimit: z.ZodOptional<z.ZodObject<{
        type: z.ZodEnum<["2hours", "daily"]>;
        message: z.ZodString;
        repeating: z.ZodOptional<z.ZodBoolean>;
        intervalMinutes: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        message: string;
        type: "2hours" | "daily";
        repeating?: boolean | undefined;
        intervalMinutes?: number | undefined;
    }, {
        message: string;
        type: "2hours" | "daily";
        repeating?: boolean | undefined;
        intervalMinutes?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    skipTokensRemaining: number;
    isSleepTimeActive: boolean;
    isSleepSnoozed: boolean;
    isOverRest: boolean;
    overRestMinutes: number;
    overRestBringToFront: boolean;
    isRestEnforcementActive: boolean;
    sleepSnoozeEndTime?: number | undefined;
    restGrace?: {
        available: boolean;
        remaining: number;
    } | undefined;
    adhocFocusSession?: {
        active: boolean;
        endTime: number;
        overridesSleepTime?: boolean | undefined;
        overridesWorkHours?: boolean | undefined;
    } | undefined;
    temporaryUnblock?: {
        active: boolean;
        endTime: number;
    } | undefined;
    healthLimit?: {
        message: string;
        type: "2hours" | "daily";
        repeating?: boolean | undefined;
        intervalMinutes?: number | undefined;
    } | undefined;
}, {
    skipTokensRemaining: number;
    isSleepTimeActive: boolean;
    isSleepSnoozed: boolean;
    isOverRest: boolean;
    overRestMinutes: number;
    overRestBringToFront: boolean;
    isRestEnforcementActive: boolean;
    sleepSnoozeEndTime?: number | undefined;
    restGrace?: {
        available: boolean;
        remaining: number;
    } | undefined;
    adhocFocusSession?: {
        active: boolean;
        endTime: number;
        overridesSleepTime?: boolean | undefined;
        overridesWorkHours?: boolean | undefined;
    } | undefined;
    temporaryUnblock?: {
        active: boolean;
        endTime: number;
    } | undefined;
    healthLimit?: {
        message: string;
        type: "2hours" | "daily";
        repeating?: boolean | undefined;
        intervalMinutes?: number | undefined;
    } | undefined;
}>;
export declare const PolicySchema: z.ZodObject<{
    config: z.ZodObject<{
        version: z.ZodNumber;
        updatedAt: z.ZodNumber;
        blacklist: z.ZodArray<z.ZodString, "many">;
        whitelist: z.ZodArray<z.ZodString, "many">;
        enforcementMode: z.ZodEnum<["strict", "gentle"]>;
        workTimeSlots: z.ZodArray<z.ZodObject<{
            dayOfWeek: z.ZodNumber;
            startHour: z.ZodNumber;
            startMinute: z.ZodNumber;
            endHour: z.ZodNumber;
            endMinute: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            dayOfWeek: number;
            startHour: number;
            startMinute: number;
            endHour: number;
            endMinute: number;
        }, {
            dayOfWeek: number;
            startHour: number;
            startMinute: number;
            endHour: number;
            endMinute: number;
        }>, "many">;
        skipTokens: z.ZodObject<{
            maxPerDay: z.ZodNumber;
            delayMinutes: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            delayMinutes: number;
            maxPerDay: number;
        }, {
            delayMinutes: number;
            maxPerDay: number;
        }>;
        distractionApps: z.ZodArray<z.ZodObject<{
            bundleId: z.ZodString;
            name: z.ZodString;
            action: z.ZodEnum<["force_quit", "hide_window"]>;
        }, "strip", z.ZodTypeAny, {
            action: "force_quit" | "hide_window";
            bundleId: string;
            name: string;
        }, {
            action: "force_quit" | "hide_window";
            bundleId: string;
            name: string;
        }>, "many">;
        sleepTime: z.ZodOptional<z.ZodObject<{
            enabled: z.ZodBoolean;
            startTime: z.ZodString;
            endTime: z.ZodString;
            enforcementApps: z.ZodArray<z.ZodObject<{
                bundleId: z.ZodString;
                name: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                bundleId: string;
                name: string;
            }, {
                bundleId: string;
                name: string;
            }>, "many">;
        }, "strip", z.ZodTypeAny, {
            startTime: string;
            endTime: string;
            enabled: boolean;
            enforcementApps: {
                bundleId: string;
                name: string;
            }[];
        }, {
            startTime: string;
            endTime: string;
            enabled: boolean;
            enforcementApps: {
                bundleId: string;
                name: string;
            }[];
        }>>;
        overRestEnforcementApps: z.ZodOptional<z.ZodArray<z.ZodObject<{
            bundleId: z.ZodString;
            name: z.ZodString;
            action: z.ZodEnum<["force_quit", "hide_window"]>;
        }, "strip", z.ZodTypeAny, {
            action: "force_quit" | "hide_window";
            bundleId: string;
            name: string;
        }, {
            action: "force_quit" | "hide_window";
            bundleId: string;
            name: string;
        }>, "many">>;
        restEnforcement: z.ZodOptional<z.ZodObject<{
            workApps: z.ZodArray<z.ZodObject<{
                bundleId: z.ZodString;
                name: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                bundleId: string;
                name: string;
            }, {
                bundleId: string;
                name: string;
            }>, "many">;
            actions: z.ZodArray<z.ZodString, "many">;
            graceDurationMinutes: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            workApps: {
                bundleId: string;
                name: string;
            }[];
            actions: string[];
            graceDurationMinutes: number;
        }, {
            workApps: {
                bundleId: string;
                name: string;
            }[];
            actions: string[];
            graceDurationMinutes: number;
        }>>;
    }, "strip", z.ZodTypeAny, {
        enforcementMode: "strict" | "gentle";
        version: number;
        updatedAt: number;
        blacklist: string[];
        whitelist: string[];
        workTimeSlots: {
            dayOfWeek: number;
            startHour: number;
            startMinute: number;
            endHour: number;
            endMinute: number;
        }[];
        skipTokens: {
            delayMinutes: number;
            maxPerDay: number;
        };
        distractionApps: {
            action: "force_quit" | "hide_window";
            bundleId: string;
            name: string;
        }[];
        sleepTime?: {
            startTime: string;
            endTime: string;
            enabled: boolean;
            enforcementApps: {
                bundleId: string;
                name: string;
            }[];
        } | undefined;
        overRestEnforcementApps?: {
            action: "force_quit" | "hide_window";
            bundleId: string;
            name: string;
        }[] | undefined;
        restEnforcement?: {
            workApps: {
                bundleId: string;
                name: string;
            }[];
            actions: string[];
            graceDurationMinutes: number;
        } | undefined;
    }, {
        enforcementMode: "strict" | "gentle";
        version: number;
        updatedAt: number;
        blacklist: string[];
        whitelist: string[];
        workTimeSlots: {
            dayOfWeek: number;
            startHour: number;
            startMinute: number;
            endHour: number;
            endMinute: number;
        }[];
        skipTokens: {
            delayMinutes: number;
            maxPerDay: number;
        };
        distractionApps: {
            action: "force_quit" | "hide_window";
            bundleId: string;
            name: string;
        }[];
        sleepTime?: {
            startTime: string;
            endTime: string;
            enabled: boolean;
            enforcementApps: {
                bundleId: string;
                name: string;
            }[];
        } | undefined;
        overRestEnforcementApps?: {
            action: "force_quit" | "hide_window";
            bundleId: string;
            name: string;
        }[] | undefined;
        restEnforcement?: {
            workApps: {
                bundleId: string;
                name: string;
            }[];
            actions: string[];
            graceDurationMinutes: number;
        } | undefined;
    }>;
    state: z.ZodObject<{
        skipTokensRemaining: z.ZodNumber;
        isSleepTimeActive: z.ZodBoolean;
        isSleepSnoozed: z.ZodBoolean;
        sleepSnoozeEndTime: z.ZodOptional<z.ZodNumber>;
        isOverRest: z.ZodBoolean;
        overRestMinutes: z.ZodNumber;
        overRestBringToFront: z.ZodBoolean;
        isRestEnforcementActive: z.ZodBoolean;
        restGrace: z.ZodOptional<z.ZodObject<{
            available: z.ZodBoolean;
            remaining: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            available: boolean;
            remaining: number;
        }, {
            available: boolean;
            remaining: number;
        }>>;
        adhocFocusSession: z.ZodOptional<z.ZodObject<{
            active: z.ZodBoolean;
            endTime: z.ZodNumber;
            overridesSleepTime: z.ZodOptional<z.ZodBoolean>;
            overridesWorkHours: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            active: boolean;
            endTime: number;
            overridesSleepTime?: boolean | undefined;
            overridesWorkHours?: boolean | undefined;
        }, {
            active: boolean;
            endTime: number;
            overridesSleepTime?: boolean | undefined;
            overridesWorkHours?: boolean | undefined;
        }>>;
        temporaryUnblock: z.ZodOptional<z.ZodObject<{
            active: z.ZodBoolean;
            endTime: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            active: boolean;
            endTime: number;
        }, {
            active: boolean;
            endTime: number;
        }>>;
        healthLimit: z.ZodOptional<z.ZodObject<{
            type: z.ZodEnum<["2hours", "daily"]>;
            message: z.ZodString;
            repeating: z.ZodOptional<z.ZodBoolean>;
            intervalMinutes: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            message: string;
            type: "2hours" | "daily";
            repeating?: boolean | undefined;
            intervalMinutes?: number | undefined;
        }, {
            message: string;
            type: "2hours" | "daily";
            repeating?: boolean | undefined;
            intervalMinutes?: number | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        skipTokensRemaining: number;
        isSleepTimeActive: boolean;
        isSleepSnoozed: boolean;
        isOverRest: boolean;
        overRestMinutes: number;
        overRestBringToFront: boolean;
        isRestEnforcementActive: boolean;
        sleepSnoozeEndTime?: number | undefined;
        restGrace?: {
            available: boolean;
            remaining: number;
        } | undefined;
        adhocFocusSession?: {
            active: boolean;
            endTime: number;
            overridesSleepTime?: boolean | undefined;
            overridesWorkHours?: boolean | undefined;
        } | undefined;
        temporaryUnblock?: {
            active: boolean;
            endTime: number;
        } | undefined;
        healthLimit?: {
            message: string;
            type: "2hours" | "daily";
            repeating?: boolean | undefined;
            intervalMinutes?: number | undefined;
        } | undefined;
    }, {
        skipTokensRemaining: number;
        isSleepTimeActive: boolean;
        isSleepSnoozed: boolean;
        isOverRest: boolean;
        overRestMinutes: number;
        overRestBringToFront: boolean;
        isRestEnforcementActive: boolean;
        sleepSnoozeEndTime?: number | undefined;
        restGrace?: {
            available: boolean;
            remaining: number;
        } | undefined;
        adhocFocusSession?: {
            active: boolean;
            endTime: number;
            overridesSleepTime?: boolean | undefined;
            overridesWorkHours?: boolean | undefined;
        } | undefined;
        temporaryUnblock?: {
            active: boolean;
            endTime: number;
        } | undefined;
        healthLimit?: {
            message: string;
            type: "2hours" | "daily";
            repeating?: boolean | undefined;
            intervalMinutes?: number | undefined;
        } | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    state: {
        skipTokensRemaining: number;
        isSleepTimeActive: boolean;
        isSleepSnoozed: boolean;
        isOverRest: boolean;
        overRestMinutes: number;
        overRestBringToFront: boolean;
        isRestEnforcementActive: boolean;
        sleepSnoozeEndTime?: number | undefined;
        restGrace?: {
            available: boolean;
            remaining: number;
        } | undefined;
        adhocFocusSession?: {
            active: boolean;
            endTime: number;
            overridesSleepTime?: boolean | undefined;
            overridesWorkHours?: boolean | undefined;
        } | undefined;
        temporaryUnblock?: {
            active: boolean;
            endTime: number;
        } | undefined;
        healthLimit?: {
            message: string;
            type: "2hours" | "daily";
            repeating?: boolean | undefined;
            intervalMinutes?: number | undefined;
        } | undefined;
    };
    config: {
        enforcementMode: "strict" | "gentle";
        version: number;
        updatedAt: number;
        blacklist: string[];
        whitelist: string[];
        workTimeSlots: {
            dayOfWeek: number;
            startHour: number;
            startMinute: number;
            endHour: number;
            endMinute: number;
        }[];
        skipTokens: {
            delayMinutes: number;
            maxPerDay: number;
        };
        distractionApps: {
            action: "force_quit" | "hide_window";
            bundleId: string;
            name: string;
        }[];
        sleepTime?: {
            startTime: string;
            endTime: string;
            enabled: boolean;
            enforcementApps: {
                bundleId: string;
                name: string;
            }[];
        } | undefined;
        overRestEnforcementApps?: {
            action: "force_quit" | "hide_window";
            bundleId: string;
            name: string;
        }[] | undefined;
        restEnforcement?: {
            workApps: {
                bundleId: string;
                name: string;
            }[];
            actions: string[];
            graceDurationMinutes: number;
        } | undefined;
    };
}, {
    state: {
        skipTokensRemaining: number;
        isSleepTimeActive: boolean;
        isSleepSnoozed: boolean;
        isOverRest: boolean;
        overRestMinutes: number;
        overRestBringToFront: boolean;
        isRestEnforcementActive: boolean;
        sleepSnoozeEndTime?: number | undefined;
        restGrace?: {
            available: boolean;
            remaining: number;
        } | undefined;
        adhocFocusSession?: {
            active: boolean;
            endTime: number;
            overridesSleepTime?: boolean | undefined;
            overridesWorkHours?: boolean | undefined;
        } | undefined;
        temporaryUnblock?: {
            active: boolean;
            endTime: number;
        } | undefined;
        healthLimit?: {
            message: string;
            type: "2hours" | "daily";
            repeating?: boolean | undefined;
            intervalMinutes?: number | undefined;
        } | undefined;
    };
    config: {
        enforcementMode: "strict" | "gentle";
        version: number;
        updatedAt: number;
        blacklist: string[];
        whitelist: string[];
        workTimeSlots: {
            dayOfWeek: number;
            startHour: number;
            startMinute: number;
            endHour: number;
            endMinute: number;
        }[];
        skipTokens: {
            delayMinutes: number;
            maxPerDay: number;
        };
        distractionApps: {
            action: "force_quit" | "hide_window";
            bundleId: string;
            name: string;
        }[];
        sleepTime?: {
            startTime: string;
            endTime: string;
            enabled: boolean;
            enforcementApps: {
                bundleId: string;
                name: string;
            }[];
        } | undefined;
        overRestEnforcementApps?: {
            action: "force_quit" | "hide_window";
            bundleId: string;
            name: string;
        }[] | undefined;
        restEnforcement?: {
            workApps: {
                bundleId: string;
                name: string;
            }[];
            actions: string[];
            graceDurationMinutes: number;
        } | undefined;
    };
}>;
/** @deprecated Use SleepTimeConfigSchema + PolicyStateSchema */
export declare const SleepTimePolicySchema: z.ZodObject<{
    enabled: z.ZodBoolean;
    startTime: z.ZodString;
    endTime: z.ZodString;
    enforcementApps: z.ZodArray<z.ZodObject<{
        bundleId: z.ZodString;
        name: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        bundleId: string;
        name: string;
    }, {
        bundleId: string;
        name: string;
    }>, "many">;
    isCurrentlyActive: z.ZodBoolean;
    isSnoozed: z.ZodBoolean;
    snoozeEndTime: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    startTime: string;
    endTime: string;
    enabled: boolean;
    enforcementApps: {
        bundleId: string;
        name: string;
    }[];
    isCurrentlyActive: boolean;
    isSnoozed: boolean;
    snoozeEndTime?: number | undefined;
}, {
    startTime: string;
    endTime: string;
    enabled: boolean;
    enforcementApps: {
        bundleId: string;
        name: string;
    }[];
    isCurrentlyActive: boolean;
    isSnoozed: boolean;
    snoozeEndTime?: number | undefined;
}>;
/** @deprecated Use PolicyStateSchema.isOverRest + related fields */
export declare const OverRestPolicySchema: z.ZodObject<{
    isOverRest: z.ZodBoolean;
    overRestMinutes: z.ZodNumber;
    enforcementApps: z.ZodArray<z.ZodObject<{
        bundleId: z.ZodString;
        name: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        bundleId: string;
        name: string;
    }, {
        bundleId: string;
        name: string;
    }>, "many">;
    bringToFront: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    enforcementApps: {
        bundleId: string;
        name: string;
    }[];
    isOverRest: boolean;
    overRestMinutes: number;
    bringToFront: boolean;
}, {
    enforcementApps: {
        bundleId: string;
        name: string;
    }[];
    isOverRest: boolean;
    overRestMinutes: number;
    bringToFront: boolean;
}>;
/** @deprecated Use TemporaryUnblockSchema */
export declare const TemporaryUnblockPolicySchema: z.ZodObject<{
    active: z.ZodBoolean;
    endTime: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    active: boolean;
    endTime: number;
}, {
    active: boolean;
    endTime: number;
}>;
/** @deprecated Use RestEnforcementConfigSchema + PolicyStateSchema */
export declare const RestEnforcementPolicySchema: z.ZodObject<{
    isActive: z.ZodBoolean;
    workApps: z.ZodArray<z.ZodObject<{
        bundleId: z.ZodString;
        name: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        bundleId: string;
        name: string;
    }, {
        bundleId: string;
        name: string;
    }>, "many">;
    actions: z.ZodArray<z.ZodString, "many">;
    grace: z.ZodObject<{
        available: z.ZodBoolean;
        remaining: z.ZodNumber;
        durationMinutes: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        available: boolean;
        remaining: number;
        durationMinutes: number;
    }, {
        available: boolean;
        remaining: number;
        durationMinutes: number;
    }>;
}, "strip", z.ZodTypeAny, {
    workApps: {
        bundleId: string;
        name: string;
    }[];
    actions: string[];
    isActive: boolean;
    grace: {
        available: boolean;
        remaining: number;
        durationMinutes: number;
    };
}, {
    workApps: {
        bundleId: string;
        name: string;
    }[];
    actions: string[];
    isActive: boolean;
    grace: {
        available: boolean;
        remaining: number;
        durationMinutes: number;
    };
}>;
/** @deprecated Dead field — never populated by server */
export declare const WorkTimePolicySchema: z.ZodObject<{
    enabled: z.ZodBoolean;
    isCurrentlyActive: z.ZodBoolean;
    isInRestPeriod: z.ZodBoolean;
    slots: z.ZodArray<z.ZodObject<{
        startTime: z.ZodString;
        endTime: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        startTime: string;
        endTime: string;
    }, {
        startTime: string;
        endTime: string;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    enabled: boolean;
    isCurrentlyActive: boolean;
    isInRestPeriod: boolean;
    slots: {
        startTime: string;
        endTime: string;
    }[];
}, {
    enabled: boolean;
    isCurrentlyActive: boolean;
    isInRestPeriod: boolean;
    slots: {
        startTime: string;
        endTime: string;
    }[];
}>;
export declare const UpdatePolicyPayloadSchema: z.ZodObject<{
    policyType: z.ZodEnum<["full", "partial"]>;
    policy: z.ZodObject<{
        config: z.ZodObject<{
            version: z.ZodNumber;
            updatedAt: z.ZodNumber;
            blacklist: z.ZodArray<z.ZodString, "many">;
            whitelist: z.ZodArray<z.ZodString, "many">;
            enforcementMode: z.ZodEnum<["strict", "gentle"]>;
            workTimeSlots: z.ZodArray<z.ZodObject<{
                dayOfWeek: z.ZodNumber;
                startHour: z.ZodNumber;
                startMinute: z.ZodNumber;
                endHour: z.ZodNumber;
                endMinute: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                dayOfWeek: number;
                startHour: number;
                startMinute: number;
                endHour: number;
                endMinute: number;
            }, {
                dayOfWeek: number;
                startHour: number;
                startMinute: number;
                endHour: number;
                endMinute: number;
            }>, "many">;
            skipTokens: z.ZodObject<{
                maxPerDay: z.ZodNumber;
                delayMinutes: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                delayMinutes: number;
                maxPerDay: number;
            }, {
                delayMinutes: number;
                maxPerDay: number;
            }>;
            distractionApps: z.ZodArray<z.ZodObject<{
                bundleId: z.ZodString;
                name: z.ZodString;
                action: z.ZodEnum<["force_quit", "hide_window"]>;
            }, "strip", z.ZodTypeAny, {
                action: "force_quit" | "hide_window";
                bundleId: string;
                name: string;
            }, {
                action: "force_quit" | "hide_window";
                bundleId: string;
                name: string;
            }>, "many">;
            sleepTime: z.ZodOptional<z.ZodObject<{
                enabled: z.ZodBoolean;
                startTime: z.ZodString;
                endTime: z.ZodString;
                enforcementApps: z.ZodArray<z.ZodObject<{
                    bundleId: z.ZodString;
                    name: z.ZodString;
                }, "strip", z.ZodTypeAny, {
                    bundleId: string;
                    name: string;
                }, {
                    bundleId: string;
                    name: string;
                }>, "many">;
            }, "strip", z.ZodTypeAny, {
                startTime: string;
                endTime: string;
                enabled: boolean;
                enforcementApps: {
                    bundleId: string;
                    name: string;
                }[];
            }, {
                startTime: string;
                endTime: string;
                enabled: boolean;
                enforcementApps: {
                    bundleId: string;
                    name: string;
                }[];
            }>>;
            overRestEnforcementApps: z.ZodOptional<z.ZodArray<z.ZodObject<{
                bundleId: z.ZodString;
                name: z.ZodString;
                action: z.ZodEnum<["force_quit", "hide_window"]>;
            }, "strip", z.ZodTypeAny, {
                action: "force_quit" | "hide_window";
                bundleId: string;
                name: string;
            }, {
                action: "force_quit" | "hide_window";
                bundleId: string;
                name: string;
            }>, "many">>;
            restEnforcement: z.ZodOptional<z.ZodObject<{
                workApps: z.ZodArray<z.ZodObject<{
                    bundleId: z.ZodString;
                    name: z.ZodString;
                }, "strip", z.ZodTypeAny, {
                    bundleId: string;
                    name: string;
                }, {
                    bundleId: string;
                    name: string;
                }>, "many">;
                actions: z.ZodArray<z.ZodString, "many">;
                graceDurationMinutes: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                workApps: {
                    bundleId: string;
                    name: string;
                }[];
                actions: string[];
                graceDurationMinutes: number;
            }, {
                workApps: {
                    bundleId: string;
                    name: string;
                }[];
                actions: string[];
                graceDurationMinutes: number;
            }>>;
        }, "strip", z.ZodTypeAny, {
            enforcementMode: "strict" | "gentle";
            version: number;
            updatedAt: number;
            blacklist: string[];
            whitelist: string[];
            workTimeSlots: {
                dayOfWeek: number;
                startHour: number;
                startMinute: number;
                endHour: number;
                endMinute: number;
            }[];
            skipTokens: {
                delayMinutes: number;
                maxPerDay: number;
            };
            distractionApps: {
                action: "force_quit" | "hide_window";
                bundleId: string;
                name: string;
            }[];
            sleepTime?: {
                startTime: string;
                endTime: string;
                enabled: boolean;
                enforcementApps: {
                    bundleId: string;
                    name: string;
                }[];
            } | undefined;
            overRestEnforcementApps?: {
                action: "force_quit" | "hide_window";
                bundleId: string;
                name: string;
            }[] | undefined;
            restEnforcement?: {
                workApps: {
                    bundleId: string;
                    name: string;
                }[];
                actions: string[];
                graceDurationMinutes: number;
            } | undefined;
        }, {
            enforcementMode: "strict" | "gentle";
            version: number;
            updatedAt: number;
            blacklist: string[];
            whitelist: string[];
            workTimeSlots: {
                dayOfWeek: number;
                startHour: number;
                startMinute: number;
                endHour: number;
                endMinute: number;
            }[];
            skipTokens: {
                delayMinutes: number;
                maxPerDay: number;
            };
            distractionApps: {
                action: "force_quit" | "hide_window";
                bundleId: string;
                name: string;
            }[];
            sleepTime?: {
                startTime: string;
                endTime: string;
                enabled: boolean;
                enforcementApps: {
                    bundleId: string;
                    name: string;
                }[];
            } | undefined;
            overRestEnforcementApps?: {
                action: "force_quit" | "hide_window";
                bundleId: string;
                name: string;
            }[] | undefined;
            restEnforcement?: {
                workApps: {
                    bundleId: string;
                    name: string;
                }[];
                actions: string[];
                graceDurationMinutes: number;
            } | undefined;
        }>;
        state: z.ZodObject<{
            skipTokensRemaining: z.ZodNumber;
            isSleepTimeActive: z.ZodBoolean;
            isSleepSnoozed: z.ZodBoolean;
            sleepSnoozeEndTime: z.ZodOptional<z.ZodNumber>;
            isOverRest: z.ZodBoolean;
            overRestMinutes: z.ZodNumber;
            overRestBringToFront: z.ZodBoolean;
            isRestEnforcementActive: z.ZodBoolean;
            restGrace: z.ZodOptional<z.ZodObject<{
                available: z.ZodBoolean;
                remaining: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                available: boolean;
                remaining: number;
            }, {
                available: boolean;
                remaining: number;
            }>>;
            adhocFocusSession: z.ZodOptional<z.ZodObject<{
                active: z.ZodBoolean;
                endTime: z.ZodNumber;
                overridesSleepTime: z.ZodOptional<z.ZodBoolean>;
                overridesWorkHours: z.ZodOptional<z.ZodBoolean>;
            }, "strip", z.ZodTypeAny, {
                active: boolean;
                endTime: number;
                overridesSleepTime?: boolean | undefined;
                overridesWorkHours?: boolean | undefined;
            }, {
                active: boolean;
                endTime: number;
                overridesSleepTime?: boolean | undefined;
                overridesWorkHours?: boolean | undefined;
            }>>;
            temporaryUnblock: z.ZodOptional<z.ZodObject<{
                active: z.ZodBoolean;
                endTime: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                active: boolean;
                endTime: number;
            }, {
                active: boolean;
                endTime: number;
            }>>;
            healthLimit: z.ZodOptional<z.ZodObject<{
                type: z.ZodEnum<["2hours", "daily"]>;
                message: z.ZodString;
                repeating: z.ZodOptional<z.ZodBoolean>;
                intervalMinutes: z.ZodOptional<z.ZodNumber>;
            }, "strip", z.ZodTypeAny, {
                message: string;
                type: "2hours" | "daily";
                repeating?: boolean | undefined;
                intervalMinutes?: number | undefined;
            }, {
                message: string;
                type: "2hours" | "daily";
                repeating?: boolean | undefined;
                intervalMinutes?: number | undefined;
            }>>;
        }, "strip", z.ZodTypeAny, {
            skipTokensRemaining: number;
            isSleepTimeActive: boolean;
            isSleepSnoozed: boolean;
            isOverRest: boolean;
            overRestMinutes: number;
            overRestBringToFront: boolean;
            isRestEnforcementActive: boolean;
            sleepSnoozeEndTime?: number | undefined;
            restGrace?: {
                available: boolean;
                remaining: number;
            } | undefined;
            adhocFocusSession?: {
                active: boolean;
                endTime: number;
                overridesSleepTime?: boolean | undefined;
                overridesWorkHours?: boolean | undefined;
            } | undefined;
            temporaryUnblock?: {
                active: boolean;
                endTime: number;
            } | undefined;
            healthLimit?: {
                message: string;
                type: "2hours" | "daily";
                repeating?: boolean | undefined;
                intervalMinutes?: number | undefined;
            } | undefined;
        }, {
            skipTokensRemaining: number;
            isSleepTimeActive: boolean;
            isSleepSnoozed: boolean;
            isOverRest: boolean;
            overRestMinutes: number;
            overRestBringToFront: boolean;
            isRestEnforcementActive: boolean;
            sleepSnoozeEndTime?: number | undefined;
            restGrace?: {
                available: boolean;
                remaining: number;
            } | undefined;
            adhocFocusSession?: {
                active: boolean;
                endTime: number;
                overridesSleepTime?: boolean | undefined;
                overridesWorkHours?: boolean | undefined;
            } | undefined;
            temporaryUnblock?: {
                active: boolean;
                endTime: number;
            } | undefined;
            healthLimit?: {
                message: string;
                type: "2hours" | "daily";
                repeating?: boolean | undefined;
                intervalMinutes?: number | undefined;
            } | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        state: {
            skipTokensRemaining: number;
            isSleepTimeActive: boolean;
            isSleepSnoozed: boolean;
            isOverRest: boolean;
            overRestMinutes: number;
            overRestBringToFront: boolean;
            isRestEnforcementActive: boolean;
            sleepSnoozeEndTime?: number | undefined;
            restGrace?: {
                available: boolean;
                remaining: number;
            } | undefined;
            adhocFocusSession?: {
                active: boolean;
                endTime: number;
                overridesSleepTime?: boolean | undefined;
                overridesWorkHours?: boolean | undefined;
            } | undefined;
            temporaryUnblock?: {
                active: boolean;
                endTime: number;
            } | undefined;
            healthLimit?: {
                message: string;
                type: "2hours" | "daily";
                repeating?: boolean | undefined;
                intervalMinutes?: number | undefined;
            } | undefined;
        };
        config: {
            enforcementMode: "strict" | "gentle";
            version: number;
            updatedAt: number;
            blacklist: string[];
            whitelist: string[];
            workTimeSlots: {
                dayOfWeek: number;
                startHour: number;
                startMinute: number;
                endHour: number;
                endMinute: number;
            }[];
            skipTokens: {
                delayMinutes: number;
                maxPerDay: number;
            };
            distractionApps: {
                action: "force_quit" | "hide_window";
                bundleId: string;
                name: string;
            }[];
            sleepTime?: {
                startTime: string;
                endTime: string;
                enabled: boolean;
                enforcementApps: {
                    bundleId: string;
                    name: string;
                }[];
            } | undefined;
            overRestEnforcementApps?: {
                action: "force_quit" | "hide_window";
                bundleId: string;
                name: string;
            }[] | undefined;
            restEnforcement?: {
                workApps: {
                    bundleId: string;
                    name: string;
                }[];
                actions: string[];
                graceDurationMinutes: number;
            } | undefined;
        };
    }, {
        state: {
            skipTokensRemaining: number;
            isSleepTimeActive: boolean;
            isSleepSnoozed: boolean;
            isOverRest: boolean;
            overRestMinutes: number;
            overRestBringToFront: boolean;
            isRestEnforcementActive: boolean;
            sleepSnoozeEndTime?: number | undefined;
            restGrace?: {
                available: boolean;
                remaining: number;
            } | undefined;
            adhocFocusSession?: {
                active: boolean;
                endTime: number;
                overridesSleepTime?: boolean | undefined;
                overridesWorkHours?: boolean | undefined;
            } | undefined;
            temporaryUnblock?: {
                active: boolean;
                endTime: number;
            } | undefined;
            healthLimit?: {
                message: string;
                type: "2hours" | "daily";
                repeating?: boolean | undefined;
                intervalMinutes?: number | undefined;
            } | undefined;
        };
        config: {
            enforcementMode: "strict" | "gentle";
            version: number;
            updatedAt: number;
            blacklist: string[];
            whitelist: string[];
            workTimeSlots: {
                dayOfWeek: number;
                startHour: number;
                startMinute: number;
                endHour: number;
                endMinute: number;
            }[];
            skipTokens: {
                delayMinutes: number;
                maxPerDay: number;
            };
            distractionApps: {
                action: "force_quit" | "hide_window";
                bundleId: string;
                name: string;
            }[];
            sleepTime?: {
                startTime: string;
                endTime: string;
                enabled: boolean;
                enforcementApps: {
                    bundleId: string;
                    name: string;
                }[];
            } | undefined;
            overRestEnforcementApps?: {
                action: "force_quit" | "hide_window";
                bundleId: string;
                name: string;
            }[] | undefined;
            restEnforcement?: {
                workApps: {
                    bundleId: string;
                    name: string;
                }[];
                actions: string[];
                graceDurationMinutes: number;
            } | undefined;
        };
    }>;
    effectiveTime: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    policy: {
        state: {
            skipTokensRemaining: number;
            isSleepTimeActive: boolean;
            isSleepSnoozed: boolean;
            isOverRest: boolean;
            overRestMinutes: number;
            overRestBringToFront: boolean;
            isRestEnforcementActive: boolean;
            sleepSnoozeEndTime?: number | undefined;
            restGrace?: {
                available: boolean;
                remaining: number;
            } | undefined;
            adhocFocusSession?: {
                active: boolean;
                endTime: number;
                overridesSleepTime?: boolean | undefined;
                overridesWorkHours?: boolean | undefined;
            } | undefined;
            temporaryUnblock?: {
                active: boolean;
                endTime: number;
            } | undefined;
            healthLimit?: {
                message: string;
                type: "2hours" | "daily";
                repeating?: boolean | undefined;
                intervalMinutes?: number | undefined;
            } | undefined;
        };
        config: {
            enforcementMode: "strict" | "gentle";
            version: number;
            updatedAt: number;
            blacklist: string[];
            whitelist: string[];
            workTimeSlots: {
                dayOfWeek: number;
                startHour: number;
                startMinute: number;
                endHour: number;
                endMinute: number;
            }[];
            skipTokens: {
                delayMinutes: number;
                maxPerDay: number;
            };
            distractionApps: {
                action: "force_quit" | "hide_window";
                bundleId: string;
                name: string;
            }[];
            sleepTime?: {
                startTime: string;
                endTime: string;
                enabled: boolean;
                enforcementApps: {
                    bundleId: string;
                    name: string;
                }[];
            } | undefined;
            overRestEnforcementApps?: {
                action: "force_quit" | "hide_window";
                bundleId: string;
                name: string;
            }[] | undefined;
            restEnforcement?: {
                workApps: {
                    bundleId: string;
                    name: string;
                }[];
                actions: string[];
                graceDurationMinutes: number;
            } | undefined;
        };
    };
    policyType: "full" | "partial";
    effectiveTime: number;
}, {
    policy: {
        state: {
            skipTokensRemaining: number;
            isSleepTimeActive: boolean;
            isSleepSnoozed: boolean;
            isOverRest: boolean;
            overRestMinutes: number;
            overRestBringToFront: boolean;
            isRestEnforcementActive: boolean;
            sleepSnoozeEndTime?: number | undefined;
            restGrace?: {
                available: boolean;
                remaining: number;
            } | undefined;
            adhocFocusSession?: {
                active: boolean;
                endTime: number;
                overridesSleepTime?: boolean | undefined;
                overridesWorkHours?: boolean | undefined;
            } | undefined;
            temporaryUnblock?: {
                active: boolean;
                endTime: number;
            } | undefined;
            healthLimit?: {
                message: string;
                type: "2hours" | "daily";
                repeating?: boolean | undefined;
                intervalMinutes?: number | undefined;
            } | undefined;
        };
        config: {
            enforcementMode: "strict" | "gentle";
            version: number;
            updatedAt: number;
            blacklist: string[];
            whitelist: string[];
            workTimeSlots: {
                dayOfWeek: number;
                startHour: number;
                startMinute: number;
                endHour: number;
                endMinute: number;
            }[];
            skipTokens: {
                delayMinutes: number;
                maxPerDay: number;
            };
            distractionApps: {
                action: "force_quit" | "hide_window";
                bundleId: string;
                name: string;
            }[];
            sleepTime?: {
                startTime: string;
                endTime: string;
                enabled: boolean;
                enforcementApps: {
                    bundleId: string;
                    name: string;
                }[];
            } | undefined;
            overRestEnforcementApps?: {
                action: "force_quit" | "hide_window";
                bundleId: string;
                name: string;
            }[] | undefined;
            restEnforcement?: {
                workApps: {
                    bundleId: string;
                    name: string;
                }[];
                actions: string[];
                graceDurationMinutes: number;
            } | undefined;
        };
    };
    policyType: "full" | "partial";
    effectiveTime: number;
}>;
export declare const UpdatePolicyCommandSchema: z.ZodObject<{
    commandId: z.ZodString;
    targetClient: z.ZodUnion<[z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>, z.ZodLiteral<"all">]>;
    priority: z.ZodEnum<["low", "normal", "high", "critical"]>;
    requiresAck: z.ZodBoolean;
    expiryTime: z.ZodOptional<z.ZodNumber>;
    createdAt: z.ZodNumber;
} & {
    commandType: z.ZodLiteral<"UPDATE_POLICY">;
    payload: z.ZodObject<{
        policyType: z.ZodEnum<["full", "partial"]>;
        policy: z.ZodObject<{
            config: z.ZodObject<{
                version: z.ZodNumber;
                updatedAt: z.ZodNumber;
                blacklist: z.ZodArray<z.ZodString, "many">;
                whitelist: z.ZodArray<z.ZodString, "many">;
                enforcementMode: z.ZodEnum<["strict", "gentle"]>;
                workTimeSlots: z.ZodArray<z.ZodObject<{
                    dayOfWeek: z.ZodNumber;
                    startHour: z.ZodNumber;
                    startMinute: z.ZodNumber;
                    endHour: z.ZodNumber;
                    endMinute: z.ZodNumber;
                }, "strip", z.ZodTypeAny, {
                    dayOfWeek: number;
                    startHour: number;
                    startMinute: number;
                    endHour: number;
                    endMinute: number;
                }, {
                    dayOfWeek: number;
                    startHour: number;
                    startMinute: number;
                    endHour: number;
                    endMinute: number;
                }>, "many">;
                skipTokens: z.ZodObject<{
                    maxPerDay: z.ZodNumber;
                    delayMinutes: z.ZodNumber;
                }, "strip", z.ZodTypeAny, {
                    delayMinutes: number;
                    maxPerDay: number;
                }, {
                    delayMinutes: number;
                    maxPerDay: number;
                }>;
                distractionApps: z.ZodArray<z.ZodObject<{
                    bundleId: z.ZodString;
                    name: z.ZodString;
                    action: z.ZodEnum<["force_quit", "hide_window"]>;
                }, "strip", z.ZodTypeAny, {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }, {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }>, "many">;
                sleepTime: z.ZodOptional<z.ZodObject<{
                    enabled: z.ZodBoolean;
                    startTime: z.ZodString;
                    endTime: z.ZodString;
                    enforcementApps: z.ZodArray<z.ZodObject<{
                        bundleId: z.ZodString;
                        name: z.ZodString;
                    }, "strip", z.ZodTypeAny, {
                        bundleId: string;
                        name: string;
                    }, {
                        bundleId: string;
                        name: string;
                    }>, "many">;
                }, "strip", z.ZodTypeAny, {
                    startTime: string;
                    endTime: string;
                    enabled: boolean;
                    enforcementApps: {
                        bundleId: string;
                        name: string;
                    }[];
                }, {
                    startTime: string;
                    endTime: string;
                    enabled: boolean;
                    enforcementApps: {
                        bundleId: string;
                        name: string;
                    }[];
                }>>;
                overRestEnforcementApps: z.ZodOptional<z.ZodArray<z.ZodObject<{
                    bundleId: z.ZodString;
                    name: z.ZodString;
                    action: z.ZodEnum<["force_quit", "hide_window"]>;
                }, "strip", z.ZodTypeAny, {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }, {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }>, "many">>;
                restEnforcement: z.ZodOptional<z.ZodObject<{
                    workApps: z.ZodArray<z.ZodObject<{
                        bundleId: z.ZodString;
                        name: z.ZodString;
                    }, "strip", z.ZodTypeAny, {
                        bundleId: string;
                        name: string;
                    }, {
                        bundleId: string;
                        name: string;
                    }>, "many">;
                    actions: z.ZodArray<z.ZodString, "many">;
                    graceDurationMinutes: z.ZodNumber;
                }, "strip", z.ZodTypeAny, {
                    workApps: {
                        bundleId: string;
                        name: string;
                    }[];
                    actions: string[];
                    graceDurationMinutes: number;
                }, {
                    workApps: {
                        bundleId: string;
                        name: string;
                    }[];
                    actions: string[];
                    graceDurationMinutes: number;
                }>>;
            }, "strip", z.ZodTypeAny, {
                enforcementMode: "strict" | "gentle";
                version: number;
                updatedAt: number;
                blacklist: string[];
                whitelist: string[];
                workTimeSlots: {
                    dayOfWeek: number;
                    startHour: number;
                    startMinute: number;
                    endHour: number;
                    endMinute: number;
                }[];
                skipTokens: {
                    delayMinutes: number;
                    maxPerDay: number;
                };
                distractionApps: {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }[];
                sleepTime?: {
                    startTime: string;
                    endTime: string;
                    enabled: boolean;
                    enforcementApps: {
                        bundleId: string;
                        name: string;
                    }[];
                } | undefined;
                overRestEnforcementApps?: {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }[] | undefined;
                restEnforcement?: {
                    workApps: {
                        bundleId: string;
                        name: string;
                    }[];
                    actions: string[];
                    graceDurationMinutes: number;
                } | undefined;
            }, {
                enforcementMode: "strict" | "gentle";
                version: number;
                updatedAt: number;
                blacklist: string[];
                whitelist: string[];
                workTimeSlots: {
                    dayOfWeek: number;
                    startHour: number;
                    startMinute: number;
                    endHour: number;
                    endMinute: number;
                }[];
                skipTokens: {
                    delayMinutes: number;
                    maxPerDay: number;
                };
                distractionApps: {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }[];
                sleepTime?: {
                    startTime: string;
                    endTime: string;
                    enabled: boolean;
                    enforcementApps: {
                        bundleId: string;
                        name: string;
                    }[];
                } | undefined;
                overRestEnforcementApps?: {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }[] | undefined;
                restEnforcement?: {
                    workApps: {
                        bundleId: string;
                        name: string;
                    }[];
                    actions: string[];
                    graceDurationMinutes: number;
                } | undefined;
            }>;
            state: z.ZodObject<{
                skipTokensRemaining: z.ZodNumber;
                isSleepTimeActive: z.ZodBoolean;
                isSleepSnoozed: z.ZodBoolean;
                sleepSnoozeEndTime: z.ZodOptional<z.ZodNumber>;
                isOverRest: z.ZodBoolean;
                overRestMinutes: z.ZodNumber;
                overRestBringToFront: z.ZodBoolean;
                isRestEnforcementActive: z.ZodBoolean;
                restGrace: z.ZodOptional<z.ZodObject<{
                    available: z.ZodBoolean;
                    remaining: z.ZodNumber;
                }, "strip", z.ZodTypeAny, {
                    available: boolean;
                    remaining: number;
                }, {
                    available: boolean;
                    remaining: number;
                }>>;
                adhocFocusSession: z.ZodOptional<z.ZodObject<{
                    active: z.ZodBoolean;
                    endTime: z.ZodNumber;
                    overridesSleepTime: z.ZodOptional<z.ZodBoolean>;
                    overridesWorkHours: z.ZodOptional<z.ZodBoolean>;
                }, "strip", z.ZodTypeAny, {
                    active: boolean;
                    endTime: number;
                    overridesSleepTime?: boolean | undefined;
                    overridesWorkHours?: boolean | undefined;
                }, {
                    active: boolean;
                    endTime: number;
                    overridesSleepTime?: boolean | undefined;
                    overridesWorkHours?: boolean | undefined;
                }>>;
                temporaryUnblock: z.ZodOptional<z.ZodObject<{
                    active: z.ZodBoolean;
                    endTime: z.ZodNumber;
                }, "strip", z.ZodTypeAny, {
                    active: boolean;
                    endTime: number;
                }, {
                    active: boolean;
                    endTime: number;
                }>>;
                healthLimit: z.ZodOptional<z.ZodObject<{
                    type: z.ZodEnum<["2hours", "daily"]>;
                    message: z.ZodString;
                    repeating: z.ZodOptional<z.ZodBoolean>;
                    intervalMinutes: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    message: string;
                    type: "2hours" | "daily";
                    repeating?: boolean | undefined;
                    intervalMinutes?: number | undefined;
                }, {
                    message: string;
                    type: "2hours" | "daily";
                    repeating?: boolean | undefined;
                    intervalMinutes?: number | undefined;
                }>>;
            }, "strip", z.ZodTypeAny, {
                skipTokensRemaining: number;
                isSleepTimeActive: boolean;
                isSleepSnoozed: boolean;
                isOverRest: boolean;
                overRestMinutes: number;
                overRestBringToFront: boolean;
                isRestEnforcementActive: boolean;
                sleepSnoozeEndTime?: number | undefined;
                restGrace?: {
                    available: boolean;
                    remaining: number;
                } | undefined;
                adhocFocusSession?: {
                    active: boolean;
                    endTime: number;
                    overridesSleepTime?: boolean | undefined;
                    overridesWorkHours?: boolean | undefined;
                } | undefined;
                temporaryUnblock?: {
                    active: boolean;
                    endTime: number;
                } | undefined;
                healthLimit?: {
                    message: string;
                    type: "2hours" | "daily";
                    repeating?: boolean | undefined;
                    intervalMinutes?: number | undefined;
                } | undefined;
            }, {
                skipTokensRemaining: number;
                isSleepTimeActive: boolean;
                isSleepSnoozed: boolean;
                isOverRest: boolean;
                overRestMinutes: number;
                overRestBringToFront: boolean;
                isRestEnforcementActive: boolean;
                sleepSnoozeEndTime?: number | undefined;
                restGrace?: {
                    available: boolean;
                    remaining: number;
                } | undefined;
                adhocFocusSession?: {
                    active: boolean;
                    endTime: number;
                    overridesSleepTime?: boolean | undefined;
                    overridesWorkHours?: boolean | undefined;
                } | undefined;
                temporaryUnblock?: {
                    active: boolean;
                    endTime: number;
                } | undefined;
                healthLimit?: {
                    message: string;
                    type: "2hours" | "daily";
                    repeating?: boolean | undefined;
                    intervalMinutes?: number | undefined;
                } | undefined;
            }>;
        }, "strip", z.ZodTypeAny, {
            state: {
                skipTokensRemaining: number;
                isSleepTimeActive: boolean;
                isSleepSnoozed: boolean;
                isOverRest: boolean;
                overRestMinutes: number;
                overRestBringToFront: boolean;
                isRestEnforcementActive: boolean;
                sleepSnoozeEndTime?: number | undefined;
                restGrace?: {
                    available: boolean;
                    remaining: number;
                } | undefined;
                adhocFocusSession?: {
                    active: boolean;
                    endTime: number;
                    overridesSleepTime?: boolean | undefined;
                    overridesWorkHours?: boolean | undefined;
                } | undefined;
                temporaryUnblock?: {
                    active: boolean;
                    endTime: number;
                } | undefined;
                healthLimit?: {
                    message: string;
                    type: "2hours" | "daily";
                    repeating?: boolean | undefined;
                    intervalMinutes?: number | undefined;
                } | undefined;
            };
            config: {
                enforcementMode: "strict" | "gentle";
                version: number;
                updatedAt: number;
                blacklist: string[];
                whitelist: string[];
                workTimeSlots: {
                    dayOfWeek: number;
                    startHour: number;
                    startMinute: number;
                    endHour: number;
                    endMinute: number;
                }[];
                skipTokens: {
                    delayMinutes: number;
                    maxPerDay: number;
                };
                distractionApps: {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }[];
                sleepTime?: {
                    startTime: string;
                    endTime: string;
                    enabled: boolean;
                    enforcementApps: {
                        bundleId: string;
                        name: string;
                    }[];
                } | undefined;
                overRestEnforcementApps?: {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }[] | undefined;
                restEnforcement?: {
                    workApps: {
                        bundleId: string;
                        name: string;
                    }[];
                    actions: string[];
                    graceDurationMinutes: number;
                } | undefined;
            };
        }, {
            state: {
                skipTokensRemaining: number;
                isSleepTimeActive: boolean;
                isSleepSnoozed: boolean;
                isOverRest: boolean;
                overRestMinutes: number;
                overRestBringToFront: boolean;
                isRestEnforcementActive: boolean;
                sleepSnoozeEndTime?: number | undefined;
                restGrace?: {
                    available: boolean;
                    remaining: number;
                } | undefined;
                adhocFocusSession?: {
                    active: boolean;
                    endTime: number;
                    overridesSleepTime?: boolean | undefined;
                    overridesWorkHours?: boolean | undefined;
                } | undefined;
                temporaryUnblock?: {
                    active: boolean;
                    endTime: number;
                } | undefined;
                healthLimit?: {
                    message: string;
                    type: "2hours" | "daily";
                    repeating?: boolean | undefined;
                    intervalMinutes?: number | undefined;
                } | undefined;
            };
            config: {
                enforcementMode: "strict" | "gentle";
                version: number;
                updatedAt: number;
                blacklist: string[];
                whitelist: string[];
                workTimeSlots: {
                    dayOfWeek: number;
                    startHour: number;
                    startMinute: number;
                    endHour: number;
                    endMinute: number;
                }[];
                skipTokens: {
                    delayMinutes: number;
                    maxPerDay: number;
                };
                distractionApps: {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }[];
                sleepTime?: {
                    startTime: string;
                    endTime: string;
                    enabled: boolean;
                    enforcementApps: {
                        bundleId: string;
                        name: string;
                    }[];
                } | undefined;
                overRestEnforcementApps?: {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }[] | undefined;
                restEnforcement?: {
                    workApps: {
                        bundleId: string;
                        name: string;
                    }[];
                    actions: string[];
                    graceDurationMinutes: number;
                } | undefined;
            };
        }>;
        effectiveTime: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        policy: {
            state: {
                skipTokensRemaining: number;
                isSleepTimeActive: boolean;
                isSleepSnoozed: boolean;
                isOverRest: boolean;
                overRestMinutes: number;
                overRestBringToFront: boolean;
                isRestEnforcementActive: boolean;
                sleepSnoozeEndTime?: number | undefined;
                restGrace?: {
                    available: boolean;
                    remaining: number;
                } | undefined;
                adhocFocusSession?: {
                    active: boolean;
                    endTime: number;
                    overridesSleepTime?: boolean | undefined;
                    overridesWorkHours?: boolean | undefined;
                } | undefined;
                temporaryUnblock?: {
                    active: boolean;
                    endTime: number;
                } | undefined;
                healthLimit?: {
                    message: string;
                    type: "2hours" | "daily";
                    repeating?: boolean | undefined;
                    intervalMinutes?: number | undefined;
                } | undefined;
            };
            config: {
                enforcementMode: "strict" | "gentle";
                version: number;
                updatedAt: number;
                blacklist: string[];
                whitelist: string[];
                workTimeSlots: {
                    dayOfWeek: number;
                    startHour: number;
                    startMinute: number;
                    endHour: number;
                    endMinute: number;
                }[];
                skipTokens: {
                    delayMinutes: number;
                    maxPerDay: number;
                };
                distractionApps: {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }[];
                sleepTime?: {
                    startTime: string;
                    endTime: string;
                    enabled: boolean;
                    enforcementApps: {
                        bundleId: string;
                        name: string;
                    }[];
                } | undefined;
                overRestEnforcementApps?: {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }[] | undefined;
                restEnforcement?: {
                    workApps: {
                        bundleId: string;
                        name: string;
                    }[];
                    actions: string[];
                    graceDurationMinutes: number;
                } | undefined;
            };
        };
        policyType: "full" | "partial";
        effectiveTime: number;
    }, {
        policy: {
            state: {
                skipTokensRemaining: number;
                isSleepTimeActive: boolean;
                isSleepSnoozed: boolean;
                isOverRest: boolean;
                overRestMinutes: number;
                overRestBringToFront: boolean;
                isRestEnforcementActive: boolean;
                sleepSnoozeEndTime?: number | undefined;
                restGrace?: {
                    available: boolean;
                    remaining: number;
                } | undefined;
                adhocFocusSession?: {
                    active: boolean;
                    endTime: number;
                    overridesSleepTime?: boolean | undefined;
                    overridesWorkHours?: boolean | undefined;
                } | undefined;
                temporaryUnblock?: {
                    active: boolean;
                    endTime: number;
                } | undefined;
                healthLimit?: {
                    message: string;
                    type: "2hours" | "daily";
                    repeating?: boolean | undefined;
                    intervalMinutes?: number | undefined;
                } | undefined;
            };
            config: {
                enforcementMode: "strict" | "gentle";
                version: number;
                updatedAt: number;
                blacklist: string[];
                whitelist: string[];
                workTimeSlots: {
                    dayOfWeek: number;
                    startHour: number;
                    startMinute: number;
                    endHour: number;
                    endMinute: number;
                }[];
                skipTokens: {
                    delayMinutes: number;
                    maxPerDay: number;
                };
                distractionApps: {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }[];
                sleepTime?: {
                    startTime: string;
                    endTime: string;
                    enabled: boolean;
                    enforcementApps: {
                        bundleId: string;
                        name: string;
                    }[];
                } | undefined;
                overRestEnforcementApps?: {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }[] | undefined;
                restEnforcement?: {
                    workApps: {
                        bundleId: string;
                        name: string;
                    }[];
                    actions: string[];
                    graceDurationMinutes: number;
                } | undefined;
            };
        };
        policyType: "full" | "partial";
        effectiveTime: number;
    }>;
}, "strip", z.ZodTypeAny, {
    payload: {
        policy: {
            state: {
                skipTokensRemaining: number;
                isSleepTimeActive: boolean;
                isSleepSnoozed: boolean;
                isOverRest: boolean;
                overRestMinutes: number;
                overRestBringToFront: boolean;
                isRestEnforcementActive: boolean;
                sleepSnoozeEndTime?: number | undefined;
                restGrace?: {
                    available: boolean;
                    remaining: number;
                } | undefined;
                adhocFocusSession?: {
                    active: boolean;
                    endTime: number;
                    overridesSleepTime?: boolean | undefined;
                    overridesWorkHours?: boolean | undefined;
                } | undefined;
                temporaryUnblock?: {
                    active: boolean;
                    endTime: number;
                } | undefined;
                healthLimit?: {
                    message: string;
                    type: "2hours" | "daily";
                    repeating?: boolean | undefined;
                    intervalMinutes?: number | undefined;
                } | undefined;
            };
            config: {
                enforcementMode: "strict" | "gentle";
                version: number;
                updatedAt: number;
                blacklist: string[];
                whitelist: string[];
                workTimeSlots: {
                    dayOfWeek: number;
                    startHour: number;
                    startMinute: number;
                    endHour: number;
                    endMinute: number;
                }[];
                skipTokens: {
                    delayMinutes: number;
                    maxPerDay: number;
                };
                distractionApps: {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }[];
                sleepTime?: {
                    startTime: string;
                    endTime: string;
                    enabled: boolean;
                    enforcementApps: {
                        bundleId: string;
                        name: string;
                    }[];
                } | undefined;
                overRestEnforcementApps?: {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }[] | undefined;
                restEnforcement?: {
                    workApps: {
                        bundleId: string;
                        name: string;
                    }[];
                    actions: string[];
                    graceDurationMinutes: number;
                } | undefined;
            };
        };
        policyType: "full" | "partial";
        effectiveTime: number;
    };
    commandId: string;
    commandType: "UPDATE_POLICY";
    targetClient: "web" | "desktop" | "browser_ext" | "mobile" | "api" | "all";
    priority: "low" | "normal" | "high" | "critical";
    requiresAck: boolean;
    createdAt: number;
    expiryTime?: number | undefined;
}, {
    payload: {
        policy: {
            state: {
                skipTokensRemaining: number;
                isSleepTimeActive: boolean;
                isSleepSnoozed: boolean;
                isOverRest: boolean;
                overRestMinutes: number;
                overRestBringToFront: boolean;
                isRestEnforcementActive: boolean;
                sleepSnoozeEndTime?: number | undefined;
                restGrace?: {
                    available: boolean;
                    remaining: number;
                } | undefined;
                adhocFocusSession?: {
                    active: boolean;
                    endTime: number;
                    overridesSleepTime?: boolean | undefined;
                    overridesWorkHours?: boolean | undefined;
                } | undefined;
                temporaryUnblock?: {
                    active: boolean;
                    endTime: number;
                } | undefined;
                healthLimit?: {
                    message: string;
                    type: "2hours" | "daily";
                    repeating?: boolean | undefined;
                    intervalMinutes?: number | undefined;
                } | undefined;
            };
            config: {
                enforcementMode: "strict" | "gentle";
                version: number;
                updatedAt: number;
                blacklist: string[];
                whitelist: string[];
                workTimeSlots: {
                    dayOfWeek: number;
                    startHour: number;
                    startMinute: number;
                    endHour: number;
                    endMinute: number;
                }[];
                skipTokens: {
                    delayMinutes: number;
                    maxPerDay: number;
                };
                distractionApps: {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }[];
                sleepTime?: {
                    startTime: string;
                    endTime: string;
                    enabled: boolean;
                    enforcementApps: {
                        bundleId: string;
                        name: string;
                    }[];
                } | undefined;
                overRestEnforcementApps?: {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }[] | undefined;
                restEnforcement?: {
                    workApps: {
                        bundleId: string;
                        name: string;
                    }[];
                    actions: string[];
                    graceDurationMinutes: number;
                } | undefined;
            };
        };
        policyType: "full" | "partial";
        effectiveTime: number;
    };
    commandId: string;
    commandType: "UPDATE_POLICY";
    targetClient: "web" | "desktop" | "browser_ext" | "mobile" | "api" | "all";
    priority: "low" | "normal" | "high" | "critical";
    requiresAck: boolean;
    createdAt: number;
    expiryTime?: number | undefined;
}>;
export declare const ShowUIPayloadSchema: z.ZodObject<{
    uiType: z.ZodEnum<["notification", "modal", "overlay", "toast"]>;
    content: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    duration: z.ZodOptional<z.ZodNumber>;
    dismissible: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    content: Record<string, unknown>;
    uiType: "notification" | "modal" | "overlay" | "toast";
    dismissible: boolean;
    duration?: number | undefined;
}, {
    content: Record<string, unknown>;
    uiType: "notification" | "modal" | "overlay" | "toast";
    dismissible: boolean;
    duration?: number | undefined;
}>;
export declare const ShowUICommandSchema: z.ZodObject<{
    commandId: z.ZodString;
    targetClient: z.ZodUnion<[z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>, z.ZodLiteral<"all">]>;
    priority: z.ZodEnum<["low", "normal", "high", "critical"]>;
    requiresAck: z.ZodBoolean;
    expiryTime: z.ZodOptional<z.ZodNumber>;
    createdAt: z.ZodNumber;
} & {
    commandType: z.ZodLiteral<"SHOW_UI">;
    payload: z.ZodObject<{
        uiType: z.ZodEnum<["notification", "modal", "overlay", "toast"]>;
        content: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        duration: z.ZodOptional<z.ZodNumber>;
        dismissible: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        content: Record<string, unknown>;
        uiType: "notification" | "modal" | "overlay" | "toast";
        dismissible: boolean;
        duration?: number | undefined;
    }, {
        content: Record<string, unknown>;
        uiType: "notification" | "modal" | "overlay" | "toast";
        dismissible: boolean;
        duration?: number | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    payload: {
        content: Record<string, unknown>;
        uiType: "notification" | "modal" | "overlay" | "toast";
        dismissible: boolean;
        duration?: number | undefined;
    };
    commandId: string;
    commandType: "SHOW_UI";
    targetClient: "web" | "desktop" | "browser_ext" | "mobile" | "api" | "all";
    priority: "low" | "normal" | "high" | "critical";
    requiresAck: boolean;
    createdAt: number;
    expiryTime?: number | undefined;
}, {
    payload: {
        content: Record<string, unknown>;
        uiType: "notification" | "modal" | "overlay" | "toast";
        dismissible: boolean;
        duration?: number | undefined;
    };
    commandId: string;
    commandType: "SHOW_UI";
    targetClient: "web" | "desktop" | "browser_ext" | "mobile" | "api" | "all";
    priority: "low" | "normal" | "high" | "critical";
    requiresAck: boolean;
    createdAt: number;
    expiryTime?: number | undefined;
}>;
export declare const ActionResultPayloadSchema: z.ZodObject<{
    optimisticId: z.ZodString;
    success: z.ZodBoolean;
    error: z.ZodOptional<z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        code: string;
        message: string;
    }, {
        code: string;
        message: string;
    }>>;
    data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    optimisticId: string;
    success: boolean;
    data?: Record<string, unknown> | undefined;
    error?: {
        code: string;
        message: string;
    } | undefined;
}, {
    optimisticId: string;
    success: boolean;
    data?: Record<string, unknown> | undefined;
    error?: {
        code: string;
        message: string;
    } | undefined;
}>;
export declare const ActionResultCommandSchema: z.ZodObject<{
    commandId: z.ZodString;
    targetClient: z.ZodUnion<[z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>, z.ZodLiteral<"all">]>;
    priority: z.ZodEnum<["low", "normal", "high", "critical"]>;
    requiresAck: z.ZodBoolean;
    expiryTime: z.ZodOptional<z.ZodNumber>;
    createdAt: z.ZodNumber;
} & {
    commandType: z.ZodLiteral<"ACTION_RESULT">;
    payload: z.ZodObject<{
        optimisticId: z.ZodString;
        success: z.ZodBoolean;
        error: z.ZodOptional<z.ZodObject<{
            code: z.ZodString;
            message: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            code: string;
            message: string;
        }, {
            code: string;
            message: string;
        }>>;
        data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        optimisticId: string;
        success: boolean;
        data?: Record<string, unknown> | undefined;
        error?: {
            code: string;
            message: string;
        } | undefined;
    }, {
        optimisticId: string;
        success: boolean;
        data?: Record<string, unknown> | undefined;
        error?: {
            code: string;
            message: string;
        } | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    payload: {
        optimisticId: string;
        success: boolean;
        data?: Record<string, unknown> | undefined;
        error?: {
            code: string;
            message: string;
        } | undefined;
    };
    commandId: string;
    commandType: "ACTION_RESULT";
    targetClient: "web" | "desktop" | "browser_ext" | "mobile" | "api" | "all";
    priority: "low" | "normal" | "high" | "critical";
    requiresAck: boolean;
    createdAt: number;
    expiryTime?: number | undefined;
}, {
    payload: {
        optimisticId: string;
        success: boolean;
        data?: Record<string, unknown> | undefined;
        error?: {
            code: string;
            message: string;
        } | undefined;
    };
    commandId: string;
    commandType: "ACTION_RESULT";
    targetClient: "web" | "desktop" | "browser_ext" | "mobile" | "api" | "all";
    priority: "low" | "normal" | "high" | "critical";
    requiresAck: boolean;
    createdAt: number;
    expiryTime?: number | undefined;
}>;
export declare const ChatResponsePayloadSchema: z.ZodObject<{
    conversationId: z.ZodString;
    messageId: z.ZodString;
    type: z.ZodEnum<["delta", "complete"]>;
    content: z.ZodString;
    usage: z.ZodOptional<z.ZodObject<{
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        inputTokens: number;
        outputTokens: number;
    }, {
        inputTokens: number;
        outputTokens: number;
    }>>;
    isProactive: z.ZodOptional<z.ZodBoolean>;
    triggerId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "delta" | "complete";
    conversationId: string;
    messageId: string;
    content: string;
    usage?: {
        inputTokens: number;
        outputTokens: number;
    } | undefined;
    isProactive?: boolean | undefined;
    triggerId?: string | undefined;
}, {
    type: "delta" | "complete";
    conversationId: string;
    messageId: string;
    content: string;
    usage?: {
        inputTokens: number;
        outputTokens: number;
    } | undefined;
    isProactive?: boolean | undefined;
    triggerId?: string | undefined;
}>;
export declare const ChatResponseCommandSchema: z.ZodObject<{
    commandId: z.ZodString;
    targetClient: z.ZodUnion<[z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>, z.ZodLiteral<"all">]>;
    priority: z.ZodEnum<["low", "normal", "high", "critical"]>;
    requiresAck: z.ZodBoolean;
    expiryTime: z.ZodOptional<z.ZodNumber>;
    createdAt: z.ZodNumber;
} & {
    commandType: z.ZodLiteral<"CHAT_RESPONSE">;
    payload: z.ZodObject<{
        conversationId: z.ZodString;
        messageId: z.ZodString;
        type: z.ZodEnum<["delta", "complete"]>;
        content: z.ZodString;
        usage: z.ZodOptional<z.ZodObject<{
            inputTokens: z.ZodNumber;
            outputTokens: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            inputTokens: number;
            outputTokens: number;
        }, {
            inputTokens: number;
            outputTokens: number;
        }>>;
        isProactive: z.ZodOptional<z.ZodBoolean>;
        triggerId: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "delta" | "complete";
        conversationId: string;
        messageId: string;
        content: string;
        usage?: {
            inputTokens: number;
            outputTokens: number;
        } | undefined;
        isProactive?: boolean | undefined;
        triggerId?: string | undefined;
    }, {
        type: "delta" | "complete";
        conversationId: string;
        messageId: string;
        content: string;
        usage?: {
            inputTokens: number;
            outputTokens: number;
        } | undefined;
        isProactive?: boolean | undefined;
        triggerId?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    payload: {
        type: "delta" | "complete";
        conversationId: string;
        messageId: string;
        content: string;
        usage?: {
            inputTokens: number;
            outputTokens: number;
        } | undefined;
        isProactive?: boolean | undefined;
        triggerId?: string | undefined;
    };
    commandId: string;
    commandType: "CHAT_RESPONSE";
    targetClient: "web" | "desktop" | "browser_ext" | "mobile" | "api" | "all";
    priority: "low" | "normal" | "high" | "critical";
    requiresAck: boolean;
    createdAt: number;
    expiryTime?: number | undefined;
}, {
    payload: {
        type: "delta" | "complete";
        conversationId: string;
        messageId: string;
        content: string;
        usage?: {
            inputTokens: number;
            outputTokens: number;
        } | undefined;
        isProactive?: boolean | undefined;
        triggerId?: string | undefined;
    };
    commandId: string;
    commandType: "CHAT_RESPONSE";
    targetClient: "web" | "desktop" | "browser_ext" | "mobile" | "api" | "all";
    priority: "low" | "normal" | "high" | "critical";
    requiresAck: boolean;
    createdAt: number;
    expiryTime?: number | undefined;
}>;
export declare const ChatToolCallPayloadSchema: z.ZodObject<{
    conversationId: z.ZodString;
    messageId: z.ZodString;
    toolCallId: z.ZodString;
    toolName: z.ZodString;
    description: z.ZodString;
    parameters: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    requiresConfirmation: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    parameters: Record<string, unknown>;
    conversationId: string;
    messageId: string;
    toolCallId: string;
    toolName: string;
    description: string;
    requiresConfirmation: boolean;
}, {
    parameters: Record<string, unknown>;
    conversationId: string;
    messageId: string;
    toolCallId: string;
    toolName: string;
    description: string;
    requiresConfirmation: boolean;
}>;
export declare const ChatToolCallCommandSchema: z.ZodObject<{
    commandId: z.ZodString;
    targetClient: z.ZodUnion<[z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>, z.ZodLiteral<"all">]>;
    priority: z.ZodEnum<["low", "normal", "high", "critical"]>;
    requiresAck: z.ZodBoolean;
    expiryTime: z.ZodOptional<z.ZodNumber>;
    createdAt: z.ZodNumber;
} & {
    commandType: z.ZodLiteral<"CHAT_TOOL_CALL">;
    payload: z.ZodObject<{
        conversationId: z.ZodString;
        messageId: z.ZodString;
        toolCallId: z.ZodString;
        toolName: z.ZodString;
        description: z.ZodString;
        parameters: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        requiresConfirmation: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        parameters: Record<string, unknown>;
        conversationId: string;
        messageId: string;
        toolCallId: string;
        toolName: string;
        description: string;
        requiresConfirmation: boolean;
    }, {
        parameters: Record<string, unknown>;
        conversationId: string;
        messageId: string;
        toolCallId: string;
        toolName: string;
        description: string;
        requiresConfirmation: boolean;
    }>;
}, "strip", z.ZodTypeAny, {
    payload: {
        parameters: Record<string, unknown>;
        conversationId: string;
        messageId: string;
        toolCallId: string;
        toolName: string;
        description: string;
        requiresConfirmation: boolean;
    };
    commandId: string;
    commandType: "CHAT_TOOL_CALL";
    targetClient: "web" | "desktop" | "browser_ext" | "mobile" | "api" | "all";
    priority: "low" | "normal" | "high" | "critical";
    requiresAck: boolean;
    createdAt: number;
    expiryTime?: number | undefined;
}, {
    payload: {
        parameters: Record<string, unknown>;
        conversationId: string;
        messageId: string;
        toolCallId: string;
        toolName: string;
        description: string;
        requiresConfirmation: boolean;
    };
    commandId: string;
    commandType: "CHAT_TOOL_CALL";
    targetClient: "web" | "desktop" | "browser_ext" | "mobile" | "api" | "all";
    priority: "low" | "normal" | "high" | "critical";
    requiresAck: boolean;
    createdAt: number;
    expiryTime?: number | undefined;
}>;
export declare const ChatToolResultPayloadSchema: z.ZodObject<{
    conversationId: z.ZodString;
    messageId: z.ZodString;
    toolCallId: z.ZodString;
    success: z.ZodBoolean;
    summary: z.ZodString;
}, "strip", z.ZodTypeAny, {
    conversationId: string;
    messageId: string;
    toolCallId: string;
    success: boolean;
    summary: string;
}, {
    conversationId: string;
    messageId: string;
    toolCallId: string;
    success: boolean;
    summary: string;
}>;
export declare const ChatToolResultCommandSchema: z.ZodObject<{
    commandId: z.ZodString;
    targetClient: z.ZodUnion<[z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>, z.ZodLiteral<"all">]>;
    priority: z.ZodEnum<["low", "normal", "high", "critical"]>;
    requiresAck: z.ZodBoolean;
    expiryTime: z.ZodOptional<z.ZodNumber>;
    createdAt: z.ZodNumber;
} & {
    commandType: z.ZodLiteral<"CHAT_TOOL_RESULT">;
    payload: z.ZodObject<{
        conversationId: z.ZodString;
        messageId: z.ZodString;
        toolCallId: z.ZodString;
        success: z.ZodBoolean;
        summary: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        conversationId: string;
        messageId: string;
        toolCallId: string;
        success: boolean;
        summary: string;
    }, {
        conversationId: string;
        messageId: string;
        toolCallId: string;
        success: boolean;
        summary: string;
    }>;
}, "strip", z.ZodTypeAny, {
    payload: {
        conversationId: string;
        messageId: string;
        toolCallId: string;
        success: boolean;
        summary: string;
    };
    commandId: string;
    commandType: "CHAT_TOOL_RESULT";
    targetClient: "web" | "desktop" | "browser_ext" | "mobile" | "api" | "all";
    priority: "low" | "normal" | "high" | "critical";
    requiresAck: boolean;
    createdAt: number;
    expiryTime?: number | undefined;
}, {
    payload: {
        conversationId: string;
        messageId: string;
        toolCallId: string;
        success: boolean;
        summary: string;
    };
    commandId: string;
    commandType: "CHAT_TOOL_RESULT";
    targetClient: "web" | "desktop" | "browser_ext" | "mobile" | "api" | "all";
    priority: "low" | "normal" | "high" | "critical";
    requiresAck: boolean;
    createdAt: number;
    expiryTime?: number | undefined;
}>;
export declare const ChatSyncPayloadSchema: z.ZodObject<{
    conversationId: z.ZodString;
    messages: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        role: z.ZodString;
        content: z.ZodString;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        createdAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        content: string;
        createdAt: string;
        role: string;
        metadata?: Record<string, unknown> | undefined;
    }, {
        id: string;
        content: string;
        createdAt: string;
        role: string;
        metadata?: Record<string, unknown> | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    conversationId: string;
    messages: {
        id: string;
        content: string;
        createdAt: string;
        role: string;
        metadata?: Record<string, unknown> | undefined;
    }[];
}, {
    conversationId: string;
    messages: {
        id: string;
        content: string;
        createdAt: string;
        role: string;
        metadata?: Record<string, unknown> | undefined;
    }[];
}>;
export declare const ChatSyncCommandSchema: z.ZodObject<{
    commandId: z.ZodString;
    targetClient: z.ZodUnion<[z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>, z.ZodLiteral<"all">]>;
    priority: z.ZodEnum<["low", "normal", "high", "critical"]>;
    requiresAck: z.ZodBoolean;
    expiryTime: z.ZodOptional<z.ZodNumber>;
    createdAt: z.ZodNumber;
} & {
    commandType: z.ZodLiteral<"CHAT_SYNC">;
    payload: z.ZodObject<{
        conversationId: z.ZodString;
        messages: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            role: z.ZodString;
            content: z.ZodString;
            metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            createdAt: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            id: string;
            content: string;
            createdAt: string;
            role: string;
            metadata?: Record<string, unknown> | undefined;
        }, {
            id: string;
            content: string;
            createdAt: string;
            role: string;
            metadata?: Record<string, unknown> | undefined;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        conversationId: string;
        messages: {
            id: string;
            content: string;
            createdAt: string;
            role: string;
            metadata?: Record<string, unknown> | undefined;
        }[];
    }, {
        conversationId: string;
        messages: {
            id: string;
            content: string;
            createdAt: string;
            role: string;
            metadata?: Record<string, unknown> | undefined;
        }[];
    }>;
}, "strip", z.ZodTypeAny, {
    payload: {
        conversationId: string;
        messages: {
            id: string;
            content: string;
            createdAt: string;
            role: string;
            metadata?: Record<string, unknown> | undefined;
        }[];
    };
    commandId: string;
    commandType: "CHAT_SYNC";
    targetClient: "web" | "desktop" | "browser_ext" | "mobile" | "api" | "all";
    priority: "low" | "normal" | "high" | "critical";
    requiresAck: boolean;
    createdAt: number;
    expiryTime?: number | undefined;
}, {
    payload: {
        conversationId: string;
        messages: {
            id: string;
            content: string;
            createdAt: string;
            role: string;
            metadata?: Record<string, unknown> | undefined;
        }[];
    };
    commandId: string;
    commandType: "CHAT_SYNC";
    targetClient: "web" | "desktop" | "browser_ext" | "mobile" | "api" | "all";
    priority: "low" | "normal" | "high" | "critical";
    requiresAck: boolean;
    createdAt: number;
    expiryTime?: number | undefined;
}>;
export declare const OctopusCommandSchema: z.ZodDiscriminatedUnion<"commandType", [z.ZodObject<{
    commandId: z.ZodString;
    targetClient: z.ZodUnion<[z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>, z.ZodLiteral<"all">]>;
    priority: z.ZodEnum<["low", "normal", "high", "critical"]>;
    requiresAck: z.ZodBoolean;
    expiryTime: z.ZodOptional<z.ZodNumber>;
    createdAt: z.ZodNumber;
} & {
    commandType: z.ZodLiteral<"SYNC_STATE">;
    payload: z.ZodObject<{
        syncType: z.ZodLiteral<"full">;
        version: z.ZodNumber;
        state: z.ZodOptional<z.ZodObject<{
            systemState: z.ZodObject<{
                state: z.ZodString;
                timeContext: z.ZodOptional<z.ZodString>;
                dailyCapReached: z.ZodBoolean;
                skipTokensRemaining: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                state: string;
                dailyCapReached: boolean;
                skipTokensRemaining: number;
                timeContext?: string | undefined;
            }, {
                state: string;
                dailyCapReached: boolean;
                skipTokensRemaining: number;
                timeContext?: string | undefined;
            }>;
            dailyState: z.ZodObject<{
                date: z.ZodString;
                completedPomodoros: z.ZodNumber;
                totalFocusMinutes: z.ZodNumber;
                top3TaskIds: z.ZodArray<z.ZodString, "many">;
            }, "strip", z.ZodTypeAny, {
                date: string;
                completedPomodoros: number;
                totalFocusMinutes: number;
                top3TaskIds: string[];
            }, {
                date: string;
                completedPomodoros: number;
                totalFocusMinutes: number;
                top3TaskIds: string[];
            }>;
            activePomodoro: z.ZodNullable<z.ZodObject<{
                id: z.ZodString;
                taskId: z.ZodNullable<z.ZodString>;
                taskTitle: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                startTime: z.ZodNumber;
                duration: z.ZodNumber;
                status: z.ZodEnum<["active", "paused", "completed", "aborted"]>;
            }, "strip", z.ZodTypeAny, {
                status: "active" | "paused" | "completed" | "aborted";
                duration: number;
                startTime: number;
                id: string;
                taskId: string | null;
                taskTitle?: string | null | undefined;
            }, {
                status: "active" | "paused" | "completed" | "aborted";
                duration: number;
                startTime: number;
                id: string;
                taskId: string | null;
                taskTitle?: string | null | undefined;
            }>>;
            top3Tasks: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                title: z.ZodString;
                status: z.ZodString;
                priority: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                status: string;
                title: string;
                id: string;
                priority: string;
            }, {
                status: string;
                title: string;
                id: string;
                priority: string;
            }>, "many">;
            settings: z.ZodObject<{
                pomodoroDuration: z.ZodNumber;
                shortBreakDuration: z.ZodNumber;
                longBreakDuration: z.ZodNumber;
                dailyCap: z.ZodNumber;
                enforcementMode: z.ZodEnum<["strict", "gentle"]>;
            }, "strip", z.ZodTypeAny, {
                pomodoroDuration: number;
                shortBreakDuration: number;
                longBreakDuration: number;
                dailyCap: number;
                enforcementMode: "strict" | "gentle";
            }, {
                pomodoroDuration: number;
                shortBreakDuration: number;
                longBreakDuration: number;
                dailyCap: number;
                enforcementMode: "strict" | "gentle";
            }>;
        }, "strip", z.ZodTypeAny, {
            settings: {
                pomodoroDuration: number;
                shortBreakDuration: number;
                longBreakDuration: number;
                dailyCap: number;
                enforcementMode: "strict" | "gentle";
            };
            dailyState: {
                date: string;
                completedPomodoros: number;
                totalFocusMinutes: number;
                top3TaskIds: string[];
            };
            systemState: {
                state: string;
                dailyCapReached: boolean;
                skipTokensRemaining: number;
                timeContext?: string | undefined;
            };
            activePomodoro: {
                status: "active" | "paused" | "completed" | "aborted";
                duration: number;
                startTime: number;
                id: string;
                taskId: string | null;
                taskTitle?: string | null | undefined;
            } | null;
            top3Tasks: {
                status: string;
                title: string;
                id: string;
                priority: string;
            }[];
        }, {
            settings: {
                pomodoroDuration: number;
                shortBreakDuration: number;
                longBreakDuration: number;
                dailyCap: number;
                enforcementMode: "strict" | "gentle";
            };
            dailyState: {
                date: string;
                completedPomodoros: number;
                totalFocusMinutes: number;
                top3TaskIds: string[];
            };
            systemState: {
                state: string;
                dailyCapReached: boolean;
                skipTokensRemaining: number;
                timeContext?: string | undefined;
            };
            activePomodoro: {
                status: "active" | "paused" | "completed" | "aborted";
                duration: number;
                startTime: number;
                id: string;
                taskId: string | null;
                taskTitle?: string | null | undefined;
            } | null;
            top3Tasks: {
                status: string;
                title: string;
                id: string;
                priority: string;
            }[];
        }>>;
    }, "strip", z.ZodTypeAny, {
        syncType: "full";
        version: number;
        state?: {
            settings: {
                pomodoroDuration: number;
                shortBreakDuration: number;
                longBreakDuration: number;
                dailyCap: number;
                enforcementMode: "strict" | "gentle";
            };
            dailyState: {
                date: string;
                completedPomodoros: number;
                totalFocusMinutes: number;
                top3TaskIds: string[];
            };
            systemState: {
                state: string;
                dailyCapReached: boolean;
                skipTokensRemaining: number;
                timeContext?: string | undefined;
            };
            activePomodoro: {
                status: "active" | "paused" | "completed" | "aborted";
                duration: number;
                startTime: number;
                id: string;
                taskId: string | null;
                taskTitle?: string | null | undefined;
            } | null;
            top3Tasks: {
                status: string;
                title: string;
                id: string;
                priority: string;
            }[];
        } | undefined;
    }, {
        syncType: "full";
        version: number;
        state?: {
            settings: {
                pomodoroDuration: number;
                shortBreakDuration: number;
                longBreakDuration: number;
                dailyCap: number;
                enforcementMode: "strict" | "gentle";
            };
            dailyState: {
                date: string;
                completedPomodoros: number;
                totalFocusMinutes: number;
                top3TaskIds: string[];
            };
            systemState: {
                state: string;
                dailyCapReached: boolean;
                skipTokensRemaining: number;
                timeContext?: string | undefined;
            };
            activePomodoro: {
                status: "active" | "paused" | "completed" | "aborted";
                duration: number;
                startTime: number;
                id: string;
                taskId: string | null;
                taskTitle?: string | null | undefined;
            } | null;
            top3Tasks: {
                status: string;
                title: string;
                id: string;
                priority: string;
            }[];
        } | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    payload: {
        syncType: "full";
        version: number;
        state?: {
            settings: {
                pomodoroDuration: number;
                shortBreakDuration: number;
                longBreakDuration: number;
                dailyCap: number;
                enforcementMode: "strict" | "gentle";
            };
            dailyState: {
                date: string;
                completedPomodoros: number;
                totalFocusMinutes: number;
                top3TaskIds: string[];
            };
            systemState: {
                state: string;
                dailyCapReached: boolean;
                skipTokensRemaining: number;
                timeContext?: string | undefined;
            };
            activePomodoro: {
                status: "active" | "paused" | "completed" | "aborted";
                duration: number;
                startTime: number;
                id: string;
                taskId: string | null;
                taskTitle?: string | null | undefined;
            } | null;
            top3Tasks: {
                status: string;
                title: string;
                id: string;
                priority: string;
            }[];
        } | undefined;
    };
    commandId: string;
    commandType: "SYNC_STATE";
    targetClient: "web" | "desktop" | "browser_ext" | "mobile" | "api" | "all";
    priority: "low" | "normal" | "high" | "critical";
    requiresAck: boolean;
    createdAt: number;
    expiryTime?: number | undefined;
}, {
    payload: {
        syncType: "full";
        version: number;
        state?: {
            settings: {
                pomodoroDuration: number;
                shortBreakDuration: number;
                longBreakDuration: number;
                dailyCap: number;
                enforcementMode: "strict" | "gentle";
            };
            dailyState: {
                date: string;
                completedPomodoros: number;
                totalFocusMinutes: number;
                top3TaskIds: string[];
            };
            systemState: {
                state: string;
                dailyCapReached: boolean;
                skipTokensRemaining: number;
                timeContext?: string | undefined;
            };
            activePomodoro: {
                status: "active" | "paused" | "completed" | "aborted";
                duration: number;
                startTime: number;
                id: string;
                taskId: string | null;
                taskTitle?: string | null | undefined;
            } | null;
            top3Tasks: {
                status: string;
                title: string;
                id: string;
                priority: string;
            }[];
        } | undefined;
    };
    commandId: string;
    commandType: "SYNC_STATE";
    targetClient: "web" | "desktop" | "browser_ext" | "mobile" | "api" | "all";
    priority: "low" | "normal" | "high" | "critical";
    requiresAck: boolean;
    createdAt: number;
    expiryTime?: number | undefined;
}>, z.ZodObject<{
    commandId: z.ZodString;
    targetClient: z.ZodUnion<[z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>, z.ZodLiteral<"all">]>;
    priority: z.ZodEnum<["low", "normal", "high", "critical"]>;
    requiresAck: z.ZodBoolean;
    expiryTime: z.ZodOptional<z.ZodNumber>;
    createdAt: z.ZodNumber;
} & {
    commandType: z.ZodLiteral<"EXECUTE_ACTION">;
    payload: z.ZodObject<{
        action: z.ZodEnum<["CLOSE_APP", "HIDE_APP", "BRING_TO_FRONT", "SHOW_NOTIFICATION", "CLOSE_TAB", "REDIRECT_TAB", "INJECT_OVERLAY", "ADD_SESSION_WHITELIST", "SEND_PUSH", "PLAY_SOUND", "VIBRATE"]>;
        parameters: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        timeout: z.ZodOptional<z.ZodNumber>;
        fallbackAction: z.ZodOptional<z.ZodEnum<["CLOSE_APP", "HIDE_APP", "BRING_TO_FRONT", "SHOW_NOTIFICATION", "CLOSE_TAB", "REDIRECT_TAB", "INJECT_OVERLAY", "ADD_SESSION_WHITELIST", "SEND_PUSH", "PLAY_SOUND", "VIBRATE"]>>;
    }, "strip", z.ZodTypeAny, {
        parameters: Record<string, unknown>;
        action: "CLOSE_APP" | "HIDE_APP" | "BRING_TO_FRONT" | "SHOW_NOTIFICATION" | "CLOSE_TAB" | "REDIRECT_TAB" | "INJECT_OVERLAY" | "ADD_SESSION_WHITELIST" | "SEND_PUSH" | "PLAY_SOUND" | "VIBRATE";
        timeout?: number | undefined;
        fallbackAction?: "CLOSE_APP" | "HIDE_APP" | "BRING_TO_FRONT" | "SHOW_NOTIFICATION" | "CLOSE_TAB" | "REDIRECT_TAB" | "INJECT_OVERLAY" | "ADD_SESSION_WHITELIST" | "SEND_PUSH" | "PLAY_SOUND" | "VIBRATE" | undefined;
    }, {
        parameters: Record<string, unknown>;
        action: "CLOSE_APP" | "HIDE_APP" | "BRING_TO_FRONT" | "SHOW_NOTIFICATION" | "CLOSE_TAB" | "REDIRECT_TAB" | "INJECT_OVERLAY" | "ADD_SESSION_WHITELIST" | "SEND_PUSH" | "PLAY_SOUND" | "VIBRATE";
        timeout?: number | undefined;
        fallbackAction?: "CLOSE_APP" | "HIDE_APP" | "BRING_TO_FRONT" | "SHOW_NOTIFICATION" | "CLOSE_TAB" | "REDIRECT_TAB" | "INJECT_OVERLAY" | "ADD_SESSION_WHITELIST" | "SEND_PUSH" | "PLAY_SOUND" | "VIBRATE" | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    payload: {
        parameters: Record<string, unknown>;
        action: "CLOSE_APP" | "HIDE_APP" | "BRING_TO_FRONT" | "SHOW_NOTIFICATION" | "CLOSE_TAB" | "REDIRECT_TAB" | "INJECT_OVERLAY" | "ADD_SESSION_WHITELIST" | "SEND_PUSH" | "PLAY_SOUND" | "VIBRATE";
        timeout?: number | undefined;
        fallbackAction?: "CLOSE_APP" | "HIDE_APP" | "BRING_TO_FRONT" | "SHOW_NOTIFICATION" | "CLOSE_TAB" | "REDIRECT_TAB" | "INJECT_OVERLAY" | "ADD_SESSION_WHITELIST" | "SEND_PUSH" | "PLAY_SOUND" | "VIBRATE" | undefined;
    };
    commandId: string;
    commandType: "EXECUTE_ACTION";
    targetClient: "web" | "desktop" | "browser_ext" | "mobile" | "api" | "all";
    priority: "low" | "normal" | "high" | "critical";
    requiresAck: boolean;
    createdAt: number;
    expiryTime?: number | undefined;
}, {
    payload: {
        parameters: Record<string, unknown>;
        action: "CLOSE_APP" | "HIDE_APP" | "BRING_TO_FRONT" | "SHOW_NOTIFICATION" | "CLOSE_TAB" | "REDIRECT_TAB" | "INJECT_OVERLAY" | "ADD_SESSION_WHITELIST" | "SEND_PUSH" | "PLAY_SOUND" | "VIBRATE";
        timeout?: number | undefined;
        fallbackAction?: "CLOSE_APP" | "HIDE_APP" | "BRING_TO_FRONT" | "SHOW_NOTIFICATION" | "CLOSE_TAB" | "REDIRECT_TAB" | "INJECT_OVERLAY" | "ADD_SESSION_WHITELIST" | "SEND_PUSH" | "PLAY_SOUND" | "VIBRATE" | undefined;
    };
    commandId: string;
    commandType: "EXECUTE_ACTION";
    targetClient: "web" | "desktop" | "browser_ext" | "mobile" | "api" | "all";
    priority: "low" | "normal" | "high" | "critical";
    requiresAck: boolean;
    createdAt: number;
    expiryTime?: number | undefined;
}>, z.ZodObject<{
    commandId: z.ZodString;
    targetClient: z.ZodUnion<[z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>, z.ZodLiteral<"all">]>;
    priority: z.ZodEnum<["low", "normal", "high", "critical"]>;
    requiresAck: z.ZodBoolean;
    expiryTime: z.ZodOptional<z.ZodNumber>;
    createdAt: z.ZodNumber;
} & {
    commandType: z.ZodLiteral<"UPDATE_POLICY">;
    payload: z.ZodObject<{
        policyType: z.ZodEnum<["full", "partial"]>;
        policy: z.ZodObject<{
            config: z.ZodObject<{
                version: z.ZodNumber;
                updatedAt: z.ZodNumber;
                blacklist: z.ZodArray<z.ZodString, "many">;
                whitelist: z.ZodArray<z.ZodString, "many">;
                enforcementMode: z.ZodEnum<["strict", "gentle"]>;
                workTimeSlots: z.ZodArray<z.ZodObject<{
                    dayOfWeek: z.ZodNumber;
                    startHour: z.ZodNumber;
                    startMinute: z.ZodNumber;
                    endHour: z.ZodNumber;
                    endMinute: z.ZodNumber;
                }, "strip", z.ZodTypeAny, {
                    dayOfWeek: number;
                    startHour: number;
                    startMinute: number;
                    endHour: number;
                    endMinute: number;
                }, {
                    dayOfWeek: number;
                    startHour: number;
                    startMinute: number;
                    endHour: number;
                    endMinute: number;
                }>, "many">;
                skipTokens: z.ZodObject<{
                    maxPerDay: z.ZodNumber;
                    delayMinutes: z.ZodNumber;
                }, "strip", z.ZodTypeAny, {
                    delayMinutes: number;
                    maxPerDay: number;
                }, {
                    delayMinutes: number;
                    maxPerDay: number;
                }>;
                distractionApps: z.ZodArray<z.ZodObject<{
                    bundleId: z.ZodString;
                    name: z.ZodString;
                    action: z.ZodEnum<["force_quit", "hide_window"]>;
                }, "strip", z.ZodTypeAny, {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }, {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }>, "many">;
                sleepTime: z.ZodOptional<z.ZodObject<{
                    enabled: z.ZodBoolean;
                    startTime: z.ZodString;
                    endTime: z.ZodString;
                    enforcementApps: z.ZodArray<z.ZodObject<{
                        bundleId: z.ZodString;
                        name: z.ZodString;
                    }, "strip", z.ZodTypeAny, {
                        bundleId: string;
                        name: string;
                    }, {
                        bundleId: string;
                        name: string;
                    }>, "many">;
                }, "strip", z.ZodTypeAny, {
                    startTime: string;
                    endTime: string;
                    enabled: boolean;
                    enforcementApps: {
                        bundleId: string;
                        name: string;
                    }[];
                }, {
                    startTime: string;
                    endTime: string;
                    enabled: boolean;
                    enforcementApps: {
                        bundleId: string;
                        name: string;
                    }[];
                }>>;
                overRestEnforcementApps: z.ZodOptional<z.ZodArray<z.ZodObject<{
                    bundleId: z.ZodString;
                    name: z.ZodString;
                    action: z.ZodEnum<["force_quit", "hide_window"]>;
                }, "strip", z.ZodTypeAny, {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }, {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }>, "many">>;
                restEnforcement: z.ZodOptional<z.ZodObject<{
                    workApps: z.ZodArray<z.ZodObject<{
                        bundleId: z.ZodString;
                        name: z.ZodString;
                    }, "strip", z.ZodTypeAny, {
                        bundleId: string;
                        name: string;
                    }, {
                        bundleId: string;
                        name: string;
                    }>, "many">;
                    actions: z.ZodArray<z.ZodString, "many">;
                    graceDurationMinutes: z.ZodNumber;
                }, "strip", z.ZodTypeAny, {
                    workApps: {
                        bundleId: string;
                        name: string;
                    }[];
                    actions: string[];
                    graceDurationMinutes: number;
                }, {
                    workApps: {
                        bundleId: string;
                        name: string;
                    }[];
                    actions: string[];
                    graceDurationMinutes: number;
                }>>;
            }, "strip", z.ZodTypeAny, {
                enforcementMode: "strict" | "gentle";
                version: number;
                updatedAt: number;
                blacklist: string[];
                whitelist: string[];
                workTimeSlots: {
                    dayOfWeek: number;
                    startHour: number;
                    startMinute: number;
                    endHour: number;
                    endMinute: number;
                }[];
                skipTokens: {
                    delayMinutes: number;
                    maxPerDay: number;
                };
                distractionApps: {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }[];
                sleepTime?: {
                    startTime: string;
                    endTime: string;
                    enabled: boolean;
                    enforcementApps: {
                        bundleId: string;
                        name: string;
                    }[];
                } | undefined;
                overRestEnforcementApps?: {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }[] | undefined;
                restEnforcement?: {
                    workApps: {
                        bundleId: string;
                        name: string;
                    }[];
                    actions: string[];
                    graceDurationMinutes: number;
                } | undefined;
            }, {
                enforcementMode: "strict" | "gentle";
                version: number;
                updatedAt: number;
                blacklist: string[];
                whitelist: string[];
                workTimeSlots: {
                    dayOfWeek: number;
                    startHour: number;
                    startMinute: number;
                    endHour: number;
                    endMinute: number;
                }[];
                skipTokens: {
                    delayMinutes: number;
                    maxPerDay: number;
                };
                distractionApps: {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }[];
                sleepTime?: {
                    startTime: string;
                    endTime: string;
                    enabled: boolean;
                    enforcementApps: {
                        bundleId: string;
                        name: string;
                    }[];
                } | undefined;
                overRestEnforcementApps?: {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }[] | undefined;
                restEnforcement?: {
                    workApps: {
                        bundleId: string;
                        name: string;
                    }[];
                    actions: string[];
                    graceDurationMinutes: number;
                } | undefined;
            }>;
            state: z.ZodObject<{
                skipTokensRemaining: z.ZodNumber;
                isSleepTimeActive: z.ZodBoolean;
                isSleepSnoozed: z.ZodBoolean;
                sleepSnoozeEndTime: z.ZodOptional<z.ZodNumber>;
                isOverRest: z.ZodBoolean;
                overRestMinutes: z.ZodNumber;
                overRestBringToFront: z.ZodBoolean;
                isRestEnforcementActive: z.ZodBoolean;
                restGrace: z.ZodOptional<z.ZodObject<{
                    available: z.ZodBoolean;
                    remaining: z.ZodNumber;
                }, "strip", z.ZodTypeAny, {
                    available: boolean;
                    remaining: number;
                }, {
                    available: boolean;
                    remaining: number;
                }>>;
                adhocFocusSession: z.ZodOptional<z.ZodObject<{
                    active: z.ZodBoolean;
                    endTime: z.ZodNumber;
                    overridesSleepTime: z.ZodOptional<z.ZodBoolean>;
                    overridesWorkHours: z.ZodOptional<z.ZodBoolean>;
                }, "strip", z.ZodTypeAny, {
                    active: boolean;
                    endTime: number;
                    overridesSleepTime?: boolean | undefined;
                    overridesWorkHours?: boolean | undefined;
                }, {
                    active: boolean;
                    endTime: number;
                    overridesSleepTime?: boolean | undefined;
                    overridesWorkHours?: boolean | undefined;
                }>>;
                temporaryUnblock: z.ZodOptional<z.ZodObject<{
                    active: z.ZodBoolean;
                    endTime: z.ZodNumber;
                }, "strip", z.ZodTypeAny, {
                    active: boolean;
                    endTime: number;
                }, {
                    active: boolean;
                    endTime: number;
                }>>;
                healthLimit: z.ZodOptional<z.ZodObject<{
                    type: z.ZodEnum<["2hours", "daily"]>;
                    message: z.ZodString;
                    repeating: z.ZodOptional<z.ZodBoolean>;
                    intervalMinutes: z.ZodOptional<z.ZodNumber>;
                }, "strip", z.ZodTypeAny, {
                    message: string;
                    type: "2hours" | "daily";
                    repeating?: boolean | undefined;
                    intervalMinutes?: number | undefined;
                }, {
                    message: string;
                    type: "2hours" | "daily";
                    repeating?: boolean | undefined;
                    intervalMinutes?: number | undefined;
                }>>;
            }, "strip", z.ZodTypeAny, {
                skipTokensRemaining: number;
                isSleepTimeActive: boolean;
                isSleepSnoozed: boolean;
                isOverRest: boolean;
                overRestMinutes: number;
                overRestBringToFront: boolean;
                isRestEnforcementActive: boolean;
                sleepSnoozeEndTime?: number | undefined;
                restGrace?: {
                    available: boolean;
                    remaining: number;
                } | undefined;
                adhocFocusSession?: {
                    active: boolean;
                    endTime: number;
                    overridesSleepTime?: boolean | undefined;
                    overridesWorkHours?: boolean | undefined;
                } | undefined;
                temporaryUnblock?: {
                    active: boolean;
                    endTime: number;
                } | undefined;
                healthLimit?: {
                    message: string;
                    type: "2hours" | "daily";
                    repeating?: boolean | undefined;
                    intervalMinutes?: number | undefined;
                } | undefined;
            }, {
                skipTokensRemaining: number;
                isSleepTimeActive: boolean;
                isSleepSnoozed: boolean;
                isOverRest: boolean;
                overRestMinutes: number;
                overRestBringToFront: boolean;
                isRestEnforcementActive: boolean;
                sleepSnoozeEndTime?: number | undefined;
                restGrace?: {
                    available: boolean;
                    remaining: number;
                } | undefined;
                adhocFocusSession?: {
                    active: boolean;
                    endTime: number;
                    overridesSleepTime?: boolean | undefined;
                    overridesWorkHours?: boolean | undefined;
                } | undefined;
                temporaryUnblock?: {
                    active: boolean;
                    endTime: number;
                } | undefined;
                healthLimit?: {
                    message: string;
                    type: "2hours" | "daily";
                    repeating?: boolean | undefined;
                    intervalMinutes?: number | undefined;
                } | undefined;
            }>;
        }, "strip", z.ZodTypeAny, {
            state: {
                skipTokensRemaining: number;
                isSleepTimeActive: boolean;
                isSleepSnoozed: boolean;
                isOverRest: boolean;
                overRestMinutes: number;
                overRestBringToFront: boolean;
                isRestEnforcementActive: boolean;
                sleepSnoozeEndTime?: number | undefined;
                restGrace?: {
                    available: boolean;
                    remaining: number;
                } | undefined;
                adhocFocusSession?: {
                    active: boolean;
                    endTime: number;
                    overridesSleepTime?: boolean | undefined;
                    overridesWorkHours?: boolean | undefined;
                } | undefined;
                temporaryUnblock?: {
                    active: boolean;
                    endTime: number;
                } | undefined;
                healthLimit?: {
                    message: string;
                    type: "2hours" | "daily";
                    repeating?: boolean | undefined;
                    intervalMinutes?: number | undefined;
                } | undefined;
            };
            config: {
                enforcementMode: "strict" | "gentle";
                version: number;
                updatedAt: number;
                blacklist: string[];
                whitelist: string[];
                workTimeSlots: {
                    dayOfWeek: number;
                    startHour: number;
                    startMinute: number;
                    endHour: number;
                    endMinute: number;
                }[];
                skipTokens: {
                    delayMinutes: number;
                    maxPerDay: number;
                };
                distractionApps: {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }[];
                sleepTime?: {
                    startTime: string;
                    endTime: string;
                    enabled: boolean;
                    enforcementApps: {
                        bundleId: string;
                        name: string;
                    }[];
                } | undefined;
                overRestEnforcementApps?: {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }[] | undefined;
                restEnforcement?: {
                    workApps: {
                        bundleId: string;
                        name: string;
                    }[];
                    actions: string[];
                    graceDurationMinutes: number;
                } | undefined;
            };
        }, {
            state: {
                skipTokensRemaining: number;
                isSleepTimeActive: boolean;
                isSleepSnoozed: boolean;
                isOverRest: boolean;
                overRestMinutes: number;
                overRestBringToFront: boolean;
                isRestEnforcementActive: boolean;
                sleepSnoozeEndTime?: number | undefined;
                restGrace?: {
                    available: boolean;
                    remaining: number;
                } | undefined;
                adhocFocusSession?: {
                    active: boolean;
                    endTime: number;
                    overridesSleepTime?: boolean | undefined;
                    overridesWorkHours?: boolean | undefined;
                } | undefined;
                temporaryUnblock?: {
                    active: boolean;
                    endTime: number;
                } | undefined;
                healthLimit?: {
                    message: string;
                    type: "2hours" | "daily";
                    repeating?: boolean | undefined;
                    intervalMinutes?: number | undefined;
                } | undefined;
            };
            config: {
                enforcementMode: "strict" | "gentle";
                version: number;
                updatedAt: number;
                blacklist: string[];
                whitelist: string[];
                workTimeSlots: {
                    dayOfWeek: number;
                    startHour: number;
                    startMinute: number;
                    endHour: number;
                    endMinute: number;
                }[];
                skipTokens: {
                    delayMinutes: number;
                    maxPerDay: number;
                };
                distractionApps: {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }[];
                sleepTime?: {
                    startTime: string;
                    endTime: string;
                    enabled: boolean;
                    enforcementApps: {
                        bundleId: string;
                        name: string;
                    }[];
                } | undefined;
                overRestEnforcementApps?: {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }[] | undefined;
                restEnforcement?: {
                    workApps: {
                        bundleId: string;
                        name: string;
                    }[];
                    actions: string[];
                    graceDurationMinutes: number;
                } | undefined;
            };
        }>;
        effectiveTime: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        policy: {
            state: {
                skipTokensRemaining: number;
                isSleepTimeActive: boolean;
                isSleepSnoozed: boolean;
                isOverRest: boolean;
                overRestMinutes: number;
                overRestBringToFront: boolean;
                isRestEnforcementActive: boolean;
                sleepSnoozeEndTime?: number | undefined;
                restGrace?: {
                    available: boolean;
                    remaining: number;
                } | undefined;
                adhocFocusSession?: {
                    active: boolean;
                    endTime: number;
                    overridesSleepTime?: boolean | undefined;
                    overridesWorkHours?: boolean | undefined;
                } | undefined;
                temporaryUnblock?: {
                    active: boolean;
                    endTime: number;
                } | undefined;
                healthLimit?: {
                    message: string;
                    type: "2hours" | "daily";
                    repeating?: boolean | undefined;
                    intervalMinutes?: number | undefined;
                } | undefined;
            };
            config: {
                enforcementMode: "strict" | "gentle";
                version: number;
                updatedAt: number;
                blacklist: string[];
                whitelist: string[];
                workTimeSlots: {
                    dayOfWeek: number;
                    startHour: number;
                    startMinute: number;
                    endHour: number;
                    endMinute: number;
                }[];
                skipTokens: {
                    delayMinutes: number;
                    maxPerDay: number;
                };
                distractionApps: {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }[];
                sleepTime?: {
                    startTime: string;
                    endTime: string;
                    enabled: boolean;
                    enforcementApps: {
                        bundleId: string;
                        name: string;
                    }[];
                } | undefined;
                overRestEnforcementApps?: {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }[] | undefined;
                restEnforcement?: {
                    workApps: {
                        bundleId: string;
                        name: string;
                    }[];
                    actions: string[];
                    graceDurationMinutes: number;
                } | undefined;
            };
        };
        policyType: "full" | "partial";
        effectiveTime: number;
    }, {
        policy: {
            state: {
                skipTokensRemaining: number;
                isSleepTimeActive: boolean;
                isSleepSnoozed: boolean;
                isOverRest: boolean;
                overRestMinutes: number;
                overRestBringToFront: boolean;
                isRestEnforcementActive: boolean;
                sleepSnoozeEndTime?: number | undefined;
                restGrace?: {
                    available: boolean;
                    remaining: number;
                } | undefined;
                adhocFocusSession?: {
                    active: boolean;
                    endTime: number;
                    overridesSleepTime?: boolean | undefined;
                    overridesWorkHours?: boolean | undefined;
                } | undefined;
                temporaryUnblock?: {
                    active: boolean;
                    endTime: number;
                } | undefined;
                healthLimit?: {
                    message: string;
                    type: "2hours" | "daily";
                    repeating?: boolean | undefined;
                    intervalMinutes?: number | undefined;
                } | undefined;
            };
            config: {
                enforcementMode: "strict" | "gentle";
                version: number;
                updatedAt: number;
                blacklist: string[];
                whitelist: string[];
                workTimeSlots: {
                    dayOfWeek: number;
                    startHour: number;
                    startMinute: number;
                    endHour: number;
                    endMinute: number;
                }[];
                skipTokens: {
                    delayMinutes: number;
                    maxPerDay: number;
                };
                distractionApps: {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }[];
                sleepTime?: {
                    startTime: string;
                    endTime: string;
                    enabled: boolean;
                    enforcementApps: {
                        bundleId: string;
                        name: string;
                    }[];
                } | undefined;
                overRestEnforcementApps?: {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }[] | undefined;
                restEnforcement?: {
                    workApps: {
                        bundleId: string;
                        name: string;
                    }[];
                    actions: string[];
                    graceDurationMinutes: number;
                } | undefined;
            };
        };
        policyType: "full" | "partial";
        effectiveTime: number;
    }>;
}, "strip", z.ZodTypeAny, {
    payload: {
        policy: {
            state: {
                skipTokensRemaining: number;
                isSleepTimeActive: boolean;
                isSleepSnoozed: boolean;
                isOverRest: boolean;
                overRestMinutes: number;
                overRestBringToFront: boolean;
                isRestEnforcementActive: boolean;
                sleepSnoozeEndTime?: number | undefined;
                restGrace?: {
                    available: boolean;
                    remaining: number;
                } | undefined;
                adhocFocusSession?: {
                    active: boolean;
                    endTime: number;
                    overridesSleepTime?: boolean | undefined;
                    overridesWorkHours?: boolean | undefined;
                } | undefined;
                temporaryUnblock?: {
                    active: boolean;
                    endTime: number;
                } | undefined;
                healthLimit?: {
                    message: string;
                    type: "2hours" | "daily";
                    repeating?: boolean | undefined;
                    intervalMinutes?: number | undefined;
                } | undefined;
            };
            config: {
                enforcementMode: "strict" | "gentle";
                version: number;
                updatedAt: number;
                blacklist: string[];
                whitelist: string[];
                workTimeSlots: {
                    dayOfWeek: number;
                    startHour: number;
                    startMinute: number;
                    endHour: number;
                    endMinute: number;
                }[];
                skipTokens: {
                    delayMinutes: number;
                    maxPerDay: number;
                };
                distractionApps: {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }[];
                sleepTime?: {
                    startTime: string;
                    endTime: string;
                    enabled: boolean;
                    enforcementApps: {
                        bundleId: string;
                        name: string;
                    }[];
                } | undefined;
                overRestEnforcementApps?: {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }[] | undefined;
                restEnforcement?: {
                    workApps: {
                        bundleId: string;
                        name: string;
                    }[];
                    actions: string[];
                    graceDurationMinutes: number;
                } | undefined;
            };
        };
        policyType: "full" | "partial";
        effectiveTime: number;
    };
    commandId: string;
    commandType: "UPDATE_POLICY";
    targetClient: "web" | "desktop" | "browser_ext" | "mobile" | "api" | "all";
    priority: "low" | "normal" | "high" | "critical";
    requiresAck: boolean;
    createdAt: number;
    expiryTime?: number | undefined;
}, {
    payload: {
        policy: {
            state: {
                skipTokensRemaining: number;
                isSleepTimeActive: boolean;
                isSleepSnoozed: boolean;
                isOverRest: boolean;
                overRestMinutes: number;
                overRestBringToFront: boolean;
                isRestEnforcementActive: boolean;
                sleepSnoozeEndTime?: number | undefined;
                restGrace?: {
                    available: boolean;
                    remaining: number;
                } | undefined;
                adhocFocusSession?: {
                    active: boolean;
                    endTime: number;
                    overridesSleepTime?: boolean | undefined;
                    overridesWorkHours?: boolean | undefined;
                } | undefined;
                temporaryUnblock?: {
                    active: boolean;
                    endTime: number;
                } | undefined;
                healthLimit?: {
                    message: string;
                    type: "2hours" | "daily";
                    repeating?: boolean | undefined;
                    intervalMinutes?: number | undefined;
                } | undefined;
            };
            config: {
                enforcementMode: "strict" | "gentle";
                version: number;
                updatedAt: number;
                blacklist: string[];
                whitelist: string[];
                workTimeSlots: {
                    dayOfWeek: number;
                    startHour: number;
                    startMinute: number;
                    endHour: number;
                    endMinute: number;
                }[];
                skipTokens: {
                    delayMinutes: number;
                    maxPerDay: number;
                };
                distractionApps: {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }[];
                sleepTime?: {
                    startTime: string;
                    endTime: string;
                    enabled: boolean;
                    enforcementApps: {
                        bundleId: string;
                        name: string;
                    }[];
                } | undefined;
                overRestEnforcementApps?: {
                    action: "force_quit" | "hide_window";
                    bundleId: string;
                    name: string;
                }[] | undefined;
                restEnforcement?: {
                    workApps: {
                        bundleId: string;
                        name: string;
                    }[];
                    actions: string[];
                    graceDurationMinutes: number;
                } | undefined;
            };
        };
        policyType: "full" | "partial";
        effectiveTime: number;
    };
    commandId: string;
    commandType: "UPDATE_POLICY";
    targetClient: "web" | "desktop" | "browser_ext" | "mobile" | "api" | "all";
    priority: "low" | "normal" | "high" | "critical";
    requiresAck: boolean;
    createdAt: number;
    expiryTime?: number | undefined;
}>, z.ZodObject<{
    commandId: z.ZodString;
    targetClient: z.ZodUnion<[z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>, z.ZodLiteral<"all">]>;
    priority: z.ZodEnum<["low", "normal", "high", "critical"]>;
    requiresAck: z.ZodBoolean;
    expiryTime: z.ZodOptional<z.ZodNumber>;
    createdAt: z.ZodNumber;
} & {
    commandType: z.ZodLiteral<"SHOW_UI">;
    payload: z.ZodObject<{
        uiType: z.ZodEnum<["notification", "modal", "overlay", "toast"]>;
        content: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        duration: z.ZodOptional<z.ZodNumber>;
        dismissible: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        content: Record<string, unknown>;
        uiType: "notification" | "modal" | "overlay" | "toast";
        dismissible: boolean;
        duration?: number | undefined;
    }, {
        content: Record<string, unknown>;
        uiType: "notification" | "modal" | "overlay" | "toast";
        dismissible: boolean;
        duration?: number | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    payload: {
        content: Record<string, unknown>;
        uiType: "notification" | "modal" | "overlay" | "toast";
        dismissible: boolean;
        duration?: number | undefined;
    };
    commandId: string;
    commandType: "SHOW_UI";
    targetClient: "web" | "desktop" | "browser_ext" | "mobile" | "api" | "all";
    priority: "low" | "normal" | "high" | "critical";
    requiresAck: boolean;
    createdAt: number;
    expiryTime?: number | undefined;
}, {
    payload: {
        content: Record<string, unknown>;
        uiType: "notification" | "modal" | "overlay" | "toast";
        dismissible: boolean;
        duration?: number | undefined;
    };
    commandId: string;
    commandType: "SHOW_UI";
    targetClient: "web" | "desktop" | "browser_ext" | "mobile" | "api" | "all";
    priority: "low" | "normal" | "high" | "critical";
    requiresAck: boolean;
    createdAt: number;
    expiryTime?: number | undefined;
}>, z.ZodObject<{
    commandId: z.ZodString;
    targetClient: z.ZodUnion<[z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>, z.ZodLiteral<"all">]>;
    priority: z.ZodEnum<["low", "normal", "high", "critical"]>;
    requiresAck: z.ZodBoolean;
    expiryTime: z.ZodOptional<z.ZodNumber>;
    createdAt: z.ZodNumber;
} & {
    commandType: z.ZodLiteral<"ACTION_RESULT">;
    payload: z.ZodObject<{
        optimisticId: z.ZodString;
        success: z.ZodBoolean;
        error: z.ZodOptional<z.ZodObject<{
            code: z.ZodString;
            message: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            code: string;
            message: string;
        }, {
            code: string;
            message: string;
        }>>;
        data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        optimisticId: string;
        success: boolean;
        data?: Record<string, unknown> | undefined;
        error?: {
            code: string;
            message: string;
        } | undefined;
    }, {
        optimisticId: string;
        success: boolean;
        data?: Record<string, unknown> | undefined;
        error?: {
            code: string;
            message: string;
        } | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    payload: {
        optimisticId: string;
        success: boolean;
        data?: Record<string, unknown> | undefined;
        error?: {
            code: string;
            message: string;
        } | undefined;
    };
    commandId: string;
    commandType: "ACTION_RESULT";
    targetClient: "web" | "desktop" | "browser_ext" | "mobile" | "api" | "all";
    priority: "low" | "normal" | "high" | "critical";
    requiresAck: boolean;
    createdAt: number;
    expiryTime?: number | undefined;
}, {
    payload: {
        optimisticId: string;
        success: boolean;
        data?: Record<string, unknown> | undefined;
        error?: {
            code: string;
            message: string;
        } | undefined;
    };
    commandId: string;
    commandType: "ACTION_RESULT";
    targetClient: "web" | "desktop" | "browser_ext" | "mobile" | "api" | "all";
    priority: "low" | "normal" | "high" | "critical";
    requiresAck: boolean;
    createdAt: number;
    expiryTime?: number | undefined;
}>, z.ZodObject<{
    commandId: z.ZodString;
    targetClient: z.ZodUnion<[z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>, z.ZodLiteral<"all">]>;
    priority: z.ZodEnum<["low", "normal", "high", "critical"]>;
    requiresAck: z.ZodBoolean;
    expiryTime: z.ZodOptional<z.ZodNumber>;
    createdAt: z.ZodNumber;
} & {
    commandType: z.ZodLiteral<"CHAT_RESPONSE">;
    payload: z.ZodObject<{
        conversationId: z.ZodString;
        messageId: z.ZodString;
        type: z.ZodEnum<["delta", "complete"]>;
        content: z.ZodString;
        usage: z.ZodOptional<z.ZodObject<{
            inputTokens: z.ZodNumber;
            outputTokens: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            inputTokens: number;
            outputTokens: number;
        }, {
            inputTokens: number;
            outputTokens: number;
        }>>;
        isProactive: z.ZodOptional<z.ZodBoolean>;
        triggerId: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "delta" | "complete";
        conversationId: string;
        messageId: string;
        content: string;
        usage?: {
            inputTokens: number;
            outputTokens: number;
        } | undefined;
        isProactive?: boolean | undefined;
        triggerId?: string | undefined;
    }, {
        type: "delta" | "complete";
        conversationId: string;
        messageId: string;
        content: string;
        usage?: {
            inputTokens: number;
            outputTokens: number;
        } | undefined;
        isProactive?: boolean | undefined;
        triggerId?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    payload: {
        type: "delta" | "complete";
        conversationId: string;
        messageId: string;
        content: string;
        usage?: {
            inputTokens: number;
            outputTokens: number;
        } | undefined;
        isProactive?: boolean | undefined;
        triggerId?: string | undefined;
    };
    commandId: string;
    commandType: "CHAT_RESPONSE";
    targetClient: "web" | "desktop" | "browser_ext" | "mobile" | "api" | "all";
    priority: "low" | "normal" | "high" | "critical";
    requiresAck: boolean;
    createdAt: number;
    expiryTime?: number | undefined;
}, {
    payload: {
        type: "delta" | "complete";
        conversationId: string;
        messageId: string;
        content: string;
        usage?: {
            inputTokens: number;
            outputTokens: number;
        } | undefined;
        isProactive?: boolean | undefined;
        triggerId?: string | undefined;
    };
    commandId: string;
    commandType: "CHAT_RESPONSE";
    targetClient: "web" | "desktop" | "browser_ext" | "mobile" | "api" | "all";
    priority: "low" | "normal" | "high" | "critical";
    requiresAck: boolean;
    createdAt: number;
    expiryTime?: number | undefined;
}>, z.ZodObject<{
    commandId: z.ZodString;
    targetClient: z.ZodUnion<[z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>, z.ZodLiteral<"all">]>;
    priority: z.ZodEnum<["low", "normal", "high", "critical"]>;
    requiresAck: z.ZodBoolean;
    expiryTime: z.ZodOptional<z.ZodNumber>;
    createdAt: z.ZodNumber;
} & {
    commandType: z.ZodLiteral<"CHAT_TOOL_CALL">;
    payload: z.ZodObject<{
        conversationId: z.ZodString;
        messageId: z.ZodString;
        toolCallId: z.ZodString;
        toolName: z.ZodString;
        description: z.ZodString;
        parameters: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        requiresConfirmation: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        parameters: Record<string, unknown>;
        conversationId: string;
        messageId: string;
        toolCallId: string;
        toolName: string;
        description: string;
        requiresConfirmation: boolean;
    }, {
        parameters: Record<string, unknown>;
        conversationId: string;
        messageId: string;
        toolCallId: string;
        toolName: string;
        description: string;
        requiresConfirmation: boolean;
    }>;
}, "strip", z.ZodTypeAny, {
    payload: {
        parameters: Record<string, unknown>;
        conversationId: string;
        messageId: string;
        toolCallId: string;
        toolName: string;
        description: string;
        requiresConfirmation: boolean;
    };
    commandId: string;
    commandType: "CHAT_TOOL_CALL";
    targetClient: "web" | "desktop" | "browser_ext" | "mobile" | "api" | "all";
    priority: "low" | "normal" | "high" | "critical";
    requiresAck: boolean;
    createdAt: number;
    expiryTime?: number | undefined;
}, {
    payload: {
        parameters: Record<string, unknown>;
        conversationId: string;
        messageId: string;
        toolCallId: string;
        toolName: string;
        description: string;
        requiresConfirmation: boolean;
    };
    commandId: string;
    commandType: "CHAT_TOOL_CALL";
    targetClient: "web" | "desktop" | "browser_ext" | "mobile" | "api" | "all";
    priority: "low" | "normal" | "high" | "critical";
    requiresAck: boolean;
    createdAt: number;
    expiryTime?: number | undefined;
}>, z.ZodObject<{
    commandId: z.ZodString;
    targetClient: z.ZodUnion<[z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>, z.ZodLiteral<"all">]>;
    priority: z.ZodEnum<["low", "normal", "high", "critical"]>;
    requiresAck: z.ZodBoolean;
    expiryTime: z.ZodOptional<z.ZodNumber>;
    createdAt: z.ZodNumber;
} & {
    commandType: z.ZodLiteral<"CHAT_TOOL_RESULT">;
    payload: z.ZodObject<{
        conversationId: z.ZodString;
        messageId: z.ZodString;
        toolCallId: z.ZodString;
        success: z.ZodBoolean;
        summary: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        conversationId: string;
        messageId: string;
        toolCallId: string;
        success: boolean;
        summary: string;
    }, {
        conversationId: string;
        messageId: string;
        toolCallId: string;
        success: boolean;
        summary: string;
    }>;
}, "strip", z.ZodTypeAny, {
    payload: {
        conversationId: string;
        messageId: string;
        toolCallId: string;
        success: boolean;
        summary: string;
    };
    commandId: string;
    commandType: "CHAT_TOOL_RESULT";
    targetClient: "web" | "desktop" | "browser_ext" | "mobile" | "api" | "all";
    priority: "low" | "normal" | "high" | "critical";
    requiresAck: boolean;
    createdAt: number;
    expiryTime?: number | undefined;
}, {
    payload: {
        conversationId: string;
        messageId: string;
        toolCallId: string;
        success: boolean;
        summary: string;
    };
    commandId: string;
    commandType: "CHAT_TOOL_RESULT";
    targetClient: "web" | "desktop" | "browser_ext" | "mobile" | "api" | "all";
    priority: "low" | "normal" | "high" | "critical";
    requiresAck: boolean;
    createdAt: number;
    expiryTime?: number | undefined;
}>, z.ZodObject<{
    commandId: z.ZodString;
    targetClient: z.ZodUnion<[z.ZodEnum<["web", "desktop", "browser_ext", "mobile", "api"]>, z.ZodLiteral<"all">]>;
    priority: z.ZodEnum<["low", "normal", "high", "critical"]>;
    requiresAck: z.ZodBoolean;
    expiryTime: z.ZodOptional<z.ZodNumber>;
    createdAt: z.ZodNumber;
} & {
    commandType: z.ZodLiteral<"CHAT_SYNC">;
    payload: z.ZodObject<{
        conversationId: z.ZodString;
        messages: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            role: z.ZodString;
            content: z.ZodString;
            metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            createdAt: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            id: string;
            content: string;
            createdAt: string;
            role: string;
            metadata?: Record<string, unknown> | undefined;
        }, {
            id: string;
            content: string;
            createdAt: string;
            role: string;
            metadata?: Record<string, unknown> | undefined;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        conversationId: string;
        messages: {
            id: string;
            content: string;
            createdAt: string;
            role: string;
            metadata?: Record<string, unknown> | undefined;
        }[];
    }, {
        conversationId: string;
        messages: {
            id: string;
            content: string;
            createdAt: string;
            role: string;
            metadata?: Record<string, unknown> | undefined;
        }[];
    }>;
}, "strip", z.ZodTypeAny, {
    payload: {
        conversationId: string;
        messages: {
            id: string;
            content: string;
            createdAt: string;
            role: string;
            metadata?: Record<string, unknown> | undefined;
        }[];
    };
    commandId: string;
    commandType: "CHAT_SYNC";
    targetClient: "web" | "desktop" | "browser_ext" | "mobile" | "api" | "all";
    priority: "low" | "normal" | "high" | "critical";
    requiresAck: boolean;
    createdAt: number;
    expiryTime?: number | undefined;
}, {
    payload: {
        conversationId: string;
        messages: {
            id: string;
            content: string;
            createdAt: string;
            role: string;
            metadata?: Record<string, unknown> | undefined;
        }[];
    };
    commandId: string;
    commandType: "CHAT_SYNC";
    targetClient: "web" | "desktop" | "browser_ext" | "mobile" | "api" | "all";
    priority: "low" | "normal" | "high" | "critical";
    requiresAck: boolean;
    createdAt: number;
    expiryTime?: number | undefined;
}>]>;
//# sourceMappingURL=schemas.d.ts.map