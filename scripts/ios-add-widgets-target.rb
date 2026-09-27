#!/usr/bin/env ruby
# Adds StudyMax's iOS widgets to ios/App/App.xcodeproj, idempotently.
#
#   ruby scripts/ios-add-widgets-target.rb
#
# Safe to re-run at any time (after a branch merge, after `npx cap sync ios`): every step
# checks before it adds, and the project is only saved when something changed.
#
# What it ensures:
#   - App target: MainViewController.swift + StudyMaxWidgetsPlugin.swift (the local Capacitor
#     plugin), Shared/DeadlineWatchAttributes.swift, ActivityKit weak-linked (the app deploys
#     to 15.0), App Group + URL scheme + NSSupportsLiveActivities in its plists.
#   - StudyMaxWidgets widget extension target (ai.calendue.studymax.widgets, iOS 16.2, automatic
#     signing, team JM7G3W9CWS) with every .swift in ios/App/StudyMaxWidgets, the asset catalog,
#     Info.plist and entitlements, plus Shared/DeadlineWatchAttributes.swift.
#   - The extension embedded in the App (Embed Foundation Extensions) with a target dependency.
require 'xcodeproj'

ROOT = File.expand_path('..', __dir__)
IOS_APP = File.join(ROOT, 'ios', 'App')
PROJECT_PATH = File.join(IOS_APP, 'App.xcodeproj')

TEAM = 'JM7G3W9CWS'
APP_GROUP = 'group.ai.calendue.studymax'
WIDGET_NAME = 'StudyMaxWidgets'
WIDGET_BUNDLE_ID = 'ai.calendue.studymax.widgets'
WIDGET_DEPLOYMENT = '16.2'
URL_SCHEME = 'studymax'

project = Xcodeproj::Project.open(PROJECT_PATH)
changes = []

app = project.targets.find { |t| t.name == 'App' } or abort('App target not found')

def group_for(parent, path)
  parent.groups.find { |g| g.path == path || g.name == path } || parent.new_group(path, path)
end

def file_ref(group, path)
  group.files.find { |f| f.path == path } || group.new_reference(path)
end

def add_source(target, ref, changes)
  return if target.source_build_phase.files_references.include?(ref)
  target.source_build_phase.add_file_reference(ref, true)
  changes << "#{target.name}: compile #{ref.path}"
end

def add_resource(target, ref, changes)
  return if target.resources_build_phase.files_references.include?(ref)
  target.resources_build_phase.add_file_reference(ref, true)
  changes << "#{target.name}: bundle #{ref.path}"
end

def set_setting(target, key, value, changes, configs: nil)
  target.build_configurations.each do |config|
    next if configs && !configs.include?(config.name)
    next if config.build_settings[key] == value
    config.build_settings[key] = value
    changes << "#{target.name}/#{config.name}: #{key}"
  end
end

# --- App target: the plugin and the shared attributes -------------------------------------------
app_group = project.main_group.groups.find { |g| g.path == 'App' } or abort('App group not found')
%w[MainViewController.swift StudyMaxWidgetsPlugin.swift].each do |name|
  add_source(app, file_ref(app_group, name), changes)
end

shared_group = group_for(project.main_group, 'Shared')
shared_ref = file_ref(shared_group, 'DeadlineWatchAttributes.swift')
add_source(app, shared_ref, changes)

# ActivityKit is iOS 16.1+ and the app deploys to 15.0.
app.build_configurations.each do |config|
  flags = Array(config.build_settings['OTHER_LDFLAGS'] || ['$(inherited)'])
  flags = flags.flat_map { |f| f.split(' ') }
  next if flags.each_cons(2).any? { |a, b| a == '-weak_framework' && b == 'ActivityKit' }
  config.build_settings['OTHER_LDFLAGS'] = flags + ['-weak_framework', 'ActivityKit']
  changes << "App/#{config.name}: weak-link ActivityKit"
end

# --- The widget extension target -----------------------------------------------------------------
widget = project.targets.find { |t| t.name == WIDGET_NAME }
unless widget
  widget = project.new_target(:app_extension, WIDGET_NAME, :ios, WIDGET_DEPLOYMENT, nil, :swift)
  changes << "created target #{WIDGET_NAME}"
end

attributes = project.root_object.attributes
attributes['TargetAttributes'] ||= {}
target_attrs = attributes['TargetAttributes'][widget.uuid] ||= {}
if target_attrs['ProvisioningStyle'] != 'Automatic' || target_attrs['DevelopmentTeam'] != TEAM
  target_attrs['CreatedOnToolsVersion'] ||= '26.4'
  target_attrs['ProvisioningStyle'] = 'Automatic'
  target_attrs['DevelopmentTeam'] = TEAM
  changes << "#{WIDGET_NAME}: target attributes"
end

# new_target links Foundation from a version-pinned SDK path; Swift autolinks what it needs.
widget.frameworks_build_phase.files.select { |f| f.file_ref&.path.to_s.end_with?('Foundation.framework') }.each do |f|
  ref = f.file_ref
  widget.frameworks_build_phase.remove_build_file(f)
  ref.remove_from_project if ref && ref.build_files.empty?
  changes << "#{WIDGET_NAME}: unlink pinned Foundation.framework"
end
frameworks_group = project.main_group.groups.find { |g| g.name == 'Frameworks' && g.path.nil? }
if frameworks_group && frameworks_group.recursive_children.none? { |c| c.is_a?(Xcodeproj::Project::Object::PBXFileReference) }
  frameworks_group.recursive_children.each(&:remove_from_project)
  frameworks_group.remove_from_project
  changes << 'removed the empty Frameworks group'
end

widget_group = group_for(project.main_group, WIDGET_NAME)
Dir.glob(File.join(IOS_APP, WIDGET_NAME, '*.swift')).sort.each do |path|
  add_source(widget, file_ref(widget_group, File.basename(path)), changes)
end
add_source(widget, shared_ref, changes)
add_resource(widget, file_ref(widget_group, 'Assets.xcassets'), changes)
file_ref(widget_group, 'Info.plist')
file_ref(widget_group, "#{WIDGET_NAME}.entitlements")

# Marketing and build numbers follow the App's, so the embedded extension always matches.
app_release = app.build_configurations.find { |c| c.name == 'Release' }
marketing = app_release.build_settings['MARKETING_VERSION'] || '1.0.0'
build_number = app_release.build_settings['CURRENT_PROJECT_VERSION'] || '1'

{
  'PRODUCT_NAME' => '$(TARGET_NAME)',
  'PRODUCT_BUNDLE_IDENTIFIER' => WIDGET_BUNDLE_ID,
  'INFOPLIST_FILE' => "#{WIDGET_NAME}/Info.plist",
  'GENERATE_INFOPLIST_FILE' => 'NO',
  'CODE_SIGN_ENTITLEMENTS' => "#{WIDGET_NAME}/#{WIDGET_NAME}.entitlements",
  'CODE_SIGN_STYLE' => 'Automatic',
  'DEVELOPMENT_TEAM' => TEAM,
  'IPHONEOS_DEPLOYMENT_TARGET' => WIDGET_DEPLOYMENT,
  'SDKROOT' => 'iphoneos',
  'SWIFT_VERSION' => '5.0',
  'TARGETED_DEVICE_FAMILY' => '1,2',
  'MARKETING_VERSION' => marketing,
  'CURRENT_PROJECT_VERSION' => build_number,
  'SKIP_INSTALL' => 'YES',
  'APPLICATION_EXTENSION_API_ONLY' => 'YES',
  'LD_RUNPATH_SEARCH_PATHS' => ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks'],
}.each { |key, value| set_setting(widget, key, value, changes) }
set_setting(widget, 'SWIFT_ACTIVE_COMPILATION_CONDITIONS', 'DEBUG', changes, configs: ['Debug'])
set_setting(widget, 'SWIFT_OPTIMIZATION_LEVEL', '-Onone', changes, configs: ['Debug'])
widget.build_configurations.each do |config|
  %w[ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME ASSETCATALOG_COMPILER_WIDGET_BACKGROUND_COLOR_NAME].each do |key|
    changes << "#{WIDGET_NAME}/#{config.name}: drop #{key}" if config.build_settings.delete(key)
  end
end

# --- Embed the extension in the App --------------------------------------------------------------
unless app.dependencies.any? { |d| d.target == widget }
  app.add_dependency(widget)
  changes << 'App depends on StudyMaxWidgets'
end

embed = app.copy_files_build_phases.find { |p| p.name == 'Embed Foundation Extensions' } ||
        app.copy_files_build_phases.find { |p| p.symbol_dst_subfolder_spec == :plug_ins }
unless embed
  embed = app.new_copy_files_build_phase('Embed Foundation Extensions')
  embed.symbol_dst_subfolder_spec = :plug_ins
  embed.dst_path = ''
  changes << 'App: Embed Foundation Extensions phase'
end
unless embed.files_references.include?(widget.product_reference)
  build_file = embed.add_file_reference(widget.product_reference, true)
  build_file.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
  changes << 'App: embed StudyMaxWidgets.appex'
end

if changes.empty?
  puts 'Xcode project already up to date.'
else
  project.save
  puts "Xcode project updated:\n  " + changes.join("\n  ")
end

# --- Plists: App Group on both targets, URL scheme, Live Activities ------------------------------
def update_plist(path)
  plist = Xcodeproj::Plist.read_from_path(path)
  before = Marshal.load(Marshal.dump(plist))
  yield plist
  return false if plist == before
  Xcodeproj::Plist.write_to_path(plist, path)
  true
end

def ensure_app_group(plist)
  groups = plist['com.apple.security.application-groups'] ||= []
  groups << APP_GROUP unless groups.include?(APP_GROUP)
end

app_entitlements = File.join(IOS_APP, 'App', 'App.entitlements')
widget_entitlements = File.join(IOS_APP, WIDGET_NAME, "#{WIDGET_NAME}.entitlements")
app_info = File.join(IOS_APP, 'App', 'Info.plist')

puts 'App.entitlements: App Group added' if update_plist(app_entitlements) { |p| ensure_app_group(p) }
puts "#{WIDGET_NAME}.entitlements: App Group added" if update_plist(widget_entitlements) { |p| ensure_app_group(p) }
info_changed = update_plist(app_info) do |p|
  types = p['CFBundleURLTypes'] ||= []
  unless types.any? { |t| Array(t['CFBundleURLSchemes']).include?(URL_SCHEME) }
    types << {
      'CFBundleTypeRole' => 'Editor',
      'CFBundleURLName' => 'ai.calendue.studymax',
      'CFBundleURLSchemes' => [URL_SCHEME],
    }
  end
  p['NSSupportsLiveActivities'] = true
end
puts 'Info.plist: studymax:// scheme and NSSupportsLiveActivities' if info_changed
