Pod::Spec.new do |s|
  s.name           = 'ScreenTime'
  s.version        = '1.0.0'
  s.summary        = 'iOS Screen Time integration for VibeFlow'
  s.description    = 'Expo native module using FamilyControls + ManagedSettings for app blocking'
  s.license        = 'MIT'
  s.author         = 'vibeflow'
  s.homepage       = 'https://github.com/vibeflow'
  s.platforms      = { :ios => '16.0' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,swift}'

  s.frameworks = 'FamilyControls', 'ManagedSettings', 'DeviceActivity'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
