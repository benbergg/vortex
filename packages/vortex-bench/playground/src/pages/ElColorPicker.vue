<script setup lang="ts">
import { ref } from "vue";

const color = ref<string>("");
</script>

<template>
  <h1>el-color-picker</h1>
  <p>验证 color picker panel 打开 + 底部 hex 输入 + 确定。</p>
  <div class="widget-wrap" data-testid="target-color-picker">
    <el-color-picker v-model="color" />
  </div>
  <div class="result" data-testid="result">color={{ color || "(未选)" }}</div>
</template>
