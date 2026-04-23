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

    // MARK: - Test: One-shot Schedule at Exact Time

    /// Register a one-shot schedule that triggers intervalDidStart immediately and
    /// intervalDidEnd after the specified number of seconds.
    /// Used for testing DeviceActivityMonitor extension callback reliability.
    AsyncFunction("registerTestSchedule") { (durationSeconds: Int, promise: Promise) in
      if #available(iOS 16.0, *) {
        let center = DeviceActivityCenter()
        let activityName = DeviceActivityName("testSchedule")

        // Stop any existing test schedule
        center.stopMonitoring([activityName])

        // Calculate end time
        let now = Date()
        let endTime = now.addingTimeInterval(Double(durationSeconds))

        // Create schedule: starts now, ends after durationSeconds
        // Using calendar components for the specific date/time
        let calendar = Calendar.current
        let startComponents = calendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: now)
        let endComponents = calendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: endTime)

        let schedule = DeviceActivitySchedule(
          intervalStart: startComponents,
          intervalEnd: endComponents,
          repeats: false
        )

        // Save test info to App Group for extension to read
        AppGroupManager.shared.saveTestScheduleInfo(endTime: endTime)

        do {
          try center.startMonitoring(activityName, during: schedule)
          self.logger.info("Test schedule registered: duration=\(durationSeconds)s, endTime=\(endTime)")
          promise.resolve([
            "success": true,
            "endTime": endTime.timeIntervalSince1970 * 1000,
            "durationSeconds": durationSeconds
          ])
        } catch {
          self.logger.error("Failed to register test schedule: \(error.localizedDescription)")
          promise.reject("SCHEDULE_ERROR", "Failed to register test schedule: \(error.localizedDescription)")
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
