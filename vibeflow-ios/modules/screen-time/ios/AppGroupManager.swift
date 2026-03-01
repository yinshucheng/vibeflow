import Foundation
import FamilyControls

/// Manages shared data between the main app and extensions via App Group UserDefaults.
/// All Screen Time related data (selections, blocking reason, sleep schedule) is stored here.
@available(iOS 16.0, *)
public final class AppGroupManager {
    static let shared = AppGroupManager()

    private let appGroupId = "group.app.vibeflow.shared"

    // MARK: - UserDefaults Keys

    private let selectionKey = "familyActivitySelection"
    private let workAppsKey = "workAppsSelection"
    private let blockingReasonKey = "blockingReason"
    private let blockingReasonExtraKey = "blockingReasonExtra"
    private let sleepScheduleKey = "sleepSchedule"

    private var defaults: UserDefaults? {
        UserDefaults(suiteName: appGroupId)
    }

    private init() {}

    // MARK: - Distraction Selection

    func saveDistractionSelection(_ selection: FamilyActivitySelection) {
        guard let data = try? JSONEncoder().encode(selection) else { return }
        defaults?.set(data, forKey: selectionKey)
    }

    func loadDistractionSelection() -> FamilyActivitySelection? {
        guard let data = defaults?.data(forKey: selectionKey) else { return nil }
        return try? JSONDecoder().decode(FamilyActivitySelection.self, from: data)
    }

    // MARK: - Work Apps Selection

    func saveWorkAppsSelection(_ selection: FamilyActivitySelection) {
        guard let data = try? JSONEncoder().encode(selection) else { return }
        defaults?.set(data, forKey: workAppsKey)
    }

    func loadWorkAppsSelection() -> FamilyActivitySelection? {
        guard let data = defaults?.data(forKey: workAppsKey) else { return nil }
        return try? JSONDecoder().decode(FamilyActivitySelection.self, from: data)
    }

    // MARK: - Blocking Reason

    func saveBlockingReason(_ reason: String, extra: [String: Any]? = nil) {
        defaults?.set(reason, forKey: blockingReasonKey)
        if let extra = extra,
           let data = try? JSONSerialization.data(withJSONObject: extra) {
            defaults?.set(data, forKey: blockingReasonExtraKey)
        } else {
            defaults?.removeObject(forKey: blockingReasonExtraKey)
        }
    }

    func readBlockingReason() -> String? {
        defaults?.string(forKey: blockingReasonKey)
    }

    func readBlockingReasonExtra() -> [String: Any]? {
        guard let data = defaults?.data(forKey: blockingReasonExtraKey) else { return nil }
        return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    }

    func clearBlockingReason() {
        defaults?.removeObject(forKey: blockingReasonKey)
        defaults?.removeObject(forKey: blockingReasonExtraKey)
    }

    // MARK: - Sleep Schedule

    func saveSleepSchedule(startHour: Int, startMinute: Int, endHour: Int, endMinute: Int) {
        let schedule: [String: Int] = [
            "startHour": startHour,
            "startMinute": startMinute,
            "endHour": endHour,
            "endMinute": endMinute,
        ]
        if let data = try? JSONEncoder().encode(schedule) {
            defaults?.set(data, forKey: sleepScheduleKey)
        }
    }

    func readSleepSchedule() -> (startHour: Int, startMinute: Int, endHour: Int, endMinute: Int)? {
        guard let data = defaults?.data(forKey: sleepScheduleKey),
              let schedule = try? JSONDecoder().decode([String: Int].self, from: data),
              let startHour = schedule["startHour"],
              let startMinute = schedule["startMinute"],
              let endHour = schedule["endHour"],
              let endMinute = schedule["endMinute"]
        else { return nil }
        return (startHour, startMinute, endHour, endMinute)
    }

    func clearSleepSchedule() {
        defaults?.removeObject(forKey: sleepScheduleKey)
    }
}
