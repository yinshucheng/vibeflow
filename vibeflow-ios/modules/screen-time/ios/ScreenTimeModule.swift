import DeviceActivity
import ExpoModulesCore
import FamilyControls
import ManagedSettings
import SwiftUI
import UIKit
import os.log

/// Helper class to detect when the picker sheet is dismissed interactively (swipe down).
@available(iOS 16.0, *)
private class PickerDismissDelegate: NSObject, UIAdaptivePresentationControllerDelegate {
  let onDismiss: () -> Void

  init(onDismiss: @escaping () -> Void) {
    self.onDismiss = onDismiss
  }

  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    onDismiss()
  }
}

/// Expo native module for iOS Screen Time integration.
/// Uses FamilyControls authorization and ManagedSettings category-based blocking.
///
/// Phase 1: Blocks ALL app categories (ActivityCategoryToken is opaque and requires
/// FamilyActivityPicker for per-category selection).
/// Phase 2 will add FamilyActivityPicker for fine-grained app/category selection.
public class ScreenTimeModule: Module {
  private let store = ManagedSettingsStore()
  private let logger = Logger(subsystem: "app.vibeflow", category: "ScreenTimeModule")

  /// Strong reference to dismiss delegate to prevent deallocation.
  private var dismissDelegate: NSObject?

  public func definition() -> ModuleDefinition {
    Name("ScreenTime")

    AsyncFunction("requestAuthorization") { (promise: Promise) in
      if #available(iOS 16.0, *) {
        Task {
          do {
            try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
            promise.resolve(self.currentStatusString())
          } catch {
            // User denied or error occurred
            promise.resolve("denied")
          }
        }
      } else {
        promise.resolve("restricted")
      }
    }

    AsyncFunction("getAuthorizationStatus") { (promise: Promise) in
      if #available(iOS 16.0, *) {
        promise.resolve(self.currentStatusString())
      } else {
        promise.resolve("restricted")
      }
    }

    AsyncFunction("enableBlocking") { (useSelection: Bool, promise: Promise) in
      if #available(iOS 16.0, *) {
        var mode = "unknown"
        var appCount = 0
        var catCount = 0

        if useSelection,
           let distractionSelection = AppGroupManager.shared.loadDistractionSelection(),
           !distractionSelection.applicationTokens.isEmpty || !distractionSelection.categoryTokens.isEmpty
        {
          let workSelection = AppGroupManager.shared.loadWorkAppsSelection()
          let workApps = workSelection?.applicationTokens ?? Set()

          var appsToBlock = distractionSelection.applicationTokens.subtracting(workApps)

          // iOS limits shield.applications to 50 tokens.
          // If over limit, truncate and rely on category-level blocking for the rest.
          if appsToBlock.count > 50 {
            self.logger.warning("App tokens (\(appsToBlock.count)) exceed iOS limit of 50, truncating")
            appsToBlock = Set(appsToBlock.prefix(50))
          }

          self.store.shield.applications = appsToBlock.isEmpty ? nil : appsToBlock
          self.store.shield.applicationCategories = .specific(
            distractionSelection.categoryTokens,
            except: workApps
          )
          mode = "selection"
          appCount = appsToBlock.count
          catCount = distractionSelection.categoryTokens.count
        } else {
          self.store.shield.applications = nil
          self.store.shield.applicationCategories = .all()
          mode = "all"
        }

        let appsSet = self.store.shield.applications != nil
        let catsSet = self.store.shield.applicationCategories != nil
        let result: [String: Any] = [
          "mode": mode,
          "appCount": appCount,
          "catCount": catCount,
          "shieldAppsSet": appsSet,
          "shieldCatsSet": catsSet,
        ]
        promise.resolve(result)
      } else {
        promise.resolve(nil)
      }
    }

    AsyncFunction("disableBlocking") { (promise: Promise) in
      if #available(iOS 16.0, *) {
        self.store.shield.applications = nil
        self.store.shield.applicationCategories = nil
        promise.resolve(nil)
      } else {
        promise.resolve(nil)
      }
    }

    AsyncFunction("isBlockingEnabled") { (promise: Promise) in
      if #available(iOS 16.0, *) {
        let enabled = self.store.shield.applications != nil || self.store.shield.applicationCategories != nil
        promise.resolve(enabled)
      } else {
        promise.resolve(false)
      }
    }

    // MARK: - Phase 2: FamilyActivityPicker

    AsyncFunction("presentActivityPicker") { (type: String, promise: Promise) in
      if #available(iOS 16.0, *) {
        DispatchQueue.main.async {
          guard let rootVC = UIApplication.shared
            .connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .flatMap({ $0.windows })
            .first(where: { $0.isKeyWindow })?
            .rootViewController else {
            promise.reject("NO_VIEW_CONTROLLER", "Cannot find root view controller")
            return
          }

          // Find the topmost presented controller to present from
          var topVC = rootVC
          while let presented = topVC.presentedViewController {
            topVC = presented
          }

          let appGroup = AppGroupManager.shared
          let initial: FamilyActivitySelection
          if type == "work" {
            initial = appGroup.loadWorkAppsSelection() ?? FamilyActivitySelection()
          } else {
            initial = appGroup.loadDistractionSelection() ?? FamilyActivitySelection()
          }

          let model = ActivitySelectionModel(selection: initial)
          let title = type == "work" ? "工作应用" : "分心应用"

          // Track whether promise has been resolved to avoid double-resolve
          var resolved = false

          let pickerView = ActivityPickerSheet(
            model: model,
            title: title,
            onDone: { finalSelection in
              guard !resolved else { return }
              resolved = true

              if type == "work" {
                appGroup.saveWorkAppsSelection(finalSelection)
              } else {
                appGroup.saveDistractionSelection(finalSelection)
              }

              // Dismiss the hosting controller (not topVC which may have changed)
              topVC.dismiss(animated: true) {
                let summary: [String: Any] = [
                  "appCount": finalSelection.applicationTokens.count,
                  "categoryCount": finalSelection.categoryTokens.count,
                  "hasSelection": !finalSelection.applicationTokens.isEmpty
                    || !finalSelection.categoryTokens.isEmpty,
                ]
                promise.resolve(summary)
              }
            }
          )

          let hostingController = UIHostingController(rootView: pickerView)

          // Handle interactive dismiss (user swipes down to close)
          let delegate = PickerDismissDelegate {
            guard !resolved else { return }
            resolved = true

            // Read current saved selection as the result
            let sel: FamilyActivitySelection?
            if type == "work" {
              sel = appGroup.loadWorkAppsSelection()
            } else {
              sel = appGroup.loadDistractionSelection()
            }
            let summary: [String: Any] = [
              "appCount": sel?.applicationTokens.count ?? 0,
              "categoryCount": sel?.categoryTokens.count ?? 0,
              "hasSelection": (sel?.applicationTokens.isEmpty == false)
                || (sel?.categoryTokens.isEmpty == false),
            ]
            promise.resolve(summary)
            self.dismissDelegate = nil
          }
          self.dismissDelegate = delegate
          hostingController.presentationController?.delegate = delegate

          topVC.present(hostingController, animated: true)
        }
      } else {
        promise.resolve([
          "appCount": 0,
          "categoryCount": 0,
          "hasSelection": false,
        ] as [String: Any])
      }
    }

    AsyncFunction("getSelectionSummary") { (type: String, promise: Promise) in
      if #available(iOS 16.0, *) {
        let appGroup = AppGroupManager.shared
        let selection: FamilyActivitySelection?
        if type == "work" {
          selection = appGroup.loadWorkAppsSelection()
        } else {
          selection = appGroup.loadDistractionSelection()
        }

        if let sel = selection {
          promise.resolve([
            "appCount": sel.applicationTokens.count,
            "categoryCount": sel.categoryTokens.count,
            "hasSelection": !sel.applicationTokens.isEmpty || !sel.categoryTokens.isEmpty,
          ] as [String: Any])
        } else {
          promise.resolve([
            "appCount": 0,
            "categoryCount": 0,
            "hasSelection": false,
          ] as [String: Any])
        }
      } else {
        promise.resolve([
          "appCount": 0,
          "categoryCount": 0,
          "hasSelection": false,
        ] as [String: Any])
      }
    }

    // MARK: - Phase 2: Blocking Reason

    AsyncFunction("setBlockingReason") { (reason: String, promise: Promise) in
      if #available(iOS 16.0, *) {
        AppGroupManager.shared.saveBlockingReason(reason)
        promise.resolve(nil)
      } else {
        promise.resolve(nil)
      }
    }

    // MARK: - Phase 2: Sleep Schedule

    AsyncFunction("registerSleepSchedule") {
      (startHour: Int, startMinute: Int, endHour: Int, endMinute: Int, promise: Promise) in
      if #available(iOS 16.0, *) {
        // Save to App Group for extensions to read
        AppGroupManager.shared.saveSleepSchedule(
          startHour: startHour, startMinute: startMinute,
          endHour: endHour, endMinute: endMinute
        )

        let start = DateComponents(hour: startHour, minute: startMinute)
        let end = DateComponents(hour: endHour, minute: endMinute)
        let schedule = DeviceActivitySchedule(
          intervalStart: start,
          intervalEnd: end,
          repeats: true
        )

        let center = DeviceActivityCenter()
        // Stop existing schedule first to avoid conflicts
        center.stopMonitoring([.init("sleepSchedule")])
        do {
          try center.startMonitoring(.init("sleepSchedule"), during: schedule)
          self.logger.info("Sleep schedule registered: \(startHour):\(startMinute)-\(endHour):\(endMinute)")
          promise.resolve(nil)
        } catch {
          self.logger.error("Failed to register sleep schedule: \(error.localizedDescription)")
          promise.reject("SCHEDULE_ERROR", "Failed to register sleep schedule: \(error.localizedDescription)")
        }
      } else {
        promise.resolve(nil)
      }
    }

    AsyncFunction("clearSleepSchedule") { (promise: Promise) in
      if #available(iOS 16.0, *) {
        let center = DeviceActivityCenter()
        center.stopMonitoring([.init("sleepSchedule")])
        AppGroupManager.shared.clearSleepSchedule()
        promise.resolve(nil)
      } else {
        promise.resolve(nil)
      }
    }

    // MARK: - Test: Schedule using time-of-day components (same as sleepSchedule)

    /// Register a test schedule that creates a monitoring window from now to (now + durationMinutes).
    /// Uses hour:minute DateComponents (same approach as sleepSchedule) which is how
    /// DeviceActivitySchedule is designed to work.
    ///
    /// - intervalDidStart fires when the start time arrives (should be ~immediate)
    /// - intervalDidEnd fires when the end time arrives (after durationMinutes)
    ///
    /// Also immediately enables blocking from the main app as a fallback.
    AsyncFunction("registerTestSchedule") { (durationSeconds: Int, promise: Promise) in
      if #available(iOS 16.0, *) {
        let center = DeviceActivityCenter()
        let activityName = DeviceActivityName("testSchedule")

        // Stop any existing test schedule
        center.stopMonitoring([activityName])

        // Calculate start (1 min ago to ensure we're "inside" the interval)
        // and end (now + durationMinutes)
        let calendar = Calendar.current
        let now = Date()
        let startTime = now.addingTimeInterval(-60) // 1 min in the past
        let endTime = now.addingTimeInterval(Double(durationSeconds))

        // Use ONLY hour and minute — this is how DeviceActivitySchedule works
        // (like sleepSchedule: "from 23:00 to 07:00")
        let startComponents = calendar.dateComponents([.hour, .minute], from: startTime)
        let endComponents = calendar.dateComponents([.hour, .minute], from: endTime)

        self.logger.info("Test schedule: start=\(startComponents.hour!):\(startComponents.minute!) end=\(endComponents.hour!):\(endComponents.minute!)")

        let schedule = DeviceActivitySchedule(
          intervalStart: startComponents,
          intervalEnd: endComponents,
          repeats: false
        )

        // Step 1: Immediately enable blocking from main app
        if let selection = AppGroupManager.shared.loadDistractionSelection(),
           !selection.applicationTokens.isEmpty || !selection.categoryTokens.isEmpty {
          let workSelection = AppGroupManager.shared.loadWorkAppsSelection()
          let workApps = workSelection?.applicationTokens ?? Set()
          self.store.shield.applications = selection.applicationTokens.subtracting(workApps)
          self.store.shield.applicationCategories = .specific(selection.categoryTokens, except: workApps)
          AppGroupManager.shared.saveBlockingReason("test")
          self.logger.info("Test blocking enabled with selection")
        } else {
          self.store.shield.applications = nil
          self.store.shield.applicationCategories = .all()
          AppGroupManager.shared.saveBlockingReason("test")
          self.logger.info("Test blocking enabled (all categories)")
        }

        // Step 2: Register the schedule
        AppGroupManager.shared.saveTestScheduleInfo(endTime: endTime)

        do {
          try center.startMonitoring(activityName, during: schedule)
          let activities = center.activities.map { $0.rawValue }
          self.logger.info("Test schedule registered OK. Active: \(activities)")
          promise.resolve([
            "success": true,
            "endTime": endTime.timeIntervalSince1970 * 1000,
            "durationSeconds": durationSeconds,
            "blockingEnabled": true,
            "startTime": "\(startComponents.hour!):\(startComponents.minute!)",
            "endTimeStr": "\(endComponents.hour!):\(endComponents.minute!)",
            "activeSchedules": activities
          ])
        } catch {
          self.logger.error("Failed to register test schedule: \(error.localizedDescription)")
          promise.resolve([
            "success": true,
            "endTime": endTime.timeIntervalSince1970 * 1000,
            "durationSeconds": durationSeconds,
            "blockingEnabled": true,
            "scheduleError": error.localizedDescription
          ])
        }
      } else {
        promise.reject("UNSUPPORTED", "Requires iOS 16.0+")
      }
    }

    /// Cancel the test schedule
    AsyncFunction("cancelTestSchedule") { (promise: Promise) in
      if #available(iOS 16.0, *) {
        let center = DeviceActivityCenter()
        center.stopMonitoring([DeviceActivityName("testSchedule")])
        AppGroupManager.shared.clearTestScheduleInfo()
        self.logger.info("Test schedule cancelled")
        promise.resolve(nil)
      } else {
        promise.resolve(nil)
      }
    }

    /// Get currently active schedules (for debugging)
    AsyncFunction("getActiveSchedules") { (promise: Promise) in
      if #available(iOS 16.0, *) {
        let center = DeviceActivityCenter()
        let activities = center.activities
        let names = activities.map { $0.rawValue }
        promise.resolve(names)
      } else {
        promise.resolve([])
      }
    }

    /// Get extension logs from App Group (for debugging)
    AsyncFunction("getExtensionLogs") { (promise: Promise) in
      if #available(iOS 16.0, *) {
        let logs = AppGroupManager.shared.readTestScheduleLogs()
        promise.resolve(logs)
      } else {
        promise.resolve([])
      }
    }

    /// Clear extension logs
    AsyncFunction("clearExtensionLogs") { (promise: Promise) in
      if #available(iOS 16.0, *) {
        AppGroupManager.shared.clearTestScheduleLogs()
        promise.resolve(nil)
      } else {
        promise.resolve(nil)
      }
    }

    /// Manually disable blocking (for testing)
    AsyncFunction("forceDisableBlocking") { (promise: Promise) in
      if #available(iOS 16.0, *) {
        self.store.shield.applications = nil
        self.store.shield.applicationCategories = nil
        AppGroupManager.shared.clearBlockingReason()
        self.logger.info("Force disabled blocking")
        promise.resolve(nil)
      } else {
        promise.resolve(nil)
      }
    }

    // MARK: - Offline Automation: Pomodoro End Schedule

    /// Register a one-shot schedule that fires when the pomodoro is expected to end.
    /// The Extension's intervalDidEnd will read BlockingContext to decide what to do.
    /// Rejects with INTERVAL_TOO_SHORT if remaining time < 15 minutes.
    AsyncFunction("registerPomodoroEndSchedule") { (endTimeMs: Double, promise: Promise) in
      if #available(iOS 16.0, *) {
        let endDate = Date(timeIntervalSince1970: endTimeMs / 1000.0)
        let remaining = endDate.timeIntervalSince(Date())

        if remaining < 15 * 60 {
          promise.reject("INTERVAL_TOO_SHORT", "Remaining time (\(Int(remaining))s) is less than 15 minutes")
          return
        }

        let center = DeviceActivityCenter()
        let activityName = DeviceActivityName("pomodoroEnd")

        center.stopMonitoring([activityName])

        let calendar = Calendar.current
        let startTime = Date().addingTimeInterval(-60) // 1 min in the past
        let startComponents = calendar.dateComponents([.hour, .minute], from: startTime)
        let endComponents = calendar.dateComponents([.hour, .minute], from: endDate)

        // Cross-midnight detection: if start.hour > end.hour, this is a cross-midnight
        // interval. DeviceActivitySchedule handles this the same way as sleepSchedule
        // (e.g., 23:00→07:00), which has been verified to work correctly.
        let crossesMidnight = startComponents.hour! > endComponents.hour!
        if crossesMidnight {
          self.logger.info("Pomodoro end schedule crosses midnight: \(startComponents.hour!):\(startComponents.minute!) → \(endComponents.hour!):\(endComponents.minute!)")
        }

        let schedule = DeviceActivitySchedule(
          intervalStart: startComponents,
          intervalEnd: endComponents,
          repeats: false
        )

        AppGroupManager.shared.savePomodoroScheduleInfo(endTime: endDate)

        do {
          try center.startMonitoring(activityName, during: schedule)
          self.logger.info("Pomodoro end schedule registered: \(endComponents.hour!):\(endComponents.minute!) (crossesMidnight=\(crossesMidnight))")
          promise.resolve(nil)
        } catch {
          self.logger.error("Failed to register pomodoro end schedule: \(error.localizedDescription)")
          AppGroupManager.shared.clearPomodoroScheduleInfo()
          promise.reject("SCHEDULE_ERROR", "Failed to register pomodoro end schedule: \(error.localizedDescription)")
        }
      } else {
        promise.resolve(nil)
      }
    }

    /// Cancel the pomodoro end schedule
    AsyncFunction("cancelPomodoroEndSchedule") { (promise: Promise) in
      if #available(iOS 16.0, *) {
        let center = DeviceActivityCenter()
        center.stopMonitoring([DeviceActivityName("pomodoroEnd")])
        AppGroupManager.shared.clearPomodoroScheduleInfo()
        self.logger.info("Pomodoro end schedule cancelled")
        promise.resolve(nil)
      } else {
        promise.resolve(nil)
      }
    }

    // MARK: - Offline Automation: Temp Unblock Expiry Schedule

    /// Register a one-shot schedule that fires when the temp unblock expires.
    /// Saves the restore reason so the Extension knows what blocking to re-enable.
    /// Rejects with INTERVAL_TOO_SHORT if remaining time < 15 minutes.
    AsyncFunction("registerTempUnblockExpirySchedule") { (endTimeMs: Double, restoreReason: String, promise: Promise) in
      if #available(iOS 16.0, *) {
        let endDate = Date(timeIntervalSince1970: endTimeMs / 1000.0)
        let remaining = endDate.timeIntervalSince(Date())

        if remaining < 15 * 60 {
          promise.reject("INTERVAL_TOO_SHORT", "Remaining time (\(Int(remaining))s) is less than 15 minutes")
          return
        }

        let center = DeviceActivityCenter()
        let activityName = DeviceActivityName("tempUnblockExpiry")

        center.stopMonitoring([activityName])

        let calendar = Calendar.current
        let startTime = Date().addingTimeInterval(-60) // 1 min in the past
        let startComponents = calendar.dateComponents([.hour, .minute], from: startTime)
        let endComponents = calendar.dateComponents([.hour, .minute], from: endDate)

        let crossesMidnight = startComponents.hour! > endComponents.hour!

        let schedule = DeviceActivitySchedule(
          intervalStart: startComponents,
          intervalEnd: endComponents,
          repeats: false
        )

        AppGroupManager.shared.saveReasonBeforeTempUnblock(restoreReason)
        AppGroupManager.shared.saveTempUnblockScheduleInfo(endTime: endDate, restoreReason: restoreReason)

        do {
          try center.startMonitoring(activityName, during: schedule)
          self.logger.info("Temp unblock expiry schedule registered: \(endComponents.hour!):\(endComponents.minute!), restore=\(restoreReason), crossesMidnight=\(crossesMidnight)")
          promise.resolve(nil)
        } catch {
          self.logger.error("Failed to register temp unblock expiry schedule: \(error.localizedDescription)")
          AppGroupManager.shared.clearTempUnblockScheduleInfo()
          AppGroupManager.shared.clearReasonBeforeTempUnblock()
          promise.reject("SCHEDULE_ERROR", "Failed to register temp unblock expiry schedule: \(error.localizedDescription)")
        }
      } else {
        promise.resolve(nil)
      }
    }

    /// Cancel the temp unblock expiry schedule
    AsyncFunction("cancelTempUnblockExpirySchedule") { (promise: Promise) in
      if #available(iOS 16.0, *) {
        let center = DeviceActivityCenter()
        center.stopMonitoring([DeviceActivityName("tempUnblockExpiry")])
        AppGroupManager.shared.clearTempUnblockScheduleInfo()
        AppGroupManager.shared.clearReasonBeforeTempUnblock()
        self.logger.info("Temp unblock expiry schedule cancelled")
        promise.resolve(nil)
      } else {
        promise.resolve(nil)
      }
    }

    // MARK: - Offline Automation: Blocking Context

    /// Update the shared BlockingContext in App Group for Extension to read.
    /// Called from JS whenever blocking state is re-evaluated.
    AsyncFunction("updateBlockingContext") { (contextJson: String, promise: Promise) in
      if #available(iOS 16.0, *) {
        guard let data = contextJson.data(using: .utf8),
              let context = try? JSONDecoder().decode(AppGroupManager.BlockingContext.self, from: data) else {
          promise.reject("INVALID_JSON", "Failed to parse BlockingContext JSON")
          return
        }
        AppGroupManager.shared.saveBlockingContext(context)
        self.logger.info("BlockingContext updated: reason=\(context.currentBlockingReason ?? "nil"), sleep=\(context.sleepScheduleActive), overRest=\(context.overRestActive)")
        promise.resolve(nil)
      } else {
        promise.resolve(nil)
      }
    }
  }

  // MARK: - Helpers

  @available(iOS 16.0, *)
  private func currentStatusString() -> String {
    switch AuthorizationCenter.shared.authorizationStatus {
    case .approved:
      return "authorized"
    case .denied:
      return "denied"
    case .notDetermined:
      return "notDetermined"
    @unknown default:
      return "notDetermined"
    }
  }
}
