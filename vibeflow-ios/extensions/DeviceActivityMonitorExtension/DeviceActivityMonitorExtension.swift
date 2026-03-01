import DeviceActivity
import FamilyControls
import ManagedSettings

/// DeviceActivityMonitor extension for offline sleep schedule enforcement.
/// Activates/deactivates app blocking at scheduled sleep times, even when the main app is not running.
/// Reads distraction/work app selections from App Group shared UserDefaults.
class DeviceActivityMonitorExtension: DeviceActivityMonitor {
    private let store = ManagedSettingsStore()
    private let appGroupId = "group.app.vibeflow.shared"

    // UserDefaults keys (must match AppGroupManager)
    private let selectionKey = "familyActivitySelection"
    private let workAppsKey = "workAppsSelection"
    private let blockingReasonKey = "blockingReason"
    private let blockingReasonExtraKey = "blockingReasonExtra"

    // MARK: - DeviceActivityMonitor Callbacks

    override func intervalDidStart(for activity: DeviceActivityName) {
        guard let distractionSelection = loadSelection(key: selectionKey),
              !distractionSelection.applicationTokens.isEmpty || !distractionSelection.categoryTokens.isEmpty
        else {
            // Fallback: block all categories if no selection configured
            store.shield.applications = nil
            store.shield.applicationCategories = .all()
            writeBlockingReason("sleep")
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
    }

    override func intervalDidEnd(for activity: DeviceActivityName) {
        // Clear all shields
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
}
