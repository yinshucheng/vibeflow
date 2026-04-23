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
