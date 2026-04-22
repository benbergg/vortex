<script setup lang="ts">
import { ref } from "vue";

interface Item { key: number; label: string }

const all: Item[] = Array.from({ length: 6 }, (_, i) => ({
  key: i + 1,
  label: `Item ${i + 1}`,
}));
const selected = ref<number[]>([]);
</script>

<template>
  <h1>el-transfer（穿梭框）</h1>
  <p>验证左侧勾选后点 → 按钮移到右侧。</p>
  <div class="widget-wrap" data-testid="target-transfer">
    <el-transfer v-model="selected" :data="all" />
  </div>
  <div class="result" data-testid="result">selected=[{{ selected.join(",") }}]</div>
</template>
