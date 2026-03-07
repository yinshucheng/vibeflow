import SwiftUI
import FamilyControls

/// ObservableObject holding FamilyActivitySelection state.
/// Must use ObservableObject (not local @State) so SwiftUI Binding
/// captures updates correctly inside UIHostingController.
@available(iOS 16.0, *)
class ActivitySelectionModel: ObservableObject {
    @Published var selection: FamilyActivitySelection

    init(selection: FamilyActivitySelection) {
        self.selection = selection
    }
}

/// SwiftUI wrapper around FamilyActivityPicker with NavigationView and "Done" button.
@available(iOS 16.0, *)
struct ActivityPickerSheet: View {
    @ObservedObject var model: ActivitySelectionModel
    let title: String
    let onDone: (FamilyActivitySelection) -> Void

    var body: some View {
        NavigationView {
            FamilyActivityPicker(selection: $model.selection)
                .navigationTitle(title)
                .navigationBarItems(trailing: Button("完成") {
                    onDone(model.selection)
                })
        }
    }
}
