import ManagedSettings
import ManagedSettingsUI
import UIKit

/// Custom Shield UI for VibeFlow blocked apps.
/// Reads the blocking reason from App Group shared UserDefaults and returns
/// localized content with VibeFlow branding (dark background, white text, blue accent).
class VibeFlowShieldConfigurationDataSource: ShieldConfigurationDataSource {
    private let appGroupId = "group.app.vibeflow.shared"
    private let blockingReasonKey = "blockingReason"
    private let blockingReasonExtraKey = "blockingReasonExtra"

    // MARK: - Brand Colors

    /// VibeFlow brand blue accent color
    private var accentBlue: UIColor {
        UIColor(red: 59.0 / 255.0, green: 130.0 / 255.0, blue: 246.0 / 255.0, alpha: 1.0)
    }

    /// Dark background with slight transparency for depth
    private var darkBackground: UIColor {
        UIColor.black.withAlphaComponent(0.92)
    }

    // MARK: - ShieldConfigurationDataSource Overrides

    override func configuration(shielding application: Application) -> ShieldConfiguration {
        return buildConfiguration()
    }

    override func configuration(shielding application: Application, in category: ActivityCategory) -> ShieldConfiguration {
        return buildConfiguration()
    }

    override func configuration(shielding webDomain: WebDomain) -> ShieldConfiguration {
        return buildConfiguration()
    }

    override func configuration(shielding webDomain: WebDomain, in category: ActivityCategory) -> ShieldConfiguration {
        return buildConfiguration()
    }

    // MARK: - Configuration Builder

    private func buildConfiguration() -> ShieldConfiguration {
        let reason = readBlockingReason()
        let extra = readBlockingReasonExtra()

        switch reason {
        case "focus":
            return ShieldConfiguration(
                backgroundBlurStyle: .dark,
                backgroundColor: darkBackground,
                icon: nil,
                title: ShieldConfiguration.Label(text: "专注中", color: .white),
                subtitle: ShieldConfiguration.Label(
                    text: "番茄钟进行中，请保持专注",
                    color: UIColor.lightGray
                ),
                primaryButtonLabel: ShieldConfiguration.Label(text: "打开 VibeFlow", color: .white),
                primaryButtonBackgroundColor: accentBlue
            )

        case "over_rest":
            return ShieldConfiguration(
                backgroundBlurStyle: .dark,
                backgroundColor: darkBackground,
                icon: nil,
                title: ShieldConfiguration.Label(text: "休息超时", color: .white),
                subtitle: ShieldConfiguration.Label(
                    text: "休息时间已结束，请返回工作",
                    color: UIColor.lightGray
                ),
                primaryButtonLabel: ShieldConfiguration.Label(text: "打开 VibeFlow", color: .white),
                primaryButtonBackgroundColor: UIColor.systemOrange
            )

        case "sleep":
            let subtitle = buildSleepSubtitle(extra: extra)
            return ShieldConfiguration(
                backgroundBlurStyle: .dark,
                backgroundColor: darkBackground,
                icon: nil,
                title: ShieldConfiguration.Label(text: "睡眠时间", color: .white),
                subtitle: ShieldConfiguration.Label(
                    text: subtitle,
                    color: UIColor.lightGray
                ),
                primaryButtonLabel: ShieldConfiguration.Label(text: "我知道了", color: .white),
                primaryButtonBackgroundColor: UIColor.systemIndigo
            )

        default:
            return ShieldConfiguration(
                backgroundBlurStyle: .dark,
                backgroundColor: darkBackground,
                icon: nil,
                title: ShieldConfiguration.Label(text: "VibeFlow", color: .white),
                subtitle: ShieldConfiguration.Label(
                    text: "应用已阻断",
                    color: UIColor.lightGray
                ),
                primaryButtonLabel: ShieldConfiguration.Label(text: "打开 VibeFlow", color: .white),
                primaryButtonBackgroundColor: accentBlue
            )
        }
    }

    // MARK: - Helpers

    private func readBlockingReason() -> String {
        let defaults = UserDefaults(suiteName: appGroupId)
        return defaults?.string(forKey: blockingReasonKey) ?? "focus"
    }

    private func readBlockingReasonExtra() -> [String: Any]? {
        let defaults = UserDefaults(suiteName: appGroupId)
        guard let data = defaults?.data(forKey: blockingReasonExtraKey) else { return nil }
        return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    }

    private func buildSleepSubtitle(extra: [String: Any]?) -> String {
        if let endTime = extra?["endTime"] as? String, !endTime.isEmpty {
            return "明天 \(endTime) 解锁"
        }
        return "请好好休息，明早再来"
    }
}
