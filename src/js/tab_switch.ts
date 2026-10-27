import { i18n } from "./localization";
import { gui_log } from "./gui_log";
import { set as setConfig } from "./ConfigStorage";
import { checkSetupAnalytics } from "./Analytics";
import { tabSwitchCleanup } from "./tab_adapters";
import { mountVueTab, vueTabState } from "./vue_tab_mounter";
import { sidebarItems } from "../components/sidebar/sidebar_items";
import { useConnectionStore } from "../stores/connection";
import { useNavigationStore } from "../stores/navigation";

export interface SwitchTabOptions {
    mode?: string;
    label?: string;
}
function defaultLabel(tabKey: string): string {
    const item = sidebarItems.find((i) => (i.tab ?? i.key) === tabKey);
    return item ? i18n.getMessage(item.i18n) : tabKey;
}
function canSwitchTab(requiresConnection: boolean): boolean {
    const store = useConnectionStore();
    if (requiresConnection && !store.connectionValid) {
        gui_log(i18n.getMessage("tabSwitchConnectionRequired"));
        return false;
    }
    if (store.connectLock || store.flashingInProgress) {
        gui_log(i18n.getMessage("tabSwitchWaitForOperation"));
        return false;
    }
    return true;
}
function handleDisallowedTab(tabKey: string, label: string): void {
    if (tabKey !== "firmware_flasher") {
        gui_log(i18n.getMessage("tabSwitchUpgradeRequired", [label]));
        return;
    }
    const store = useConnectionStore();
    if (store.connectedTo || store.connectingTo) {
        useNavigationStore().pendingTab = "firmware_flasher";
        void import("./serial_backend").then(({ connectDisconnect }) => connectDisconnect());
    } else {
        switchTab("firmware_flasher", { mode: "disconnected", label });
    }
}
function resetPageZoom(): void {
    if (!document.body.classList.contains("mobile-app-shell")) return;
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable)) active.blur();
    const meta = document.querySelector("meta[name=viewport]");
    if (!meta) return;
    const content = meta.getAttribute("content") ?? "";
    meta.setAttribute("content", `${content},maximum-scale=1`);
    requestAnimationFrame(() => meta.setAttribute("content", content));
}
export function switchTab(tabKey: string, options: SwitchTabOptions = {}): boolean {
    const mode = options.mode ?? "disconnected";
    const label = options.label ?? defaultLabel(tabKey);
    const navigation = useNavigationStore();
    if ((navigation.activeTab === tabKey && vueTabState.activeTabName === tabKey) || navigation.tabSwitchInProgress) return false;
    if (!canSwitchTab(mode === "connected" || mode === "cli")) return false;
    if (!navigation.allowedTabs.includes(tabKey) && mode !== "loggedin") {
        handleDisallowedTab(tabKey, label);
        return false;
    }
    // Keep the gyro instance mounted while it hands over to its educational lesson.
    if (tabKey === "motors" && vueTabState.activeTabName === "setup" &&
        !document.body.classList.contains("motor-lesson-active")) {
        window.dispatchEvent(new CustomEvent("test-edit-open-motor-lesson"));
        return true;
    }
    if (mode === "connected" && tabKey !== "cli") setConfig({ lastTab: `tab_${tabKey}` });
    resetPageZoom();
    navigation.tabSwitchInProgress = true;
    tabSwitchCleanup(() => {
        checkSetupAnalytics((service) => service?.sendAppView(tabKey));
        if (!mountVueTab(tabKey, () => { navigation.tabSwitchInProgress = false; })) {
            console.log(`Tab not found: ${tabKey}`);
            navigation.tabSwitchInProgress = false;
        }
    });
    return true;
}
export function selectDefaultTabWhenConnected(): void {
    if (!switchTab("calibrate", { mode: "loggedin" })) switchTab("setup", { mode: "connected" });
}
