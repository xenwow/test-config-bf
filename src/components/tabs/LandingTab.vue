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
    background: linear-gradient(160deg, #020e24 0%, #052a5e 55%, #0b3f86 100%);
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
    background-color: #0e5fc9 !important;
    border: 2px solid #ffffff !important;
    color: #ffffff !important;
    font-size: 1.2rem !important;
    font-weight: 600 !important;
    padding: 0.9rem 1.2rem !important;
    box-shadow: 0 8px 28px rgba(14, 95, 201, 0.45);
    transition: background-color 0.2s ease, color 0.2s ease;
}
.tab-landing .wizard-connect button:hover:not(:disabled) {
    background-color: #ffffff !important;
    color: #0e5fc9 !important;
}
</style>
