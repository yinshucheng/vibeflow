import ExpoModulesCore
import FamilyControls
import ManagedSettings

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
