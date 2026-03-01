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

    AsyncFunction("enableBlocking") { (promise: Promise) in
      if #available(iOS 16.0, *) {
        // Phase 1: Block all app categories.
        // ActivityCategoryToken is opaque — specific category selection
        // requires FamilyActivityPicker (Phase 2).
        self.store.shield.applicationCategories = .all()
        promise.resolve(nil)
      } else {
        promise.resolve(nil)
      }
    }

    AsyncFunction("disableBlocking") { (promise: Promise) in
      if #available(iOS 16.0, *) {
        self.store.shield.applicationCategories = nil
        promise.resolve(nil)
      } else {
        promise.resolve(nil)
      }
    }

    AsyncFunction("isBlockingEnabled") { (promise: Promise) in
      if #available(iOS 16.0, *) {
        let enabled = self.store.shield.applicationCategories != nil
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
