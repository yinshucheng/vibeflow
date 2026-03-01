import DeviceActivity
import ExpoModulesCore
import FamilyControls
import ManagedSettings
import SwiftUI
import UIKit

/// Expo native module for iOS Screen Time integration.
/// Uses FamilyControls authorization and ManagedSettings category-based blocking.
///
/// Phase 1: Blocks ALL app categories (ActivityCategoryToken is opaque and requires
/// FamilyActivityPicker for per-category selection).
/// Phase 2 will add FamilyActivityPicker for fine-grained app/category selection.
public class ScreenTimeModule: Module {
  private let store = ManagedSettingsStore()

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
        if useSelection,
           let distractionSelection = AppGroupManager.shared.loadDistractionSelection(),
           !distractionSelection.applicationTokens.isEmpty || !distractionSelection.categoryTokens.isEmpty
        {
          let workSelection = AppGroupManager.shared.loadWorkAppsSelection()
          let workApps = workSelection?.applicationTokens ?? Set()

          // App tokens: direct set subtraction
          self.store.shield.applications = distractionSelection.applicationTokens.subtracting(workApps)

          // Category tokens: must use .specific(_, except:) because opaque tokens
          // prevent determining if a category contains a specific app
          self.store.shield.applicationCategories = .specific(
            distractionSelection.categoryTokens,
            except: workApps
          )
        } else {
          // Fallback: block all categories (Phase 1 behavior)
          self.store.shield.applications = nil
          self.store.shield.applicationCategories = .all()
        }
        promise.resolve(nil)
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

          let pickerView = ActivityPickerSheet(
            model: model,
            title: title,
            onDone: { finalSelection in
              if type == "work" {
                appGroup.saveWorkAppsSelection(finalSelection)
              } else {
                appGroup.saveDistractionSelection(finalSelection)
              }
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
          promise.resolve(nil)
        } catch {
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
