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

            <div v-if="stepLabel" class="step-label" :class="{ 'step-label--light': isLandingTab }">
                <span class="step-label__num">{{ stepLabel.num }}</span>
                <span class="step-label__rule"></span>
                <span class="step-label__text">{{ stepLabel.text }}</span>
            </div>

            <Transition name="info-slide">
                <aside v-if="infoVisible" class="info-popup">
                    <button type="button" class="info-popup__close" aria-label="Close" @click="infoOpen = false">
                        &times;
                    </button>
                    <div class="info-popup__eyebrow">Gyro check</div>
                    <h2>Tilt your drone</h2>
                    <p>
                        Filler text. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Move the drone gently
                        and watch the model follow every roll, pitch and yaw in real time.
                    </p>
                    <p>
                        Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. When the model matches the
                        real aircraft, continue to the motor test.
                    </p>
                </aside>
            </Transition>
            <button v-if="isSetupTab && !infoOpen" type="button" class="info-fab" @click="infoOpen = true">i</button>

            <Teleport v-if="motorStageHost" :to="motorStageHost">
                <ModelStage />
            </Teleport>

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
import ModelStage from "./components/wizard/ModelStage.vue";
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
const STEP_LABELS: Record<string, { num: string; text: string }> = {
    landing: { num: "01", text: "Connect" },
    setup: { num: "02", text: "Gyro" },
    motors: { num: "03", text: "Motors" },
    complete: { num: "04", text: "Complete" },
};
const stepLabel = computed(() => STEP_LABELS[vueTabState.activeTabName ?? ""] ?? null);
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
    await sleep(450);
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
    await sleep(350);
    await disconnect();
    contentFading.value = false;
}

// Gyro screen: filler popup that slides in and pushes the 3D model to the left.
const infoOpen = ref(false);
const infoVisible = computed(() => isSetupTab.value && infoOpen.value);

watch(
    () => vueTabState.activeTabKey,
    async () => {
        infoOpen.value = false;
        if (vueTabState.activeTabName !== "setup") {
            return;
        }
        await sleep(1100);
        if (vueTabState.activeTabName === "setup") {
            infoOpen.value = true;
        }
    },
);

// The model canvas only resizes on window resize, so pump resize events while the layout animates.
watch(infoVisible, () => {
    const start = performance.now();
    const tick = () => {
        window.dispatchEvent(new Event("resize"));
        if (performance.now() - start < 800) {
            requestAnimationFrame(tick);
        }
    };
    requestAnimationFrame(tick);
});

// Motors screen: swap the flat mixer SVG for the same 3D model the gyro screen uses.
const motorStageHost = shallowRef<HTMLElement | null>(null);

watch(
    () => vueTabState.activeTabKey,
    async () => {
        if (motorStageHost.value) {
            motorStageHost.value.remove();
            motorStageHost.value = null;
        }
        if (vueTabState.activeTabName !== "motors") {
            return;
        }
        for (let i = 0; i < 40; i++) {
            await sleep(100);
            if (vueTabState.activeTabName !== "motors") {
                return;
            }
            const svgBox = document.querySelector<HTMLElement>(".tab-motors .p-2\\.5.justify-center");
            if (svgBox?.parentElement) {
                const host = document.createElement("div");
                host.className = "motor-stage-host";
                svgBox.parentElement.insertBefore(host, svgBox);
                svgBox.style.display = "none";
                motorStageHost.value = host;
                return;
            }
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

/* ---- Test edit v2: layout, texture removal, gradients ---- */
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

.app-wrapper #content {
    margin-inline-start: 0 !important;
    inset-inline-start: 0 !important;
    width: 100% !important;
    background:
        radial-gradient(60rem 34rem at 88% -8%, rgba(14, 95, 201, 0.2), transparent 62%),
        radial-gradient(50rem 30rem at -8% 108%, rgba(79, 147, 238, 0.2), transparent 62%),
        linear-gradient(180deg, #f8fbff 0%, #e8f1fd 100%) !important;
    transition:
        opacity 0.45s ease,
        transform 0.45s cubic-bezier(0.22, 1, 0.36, 1),
        filter 0.45s ease;
}
.app-wrapper.wizard-bar-visible #content {
    padding-bottom: 6rem;
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
    animation: wizard-fade-in 0.75s cubic-bezier(0.22, 1, 0.36, 1) both;
}

/* Space for the step label; the original tab titles and wiki buttons are replaced by it. */
.app-wrapper #content .content_wrapper {
    padding-top: 4rem;
}
.app-wrapper .tab_title {
    display: none;
}

/* Gyro screen: drop the detailed data panels, let the model breathe. */
.tab-setup .setup-info-grid {
    display: none !important;
}
.tab-setup .setup-top {
    transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1);
}
.app-wrapper.info-open .tab-setup .setup-top {
    width: calc(100% - 26rem);
}

/* Step label: numbered section marker, spec-sheet style. */
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
    color: #0b3366;
    pointer-events: none;
}
.step-label__num {
    font-weight: 700;
    color: #0e5fc9;
}
.step-label__rule {
    width: 3rem;
    height: 1px;
    background: currentColor;
    opacity: 0.5;
}
.step-label--light,
.step-label--light .step-label__num {
    color: #ffffff;
}

/* Gyro info popup. */
.info-popup {
    position: fixed;
    top: 4.5rem;
    bottom: 6rem;
    inset-inline-end: 1.25rem;
    width: 24rem;
    z-index: 1500;
    padding: 1.75rem;
    overflow-y: auto;
    border-radius: 1.25rem;
    border: 1px solid rgba(14, 95, 201, 0.25);
    background:
        radial-gradient(18rem 14rem at 100% 0%, rgba(14, 95, 201, 0.16), transparent 70%),
        linear-gradient(160deg, rgba(255, 255, 255, 0.97), rgba(226, 238, 253, 0.95));
    box-shadow: 0 24px 60px rgba(7, 31, 64, 0.28);
    color: #0b3366;
}
.info-popup__eyebrow {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.75rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #0e5fc9;
    margin-bottom: 0.5rem;
}
.info-popup h2 {
    margin: 0 0 1rem;
    font-size: 1.8rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.15;
}
.info-popup p {
    margin: 0 0 0.9rem;
    font-size: 0.95rem;
    line-height: 1.55;
}
.info-popup__close {
    position: absolute;
    top: 0.75rem;
    inset-inline-end: 0.9rem;
    border: 0;
    background: transparent;
    color: #0e5fc9;
    font-size: 1.6rem;
    line-height: 1;
    cursor: pointer;
}
.info-fab {
    position: fixed;
    inset-inline-end: 1.5rem;
    top: 1.1rem;
    z-index: 1500;
    width: 2.4rem;
    height: 2.4rem;
    border-radius: 9999px;
    border: 2px solid #0e5fc9;
    background: #ffffff;
    color: #0e5fc9;
    font-weight: 700;
    cursor: pointer;
}
.info-slide-enter-active,
.info-slide-leave-active {
    transition:
        opacity 0.5s ease,
        transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
}
.info-slide-enter-from,
.info-slide-leave-to {
    opacity: 0;
    transform: translateX(3rem);
}

/* Floating Next / Disconnect pills (no bar). */
.wizard-bar {
    position: fixed;
    inset-inline: 0;
    bottom: 1.5rem;
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
    transition:
        background 0.3s ease,
        transform 0.3s ease;
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
    opacity: 0.6;
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

/* Main app content wrapper - flex column */
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
