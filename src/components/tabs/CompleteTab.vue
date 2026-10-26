<template>
    <BaseTab tab-name="complete">
        <div class="complete-screen">
            <div class="complete-card">
                <div class="complete-check">
                    <svg viewBox="0 0 52 52" aria-hidden="true">
                        <circle cx="26" cy="26" r="24" fill="none" stroke="#ffffff" stroke-width="3" />
                        <path
                            d="M15 27 L23 35 L38 18"
                            fill="none"
                            stroke="#ffffff"
                            stroke-width="4"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                    </svg>
                </div>
                <h1>Complete</h1>
                <p>Your drone has been checked and is ready.</p>
                <button type="button" class="complete-btn" @click="onDisconnect">Disconnect</button>
            </div>
        </div>
    </BaseTab>
</template>

<script setup lang="ts">
import BaseTab from "./BaseTab.vue";
import { disconnect } from "../../js/serial_backend";

function onDisconnect() {
    disconnect();
}
</script>

<style>
.tab-complete {
    min-height: 100%;
    display: flex;
}
.tab-complete .complete-screen {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--wz-fg);
    padding: 2rem;
}
.tab-complete .complete-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 1rem;
}
.tab-complete .complete-check {
    width: 7rem;
    height: 7rem;
    border-radius: 9999px;
    background: linear-gradient(145deg, #4f93ee 0%, #0e5fc9 55%, #0a3f8a 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 14px 40px rgba(14, 95, 201, 0.5);
}
.tab-complete .complete-check svg {
    width: 4.5rem;
    height: 4.5rem;
}
.tab-complete h1 {
    font-size: 3rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    margin: 0;
}
.tab-complete p {
    font-size: 1rem;
    color: var(--wz-muted);
    margin: 0;
}
.tab-complete .complete-btn {
    margin-top: 1rem;
    padding: 0.75rem 2rem;
    border-radius: 9999px;
    border: 2px solid #0e5fc9;
    background: #ffffff;
    color: #0e5fc9;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.25s ease, color 0.25s ease;
}
.tab-complete .complete-btn:hover {
    background: linear-gradient(135deg, #1478f0, #0e5fc9 55%, #0a3f8a);
    color: #ffffff;
}
</style>
