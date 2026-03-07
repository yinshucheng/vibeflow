import Foundation
import FamilyControls
import os.log

/// Manages shared data between the main app and extensions via App Group UserDefaults.
/// All Screen Time related data (selections, blocking reason, sleep schedule) is stored here.
@available(iOS 16.0, *)
public final class AppGroupManager {
    static let shared = AppGroupManager()

    private let appGroupId = "group.app.vibeflow.shared"
    private let logger = Logger(subsystem: "app.vibeflow", category: "AppGroup")

    // MARK: - UserDefaults Keys

    private let selectionKey = "familyActivitySelection"
    private let workAppsKey = "workAppsSelection"
    private let blockingReasonKey = "blockingReason"
    private let blockingReasonExtraKey = "blockingReasonExtra"
    private let sleepScheduleKey = "sleepSchedule"

    private var defaults: UserDefaults? {
        let ud = UserDefaults(suiteName: appGroupId)
        if ud == nil {
            logger.error("Failed to create UserDefaults for App Group: \(self.appGroupId)")
        }
        return ud
    }

    private init() {}

    // MARK: - Distraction Selection

    func saveDistractionSelection(_ selection: FamilyActivitySelection) {
        guard let data = try? JSONEncoder().encode(selection) else {
            logger.error("Failed to encode distraction selection")
            return
        }
        defaults?.set(data, forKey: selectionKey)
    }

    func loadDistractionSelection() -> FamilyActivitySelection? {
        guard let data = defaults?.data(forKey: selectionKey) else {
            logger.info("No distraction selection data found in App Group")
            return nil
        }
        guard let selection = try? JSONDecoder().decode(FamilyActivitySelection.self, from: data) else {
            logger.error("Failed to decode distraction selection from App Group")
            return nil
        }
        return selection
    }

    // MARK: - Work Apps Selection

    func saveWorkAppsSelection(_ selection: FamilyActivitySelection) {
        guard let data = try? JSONEncoder().encode(selection) else {
            logger.error("Failed to encode work apps selection")
            return
        }
        defaults?.set(data, forKey: workAppsKey)
    }

    func loadWorkAppsSelection() -> FamilyActivitySelection? {
        guard let data = defaults?.data(forKey: workAppsKey) else {
            logger.info("No work apps selection data found in App Group")
            return nil
        }
        guard let selection = try? JSONDecoder().decode(FamilyActivitySelection.self, from: data) else {
            logger.error("Failed to decode work apps selection from App Group")
            return nil
        }
        return selection
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
        guard let data = try? JSONEncoder().encode(schedule) else {
            logger.error("Failed to encode sleep schedule")
            return
        }
        defaults?.set(data, forKey: sleepScheduleKey)
    }

    func readSleepSchedule() -> (startHour: Int, startMinute: Int, endHour: Int, endMinute: Int)? {
        guard let data = defaults?.data(forKey: sleepScheduleKey) else {
            logger.info("No sleep schedule data found in App Group")
            return nil
        }
        guard let schedule = try? JSONDecoder().decode([String: Int].self, from: data),
              let startHour = schedule["startHour"],
              let startMinute = schedule["startMinute"],
              let endHour = schedule["endHour"],
              let endMinute = schedule["endMinute"]
        else {
            logger.error("Failed to decode sleep schedule from App Group")
            return nil
        }
        return (startHour, startMinute, endHour, endMinute)
    }

    func clearSleepSchedule() {
        defaults?.removeObject(forKey: sleepScheduleKey)
    }
}
