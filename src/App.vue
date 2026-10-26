<template>
    <UApp :locale="uiLocale" :tooltip="{ delayDuration: 100 }" portal="#main-wrapper">
        <div class="app-wrapper" :class="{ 'wizard-bar-visible': showWizardBar, 'info-open': infoVisible }">
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

            <DroneStage
                v-if="connectionStore.connectionValid"
                :mode="stageMode"
                :shifted="infoVisible"
                :gyro-offset="gyroOffset"
            />

            <div v-if="stepLabel" class="step-label" :class="{ 'step-label--light': isLandingTab }">
                <span class="step-label__num">{{ stepLabel.num }}</span>
                <span class="step-label__rule"></span>
                <span class="step-label__text">{{ stepLabel.text }}</span>
            </div>

            <button type="button" class="theme-toggle" @click="toggleTheme">{{ isDark ? "Light" : "Dark" }}</button>

            <div
                v-if="isSetupTab"
                class="rotate-controls"
                :class="{ 'rotate-controls--muted': !introDone && introStep !== 2, 'rotate-controls--spot': spotlightVisible }"
            >
                <button type="button" class="rotate-btn" @click="gyroOffset += 90">&#8634; Rotate 90&deg; left</button>
                <button type="button" class="rotate-btn" @click="gyroOffset -= 90">Rotate 90&deg; right &#8635;</button>
            </div>

            <Transition name="dlg" mode="out-in">
                <div v-if="infoVisible" :key="introStep" class="dialogue">
                    <div class="dialogue__eyebrow">{{ dialogue.eyebrow }}</div>
                    <h2>{{ dialogue.title }}</h2>
                    <p>{{ dialogue.text }}</p>
                    <button type="button" class="dialogue__btn" @click="dialogue.action">{{ dialogue.button }}</button>
                </div>
            </Transition>

            <button v-if="isSetupTab && introStep === 0 && introDone" type="button" class="info-fab" @click="introStep = 1">
                i
            </button>

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
                <button
                    v-if="hasNext"
                    type="button"
                    class="wizard-btn"
                    :disabled="wizardBusy || nextBlocked"
                    @click="goNext"
                >
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
            <div class="demo-watermark" aria-hidden="true">
                This is trash visuals.<br />No art direction has been put in. It is a technical demo.
            </div>
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
import { computed, nextTick, onBeforeUnmount, onMounted, provide, reactive, ref, shallowRef, watch } from "vue";
import { onKeyStroke, useMediaQuery } from "@vueuse/core";
import ConnectButton from "./components/device-picker/ConnectButton.vue";
import GlobalDialogs from "./components/dialogs/GlobalDialogs.vue";
import Sidebar from "./components/sidebar/Sidebar.vue";
import DroneStage from "./components/wizard/DroneStage.vue";
import PortUsageModule from "./js/port_usage";
import { i18n } from "./js/localization";
import { setDarkTheme } from "./js/DarkTheme";
import { mspHelper } from "./js/msp/MSPHelper";
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

// The branded top bar is a landing-page affordance.
const isLandingTab = computed(() => vueTabState.activeTabName === "landing");
const isSetupTab = computed(() => vueTabState.activeTabName === "setup");
const isCalibrateTab = computed(() => vueTabState.activeTabName === "calibrate");

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

// Theme: the guided screens are dark blue in both modes; the toggle changes the stock panels.
const THEME_KEY = "bfTestEditTheme";
const GYRO_KEY = "bfTestEditGyroOffset";
const isDark = ref(true);

function applyTheme() {
    setDarkTheme(isDark.value ? 0 : 1);
    document.documentElement.classList.toggle("dark", isDark.value);
}

function toggleTheme() {
    isDark.value = !isDark.value;
    localStorage.setItem(THEME_KEY, isDark.value ? "dark" : "light");
    applyTheme();
}

// Gyro mapping offset in degrees: rotates what the gyro reads, not the model. Saved on Next.
const gyroOffset = ref(0);

// The calibrate step must finish before the flow can continue; it then advances by itself.
const calibrated = ref(false);

function onCalibrated() {
    calibrated.value = true;
    setTimeout(() => {
        if (isCalibrateTab.value) {
            void goNext();
        }
    }, 1400);
}

onMounted(() => {
    isDark.value = localStorage.getItem(THEME_KEY) !== "light";
    applyTheme();
    setTimeout(applyTheme, 800);
    gyroOffset.value = Number(localStorage.getItem(GYRO_KEY)) || 0;
    window.addEventListener("wizard-calibrated", onCalibrated);
});

onBeforeUnmount(() => {
    window.removeEventListener("wizard-calibrated", onCalibrated);
});

// Guided flow: connect -> calibrate -> gyro (setup) -> motors -> complete.
const WIZARD_STEPS = ["calibrate", "setup", "motors", "complete"];
const STEP_LABELS: Record<string, { num: string; text: string }> = {
    landing: { num: "01", text: "Connect" },
    calibrate: { num: "02", text: "Calibrate" },
    setup: { num: "03", text: "Gyro" },
    motors: { num: "04", text: "Motors" },
    complete: { num: "05", text: "Complete" },
};
const stepLabel = computed(() => STEP_LABELS[vueTabState.activeTabName ?? ""] ?? null);
const wizardIndex = computed(() => WIZARD_STEPS.indexOf(vueTabState.activeTabName ?? ""));
const showWizardBar = computed(() => connectionStore.connectionValid && wizardIndex.value >= 0);
const hasNext = computed(() => wizardIndex.value >= 0 && wizardIndex.value < WIZARD_STEPS.length - 1);
const contentFading = ref(false);
const wizardBusy = ref(false);

// The shared 3D drone starts moving to the next scene's position while the content fades out.
const stageTarget = ref<string | null>(null);
const stageMode = computed<"calibrate" | "gyro" | "hidden">(() => {
    const tab = stageTarget.value ?? vueTabState.activeTabName;
    if (tab === "calibrate") {
        return "calibrate";
    }
    if (tab === "setup") {
        return "gyro";
    }
    return "hidden";
});

// Gyro screen intro: two short on-screen lines beside the drone (mandatory the first time).
const introStep = ref<0 | 1 | 2>(0);
const introDone = ref(false);
const infoVisible = computed(() => isSetupTab.value && introStep.value > 0);
const spotlightVisible = computed(() => isSetupTab.value && introStep.value === 2);
const nextBlocked = computed(
    () =>
        (isSetupTab.value && (!introDone.value || introStep.value !== 0)) || (isCalibrateTab.value && !calibrated.value),
);

function finishIntro() {
    introStep.value = 0;
    introDone.value = true;
}

const dialogue = computed(() =>
    introStep.value === 2
        ? {
              eyebrow: "Step 1 \u00b7 Match it",
              title: "Tilt it forward",
              text: "Tilt your drone forward. If the model tilts sideways, use the buttons above until it matches.",
              button: "Got it",
              action: finishIntro,
          }
        : {
              eyebrow: "Step 1 \u00b7 Read first",
              title: "Meet your gyro",
              text: "The gyro senses how your drone rotates. With the accelerometer, it tells the flight controller which way is up. We check it so tilts on screen match tilts in your hands.",
              button: "Next",
              action: () => {
                  introStep.value = 2;
              },
          },
);

watch(
    () => connectionStore.connectionValid,
    (valid) => {
        if (!valid) {
            introDone.value = false;
            introStep.value = 0;
            calibrated.value = false;
        }
    },
);

function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// Save to the flight controller's flash, and keep the gyro offset for next time.
function saveChanges(): Promise<void> {
    localStorage.setItem(GYRO_KEY, String(gyroOffset.value));
    return new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 2500);
        try {
            mspHelper.writeConfiguration(false, () => {
                clearTimeout(timeout);
                resolve();
            });
        } catch (e) {
            console.warn("Save on Next failed", e);
            clearTimeout(timeout);
            resolve();
        }
    });
}

async function goNext() {
    if (wizardBusy.value || !hasNext.value || nextBlocked.value) {
        return;
    }
    const next = WIZARD_STEPS[wizardIndex.value + 1];
    wizardBusy.value = true;
    await saveChanges();
    stageTarget.value = next;
    contentFading.value = true;
    await sleep(550);
    const started = switchTab(next, { mode: next === "complete" ? "loggedin" : "connected" });
    if (started) {
        for (let i = 0; i < 60 && vueTabState.activeTabName !== next; i++) {
            await sleep(50);
        }
    }
    stageTarget.value = null;
    contentFading.value = false;
    wizardBusy.value = false;
}

async function onWizardDisconnect() {
    contentFading.value = true;
    await sleep(350);
    await disconnect();
    contentFading.value = false;
}

watch(
    () => vueTabState.activeTabKey,
    async () => {
        introStep.value = 0;
        if (vueTabState.activeTabName !== "setup" || introDone.value) {
            return;
        }
        await sleep(1600);
        if (vueTabState.activeTabName === "setup" && !introDone.value) {
            introStep.value = 1;
        }
    },
);

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
/* ---- Test edit: #0e5fc9 palette (overrides theme.css tokens) ---- */
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

    /* Guided-flow screens are dark blue in both modes, so their text is always light. */
    --wz-fg: #ffffff;
    --wz-muted: #cfe1fb;
}

/* Status bar: dark blue in both modes. */
.app-status-bar#status-bar {
    background: linear-gradient(90deg, #052a5e 0%, #0a3f8a 100%) !important;
    border-top: 1px solid rgba(79, 147, 238, 0.35);
    color: #ffffff;
}
.app-status-bar#status-bar .text-muted,
.app-status-bar#status-bar .stat-icon {
    color: #cfe1fb !important;
}

/* Always-on technical-demo watermark: huge, centred, 30% opacity, never blocks clicks. */
.demo-watermark {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 92vw;
    z-index: 9000;
    text-align: center;
    font-size: clamp(2.2rem, 7.5vw, 8rem);
    font-weight: 900;
    line-height: 1.05;
    letter-spacing: -0.02em;
    text-transform: uppercase;
    color: #ffffff;
    opacity: 0.3;
    pointer-events: none;
    user-select: none;
}

/* ---- Test edit v6: layout, texture removal, gradients ---- */
.app-wrapper .tab_container {
    display: none !important;
}
.app-wrapper #tab-content-container {
    padding-inline-start: 0 !important;
}

/* No honeycomb / paper textures anywhere (landing keeps its own gradient). */
html,
body,
#main-wrapper,
.app-wrapper,
#tab-content-container,
#content,
#content .content_wrapper,
#content .background_paper,
.tab-setup,
.tab-motors {
    background-image: none;
}
#content .content_wrapper,
#content .background_paper {
    background-image: none !important;
}

/* Dark blue to a darker blue, no black, in both modes. */
.app-wrapper #content {
    margin-inline-start: 0 !important;
    inset-inline-start: 0 !important;
    width: 100% !important;
    background:
        radial-gradient(70rem 40rem at 85% -10%, rgba(79, 147, 238, 0.45), transparent 60%),
        linear-gradient(180deg, #0e5fc9 0%, #0a458f 35%, #062a5e 70%, #041d45 100%) !important;
    transition:
        opacity 0.5s ease,
        transform 0.5s cubic-bezier(0.22, 1, 0.36, 1),
        filter 0.5s ease;
}
.app-wrapper.wizard-bar-visible #content {
    padding-bottom: 7rem;
}
#content.wizard-fading {
    opacity: 0;
    transform: translateY(14px) scale(0.985);
    filter: blur(5px);
}
@keyframes wizard-fade-in {
    from {
        opacity: 0;
        transform: translateY(18px) scale(0.99);
        filter: blur(4px);
    }
    to {
        opacity: 1;
        transform: none;
        filter: blur(0);
    }
}
#content > * {
    animation: wizard-fade-in 0.8s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.app-wrapper #content .content_wrapper {
    padding-top: 4rem;
}
.app-wrapper .tab_title {
    display: none;
}

/* Gyro screen: the shared floating drone replaces the boxed canvas; data panels are hidden. */
.tab-setup #interactive_block {
    visibility: hidden;
}
.tab-setup .setup-info-grid {
    display: none !important;
}

/* Step label. */
.step-label {
    position: fixed;
    top: 1.25rem;
    inset-inline-start: 1.5rem;
    z-index: 1900;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.8rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--wz-fg);
    pointer-events: none;
}
.step-label__num {
    font-weight: 700;
    color: #8dbaf7;
}
.step-label__rule {
    width: 3rem;
    height: 1px;
    background: currentColor;
    opacity: 0.5;
}

/* Theme toggle and gyro controls. */
.theme-toggle,
.rotate-btn,
.info-fab {
    border: 2px solid #ffffff;
    background: rgba(255, 255, 255, 0.92);
    color: #0e5fc9;
    font-weight: 600;
    cursor: pointer;
    transition:
        background 0.25s ease,
        color 0.25s ease;
}
.theme-toggle:hover,
.rotate-btn:hover,
.info-fab:hover {
    background: #0e5fc9;
    color: #ffffff;
}
.theme-toggle {
    position: fixed;
    top: 1.1rem;
    inset-inline-end: 1.5rem;
    z-index: 2100;
    padding: 0.4rem 1rem;
    border-radius: 9999px;
    font-size: 0.85rem;
}
.info-fab {
    position: fixed;
    top: 1.1rem;
    inset-inline-end: 6.2rem;
    z-index: 2100;
    width: 2.2rem;
    height: 2.2rem;
    border-radius: 9999px;
}
.rotate-controls {
    position: fixed;
    top: 1.1rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2100;
    display: flex;
    gap: 0.75rem;
    transition: opacity 0.4s ease;
}
.rotate-controls--muted {
    opacity: 0.25;
    pointer-events: none;
}
.rotate-controls--spot .rotate-btn {
    animation: rotate-pulse 1.4s ease-in-out infinite;
    background: #ffffff;
}
@keyframes rotate-pulse {
    0%,
    100% {
        box-shadow: 0 0 0 3px rgba(141, 186, 247, 0.8);
    }
    50% {
        box-shadow: 0 0 0 12px rgba(141, 186, 247, 0);
    }
}
.rotate-btn {
    padding: 0.45rem 1.1rem;
    border-radius: 9999px;
    font-size: 0.85rem;
}

/* On-screen dialogue: plain text beside the drone, at the same vertical level, no box. */
.dialogue {
    position: fixed;
    left: 7vw;
    top: 50%;
    transform: translateY(-50%);
    width: min(26rem, 36vw);
    z-index: 1500;
    color: #ffffff;
}
.dialogue__eyebrow {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.75rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #8dbaf7;
    margin-bottom: 0.6rem;
}
.dialogue h2 {
    margin: 0 0 0.8rem;
    font-size: 2.6rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.08;
}
.dialogue p {
    margin: 0 0 1.4rem;
    font-size: 1.05rem;
    line-height: 1.55;
    color: #cfe1fb;
}
.dialogue__btn {
    padding: 0.7rem 2rem;
    border-radius: 9999px;
    border: 2px solid #ffffff;
    background: linear-gradient(135deg, #1478f0 0%, #0e5fc9 55%, #0a3f8a 100%);
    color: #ffffff;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 8px 24px rgba(14, 95, 201, 0.45);
    transition:
        background 0.25s ease,
        color 0.25s ease,
        transform 0.25s ease;
}
.dialogue__btn:hover {
    background: #ffffff;
    color: #0e5fc9;
    transform: translateY(-1px);
}
.dlg-enter-active,
.dlg-leave-active {
    transition:
        opacity 0.5s ease,
        transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
}
.dlg-enter-from {
    opacity: 0;
    transform: translateY(-50%) translateX(-1.5rem);
}
.dlg-leave-to {
    opacity: 0;
    transform: translateY(-50%) translateX(1rem);
}

/* Floating Next / Disconnect pills above the status bar. */
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
    background: rgba(255, 255, 255, 0.25);
    border: 1px solid #ffffff;
    transition:
        background 0.3s ease,
        transform 0.3s ease;
}
.wizard-dot--done {
    background: #8dbaf7;
}
.wizard-dot--active {
    background: #ffffff;
    transform: scale(1.3);
}
.wizard-btn {
    min-width: 7rem;
    padding: 0.7rem 1.6rem;
    border-radius: 9999px;
    border: 2px solid #ffffff;
    background: linear-gradient(135deg, #1478f0 0%, #0e5fc9 55%, #0a3f8a 100%);
    color: #ffffff;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 8px 24px rgba(14, 95, 201, 0.4);
    transition:
        background 0.25s ease,
        color 0.25s ease,
        opacity 0.25s ease,
        transform 0.25s ease;
}
.wizard-btn:hover:not(:disabled) {
    background: #ffffff;
    color: #0e5fc9;
    transform: translateY(-1px);
}
.wizard-btn:disabled {
    opacity: 0.45;
    cursor: default;
}
.wizard-btn--ghost {
    background: #ffffff;
    color: #0e5fc9;
    box-shadow: none;
}
.wizard-btn--ghost:hover:not(:disabled) {
    background: linear-gradient(135deg, #1478f0 0%, #0e5fc9 55%, #0a3f8a 100%);
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

/* Mobile top bar - the landing page's branding, auto-hides on scroll down. */
.mobile-topbar {
    display: none;
    position: fixed;
    top: 0;
    inset-inline-start: 0;
    inset-inline-end: 0;
    z-index: 2001;
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
        #content {
            padding-top: calc(3rem + var(--bf-inset-top));
            padding-bottom: calc(5.75rem + var(--bf-inset-bottom));
        }
    }
}
</style>
