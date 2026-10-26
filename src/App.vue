<template>
    <UApp :locale="uiLocale" :tooltip="{ delayDuration: 100 }" portal="#main-wrapper">
        <div class="app-wrapper" :class="{ 'wizard-bar-visible': showWizardBar }">
            <div id="background" v-if="isMobileSidebarOpen" aria-hidden="true" @click="isRevealed = false"></div>
            <div id="side_menu_swipe"></div>
            <div v-if="isLandingTab" class="mobile-topbar" :class="{ 'mobile-topbar--hidden': topbarHidden }">
                <div class="mobile-topbar__logo" :title="logoTooltip" aria-hidden="true"></div>
            </div>
            <UserSession is-compact class="floating-account" />
            <div id="tab-content-container" :class="{ 'has-mobile-topbar': isLandingTab }">
                <div class="tab_container" :class="{ reveal: isMobileSidebarOpen }">
                    <betaflight-logo
                        :configurator-version="appInfo.displayVersion"
                        :firmware-version="fcStore.config.flightControllerVersion"
                        :firmware-id="fcStore.config.flightControllerIdentifier"
                        :hardware-id="fcStore.config.hardwareName"
                    ></betaflight-logo>
                    <Teleport to=".floating-connect" :disabled="!useFloatingChrome">
                        <ConnectButton />
                    </Teleport>
                    <Sidebar />
                    <div class="clear-both"></div>
                </div>
                <div id="content" :class="{ 'wizard-fading': contentFading }" @scroll.passive="onContentScroll">
                    <keep-alive :include="keptAliveTabs">
                        <component
                            :is="activeTabComponent"
                            v-if="activeTabComponent"
                            :key="activeTabKey"
                            ref="activeTabInstance"
                        />
                    </keep-alive>
                </div>
            </div>
            <div v-if="showWizardBar" class="wizard-bar">
                <button type="button" class="wizard-btn wizard-btn--ghost" @click="onWizardDisconnect">
                    Disconnect
                </button>
                <div class="wizard-steps" aria-hidden="true">
                    <span
                        v-for="(step, i) in WIZARD_STEPS"
                        :key="step"
                        class="wizard-dot"
                        :class="{ 'wizard-dot--active': i === wizardIndex, 'wizard-dot--done': i < wizardIndex }"
                    ></span>
                </div>
                <button v-if="hasNext" type="button" class="wizard-btn" :disabled="wizardBusy" @click="goNext">
                    Next
                </button>
                <span v-else class="wizard-spacer"></span>
            </div>
            <status-bar
                :port-usage-down="PortUsage.port_usage_down"
                :port-usage-up="PortUsage.port_usage_up"
                :connection-timestamp="CONNECTION.timestamp"
                :packet-error="connectionStore.packetErrors"
                :cycle-time="fcStore.config.cycleTime"
                :cpu-load="fcStore.config.cpuload"
                :cpu-temperature="fcStore.config.cpuTemp"
                :configurator-version="appInfo.displayVersion"
                :firmware-version="fcStore.config.flightControllerVersion"
                :firmware-target="fcStore.config.hardwareName"
            ></status-bar>
            <div id="cache">
                <div class="data-loading">
                    <p i18n="dataWaitingForData">Waiting for data ...</p>
                </div>
            </div>
        </div>
        <GlobalDialogs />
    </UApp>
</template>

<script setup lang="ts">
import { isAndroid } from "@/js/utils/checkCompatibility";
import { computed, nextTick, provide, reactive, ref, shallowRef, watch } from "vue";
import { onKeyStroke, useMediaQuery } from "@vueuse/core";
import ConnectButton from "./components/device-picker/ConnectButton.vue";
import GlobalDialogs from "./components/dialogs/GlobalDialogs.vue";
import Sidebar from "./components/sidebar/Sidebar.vue";
import PortUsageModule from "./js/port_usage";
import { i18n } from "./js/localization";
import { useUiLocale } from "./composables/useUiLocale";
import { useFlightControllerStore } from "./stores/fc";
import { useConnectionStore } from "./stores/connection";
import { useAppInfoStore } from "./stores/appInfo";
import {
    completeVueTabMount,
    tabAdapterRegistration,
    TAB_ADAPTER_REGISTRATION_KEY,
    vueTabState,
} from "./js/vue_tab_mounter.js";
import { VueTabComponents } from "./js/vue_tab_registry";
import { switchTab } from "./js/tab_switch";
import { disconnect } from "./js/serial_backend";

// Tests or unusual entry points may run without init.js; init.js overwrites this synchronously after its model exists.
if (!window.vm) {
    window.vm = reactive({ expertMode: false });
}

// Stable fallback so computed() does not allocate a new reactive per evaluation when window.vm.CONNECTION is missing.
const connectionFallback = reactive({ timestamp: null });

// Track latest window.vm so computeds re-run when it is reassigned (import order vs. init.js).
const syncedVm = shallowRef(window.vm);

// Intercept future assignments to window.vm so syncedVm stays in sync
// without needing side effects inside computed getters.
let _windowVm = window.vm;
Object.defineProperty(window, "vm", {
    get: () => _windowVm,
    set: (v) => {
        _windowVm = v;
        syncedVm.value = v;
    },
    configurable: true,
    enumerable: true,
});

function currentVm() {
    return syncedVm.value;
}

const fcStore = useFlightControllerStore();
const connectionStore = useConnectionStore();
const appInfo = useAppInfoStore();
const PortUsage = computed(() => currentVm()?.PortUsage ?? PortUsageModule);
const CONNECTION = computed(() => currentVm()?.CONNECTION ?? connectionFallback);

// Nuxt UI needs its own locale to pick up the text direction and translate its built-in
// strings; without it every element renders LTR and in English (see issue #5482).
const uiLocale = useUiLocale();

const activeTabInstance = ref(null);

const isRevealed = ref(false);
const sidebarNarrow = useMediaQuery("(max-width: 1055px)");
const isCompactBreakpoint = useMediaQuery(
    "(max-width: 575px), (max-width: 950px) and (max-height: 500px) and (orientation: landscape)",
);
const isMobileSidebarOpen = computed(() => isCompactBreakpoint.value && isRevealed.value);
const isSidebarExpanded = computed(() => !sidebarNarrow.value || isRevealed.value);

// Escape closes the open drawer, the keyboard equivalent of a click on the backdrop. The backdrop
// itself cannot take focus, so the listener is on the window; onKeyStroke removes it on unmount.
onKeyStroke("Escape", () => {
    if (isMobileSidebarOpen.value) {
        isRevealed.value = false;
    }
});

// Auto-close the drawer when leaving the mobile drawer breakpoint.
watch(isCompactBreakpoint, (compact) => {
    if (!compact) {
        isRevealed.value = false;
    }
});

// The branded top bar is a landing-page affordance. Every other tab reaches the drawer from the
// hamburger in the status bar instead, so the bar only costs vertical space there.
const isLandingTab = computed(() => vueTabState.activeTabName === "landing");

// Connecting is the app's primary action and it lives in the drawer, which the phone shell no
// longer opens. Teleport it into the floating chrome there, and leave it in place everywhere else.
const isAppShell = isAndroid();
const useFloatingChrome = computed(() => isAppShell && isCompactBreakpoint.value);

const topbarHidden = ref(false);
let lastScrollTop = 0;
const scrollThreshold = 6;

function onContentScroll(event: Event) {
    const current = (event.target as HTMLElement).scrollTop;
    if (current <= 0) {
        topbarHidden.value = false;
        lastScrollTop = 0;
        return;
    }
    const diff = current - lastScrollTop;
    if (diff > scrollThreshold) {
        topbarHidden.value = true;
        lastScrollTop = current;
    } else if (diff < -scrollThreshold) {
        topbarHidden.value = false;
        lastScrollTop = current;
    }
}

// Ensure the topbar is visible when the drawer opens so the hamburger stays reachable.
watch(isRevealed, (revealed) => {
    if (revealed) {
        topbarHidden.value = false;
    }
});

// Scrolling any tab sets the hidden flag, and the landing page may be too short to
// scroll it back, so entering the landing tab has to reset it itself.
watch(isLandingTab, (isLanding) => {
    if (isLanding) {
        topbarHidden.value = false;
        lastScrollTop = 0;
    }
});

const logoTooltip = computed(() => {
    const lines = [`${i18n.getMessage("versionLabelConfigurator")}: ${appInfo.displayVersion}`];
    const cfg = fcStore.config ?? {};
    if (cfg.flightControllerVersion && cfg.flightControllerIdentifier) {
        lines.push(
            `${i18n.getMessage("versionLabelFirmware")}: ${cfg.flightControllerVersion} ${cfg.flightControllerIdentifier}`,
        );
    }
    if (cfg.hardwareName) {
        lines.push(`${i18n.getMessage("versionLabelTarget")}: ${cfg.hardwareName}`);
    }
    return lines.join("\n");
});

provide("toggleMobileSidebar", () => {
    isRevealed.value = !isRevealed.value;
});
provide("sidebarExpanded", isSidebarExpanded);
provide("closeMobileSidebar", () => {
    if (isCompactBreakpoint.value) {
        isRevealed.value = false;
    }
});

const activeTabComponent = computed(() => {
    const tabName = vueTabState.activeTabName;
    return tabName ? (VueTabComponents[tabName as keyof typeof VueTabComponents] ?? null) : null;
});

// Tabs that keep their state (and heavy resources) alive across switches rather than being torn
// down. Matched by component name.
const keptAliveTabs = ["BlackboxViewerTab"];

// The mounter bumps activeTabKey on every switch to force a fresh instance. Kept-alive tabs need
// a stable key instead, or keep-alive caches by an ever-changing key and never restores.
const activeTabKey = computed(() =>
    vueTabState.activeTabName === "blackbox_viewer" ? "blackbox_viewer" : vueTabState.activeTabKey,
);

// Guided flow: connect -> gyro (setup) -> motors -> complete.
const WIZARD_STEPS = ["setup", "motors", "complete"];
const wizardIndex = computed(() => WIZARD_STEPS.indexOf(vueTabState.activeTabName ?? ""));
const showWizardBar = computed(() => connectionStore.connectionValid && wizardIndex.value >= 0);
const hasNext = computed(() => wizardIndex.value >= 0 && wizardIndex.value < WIZARD_STEPS.length - 1);
const contentFading = ref(false);
const wizardBusy = ref(false);

function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function goNext() {
    if (wizardBusy.value || !hasNext.value) {
        return;
    }
    const next = WIZARD_STEPS[wizardIndex.value + 1];
    wizardBusy.value = true;
    contentFading.value = true;
    await sleep(350);
    const started = switchTab(next, { mode: next === "complete" ? "loggedin" : "connected" });
    if (started) {
        for (let i = 0; i < 60 && vueTabState.activeTabName !== next; i++) {
            await sleep(50);
        }
    }
    contentFading.value = false;
    wizardBusy.value = false;
}

async function onWizardDisconnect() {
    contentFading.value = true;
    await sleep(250);
    await disconnect();
    contentFading.value = false;
}

provide("betaflightModel", currentVm());
provide(TAB_ADAPTER_REGISTRATION_KEY, tabAdapterRegistration);

watch(
    () => vueTabState.activeTabKey,
    async () => {
        if (!vueTabState.activeTabName) {
            return;
        }

        await nextTick();
        completeVueTabMount(activeTabInstance.value);
    },
    { flush: "post" },
);
</script>

<style lang="less">
@keyframes app-spin {
    0% {
        transform: rotate(0deg);
    }
    100% {
        transform: rotate(360deg);
    }
}
</style>

<style>
/* ---- Test edit: #0e5fc9 + white palette (overrides theme.css tokens) ---- */
html:root,
html.dark:root {
    --color-primary-50: #eef5fe;
    --color-primary-100: #dbe9fd;
    --color-primary-200: #bcd6fb;
    --color-primary-300: #8dbaf7;
    --color-primary-400: #4f93ee;
    --color-primary-500: #0e5fc9;
    --color-primary-600: #0e5fc9;
    --color-primary-700: #0b4ba0;
    --color-primary-800: #0a3c80;
    --color-primary-900: #0b3366;
    --color-primary-950: #071f40;

    --primary-50: #eef5fe;
    --primary-100: #dbe9fd;
    --primary-200: #bcd6fb;
    --primary-300: #8dbaf7;
    --primary-400: #4f93ee;
    --primary-500: #0e5fc9;
    --primary-600: #0e5fc9;
    --primary-700: #0b4ba0;
    --primary-800: #0a3c80;
    --primary-900: #0b3366;
    --primary-950: #071f40;

    --primary-transparent-1: rgba(14, 95, 201, 0.1);
    --primary-transparent-2: rgba(14, 95, 201, 0.2);
    --primary-transparent-3: rgba(14, 95, 201, 0.3);
    --primary-transparent-4: rgba(14, 95, 201, 0.4);

    --primary-action: #0e5fc9;
    --primary-action-border: #0b4ba0;
    --primary-action-hover: #4f93ee;

    --ui-primary: #0e5fc9;
    --ui-text-inverted: #ffffff;
}

/* ---- Test edit: guided flow chrome ---- */
/* The sidebar is replaced by the Next / Disconnect bar. */
.app-wrapper .tab_container {
    display: none !important;
}
.app-wrapper #tab-content-container {
    padding-inline-start: 0 !important;
}
.app-wrapper #content {
    margin-inline-start: 0 !important;
    inset-inline-start: 0 !important;
    width: 100% !important;
    transition: opacity 0.35s ease;
}
.app-wrapper.wizard-bar-visible #content {
    padding-bottom: 5rem;
}
#content.wizard-fading {
    opacity: 0;
}
@keyframes wizard-fade-in {
    from {
        opacity: 0;
    }
    to {
        opacity: 1;
    }
}
#content > * {
    animation: wizard-fade-in 0.45s ease both;
}

.wizard-bar {
    position: fixed;
    inset-inline: 0;
    bottom: 3.75rem;
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 1.5rem;
    pointer-events: none;
}
.wizard-bar > * {
    pointer-events: auto;
}
.wizard-spacer {
    min-width: 7rem;
}
.wizard-steps {
    display: flex;
    gap: 0.6rem;
}
.wizard-dot {
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 9999px;
    background: #bcd6fb;
    border: 1px solid #0e5fc9;
    transition: background-color 0.3s ease, transform 0.3s ease;
}
.wizard-dot--done {
    background: #8dbaf7;
}
.wizard-dot--active {
    background: #0e5fc9;
    transform: scale(1.3);
}
.wizard-btn {
    min-width: 7rem;
    padding: 0.7rem 1.6rem;
    border-radius: 9999px;
    border: 2px solid #0e5fc9;
    background: #0e5fc9;
    color: #ffffff;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 6px 20px rgba(14, 95, 201, 0.4);
    transition: background-color 0.2s ease, color 0.2s ease, opacity 0.2s ease;
}
.wizard-btn:hover:not(:disabled) {
    background: #ffffff;
    color: #0e5fc9;
}
.wizard-btn:disabled {
    opacity: 0.6;
    cursor: default;
}
.wizard-btn--ghost {
    background: #ffffff;
    color: #0e5fc9;
    box-shadow: none;
}
.wizard-btn--ghost:hover:not(:disabled) {
    background: #0e5fc9;
    color: #ffffff;
}

/* Main app content wrapper - flex column to push status bar to bottom */
.app-wrapper {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0; /* Allow flex children to shrink below content size */
}

/* Legacy cache node is required by some code paths but should never be visible in Vue UI */
#cache {
    display: none;
}

/* Mobile top bar — the landing page's branding, auto-hides on scroll down. The drawer is
   reached from the status bar, which is present on every tab.
   The bar grows by the safe-area inset and pads its contents down by the same amount, so the
   controls sit below the Android/iOS status bar with the content box unchanged. */
.mobile-topbar {
    display: none;
    position: fixed;
    top: 0;
    inset-inline-start: 0;
    inset-inline-end: 0;
    z-index: 2001;
    /* Explicit, not inherited from the Tailwind reset: the height below is an outer height, and
       #content's matching padding-top depends on it staying one. */
    box-sizing: border-box;
    height: calc(3rem + var(--bf-inset-top));
    padding: calc(0.25rem + var(--bf-inset-top)) 0.5rem 0.25rem;
    align-items: center;
    gap: 0.5rem;
    background-color: var(--surface-100);
    border-bottom: 1px solid var(--surface-200);
    box-shadow: var(--shadow-chrome-bar);
    transition: transform 0.25s ease;
}
/* Compact only: a round, always-reachable account button over the content, matching the
   floating status bar at the other end of the screen. */
.floating-connect {
    display: none;
    position: fixed;
    top: calc(0.5rem + var(--bf-inset-top));
    right: 0.75rem;
    z-index: 2002;
    max-width: 62vw;
    border-radius: 9999px;
    border: 1px solid var(--surface-200);
    background-color: color-mix(in srgb, var(--surface-100) 82%, transparent);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    box-shadow: var(--shadow-chrome-floating);
    overflow: hidden;
}

.floating-account {
    display: none;
    position: fixed;
    top: calc(0.5rem + var(--bf-inset-top));
    left: 0.75rem;
    z-index: 2002;
    border-radius: 9999px;
    border: 1px solid var(--surface-200);
    background-color: color-mix(in srgb, var(--surface-100) 82%, transparent);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    box-shadow: var(--shadow-chrome-floating);
}

.mobile-topbar--hidden {
    transform: translateY(-100%);
}
.mobile-topbar__logo {
    flex: 1;
    min-width: 0;
    height: 2.5rem;
    background-image: url(./images/bf_logo_white.svg);
    background-repeat: no-repeat;
    background-position: center;
    background-size: auto 100%;
}
.dark .mobile-topbar__logo {
    background-image: url(./images/bf_logo_black.svg);
}
body.mobile-app-shell {
    @media all and (max-width: 575px), all and (max-width: 950px) and (max-height: 500px) and (orientation: landscape) {
        .mobile-topbar {
            display: flex;
        }
        .floating-account,
        .floating-connect {
            display: block;
        }
        /* One reserved strip at the top, whether it holds the landing page's bar or just the
       floating account button. Without it a tab's title renders underneath that button. */
        #content {
            padding-top: calc(3rem + var(--bf-inset-top));
            /* The status bar floats over the content, so the last row needs somewhere to scroll to. */
            padding-bottom: calc(5.75rem + var(--bf-inset-bottom));
        }
    }
}
</style>
