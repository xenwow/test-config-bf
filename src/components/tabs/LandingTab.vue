<template>
    <BaseTab tab-name="landing">
        <div class="landing-screen">
            <img class="landing-logo" src="/images/bf_logo_white.svg" alt="Betaflight" />
            <p class="landing-sub">Plug in your drone and connect</p>
            <ConnectButton class="wizard-connect" />
        </div>
    </BaseTab>
</template>

<script setup lang="ts">
import BaseTab from "./BaseTab.vue";
import ConnectButton from "../device-picker/ConnectButton.vue";
</script>

<style>
.tab-landing {
    display: flex;
    min-height: 100%;
    background:
        radial-gradient(60rem 40rem at 18% 8%, rgba(14, 95, 201, 0.55), transparent 60%),
        radial-gradient(50rem 40rem at 92% 92%, rgba(79, 147, 238, 0.35), transparent 60%),
        linear-gradient(160deg, #01060f 0%, #04204a 45%, #0a3f86 100%) !important;
    background-size: 140% 140%, 140% 140%, 100% 100%;
    animation: landing-drift 16s ease-in-out infinite alternate;
}
@keyframes landing-drift {
    from {
        background-position: 0% 0%, 100% 100%, 0 0;
    }
    to {
        background-position: 30% 20%, 70% 80%, 0 0;
    }
}
.tab-landing .landing-screen {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1.25rem;
    padding: 2rem;
    color: #ffffff;
}
.tab-landing .landing-logo {
    width: min(420px, 70vw);
}
.tab-landing .landing-sub {
    margin: 0 0 1rem;
    font-size: 1.1rem;
    color: #bcd6fb;
}
.tab-landing .wizard-connect {
    width: min(340px, 80vw);
}
.tab-landing .wizard-connect .sidebar-connect__group {
    width: 100% !important;
}
.tab-landing .wizard-connect .sidebar-connect__label {
    display: inline !important;
}
.tab-landing .wizard-connect button {
    background: linear-gradient(135deg, #1478f0 0%, #0e5fc9 55%, #0a3f8a 100%) !important;
    border: 2px solid #ffffff !important;
    color: #ffffff !important;
    font-size: 1.2rem !important;
    font-weight: 600 !important;
    padding: 0.9rem 1.2rem !important;
    box-shadow: 0 8px 28px rgba(14, 95, 201, 0.45);
    transition: background 0.25s ease, color 0.25s ease, transform 0.25s ease;
}
.tab-landing .wizard-connect button:hover:not(:disabled) {
    background: #ffffff !important;
    color: #0e5fc9 !important;
    transform: translateY(-1px);
}
</style>
