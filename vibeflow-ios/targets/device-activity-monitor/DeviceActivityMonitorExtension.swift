import DeviceActivity
import FamilyControls
import Foundation
import ManagedSettings

/// DeviceActivityMonitor extension for offline schedule enforcement.
/// Handles:
/// - Sleep schedule (daily repeating)
/// - Test schedule (one-shot, for verifying callback reliability)
/// - Future: Pomodoro end, temp unblock expiry
///
/// Reads app selections from App Group shared UserDefaults.
class DeviceActivityMonitorExtension: DeviceActivityMonitor {
    private let store = ManagedSettingsStore()
    private let appGroupId = "group.app.vibeflow.shared"

    // UserDefaults keys (must match AppGroupManager)
    private let selectionKey = "familyActivitySelection"
    private let workAppsKey = "workAppsSelection"
    private let blockingReasonKey = "blockingReason"
    private let blockingReasonExtraKey = "blockingReasonExtra"
    private let testScheduleLogKey = "testScheduleLog"
    private let blockingContextKey = "blockingContext"
    private let reasonBeforeTempUnblockKey = "reasonBeforeTempUnblock"

    // MARK: - DeviceActivityMonitor Callbacks

    override func intervalDidStart(for activity: DeviceActivityName) {
        let activityName = activity.rawValue
        appendLog("intervalDidStart: \(activityName)")

        switch activityName {
        case "sleepSchedule":
            handleSleepStart()

        case "testSchedule":
            // Test schedule started — enable blocking to verify
            appendLog("testSchedule: enabling blocking")
            enableBlocking(reason: "test")

        case "pomodoroEnd", "tempUnblockExpiry":
            // No-op on start — main app already handles the immediate state
            appendLog("\(activityName): intervalDidStart (no-op, main app handles)")

        default:
            appendLog("Unknown activity started: \(activityName)")
        }
    }

    override func intervalDidEnd(for activity: DeviceActivityName) {
        let activityName = activity.rawValue
        appendLog("intervalDidEnd: \(activityName)")

        switch activityName {
        case "sleepSchedule":
            handleSleepEnd()

        case "testSchedule":
            // Test schedule ended — disable blocking
            appendLog("testSchedule: disabling blocking")
            disableBlocking()

        case "pomodoroEnd":
            handlePomodoroEnd()

        case "tempUnblockExpiry":
            handleTempUnblockExpiry()

        default:
            appendLog("Unknown activity ended: \(activityName)")
        }
    }

    // MARK: - Sleep Schedule Handlers

    private func handleSleepStart() {
        guard let distractionSelection = loadSelection(key: selectionKey),
              !distractionSelection.applicationTokens.isEmpty || !distractionSelection.categoryTokens.isEmpty
        else {
            // Fallback: block all categories if no selection configured
            store.shield.applications = nil
            store.shield.applicationCategories = .all()
            writeBlockingReason("sleep")
            appendLog("sleepSchedule: blocking ALL (no selection)")
            return
        }

        let workSelection = loadSelection(key: workAppsKey)
        let workApps = workSelection?.applicationTokens ?? Set()

        // Write blocking reason before applying shields
        writeBlockingReason("sleep")

        // Fine-grained blocking: distraction apps minus work apps
        store.shield.applications = distractionSelection.applicationTokens.subtracting(workApps)

        // Categories: use .specific(_, except:) for correct handling of opaque tokens
        store.shield.applicationCategories = .specific(
            distractionSelection.categoryTokens,
            except: workApps
        )
        appendLog("sleepSchedule: blocking enabled with selection")
    }

    private func handleSleepEnd() {
        disableBlocking()
        appendLog("sleepSchedule: blocking disabled")
    }

    // MARK: - Pomodoro End Handler

    /// When pomodoro ends offline, decide what to do based on BlockingContext.
    /// If sleep is active → switch to sleep blocking
    /// If over_rest → switch to over_rest blocking
    /// Otherwise → disable blocking
    private func handlePomodoroEnd() {
        appendLog("pomodoroEnd: reading BlockingContext for decision")

        if let context = readBlockingContext() {
            appendLog("pomodoroEnd: context found — sleep=\(context.sleepScheduleActive), overRest=\(context.overRestActive)")

            if context.sleepScheduleActive {
                appendLog("pomodoroEnd: sleep active → enabling sleep blocking")
                enableBlocking(reason: "sleep")
                return
            }

            if context.overRestActive {
                appendLog("pomodoroEnd: over_rest active → enabling over_rest blocking")
                enableBlocking(reason: "over_rest")
                return
            }
        } else {
            appendLog("pomodoroEnd: no BlockingContext found")
        }

        appendLog("pomodoroEnd: no other blocking reason → disabling blocking")
        disableBlocking()
    }

    // MARK: - Temp Unblock Expiry Handler

    /// When temporary unblock expires offline, restore the previous blocking reason.
    /// Reads from reasonBeforeTempUnblock first, then falls back to BlockingContext.
    private func handleTempUnblockExpiry() {
        appendLog("tempUnblockExpiry: reading restore reason")

        // First check saved reason from before temp unblock
        if let savedReason = readReasonBeforeTempUnblock() {
            appendLog("tempUnblockExpiry: restoring saved reason '\(savedReason)'")
            enableBlocking(reason: savedReason)
            clearReasonBeforeTempUnblock()
            return
        }

        // Fallback: read BlockingContext
        if let context = readBlockingContext() {
            if let reason = context.currentBlockingReason {
                appendLog("tempUnblockExpiry: restoring from context '\(reason)'")
                enableBlocking(reason: reason)
                return
            }

            // Context exists but no reason — check sleep/overRest flags
            if context.sleepScheduleActive {
                appendLog("tempUnblockExpiry: sleep active → enabling sleep blocking")
                enableBlocking(reason: "sleep")
                return
            }
            if context.overRestActive {
                appendLog("tempUnblockExpiry: over_rest active → enabling over_rest blocking")
                enableBlocking(reason: "over_rest")
                return
            }
        }

        appendLog("tempUnblockExpiry: no reason to restore → disabling blocking")
        disableBlocking()
    }

    // MARK: - Blocking Helpers

    private func enableBlocking(reason: String) {
        guard let distractionSelection = loadSelection(key: selectionKey),
              !distractionSelection.applicationTokens.isEmpty || !distractionSelection.categoryTokens.isEmpty
        else {
            // Fallback: block all categories
            store.shield.applications = nil
            store.shield.applicationCategories = .all()
            writeBlockingReason(reason)
            return
        }

        let workSelection = loadSelection(key: workAppsKey)
        let workApps = workSelection?.applicationTokens ?? Set()

        writeBlockingReason(reason)
        store.shield.applications = distractionSelection.applicationTokens.subtracting(workApps)
        store.shield.applicationCategories = .specific(
            distractionSelection.categoryTokens,
            except: workApps
        )
    }

    private func disableBlocking() {
        store.shield.applications = nil
        store.shield.applicationCategories = nil
        clearBlockingReason()
    }

    // MARK: - App Group Helpers

    private func loadSelection(key: String) -> FamilyActivitySelection? {
        let defaults = UserDefaults(suiteName: appGroupId)
        guard let data = defaults?.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(FamilyActivitySelection.self, from: data)
    }

    private func writeBlockingReason(_ reason: String) {
        let defaults = UserDefaults(suiteName: appGroupId)
        defaults?.set(reason, forKey: blockingReasonKey)
    }

    private func clearBlockingReason() {
        let defaults = UserDefaults(suiteName: appGroupId)
        defaults?.removeObject(forKey: blockingReasonKey)
        defaults?.removeObject(forKey: blockingReasonExtraKey)
    }

    // MARK: - BlockingContext Helpers

    /// Codable struct matching AppGroupManager.BlockingContext
    private struct BlockingContext: Codable {
        let currentBlockingReason: String?
        let sleepScheduleActive: Bool
        let sleepStartHour: Int?
        let sleepStartMinute: Int?
        let sleepEndHour: Int?
        let sleepEndMinute: Int?
        let overRestActive: Bool
    }

    private func readBlockingContext() -> BlockingContext? {
        let defaults = UserDefaults(suiteName: appGroupId)
        // C1: Force sync from disk before reading (cross-process data from main App)
        defaults?.synchronize()
        guard let data = defaults?.data(forKey: blockingContextKey) else { return nil }
        return try? JSONDecoder().decode(BlockingContext.self, from: data)
    }

    private func readReasonBeforeTempUnblock() -> String? {
        let defaults = UserDefaults(suiteName: appGroupId)
        defaults?.synchronize()
        return defaults?.string(forKey: reasonBeforeTempUnblockKey)
    }

    private func clearReasonBeforeTempUnblock() {
        let defaults = UserDefaults(suiteName: appGroupId)
        defaults?.removeObject(forKey: reasonBeforeTempUnblockKey)
    }

    /// Append log entry to App Group for debugging
    private func appendLog(_ message: String) {
        let defaults = UserDefaults(suiteName: appGroupId)
        var logs = defaults?.stringArray(forKey: testScheduleLogKey) ?? []
        let entry = "[\(ISO8601DateFormatter().string(from: Date()))] \(message)"
        logs.append(entry)
        if logs.count > 20 {
            logs = Array(logs.suffix(20))
        }
        defaults?.set(logs, forKey: testScheduleLogKey)
    }
}
